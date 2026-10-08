"""Accept a Channel invitation on a fresh private Core state, never the daily account."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "skills/colab/lib"))
from local_api import request, LocalApiError

body = json.load(sys.stdin)
app = pathlib.Path.home() / ".local/share/agent-colab"
fixture_parent = pathlib.Path(__file__).resolve().parents[1] / ".fixtures"
invite = request("POST", "/v1/channels/" + body["channelId"] + "/invite-links")
member_email = None
try:
    with tempfile.TemporaryDirectory(prefix="invitation-fresh-", dir=fixture_parent) as folder:
        root = pathlib.Path(folder)
        discovery = root / "discovery.json"
        env = dict(os.environ, COLAB_APPLICATION_ROOT=str(root), COLAB_LOCAL_DATABASE_PATH=str(root/"client.sqlite3"), COLAB_DISCOVERY_FILE=str(discovery), COLAB_LOCAL_ADDRESS="127.0.0.1:0", COLAB_SERVER_URL=body["serverUrl"], COLAB_GUI_ROOT=str(app/"current/ui"), COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE=str(app/"current/core/google-oauth.json"))
        with (root/"core.log").open("wb") as log:
            child = subprocess.Popen([str(app/"current/core/colabd")], env=env, stdout=log, stderr=log)
        try:
            original = os.environ.get("COLAB_DISCOVERY_FILE")
            os.environ["COLAB_DISCOVERY_FILE"] = str(discovery)
            try:
                for _ in range(100):
                    try:
                        status = request("GET", "/v1/auth/status", timeout=2)
                        break
                    except LocalApiError:
                        time.sleep(.2)
                else:
                    raise RuntimeError("Fresh device Core not ready")
                assert not status["authenticated"], "Fresh fixture unexpectedly authenticated"
                joined = subprocess.run([sys.executable, str(app/"current/skill/bin/colab-join"), "--invitation", invite["token"], "--no-open"], env=env, capture_output=True, text=True)
                status = request("GET", "/v1/auth/status")
                if status.get("authenticated"):
                    member_email = status["user"]["email"]
                if joined.returncode:
                    raise RuntimeError((joined.stderr+joined.stdout).replace(invite["token"], "[redacted]"))
                assert json.loads(joined.stdout)["data"]["channel"]["id"] == body["channelId"]
                assert any(row["id"] == body["channelId"] for row in request("GET", "/v1/channels"))
                print(json.dumps({"freshDeviceWasSignedOut": True, "deviceRegistrationCompleted": status["authenticated"], "downloadedSkillJoinedChannel": True}))
            finally:
                if original is None:
                    os.environ.pop("COLAB_DISCOVERY_FILE", None)
                else:
                    os.environ["COLAB_DISCOVERY_FILE"] = original
        finally:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill(); child.wait()
finally:
    request("DELETE", "/v1/invite-links/"+invite["id"])
    if member_email:
        member = next((row for row in request("GET", "/v1/channels/"+body["channelId"]+"/members") if row["email"] == member_email), None)
        if member:
            request("DELETE", "/v1/channels/"+body["channelId"]+"/members/"+member["memberId"])
