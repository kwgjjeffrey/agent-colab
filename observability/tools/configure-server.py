#!/usr/bin/env python3
"""Select an OTLP provider and materialize a private Server environment file."""
import argparse
import base64
import json
import os
import pathlib
import urllib.parse


def private_json(path):
    path = pathlib.Path(path).expanduser()
    if os.name != 'nt' and path.stat().st_mode & 0o077:
        raise ValueError('Credential file must have mode 0600')
    return json.loads(path.read_text())


def render(profile, credentials):
    endpoint = profile['endpoint'].rstrip('/')
    url = urllib.parse.urlsplit(endpoint)
    if url.scheme != 'https' or not url.netloc or url.username or url.query or url.fragment:
        raise ValueError('OTLP endpoint must be an HTTPS base URL without credentials/query')
    auth = profile['authentication']
    if auth == 'honeycomb':
        headers = {'x-honeycomb-team': credentials['key']}
    elif auth == 'basic':
        value = base64.b64encode((str(profile['instanceId']) + ':' + credentials['token']).encode()).decode()
        headers = {'authorization': 'Basic ' + value}
    else:
        raise ValueError('Unknown authentication scheme')
    header = ','.join(k + '=' + urllib.parse.quote(v, safe='') for k, v in headers.items())
    values = {'OTEL_EXPORTER_OTLP_ENDPOINT': endpoint,
              'OTEL_EXPORTER_OTLP_PROTOCOL': 'http/protobuf',
              'OTEL_EXPORTER_OTLP_HEADERS': header,
              # Explicit signal values prevent a stale inherited provider overriding the base.
              'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT': endpoint + '/v1/traces',
              'OTEL_EXPORTER_OTLP_TRACES_HEADERS': header}
    return ''.join(k + '=' + json.dumps(v) + '\n' for k, v in values.items())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=pathlib.Path)
    parser.add_argument('--provider', help='Override activeProvider for this materialization')
    parser.add_argument('--credentials', help='Legacy single Honeycomb credential JSON')
    parser.add_argument('--output', required=True, type=pathlib.Path)
    args = parser.parse_args()
    if args.config:
        config = json.loads(args.config.expanduser().read_text())
        name = args.provider or config['activeProvider']
        profile = config['providers'][name]
        credential_path = pathlib.Path(profile['credentialsFile']).expanduser()
        if not credential_path.is_absolute(): credential_path = args.config.expanduser().parent / credential_path
        credentials = private_json(credential_path)
    elif args.credentials:
        name = 'honeycomb'
        credentials = private_json(args.credentials)
        profile = {'endpoint': credentials['endpoint'], 'authentication': 'honeycomb'}
    else:
        parser.error('--config is required')
    contents = render(profile, credentials)
    out = args.output.expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as file: file.write(contents)
    print('Saved private OTLP environment for ' + name + ' (0600)')


if __name__ == '__main__':
    try: main()
    except (ValueError, KeyError, OSError): raise SystemExit('Invalid or unavailable provider configuration; no credentials printed')
