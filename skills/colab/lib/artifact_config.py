"""Read deployment defaults shipped with this independent Skill artifact."""
import json
from pathlib import Path

def artifact_config():
    root = Path(__file__).resolve().parents[1]
    packaged = root / "artifact-config.json"
    if packaged.is_file():
        return json.loads(packaged.read_text())
    # Source-checkout tooling uses the publisher's local configuration.
    source = root.parents[1] / "packaging/artifact-config.local.json"
    if not source.is_file():
        source = root.parents[1] / "packaging/artifact-config.example.json"
    return json.loads(source.read_text())
