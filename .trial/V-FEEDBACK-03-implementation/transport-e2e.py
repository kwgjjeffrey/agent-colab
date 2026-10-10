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
    return subprocess.check_output([PSQL,PG,'-At','-v','ON_ERROR_STOP=1'],input=text,text=True,stderr=subprocess.PIPE).strip()
def wait(fn):
    last=None
    for _ in range(100):
        try:
            value=fn()
            if value:return value
        except Exception as error:last=error
        time.sleep(.1)
    raise RuntimeError(f'Timed out: {last}')
def terminate(p):
    if p and p.poll() is None:p.terminate();p.wait(timeout=10)
root=pathlib.Path(tempfile.mkdtemp(prefix='colab-feedback-e2e-'))
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
    sql(f"insert into feedback_reviewers(asset_key,user_id) values('builtin:agent-colab','{users['owner']}');")

    discovery=root/'discovery.json';dbpath=root/'client.sqlite3'
    coreenv={**os.environ,'COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE':str(google),'COLAB_SERVER_URL':SERVER,'COLAB_LOCAL_DATABASE_PATH':str(dbpath),'COLAB_DISCOVERY_FILE':str(discovery)}
    def launch():
        p=subprocess.Popen([str(REPO/'local/target/debug/colabd')],env=coreenv,cwd=root,stdout=(root/'core.log').open('a'),stderr=subprocess.STDOUT);processes.append(p);wait(lambda:discovery.exists());time.sleep(.4);return p
    core=launch();terminate(core)
    db=sqlite3.connect(dbpath)
    for name,id in users.items():
        session={'accessToken':tokens[name],'refreshToken':'test','expiresIn':86400,'expiresAt':int(time.time())+86400,'user':{'id':id,'email':f'{id}@e2e.invalid'}}
        db.execute('insert into accounts(user_id,email,session_json) values(?,?,?)',(id,f'{id}@e2e.invalid',json.dumps(session)))
    db.execute("insert into local_settings values('current_user_id',?)",(users['reporter'],))
    db.execute('insert into feedback_settings values(?,1,0,current_timestamp)',(users['reporter'],))
    feedbackid=str(uuid.uuid4());turn=str(uuid.uuid4());sessionid=str(uuid.uuid4());analysisid=str(uuid.uuid4())
    evidence=root/'evidence.jsonl'
    rows=[{'type':'response_item','payload':{'type':'message','role':'user','content':[{'type':'input_text','text':'SYNTHETIC_QUERY_ONLY'}]}},{'type':'response_item','payload':{'type':'message','role':'assistant','content':[{'type':'output_text','text':'SYNTHETIC_FINAL_ONLY'}]}}]
    evidence.write_text(''.join(json.dumps(row)+'\n' for row in rows))
    event={'skillVersion':'trial','capturedAt':'2026-10-10T04:00:00Z','session_id':sessionid,'turn_id':turn}
    db.execute('insert into feedback_records(id,user_id,asset_key,channel_key,turn_id,session_id,hook_json,evidence_path,metadata_json,analysis_id) values(?,?,?,?,?,?,?,?,?,?)',(feedbackid,users['reporter'],'builtin:agent-colab','builtin:agent-colab',turn,sessionid,json.dumps(event),str(evidence),json.dumps({'captureScope':'synthetic_e2e','priorUserQueryCount':0}),analysisid))
    for kind in ['feedback_upload','feedback_analyze']:
        db.execute("insert into local_jobs(id,dedupe_key,kind,share_id,user_id,state,next_attempt_at) values(?,?,?,?,?,'pending',0)",(str(uuid.uuid4()),kind+':'+users['reporter']+':'+feedbackid,kind,feedbackid,users['reporter']))
    commentid=str(uuid.uuid4())
    markdown='```yaml\nrating: negative\ntaskOutcome: progress\nnegativeTags:\n - tag: 脚本使用说明不清晰\n   evidence: 合成任务因缺少参数说明额外读取帮助\n```\n\n## 自由说明\n保留任意 Markdown。'
    db.execute('insert into feedback_records(id,user_id,asset_key,channel_key,turn_id,session_id,hook_json,evidence_path,metadata_json,analysis_id,analysis_status,comment_markdown) values(?,?,?,?,?,?,?,?,?,?,?,?)',(commentid,users['reporter'],'builtin:agent-colab','builtin:agent-colab',str(uuid.uuid4()),sessionid,json.dumps(event),str(evidence),json.dumps({'captureScope':'synthetic_e2e'}),str(uuid.uuid4()),'completed',markdown))
    db.execute("insert into local_jobs(id,dedupe_key,kind,share_id,user_id,state,next_attempt_at) values(?,?,'feedback_upload',?,?,'pending',0)",(str(uuid.uuid4()),'feedback_upload:'+users['reporter']+':'+commentid,commentid,users['reporter']))
    db.commit();core=launch()
    wait(lambda:db.execute('select uploaded and comment_uploaded from feedback_records where id=?',(feedbackid,)).fetchone()[0])
    wait(lambda:db.execute('select uploaded and comment_uploaded from feedback_records where id=?',(commentid,)).fetchone()[0])
    assert db.execute('select analysis_status from feedback_records where id=?',(feedbackid,)).fetchone()[0]=='disabled'
    # Switch this isolated Core to the owner for real producer commands.
    terminate(core);db.execute("update local_settings set value=? where key='current_user_id'",(users['owner'],));db.commit();core=launch()
    env={**os.environ,'COLAB_DISCOVERY_FILE':str(discovery)}
    def cli(command,*args):
        result=subprocess.run(['python3',str(REPO/'skills/colab/bin'/command),*args],env=env,text=True,capture_output=True,timeout=15)
        assert result.returncode==0,result.stderr+result.stdout
        return json.loads(result.stdout)['data']
    assets=cli('colab-feedback','list-assets');assert any(row['assetKey']=='builtin:agent-colab' for row in assets['items'])
    feedbacks=cli('colab-feedback','list-feedbacks','--asset-key','builtin:agent-colab','--feedback-id',feedbackid,'--include','rating,comment')
    assert feedbacks['items'][0]['rating']=='unrated'
    comments=cli('colab-feedback','list-feedbacks','--asset-key','builtin:agent-colab','--negative-tag','脚本使用说明不清晰','--include','rating,tags,comment')
    assert comments['totalMatching']==1 and comments['items'][0]['comment']==markdown

    fragment=cli('colab-session-reader','read','--ref',f'colab://feedback/{feedbackid}/session');assert 'SYNTHETIC_QUERY_ONLY' in json.dumps(fragment) and 'SYNTHETIC_FINAL_ONLY' in json.dumps(fragment)
    blobkey=sql(f"select session_blob_key from feedback_records where id='{feedbackid}';")
    blob=root/'blobs'/blobkey[:2]/blobkey
    original=blob.read_bytes()
    try:
        blob.write_bytes(original.replace(b'SYNTHETIC_FINAL_ONLY',b'CORRUPTED_FINAL_ONLY'))
        broken=subprocess.run(['python3',str(REPO/'skills/colab/bin/colab-session-reader'),'read','--ref',f'colab://feedback/{feedbackid}/session'],env=env,text=True,capture_output=True,timeout=15)
        assert broken.returncode!=0 and 'integrity verification' in broken.stdout
    finally:blob.write_bytes(original)
    changed=cli('colab-feedback','update-feedback-status','--asset-key','builtin:agent-colab','--feedback-id',feedbackid,'--expected-revision',feedbackid+'=0','--status','ignored','--reason','Synthetic validation fixture');assert changed['updatedCount']==1
    query=urllib.request.Request(f'{SERVER}/v1/feedbacks/{feedbackid}/session',headers={'authorization':'Bearer '+tokens['outsider']})
    try:urllib.request.urlopen(query);raise AssertionError('Outsider received private evidence')
    except urllib.error.HTTPError as error:assert error.code==403
    summary={'coreUpload':True,'analysisDisabledRawStillUploaded':True,'producerListAssets':True,'producerListFeedbacks':True,'existingSessionReader':True,'resolutionCommand':True,'outsiderDenied':True,'realUserConversationUploaded':False,'markdownCommentUpload':True,'negativeTagFiltering':True,'readerRejectsCorruptEvidence':True}
    print(json.dumps(summary));(REPO/'.trial/V-FEEDBACK-03-implementation/transport-summary.local.json').write_text(json.dumps(summary,indent=2))
except Exception:
    if 'db' in locals():
        print('Synthetic worker diagnostics:',db.execute('select kind,state,last_error from local_jobs').fetchall())
    print('Synthetic Core diagnostics:',(root/'core.log').read_text()[-2000:] if (root/'core.log').exists() else 'none')
    raise
finally:
    for p in reversed(processes):terminate(p)
    db.close() if 'db' in locals() else None
    if pg_started:subprocess.run([str(PGBIN/'pg_ctl'),'-D',str(root/'pg'),'stop','-m','fast'],check=True,stdout=subprocess.DEVNULL)
    shutil.rmtree(root)
