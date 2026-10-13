"""Synthetic evidence through real Core workers and real Server; never installs user hooks."""
import hashlib,json,os,pathlib,sqlite3,subprocess,tempfile,time,urllib.request,uuid,socket,shutil
REPO=pathlib.Path(__file__).resolve().parents[2]
PSQL=shutil.which('psql') or '/opt/homebrew/opt/postgresql@14/bin/psql'
PGBIN=pathlib.Path(PSQL).parent
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));pgport=sock.getsockname()[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));serverport=sock.getsockname()[1]
PG=f'postgres://{__import__("getpass").getuser()}@127.0.0.1:{pgport}/postgres'
SERVER=f'http://127.0.0.1:{serverport}'
def sql(text):
    return subprocess.check_output([PSQL,PG,'-At','-v','ON_ERROR_STOP=1'],input=text,text=True,stderr=None).strip()
def wait(fn, attempts=100):
    last=None
    for _ in range(attempts):
        try:
            value=fn()
            if value:return value
        except Exception as error:last=error
        time.sleep(.1)
    raise RuntimeError(f'Timed out: {last}')
def terminate(p):
    if p and p.poll() is None:p.terminate();p.wait(timeout=10)
root=pathlib.Path(tempfile.mkdtemp(prefix='colab-release-e2e-'))
processes=[]
pg_started=False
try:
    subprocess.run([str(PGBIN/'initdb'),'-D',str(root/'pg'),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PGBIN/'pg_ctl'),'-D',str(root/'pg'),'-l',str(root/'pg.log'),'-o',f'-p {pgport} -k {root}','start'],check=True,stdout=subprocess.DEVNULL)
    pg_started=True
    google=root/'google.json';google.write_text(json.dumps({'installed':{'client_id':'test','client_secret':'test','auth_uri':'http://localhost','token_uri':'http://localhost','redirect_uris':['http://localhost']}}))
    users={name:str(uuid.uuid4()) for name in ['reporter','owner','outsider']}
    tokens={name:uuid.uuid4().hex+uuid.uuid4().hex for name in users}
    serverenv={**os.environ,'COLAB_DATABASE_URL':PG,'COLAB_SERVER_ADDRESS':f'127.0.0.1:{serverport}','COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE':str(google),'COLAB_BLOB_ROOT':str(root/'blobs')}
    serverenv.pop('COLAB_FEEDBACK_REVIEWER_IDS',None)
    server=subprocess.Popen([str(REPO/'server/standalone/target/debug/colab-server')],env=serverenv,cwd=root,stdout=(root/'server.log').open('w'),stderr=subprocess.STDOUT);processes.append(server)
    wait(lambda:urllib.request.urlopen(SERVER+'/health/ready').status==200)
    for name,id in users.items():
        tokenhash=hashlib.sha256(tokens[name].encode()).hexdigest()
        sql(f"insert into users(id,email) values('{id}','{id}@e2e.invalid'); insert into sessions(id,user_id,access_token_hash,refresh_token_hash,expires_at) values('{uuid.uuid4()}','{id}','{tokenhash}','{uuid.uuid4().hex}',now()+interval '1 day');")

    def api(method, path, body=None, actor='owner'):
        data=None if body is None else json.dumps(body).encode()
        req=urllib.request.Request(SERVER+path,data=data,method=method,headers={'authorization':'Bearer '+tokens[actor],'content-type':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
    org=api('POST','/v1/organizations',{'name':'Skill Release Test'})
    channel=api('POST',f"/v1/organizations/{org['id']}/channels",{'name':'Colab self publication'})
    reporter=users['reporter'];member=str(uuid.uuid4())
    sql(f"insert into organization_members(id,organization_id,user_id,role) values('{member}','{org['id']}','{reporter}','member'); insert into channel_members(channel_id,organization_id,organization_member_id,role) values('{channel['id']}','{org['id']}','{member}','member');")
    discovery=root/'discovery.json';dbpath=root/'client.sqlite3'
    coreenv={**os.environ,'COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE':str(google),'COLAB_SERVER_URL':SERVER,'COLAB_LOCAL_DATABASE_PATH':str(dbpath),'COLAB_DISCOVERY_FILE':str(discovery)}
    def launch():
        discovery.unlink(missing_ok=True)
        p=subprocess.Popen([str(REPO/'local/target/debug/colabd')],env=coreenv,cwd=root,stdout=(root/'core.log').open('a'),stderr=subprocess.STDOUT);processes.append(p);wait(lambda:discovery.exists());time.sleep(.4);return p
    core=launch();terminate(core)
    db=sqlite3.connect(dbpath)
    id=users['owner'];session={'accessToken':tokens['owner'],'refreshToken':'test','expiresIn':86400,'expiresAt':int(time.time())+86400,'user':{'id':id,'email':f'{id}@e2e.invalid'}}
    db.execute('insert into accounts(user_id,email,session_json) values(?,?,?)',(id,f'{id}@e2e.invalid',json.dumps(session)))
    db.execute("insert into local_settings values('current_user_id',?)",(id,))
    db.execute("insert into local_settings values('current_organization_id',?)",(org['id'],));db.commit();core=launch()
    env={**os.environ,'COLAB_DISCOVERY_FILE':str(discovery)}
    def cli(*args, ok=True):
        r=subprocess.run(['python3',str(REPO/'skills/colab/bin/colab-skill-release'),*args],env=env,text=True,capture_output=True,timeout=180)
        assert (r.returncode==0)==ok,r.stdout+r.stderr
        return json.loads(r.stdout)
    import zipfile
    artifact=root/'colab.zip'
    def package(extra=None):
        canonical=REPO/'.trial/skill-releases/artifacts/colab-skill'/((REPO/'skills/colab/VERSION').read_text().strip()+'.zip')
        with zipfile.ZipFile(canonical) as original, zipfile.ZipFile(artifact,'w',zipfile.ZIP_DEFLATED) as z:
            for entry in original.infolist():z.writestr(entry,original.read(entry.filename))
            if extra:z.writestr((REPO/'skills/colab/VERSION').read_text().strip()+'/RELEASE-TEST.txt',extra)
    package()
    base=['publish','--channel',channel['id'],'--package','agent-colab','--artifact',str(artifact)]
    version=(REPO/'skills/colab/VERSION').read_text().strip()
    result=subprocess.run(['python3',str(REPO/'packaging/publish-skill-to-colab.py'),'--channel',channel['id'],'--package','agent-colab','--artifact',str(artifact),'--version',version,'--receipt',str(root/'receipt.json')],env=env,text=True,capture_output=True,timeout=180)
    assert result.returncode==0,result.stdout+result.stderr
    first=json.loads(result.stdout)['data']
    retry=cli(*base,'--version',version)['data'];assert retry['releaseId']==first['releaseId']
    package('second version')
    conflict=cli(*base,'--version',version,ok=False);assert '409' in conflict['error']['message']
    second=cli(*base,'--version','selftest-2')['data'];assert second['referenceId']==first['referenceId']
    history=cli('history','--reference-id',first['referenceId'])['data'];assert len(history['releases'])==2
    info=json.loads(discovery.read_text())
    def local(path,method='GET',body=None):
        data=None if body is None else json.dumps(body).encode()
        with urllib.request.urlopen(urllib.request.Request(info['endpoint']+path,data=data,method=method,headers={'authorization':'Bearer '+info['bearer'],'content-type':'application/json'}),timeout=90) as response:
            raw=response.read();return json.loads(raw) if raw else None
    preview=local('/v1/skills/'+first['referenceId']+'/preview');assert 'Agent Colab' in preview['content']
    assert db.execute('select count(*) from local_skill_sources').fetchone()[0]==0
    assert sql('select count(*) from skill_releases')=='2'
    # Exercise ordinary installation with the actual Colab package in an unused Agent target.
    target=pathlib.Path.home()/'.claude/skills/agent-colab'
    assert not target.exists() and not target.is_symlink(), 'Acceptance target already exists'
    def install(operation):
        r=subprocess.run(['python3',str(REPO/'skills/colab/bin/colab-skill-tool'),operation,'--ref',first['stableRef'],'--target','claude'],env=env,text=True,capture_output=True,timeout=90)
        assert r.returncode==0,r.stdout+r.stderr
        return json.loads(r.stdout)['data']
    try:
        installed=install('ensure');assert (target/'SKILL.md').is_file()
        r=subprocess.run(['python3',str(target/'bin/colab-skill-release'),'--help'],capture_output=True,text=True);assert r.returncode==0 and 'publish' in r.stdout
        cli('promote','--reference-id',first['referenceId'],'--version',version)
        updated=install('ensure');assert not (target/'RELEASE-TEST.txt').exists()
        cli('promote','--reference-id',first['referenceId'],'--version','selftest-2')
        updated=install('ensure');assert (target/'RELEASE-TEST.txt').read_text()=='second version'
    finally:
        if target.exists():install('uninstall')
    legacy=root/'legacy-skill';legacy.mkdir();entry=legacy/'SKILL.md';entry.write_text('---\nname: legacy-directory-skill\ndescription: Existing source adapter verification\n---\nExisting content')
    old=local('/v1/channels/'+channel['id']+'/skills/share','POST',{'sourcePath':str(legacy)})
    old=wait(lambda:next((r for r in local('/v1/channels/'+channel['id']+'/skills') if r['id']==old['id'] and r['currentRootOid']),None))
    assert old['sourceAdapter']=='shadow-git-v1' and old['currentRootOid']
    entry.write_text(entry.read_text()+'\nA watched directory update')
    changed=wait(lambda:next((r for r in local('/v1/channels/'+channel['id']+'/skills') if r['id']==old['id'] and r['currentRootOid']!=old['currentRootOid']),None), attempts=600)
    assert changed['currentRootOid']
    local('/v1/skills/'+old['id'],'DELETE');assert entry.exists()
    cli('grant','--reference-id',first['referenceId'],'--user-id',reporter)
    def switch(name):
        global core
        terminate(core)
        id=users[name];session={'accessToken':tokens[name],'refreshToken':'test','expiresIn':86400,'expiresAt':int(time.time())+86400,'user':{'id':id,'email':f'{id}@e2e.invalid'}}
        db.execute('insert or replace into accounts(user_id,email,session_json) values(?,?,?)',(id,f'{id}@e2e.invalid',json.dumps(session)))
        db.execute("update local_settings set value=? where key='current_user_id'",(id,));db.commit();core=launch()
    switch('reporter')
    third=cli(*base,'--version','selftest-3','--reference-id',first['referenceId'])['data'];assert third['referenceId']==first['referenceId']
    switch('owner');cli('revoke','--reference-id',first['referenceId'],'--user-id',reporter)
    switch('reporter');denied=cli(*base,'--version','selftest-4','--reference-id',first['referenceId'],ok=False);assert '403' in denied['error']['message']
    summary={'selfSkillArchivePublished':True,'immutableRetryReused':True,'changedSameVersionRejected':True,'stableChannelReference':True,'twoVersionsRetained':True,'existingPreviewConsumer':True,'noSourceWatcherRegistered':True,'nativeInstallationAndEntrypoint':True,'rollbackAndUpdate':True,'collaboratorPublication':True,'revocationEnforced':True,'scaffoldTarget':True,'directorySyncUnchanged':True}
    print(json.dumps(summary));(REPO/'.trial/skill-releases/evidence.json').write_text(json.dumps(summary,indent=2))
except Exception:
    print((root/'server.log').read_text()[-2500:] if (root/'server.log').exists() else '')
    print((root/'core.log').read_text()[-2500:] if (root/'core.log').exists() else '')
    raise
finally:
    for p in reversed(processes):terminate(p)
    if pg_started:subprocess.run([str(PGBIN/'pg_ctl'),'-D',str(root/'pg'),'stop','-m','immediate'],stdout=subprocess.DEVNULL)
