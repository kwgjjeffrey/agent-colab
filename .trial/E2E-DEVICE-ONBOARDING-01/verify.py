"""Actual isolated Core → Server → PostgreSQL acceptance; no tokens in output."""
import argparse
import json
import subprocess
from uuid import UUID
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--a", required=True)
    parser.add_argument("--b", required=True)
    parser.add_argument("--database", help="Isolated PostgreSQL fixture only; enables multi-account picker acceptance")
    args = parser.parse_args()
    a, b = (json.loads(Path(path).read_text()) for path in (args.a, args.b))
    http = build_opener(ProxyHandler({}))

    def request(core, path, method="GET", body=None, expected=200):
        data = json.dumps(body).encode() if body is not None else None
        req = Request(core["endpoint"] + path, data=data, method=method,
                      headers={"Authorization": "Bearer " + core["bearer"], "Content-Type": "application/json"})
        try:
            with http.open(req, timeout=45) as response:
                status, raw = response.status, response.read()
        except HTTPError as error:
            status, raw = error.code, error.read()
        assert status == expected, (path, status, raw.decode() if status >= 400 else "")
        return json.loads(raw) if raw else None

    first = request(a, "/v1/auth/device/start", "POST")
    assert len(first["accounts"]) == 1 and not first["requiresSelection"]
    user = first["accounts"][0]["id"]
    assert request(a, "/v1/auth/device/start", "POST")["accounts"][0]["id"] == user
    assert request(a, "/v1/auth/status")["user"]["id"] == user
    channels = request(a, "/v1/channels")
    assert len(channels) == 1 and channels[0]["name"] == "My workspace"
    second = request(b, "/v1/auth/device/start", "POST")
    assert second["accounts"][0]["id"] != user
    channel = channels[0]["id"]
    request(b, f"/v1/channels/{channel}/invite-links", "POST", expected=403)
    invite = request(a, f"/v1/channels/{channel}/invite-links", "POST")
    target = request(b, "/v1/invite-links/accept", "POST", {"token": invite["token"]})
    assert target["channelId"] == channel
    joined = request(b, "/v1/channels")
    assert any(item["id"] == channel and item["role"] == "member" for item in joined)
    assert request(b, "/v1/invite-links/accept", "POST", {"token": invite["token"]})["channelId"] == channel
    assert request(b, f"/v1/channels/{channel}/sessions") == []
    request(b, f"/v1/invite-links/{invite['id']}", "DELETE", expected=403)
    request(a, f"/v1/invite-links/{invite['id']}", "DELETE", expected=204)
    request(b, "/v1/invite-links/accept", "POST", {"token": invite["token"]}, expected=400)
    devices = request(a, "/v1/auth/devices")
    assert len(devices) == 1 and devices[0]["current"]
    request(a, f"/v1/auth/devices/{devices[0]['id']}", "DELETE", expected=409)
    request(a, "/v1/auth/device/login", "POST", {"userId": second["accounts"][0]["id"]}, expected=401)
    assert request(a, "/v1/auth/status")["user"]["id"] == user
    print("PASS: bootstrap/repeat/isolation/invitation/ordinary membership/revoke/last credential/wrong-account rejection")
    if args.database:
        # Seed the already unit-tested bind result, exclusively in the disposable test DB.
        # GUI/Core account selection and unbinding still use real signed HTTP requests.
        other_user = str(UUID(second["accounts"][0]["id"]))
        device_id = str(UUID(devices[0]["id"]))
        subprocess.run(["psql", args.database, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-c",
                        f"insert into account_devices(user_id,device_id) values('{other_user}','{device_id}') on conflict(user_id,device_id) do update set revoked_at=null"], check=True, stdout=subprocess.DEVNULL)
        selection = request(a, "/v1/auth/device/start", "POST")
        assert selection["requiresSelection"] and len(selection["accounts"]) == 2
        assert not request(a, "/v1/auth/status")["authenticated"]
        request(a, "/v1/auth/device/login", "POST", {"userId": other_user}, expected=204)
        assert request(a, "/v1/auth/status")["user"]["id"] == other_user
        linked = request(a, "/v1/auth/devices")
        assert len(linked) == 2
        request(a, f"/v1/auth/devices/{device_id}", "DELETE", expected=204)
        assert not request(a, "/v1/auth/status")["authenticated"]
        assert request(a, "/v1/auth/device/start", "POST")["accounts"][0]["id"] == user
        print("PASS: multiple bindings require selection; selected account and current-device revocation stay consistent")


if __name__ == "__main__":
    main()
