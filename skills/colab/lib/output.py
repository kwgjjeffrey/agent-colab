"""Stable JSON envelopes and documented process exit behavior."""
from __future__ import annotations
import json
import sys

def success(data, *, include_cursor=False, page=None) -> int:
    envelope = {"ok": True, "data": data}
    if page:
        envelope["page"] = page
    json.dump(envelope, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0

def failure(code: str, message: str, exit_code: int, details=None) -> int:
    error = {"code": code, "message": message, "retryable": exit_code in (3, 4)}
    if details is not None:
        error["details"] = details
    json.dump({"ok": False, "error": error}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return exit_code
