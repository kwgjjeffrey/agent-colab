#!/usr/bin/env python3
"""Build a portable SDK dependency bundle; no target-machine pip operation is required."""
import pathlib
import subprocess
import sys
root = pathlib.Path(__file__).resolve().parents[1]
target = pathlib.Path(sys.argv[1]) / "lib" / "vendor"
target.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, "-m", "pip", "install", "--target", str(target), "--upgrade", "-r", str(root / "skills/colab/packaging/telemetry-requirements.txt")], check=True)
# These distributions provide Python fallbacks. A single Skill artifact must not carry
# a macOS/CPython-specific extension into Windows or a different Python minor version.
for path in target.rglob("*"):
    if path.suffix in (".so", ".pyd", ".dylib"):
        path.unlink()
