"""Invoke the real join entry without putting an invitation capability in recorded args."""
import contextlib
import json
import os
import pathlib
import runpy
import sys

payload = json.load(sys.stdin)
os.environ["COLAB_DISCOVERY_FILE"] = payload["discoveryFile"]
script = pathlib.Path(__file__).resolve().parents[2] / "skills/colab/bin/colab-join"
main = runpy.run_path(str(script))["main"]
sys.argv = [str(script), "--invitation", payload["token"], "--no-open"]
raise SystemExit(main())
