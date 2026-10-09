# Server deployment

The deployment target is intentionally absent from tracked files. Copy
`.env.example` to `.env.local`; the repository-wide ignore rule excludes it.

```bash
server/deploy/bootstrap-server.sh
server/deploy/configure-server.sh
server/deploy/preflight.sh
artifact=$(server/deploy/build-linux-on-host.sh)
COLAB_SERVER_ARTIFACT=/path/to/linux-x86_64/colab-server \
  COLAB_SERVER_VERSION=0.1.0 \
  server/deploy/deploy-server.sh
```

`bootstrap-server.sh` idempotently creates PostgreSQL, the service account and
systemd unit. `configure-server.sh` copies ignored runtime credentials into
root-owned `/etc/agent-colab`; it never writes secrets into a release directory.

`build-linux-on-host.sh` sends a secret-free source archive to the Linux build
host, builds a locked release binary, and downloads that artifact into `dist/`.

`deploy-server.sh` uploads an immutable release directory, atomically switches
`/opt/agent-colab/current`, restarts systemd, and requires the real readiness
endpoint to pass. It does not build artifacts, install infrastructure, write
runtime secrets, or pretend that an unconfigured host is production-ready.

Application deployment does not migrate an existing environment's business
data. A data migration must treat PostgreSQL and the configured Blob Store as
one logical backup, restore both while the service is stopped, and validate a
real historical Shared Item download after readiness succeeds. Restoring only
the database leaves valid revision rows pointing at missing blobs.

The self-hosted SMTP daemon is a separate service, even when it is placed on
the same VPS. Colab Server talks to it through `COLAB_SMTP_URL`. Before SMTP is
installed, `preflight.sh` must show outbound TCP 25 as reachable, the mail host
must resolve to the VPS, and the VPS provider must set PTR/rDNS to the same mail
host.

## OTLP provider configuration

Generate the private exporter env with `observability/tools/configure-server.py` from the named provider profiles. Install it independently of business credentials:

```sh
COLAB_OBSERVABILITY_ENV=/private/path/server-exporter.env server/deploy/configure-observability.sh
```

This writes `/etc/agent-colab/observability.env` and a systemd drop-in; the next Server deployment/restart activates it. A provider switch regenerates and reinstalls this file, then restarts Server. Never copy the token into GUI/Skill/Core artifacts. Linux source builds include the shared `observability/rust` crate and inject the selected Server release version.

Canvas image storage is installed separately from business/server configuration:

```bash
COLAB_BLOB_ENV_FILE=/private/canvas-image-storage.env server/deploy/configure-blob.sh
```

The private file supplies `COLAB_CANVAS_IMAGE_S3_BUCKET`, a dedicated managed
`COLAB_CANVAS_IMAGE_S3_PREFIX`, and standard `AWS_ENDPOINT`, `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. R2 uses region `auto`; credentials
remain on Server. Restart/deploy Server after installation. Existing Files and
Sessions retain their configured store. Do not place images under the client
artifact prefix. Image GC only scans its dedicated namespace.
