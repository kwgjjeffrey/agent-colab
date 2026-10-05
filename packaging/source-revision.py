#!/usr/bin/env python3
"""Identify dirty builds honestly, including new source files absent from git diff."""
import hashlib,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
head=git('rev-parse','HEAD').decode().strip()
changes=git('status','--porcelain')
if not changes:print(head)
else:
    digest=hashlib.sha256(git('diff','HEAD','--binary'))
    for name in sorted(git('ls-files','--others','--exclude-standard','-z').split(b'\0')):
        if not name:continue
        file=root/name.decode();digest.update(name+b'\0')
        if file.is_file():
            with file.open('rb') as stream:
                while chunk:=stream.read(1024*1024):digest.update(chunk)
    print(head+'-dirty-'+digest.hexdigest()[:12])
