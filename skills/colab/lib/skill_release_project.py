"""Project-owned release scaffolding; publication still goes through Local Core."""
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def initialize(project, skill_dir, channel, package, tool, parent=None):
    root = Path(project).resolve()
    source = (root / skill_dir).resolve()
    source.relative_to(root)
    if not (source / 'SKILL.md').is_file():
        raise ValueError('skill-dir must contain SKILL.md')
    config = root / 'colab-release.json'
    script = root / 'scripts/publish-colab-skill.py'
    if config.exists() or script.exists():
        raise ValueError('Release scaffold already exists; edit it instead of overwriting it')
    config.write_text(json.dumps({'schemaVersion': 1, 'channel': channel, 'package': package,
        'skillDirectory': str(source.relative_to(root)), 'buildCommands': [], 'validationCommands': [], **({'parentRef': parent} if parent else {})}, indent=2)+'\n')
    script.parent.mkdir(parents=True, exist_ok=True)
    script.write_text('#!/usr/bin/env python3\nimport os, subprocess, sys\nfrom pathlib import Path\n'
        +f'tool = os.environ.get("COLAB_SKILL_RELEASE_TOOL", {str(Path(tool).absolute())!r})\n'
        +'sys.exit(subprocess.call([sys.executable, tool, "publish-project", "--project", str(Path(__file__).resolve().parents[1]), *sys.argv[1:]]))\n')
    ignore = root / '.gitignore'
    existing = ignore.read_text() if ignore.exists() else ''
    if '/.colab-release/' not in existing.splitlines():
        ignore.write_text(existing.rstrip()+'\n/.colab-release/\n')
    return {'config': str(config), 'script': str(script)}


def prepare(project, version):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+-]{0,63}', version):
        raise ValueError('Invalid release version')
    root = Path(project).resolve()
    cfg = json.loads((root / 'colab-release.json').read_text())
    if git(root, 'status', '--porcelain'):
        raise ValueError('Commit the project and scaffold before publishing; working tree must be clean')
    commit = git(root, 'rev-parse', 'HEAD')
    for command in cfg.get('buildCommands', []) + cfg.get('validationCommands', []):
        if not isinstance(command, list) or not command or not all(isinstance(v, str) for v in command):
            raise ValueError('Build and validation commands must be argv arrays')
        subprocess.run(command, cwd=root, check=True, stdout=sys.stderr)
    if git(root, 'status', '--porcelain'):
        raise ValueError('Build changed tracked files; commit the result before publishing')
    output = root / '.colab-release' / version
    output.mkdir(parents=True, exist_ok=True)
    artifact = output / 'skill.zip'
    candidate = output / 'candidate.zip'
    if cfg.get('artifactFile'):
        import shutil
        source = (root / cfg['artifactFile']).resolve()
        source.relative_to(root)
        shutil.copyfile(source, candidate)
    else:
        source = (root / cfg['skillDirectory']).resolve()
        source.relative_to(root)
        files = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '--', str(source.relative_to(root))]).decode().split('\0')
        with zipfile.ZipFile(candidate, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(filter(None, files)):
                path = root / name
                if path.is_symlink():
                    raise ValueError('Distributable Skill files must not be symlinks')
                info = zipfile.ZipInfo(path.relative_to(source).as_posix(), (2020,1,1,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o100755 if os.access(path, os.X_OK) else 0o100644) << 16
                archive.writestr(info, path.read_bytes())
    if artifact.exists() and artifact.read_bytes() != candidate.read_bytes():
        candidate.unlink()
        raise ValueError('This version already has different bytes; use a new version')
    candidate.replace(artifact)
    return cfg, artifact, commit
