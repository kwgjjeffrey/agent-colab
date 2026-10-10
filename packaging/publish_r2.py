#!/usr/bin/env python3
"""Publish independently versioned Colab artifacts to Cloudflare R2.

Immutable release objects are uploaded before the signed mutable channel.
Every object is downloaded through the public distribution domain and hashed
before the channel is promoted, so an S3 success alone cannot claim release.
"""

from __future__ import annotations

import argparse
import atexit
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_specs(repo: Path) -> list[tuple[str, str, Path, str, str | None, str | None]]:
    versions = {
        "local-core": (repo / "local/VERSION").read_text().strip(),
        "operation-workbench": (repo / "desktop/operation-workbench/VERSION").read_text().strip(),
        "desktop-ui": (repo / "desktop/ui/VERSION").read_text().strip(),
        "colab-skill": (repo / "skills/colab/VERSION").read_text().strip(),
        "electron-shell": (repo / "desktop/shell/VERSION").read_text().strip(),
    }
    return [
        # Keep Darwin after Windows during the migration release. Pre-platform
        # macOS installers collapse artifacts by name and therefore select the
        # last entry; new installers filter platform + architecture explicitly.
        ("local-core", versions["local-core"], repo / f"dist/local-core/{versions['local-core']}/windows-x86_64.zip", "local-core-windows-x86_64.zip", "windows", "x86_64"),
        ("local-core", versions["local-core"], repo / f"dist/local-core/{versions['local-core']}/darwin-arm64.tar.gz", "local-core-darwin-arm64.tar.gz", "darwin", "arm64"),
        ("operation-workbench", versions["operation-workbench"], repo / f"dist/operation-workbench/{versions['operation-workbench']}.zip", "operation-workbench.zip", None, None),
        ("desktop-ui", versions["desktop-ui"], repo / f"dist/desktop-ui/{versions['desktop-ui']}.zip", "desktop-ui.zip", None, None),
        ("colab-skill", versions["colab-skill"], repo / f"dist/colab-skill/{versions['colab-skill']}.zip", "colab-skill.zip", None, None),
        ("electron-shell", versions["electron-shell"], repo / f"dist/electron-shell/{versions['electron-shell']}/Colab-{versions['electron-shell']}-x64.exe", f"Colab-{versions['electron-shell']}-x64.exe", "windows", "x86_64"),
        ("electron-shell", versions["electron-shell"], repo / f"dist/electron-shell/{versions['electron-shell']}/Colab-{versions['electron-shell']}-arm64.zip", f"Colab-{versions['electron-shell']}-arm64.zip", "darwin", "arm64"),
    ]


def _curl_download(url: str, output: Path, byte_range: str | None = None) -> None:
    # urllib follows the macOS/Python proxy stack and has repeatedly stalled while
    # reading otherwise healthy R2 responses. curl is already a bootstrap
    # dependency, and --noproxy makes this release-integrity check deterministic.
    command = [
            "curl", "--http1.1", "--fail", "--location", "--silent", "--show-error",
            "--noproxy", "*", "--retry", "3", "--retry-all-errors",
            # Force HTTP/1.1: this R2 custom domain has returned a complete HTTP/2
            # range body without closing the stream on the development network.
            # Electron archives are currently ~110 MiB and the custom-domain
            # egress can be slow from the development network. Integrity still
            # requires a complete public readback; size the timeout for that
            # reality instead of turning a healthy large artifact into a false
            # release failure.
            "--connect-timeout", "15", "--max-time", "2400",
            "--speed-time", "20", "--speed-limit", "1024",
            "--user-agent", "agent-colab-release-verifier/1",
            "--output", str(output),
    ]
    if byte_range:
        command.extend(["--range", byte_range])
    command.append(url)
    subprocess.run(command, check=True)


