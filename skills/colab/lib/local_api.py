"""Dependency-free transport for the user-local Colab Core.

Local traffic explicitly bypasses proxy environment variables. Authentication will
move to the Core discovery file; callers never receive remote Colab credentials.
"""
from __future__ import annotations
import json
import os
import pathlib
import urllib.error
import urllib.request
# The executable entrypoints add this directory itself to sys.path. Import the
# sibling module directly so the packaged Skill works outside the source tree.
from platform_paths import application_root

DEFAULT_CORE = None
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

class LocalApiError(RuntimeError):
    def __init__(self, message: str, exit_code: int = 4):
        super().__init__(message)
        self.exit_code = exit_code

def discovery():
    path = pathlib.Path(os.environ.get(
        "COLAB_DISCOVERY_FILE",
        application_root() / "discovery.json",
    ))
    try:
        if os.name != "nt" and path.stat().st_mode & 0o077:
            raise LocalApiError(f"Colab discovery file is not private: {path}", 3)
        value = json.loads(path.read_text())
        return value["endpoint"], value["bearer"]
    except (OSError, KeyError, ValueError) as error:
        raise LocalApiError(f"Cannot read Colab Local Core discovery at {path}: {error}", 3) from error

def request(method: str, path: str, *, core: str = DEFAULT_CORE, body=None, timeout: int = 30):
    discovered_core, bearer = discovery()
    core = core or discovered_core
    payload = None if body is None else json.dumps(body).encode()
    headers = {"authorization": f"Bearer {bearer}"}
    if payload is not None:
        headers["content-type"] = "application/json"
    request = urllib.request.Request(core.rstrip("/") + path, data=payload, headers=headers, method=method)
    from telemetry import request_span
    try:
        with request_span(method, headers):
            # Inject after creating the child span, rather than reusing the root span id.
            for name, value in headers.items():
                request.add_header(name, value)
            with _OPENER.open(request, timeout=timeout) as response:
                raw = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise LocalApiError(f"Local Core returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise LocalApiError(f"Cannot reach Colab Local Core at {core}: {error.reason}", 3) from error
    return json.loads(raw) if raw else None

def download(path: str, destination, *, core: str = DEFAULT_CORE, limit: int = 20 * 1024 * 1024):
    """Download a bounded Canvas attachment through authenticated Local Core."""
    import hashlib
    import tempfile
    discovered_core, bearer = discovery()
    core = core or discovered_core
    target = pathlib.Path(destination).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    query = urllib.request.Request(core.rstrip('/') + path, headers={'authorization': f'Bearer {bearer}'})
    temp = None
    digest, size = hashlib.sha256(), 0
    try:
        with _OPENER.open(query, timeout=60) as response, tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
            temp = pathlib.Path(output.name)
            while chunk := response.read(65536):
                size += len(chunk)
                if size > limit:
                    raise LocalApiError('Image exceeds the download size limit')
                digest.update(chunk)
                output.write(chunk)
        temp.replace(target)
        return {'localPath': str(target), 'byteSize': size, 'sha256': digest.hexdigest()}
    except (urllib.error.URLError, OSError) as error:
        raise LocalApiError(f'Image download failed: {error}') from error
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)
