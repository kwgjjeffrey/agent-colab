"""Release acceptance: execute the public invitation bootstrap, preserving the daily account."""
import json
import pathlib
import shlex
import subprocess
import sys
import time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "skills/colab/lib"))
from local_api import request, LocalApiError

body = json.load(sys.stdin)
before = request("GET", "/v1/auth/status")["user"]["id"]
invite = request("POST", "/v1/channels/" + body["channelId"] + "/invite-links")
try:
    script = "curl --noproxy '*' -fsSL --retry 3 --connect-timeout 10 " + shlex.quote(body["installerUrl"]) + " | bash -s -- --with-app --invitation " + shlex.quote(invite["token"])
    completed = subprocess.run(["bash", "-o", "pipefail", "-c", script], capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError((completed.stderr + completed.stdout).replace(invite["token"], "[redacted]"))
    after = request("GET", "/v1/auth/status")["user"]["id"]
    if after != before:
        raise RuntimeError("Bootstrap replaced the selected account")
    if '"joined": true' not in completed.stdout or body["channelId"] not in completed.stdout:
        raise RuntimeError("Bootstrap did not return the intended Channel join receipt")
    print(json.dumps({"bootstrapExecuted": True, "selectedAccountPreserved": True, "joinSucceeded": True}))
finally:
    for attempt in range(30):
        try:
            request("DELETE", "/v1/invite-links/" + invite["id"])
            break
        except LocalApiError:
            if attempt == 29:
                raise
            time.sleep(1)
