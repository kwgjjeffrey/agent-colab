"""Own only Colab hook entries; host trust remains a separate explicit user action."""
import json, os, shlex, tempfile
from pathlib import Path
try:
    from .artifact_config import artifact_config
except ImportError:
    from artifact_config import artifact_config
OWNER = artifact_config()['skill']['name'] + '-feedback'
def configure_hooks(enabled, *, path=None, command=None):
    path = path or Path(os.environ.get('CODEX_HOME',Path.home()/'.codex'))/'hooks.json'
    command = command or f'{shlex.quote(sys_executable())} {shlex.quote(str(Path(__import__("sys").argv[0]).absolute().parent/"colab-feedback-hook"))}'
    value = json.loads(path.read_text()) if path.exists() else {'hooks':{}}
    hooks = value.setdefault('hooks',{})
    for event in ('PostToolUse','Stop'):
        entries = hooks.setdefault(event,[])
        hooks[event] = [entry for entry in entries if entry.get('_owner') != OWNER]
        if enabled:
            hooks[event].append({'_owner':OWNER,'hooks':[{'type':'command','command':command,'timeout':3}]})
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile('w',dir=path.parent,delete=False) as f:
        temp = Path(f.name)
        json.dump(value,f,ensure_ascii=False,indent=2)
        f.flush(); os.fsync(f.fileno())
    os.chmod(temp,0o600)
    temp.replace(path)
def sys_executable():
    import sys
    return sys.executable
