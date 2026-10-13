#!/usr/bin/env python3
"""Colab release target for an already-built Skill ZIP (usable by CI or release scaffolds)."""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--channel', required=True)
    parser.add_argument('--artifact', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--package', default='agent-colab')
    parser.add_argument('--reference-id')
    parser.add_argument('--notes', default='')
    parser.add_argument('--receipt', required=True, help='Local publication receipt path')
    parser.add_argument('--skill-tool', help='Installed colab-skill-release executable')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    artifact = Path(args.artifact).expanduser().resolve(strict=True)
    # This project adapter checks canonical build provenance; the Core remains the ZIP authority.
    with zipfile.ZipFile(artifact) as archive:
        metadata = [n for n in archive.namelist() if n.endswith('/installed.json')]
        if len(metadata) != 1:
            raise ValueError('Expected the canonical Colab Skill build artifact')
        installed = json.loads(archive.read(metadata[0]))
        if installed['version'] != args.version:
            raise ValueError('Release version must match the built Skill version')
        commit = installed['codeRevision']
    tool = args.skill_tool or str(repo/'skills/colab/bin/colab-skill-release')
    command = [sys.executable, tool, 'publish', '--channel', args.channel, '--artifact', str(artifact),
               '--package', args.package, '--version', args.version, '--source-commit', commit, '--notes', args.notes]
    if args.reference_id: command += ['--reference-id', args.reference_id]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        sys.stderr.write(result.stdout + result.stderr)
        return result.returncode
    receipt = json.loads(result.stdout)
    path = Path(args.receipt).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix+'.tmp')
    pending.write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
    pending.replace(path)
    print(result.stdout, end='')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