def public_download(url: str, output: Path, expected_size: int | None = None) -> None:
    """Read back a public artifact, using ranges for large immutable objects.

    R2's public domain supports byte ranges. Parallel ranges avoid treating a
    slow single CDN stream as a failed release while still reconstructing and
    hashing every byte delivered to users.
    """
    # The R2 custom domain can be extremely slow on a single long-lived stream
    # even for a few MiB. Use the same deterministic range path for every
    # non-trivial artifact; the final assembled size/hash remains authoritative.
    if not expected_size or expected_size < 1024 * 1024:
        _curl_download(url, output)
        return
    # Keep each HTTP response small. This custom domain has occasionally closed
    # multi-MiB range streams early; one-MiB chunks retry cheaply and avoid
    # restarting an otherwise complete 80+ MiB artifact verification.
    chunk_size = 1024 * 1024
    # A small pool is faster and more reliable than opening dozens of TLS handshakes
    # through the same consumer uplink; excessive concurrency caused connection timeouts.
    # Two connections saturate the current uplink without creating the TLS-handshake storm seen
    # with eight concurrent ranges. Reliability matters more than shaving seconds from promotion.
    workers = min(2, (expected_size + chunk_size - 1) // chunk_size)
    parts = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = []
        for index, start in enumerate(range(0, expected_size, chunk_size)):
            end = min(expected_size - 1, start + chunk_size - 1)
            part = output.with_name(f"{output.name}.part-{index}")
            parts.append((part, end - start + 1))
            futures.append(executor.submit(_curl_download, url, part, f"{start}-{end}"))
        for future in futures:
            future.result()
    with output.open("wb") as destination:
        for part, expected_part_size in parts:
            if part.stat().st_size != expected_part_size:
                raise RuntimeError(f"public range verification failed: {part.name}")
            with part.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    destination.write(chunk)
            part.unlink()


def current_channel(public_base: str, next_version: str | None = None) -> dict[tuple[str, str, str | None, str | None], dict]:
    """Return artifacts already promoted and publicly verified by an earlier release.

    Immutable objects reused by a later mixed-version channel do not need to be
    downloaded again. New or changed component versions are still read back in
    full before the mutable channel is promoted.
    """
    try:
        with tempfile.TemporaryDirectory(prefix="agent-colab-current-channel-") as temp:
            channel = Path(temp) / "stable.json"
            public_download(f"{public_base}/channels/stable.json", channel)
            payload = json.loads(channel.read_text())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit('Cannot verify current stable; refusing partial promotion') from error
    if not isinstance(payload.get('artifacts'), list) or not payload.get('version'):
        raise SystemExit('Invalid stable manifest; refusing partial promotion')
    if next_version is not None:
        current = payload.get("version")
        if current and promotion_order(next_version) <= promotion_order(current):
            raise SystemExit(f"Promotion {next_version} is not newer than stable {current}; allocate a new promotion identifier")
    return {
        (artifact["name"], artifact["version"], artifact.get("platform"), artifact.get("arch")): artifact
        for artifact in payload.get("artifacts", [])
    }

def promotion_order(version: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in version.split("-", 1)[0].split("."))
    except ValueError as error:
        raise SystemExit("Invalid numeric promotion version") from error

def acquire_publish_lock(repo: Path) -> None:
    # Serialize this deployment's publishers before reading the retained component set.
    # This is a local publisher lock, not a claim of cross-host atomic promotion.
    import fcntl
    (repo / "dist").mkdir(exist_ok=True)
    descriptor = os.open(repo / "dist" / ".r2-publish.lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(descriptor)
        raise SystemExit("Another R2 publication is in progress; retry after it completes")
    atexit.register(os.close, descriptor)


def main() -> None:
    # Keep provider dependencies local to publication so the checked-in curl
    # readback verifier remains reusable for GitHub and other public mirrors.
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError

    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument(
        "--component",
        action="append",
        choices=["local-core", "desktop-ui", "colab-skill", "electron-shell", "operation-workbench"],
        help="Publish this changed component and retain all other artifacts from stable",
    )
    parser.add_argument(
        "--platform",
        action="append",
        choices=["darwin", "windows"],
        help="Limit a component release to this platform and retain its other stable platforms",
    )
    args = parser.parse_args()
    repo = args.repo.resolve()
    acquire_publish_lock(repo)
    version = (repo / "VERSION").read_text().strip()
    bucket = os.environ["R2_BUCKET"]
    endpoint = os.environ["R2_ENDPOINT"].rstrip("/")
    public_base = os.environ["R2_PUBLIC_BASE_URL"].rstrip("/")
    signing_key = Path(os.environ["COLAB_RELEASE_SIGNING_KEY"]).expanduser()
    if not signing_key.is_file():
        raise SystemExit(f"missing release signing key: {signing_key}")

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
    )
    s3.head_bucket(Bucket=bucket)

    config_path = Path(os.environ.get("COLAB_ARTIFACT_CONFIG", repo / "packaging/artifact-config.local.json"))
    subprocess.run(["python3", str(repo / "packaging/artifact-config.py"), "--config", str(config_path), "--mode", "public", "--out", str(repo / "dist/bootstrap")], check=True)

    promoted = current_channel(public_base, version)
    artifacts = []
    selected = set(args.component or [])
    selected_platforms = set(args.platform or [])
    if selected_platforms and not selected:
        raise SystemExit("--platform requires --component")
    if selected:
        # A component-scoped release must not require or accidentally promote half-built artifacts
        # from unrelated owning directories. The prior signed channel is the source of truth for
        # every unselected component.
        retained = [
            artifact
            for artifact in promoted.values()
            if artifact["name"] not in selected
            or (
                selected_platforms
                and artifact.get("platform") is not None
                and artifact.get("platform") not in selected_platforms
            )
        ]
        missing = {"local-core", "desktop-ui", "colab-skill", "electron-shell"} - selected - {artifact["name"] for artifact in retained}
        if missing:
            raise SystemExit(f"stable channel cannot supply unchanged components: {sorted(missing)}")
        artifacts.extend(retained)
    for name, artifact_version, path, remote_name, platform, arch in artifact_specs(repo):
        if selected and name not in selected:
            continue
        if selected_platforms and platform is not None and platform not in selected_platforms:
            continue
        if not path.is_file():
            raise SystemExit(f"missing artifact: {path}")
        digest = sha256(path)
        size = path.stat().st_size
        key = f"artifacts/{name}/{artifact_version}/{remote_name}"
        existing = None
        try:
            existing = s3.head_object(Bucket=bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") not in {"404", "NoSuchKey", "NotFound"}:
                raise
        else:
            remote_digest = existing.get("Metadata", {}).get("sha256")
            if existing["ContentLength"] != size or remote_digest != digest:
                raise SystemExit(f"refusing to overwrite immutable object with different content: {key}")
        if existing is None:
            s3.upload_file(
                str(path),
                bucket,
                key,
                ExtraArgs={
                    "CacheControl": "public, max-age=31536000, immutable",
                    "ContentType": "application/octet-stream",
                    "Metadata": {"sha256": digest, "package": name, "version": artifact_version},
                },
            )
        artifact = {
                "name": name,
                "version": artifact_version,
                "url": f"{public_base}/{key}",
                "sha256": digest,
                "size": size,
            }
        if platform: artifact["platform"] = platform
        if arch: artifact["arch"] = arch
        artifacts.append(artifact)

    manifest = repo / "dist" / f"release-{version}.json"
    manifest.write_text(json.dumps({"schemaVersion": 1, "version": version, "artifacts": artifacts}, indent=2) + "\n")
    signature = Path(f"{manifest}.sig")
    if signature.exists():
        signature.unlink()
    subprocess.run(
        ["ssh-keygen", "-Y", "sign", "-q", "-f", str(signing_key), "-n", "agent-colab-release", str(manifest)],
        check=True,
    )

    # Public-domain verification happens before publishing the mutable channel.
    with tempfile.TemporaryDirectory(prefix="agent-colab-r2-verify-") as temp:
        temp_dir = Path(temp)
        for artifact in artifacts:
            prior = promoted.get((artifact["name"], artifact["version"], artifact.get("platform"), artifact.get("arch")))
            if prior and prior.get("sha256") == artifact["sha256"] and prior.get("size") == artifact["size"]:
                continue
            downloaded = temp_dir / artifact["name"]
            public_download(artifact["url"], downloaded, artifact["size"])
            if downloaded.stat().st_size != artifact["size"] or sha256(downloaded) != artifact["sha256"]:
                raise RuntimeError(f"public verification failed: {artifact['name']}")

    if current_channel(public_base, version) != promoted:
        raise SystemExit("Stable changed during verification; retry with its latest component set")
    for source, key, content_type in [
        (manifest, "channels/stable.json", "application/json"),
        (signature, "channels/stable.json.sig", "application/octet-stream"),
    ]:
        s3.upload_file(
            str(source),
            bucket,
            key,
            ExtraArgs={"CacheControl": "no-cache", "ContentType": content_type},
        )

    with tempfile.TemporaryDirectory(prefix="agent-colab-r2-channel-") as temp:
        temp_dir = Path(temp)
        for source, name in [(manifest, "stable.json"), (signature, "stable.json.sig")]:
            downloaded = temp_dir / name
            public_download(f"{public_base}/channels/{name}", downloaded)
            if downloaded.read_bytes() != source.read_bytes():
                raise RuntimeError(f"channel readback mismatch: {name}")

    bootstraps = [
        (repo / "dist/bootstrap" / "colab-install", "install/colab-install", "text/x-shellscript"),
        (repo / "dist/bootstrap" / "colab-install.ps1", "install/colab-install.ps1", "text/plain; charset=utf-8"),
    ]
    for bootstrap, bootstrap_key, content_type in bootstraps:
        s3.upload_file(str(bootstrap), bucket, bootstrap_key, ExtraArgs={"CacheControl": "no-cache", "ContentType": content_type})
        with tempfile.TemporaryDirectory(prefix="agent-colab-r2-bootstrap-") as temp:
            downloaded = Path(temp) / bootstrap.name
            public_download(f"{public_base}/{bootstrap_key}", downloaded)
            if downloaded.read_bytes() != bootstrap.read_bytes():
                raise RuntimeError(f"bootstrap installer readback mismatch: {bootstrap.name}")

    print(f"published={public_base}/channels/stable.json")
    print(f"installer={public_base}/install/colab-install")
    print(f"windows_installer={public_base}/install/colab-install.ps1")
    for artifact in artifacts:
        print(f"verified={artifact['name']} sha256={artifact['sha256']} size={artifact['size']}")


if __name__ == "__main__":
    main()
