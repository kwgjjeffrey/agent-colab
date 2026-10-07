"""Probe the freshly installed executable without registering a daily service."""
import json, os, pathlib, subprocess, sys, time, urllib.request
root = pathlib.Path(sys.argv[1]).resolve()
allowed = pathlib.Path(__file__).resolve().parents[1] / '.fixtures'
if not root.is_relative_to(allowed.resolve()):
    raise SystemExit('Health probe requires an owned installation')
core = root/'current/core'
receipt = json.loads((root/'installation.json').read_text())
env = dict(os.environ, COLAB_APPLICATION_ROOT=str(root), COLAB_LOCAL_ADDRESS='127.0.0.1:0', COLAB_LOCAL_DATABASE_PATH=str(root/'health.sqlite3'), COLAB_DISCOVERY_FILE=str(root/'health-discovery.json'), COLAB_SERVER_URL=receipt['serverUrl'], COLAB_GUI_ROOT=str(root/'current/ui'), COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE=str(core/'google-oauth.json'))
with (root/'health.log').open('ab') as log:
    child = subprocess.Popen([str(core/'colabd')], env=env, stdout=log, stderr=log)
try:
    for _ in range(100):
        if child.poll() is not None:
            raise RuntimeError('Installed Core exited before readiness')
        try:
            discovery = json.loads((root/'health-discovery.json').read_text())
            req = urllib.request.Request(discovery['endpoint']+'/v1/status', headers={'Authorization':'Bearer '+discovery['bearer']})
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    print(json.dumps({'ready': True})); break
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    else:
        raise RuntimeError('Installed Core readiness timeout')
finally:
    child.terminate()
    try: child.wait(timeout=5)
    except subprocess.TimeoutExpired: child.kill(); child.wait()
