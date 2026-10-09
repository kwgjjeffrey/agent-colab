#!/usr/bin/env python3
"""Validate deployment configuration and render standalone bootstrap scripts."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit


def load_config(path):
    value = json.loads(Path(path).read_text())
    if value.get('schemaVersion') != 1 or value.get('deploymentMode') not in ('public', 'enterprise'):
        raise ValueError('unsupported artifact configuration')
    auth = value.get('auth', {})
    if auth.get('kind') not in ('google', 'external') or not isinstance(auth.get('label'), str) or not auth['label'].strip():
        raise ValueError('auth.kind and auth.label are required')
    if value['deploymentMode'] == 'enterprise' and auth['kind'] != 'external':
        raise ValueError('enterprise configuration must select its external identity provider')
    for key in ('serverUrl', 'releaseManifestUrl', 'installMacUrl', 'installWindowsUrl'):
        url = value[key]
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError(f'invalid {key}')
        if key != 'serverUrl' and parsed.scheme != 'https':
            raise ValueError(f'{key} must use HTTPS')
        if any(char in url for char in "'\"`$\\\r\n "):
            raise ValueError(f'{key} cannot be represented safely in bootstrap scripts')
    return value


def render(repo, config, output):
    output.mkdir(parents=True, exist_ok=True)
    for name in ('colab-install', 'colab-install.ps1'):
        text = (repo / 'packaging' / name).read_text()
        if '@COLAB_RELEASE_MANIFEST@' not in text:
            raise ValueError(f'{name} has no manifest template')
        text = text.replace('@COLAB_RELEASE_MANIFEST@', config['releaseManifestUrl'])
        (output / name).write_text(text)
    (output / 'colab-install').chmod(0o755)
    (output / 'artifact-config.json').write_text(json.dumps(config, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--mode', choices=['public', 'enterprise'])
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    if args.mode and config['deploymentMode'] != args.mode:
        parser.error('artifact configuration does not match the build deployment mode')
    if args.out:
        render(Path(__file__).resolve().parents[1], config, args.out)
