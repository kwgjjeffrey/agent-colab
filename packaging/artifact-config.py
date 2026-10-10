#!/usr/bin/env python3
"""Validate deployment configuration and render standalone bootstrap scripts."""
import argparse
import json
import re
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
    skill = value.get('skill', {})
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', skill.get('name', '')):
        raise ValueError('skill.name must be a lowercase Skill directory name')
    for key in ('displayName', 'description', 'shortDescription', 'defaultPrompt', 'brandColor'):
        if not isinstance(skill.get(key), str) or not skill[key].strip() or '\n' in skill[key] or '\r' in skill[key]:
            raise ValueError(f'skill.{key} must be non-empty single-line text')
    if '$' + skill['name'] not in skill['defaultPrompt']:
        raise ValueError('skill.defaultPrompt must invoke the configured Skill name')
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


def render_skill(repo, config, output, template_root=None):
    """Use original templates for both distributions; never reverse-edit a rendered public name."""
    skill = config['skill']
    yaml_text = lambda value: json.dumps(value, ensure_ascii=False)
    fields = {'COLAB_SKILL_NAME': skill['name'],
              'COLAB_SKILL_DESCRIPTION': yaml_text(skill['description']),
              'COLAB_SKILL_DISPLAY_NAME': skill['displayName'],
              'COLAB_SKILL_DISPLAY_NAME_YAML': yaml_text(skill['displayName']),
              'COLAB_SKILL_SHORT_DESCRIPTION': yaml_text(skill['shortDescription']),
              'COLAB_SKILL_BRAND_COLOR': yaml_text(skill['brandColor']),
              'COLAB_SKILL_DEFAULT_PROMPT': yaml_text(skill['defaultPrompt'])}
    frozen = output / '.artifact-templates'
    for relative in ('SKILL.md', 'agents/openai.yaml'):
        template_name = relative.replace('/', '-') + '.in'
        source = (template_root / template_name) if template_root else (repo / 'skills/colab' / relative)
        text = source.read_text()
        # Enterprise derivation uses the templates frozen in its input artifact, not newer HEAD.
        frozen.mkdir(parents=True, exist_ok=True)
        (frozen / template_name).write_text(text)
        for name, value in fields.items():
            text = text.replace('@' + name + '@', value)
        if re.search(r'@COLAB_SKILL_[A-Z_]+@', text):
            raise ValueError(f'unresolved Skill template field in {relative}')
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    (output / 'artifact-config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--mode', choices=['public', 'enterprise'])
    parser.add_argument('--out', type=Path)
    parser.add_argument('--skill-out', type=Path)
    parser.add_argument('--template-root', type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    if args.mode and config['deploymentMode'] != args.mode:
        parser.error('artifact configuration does not match the build deployment mode')
    if args.out:
        render(Path(__file__).resolve().parents[1], config, args.out)

    if args.skill_out:
        render_skill(Path(__file__).resolve().parents[1], config, args.skill_out, args.template_root)
