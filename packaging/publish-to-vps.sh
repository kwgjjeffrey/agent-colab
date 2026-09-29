#!/usr/bin/env bash
set -euo pipefail
# Legacy development adapter only. Cloudflare R2 is the canonical client
# artifact origin; do not use this script to promote the stable channel.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/server/deploy/lib.sh"
version=$(tr -d '[:space:]' < "$repo_root/VERSION")
platform=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
remote_root=${COLAB_ARTIFACT_ROOT:-/var/www/agent-colab/artifacts}
base_url=${COLAB_ARTIFACT_BASE_URL:-http://$DEPLOY_SSH_HOST/artifacts}
signing_key=${COLAB_RELEASE_SIGNING_KEY:-$HOME/.config/agent-colab/release-signing-key}
[[ -f "$signing_key" ]] || { echo "Missing release signing key: $signing_key" >&2; exit 2; }

artifacts=(
  "local-core/$version/$platform-$arch.tar.gz:local-core-$platform-$arch.tar.gz"
  "desktop-ui/$version.zip:desktop-ui.zip"
  "colab-skill/$version.zip:colab-skill.zip"
  "electron-shell/$version/Colab-$version-arm64.zip:Colab-$version-arm64.zip"
)
deploy_ssh "install -d -m 0755 '$remote_root/releases/$version' '$remote_root/channels'"
for mapping in "${artifacts[@]}"; do
  relative=${mapping%%:*}
  remote_name=${mapping#*:}
  source_file="$repo_root/dist/$relative"
  [[ -f "$source_file" ]] || { echo "Missing artifact: $source_file" >&2; exit 2; }
  remote_file="$remote_root/releases/$version/$remote_name"
  scp "${scp_options[@]}" "$source_file" "$deploy_target:$remote_file.uploading"
  deploy_ssh "chmod 0644 '$remote_file.uploading' && mv '$remote_file.uploading' '$remote_file'"
done

manifest="$repo_root/dist/release-$version.json"
python3 - "$manifest" "$version" "$platform" "$arch" "$base_url" "$repo_root/dist" <<'PY'
import hashlib,json,pathlib,sys
output,version,platform,arch,base,dist=sys.argv[1:]
def item(name,path,remote_name):
    raw=pathlib.Path(path).read_bytes()
    return {"name":name,"version":version,"url":f"{base}/releases/{version}/{remote_name}","sha256":hashlib.sha256(raw).hexdigest(),"size":len(raw)}
payload={"schemaVersion":1,"version":version,"artifacts":[
 item("local-core",f"{dist}/local-core/{version}/{platform}-{arch}.tar.gz",f"local-core-{platform}-{arch}.tar.gz"),
 item("desktop-ui",f"{dist}/desktop-ui/{version}.zip","desktop-ui.zip"),
 item("colab-skill",f"{dist}/colab-skill/{version}.zip","colab-skill.zip"),
 item("electron-shell",f"{dist}/electron-shell/{version}/Colab-{version}-arm64.zip",f"Colab-{version}-arm64.zip") ]}
pathlib.Path(output).write_text(json.dumps(payload,indent=2)+"\n")
PY
rm -f "$manifest.sig"
ssh-keygen -Y sign -q -f "$signing_key" -n agent-colab-release "$manifest"
scp "${scp_options[@]}" "$manifest" "$deploy_target:$remote_root/channels/stable.json.uploading"
scp "${scp_options[@]}" "$manifest.sig" "$deploy_target:$remote_root/channels/stable.json.sig.uploading"
deploy_ssh "chmod 0644 '$remote_root/channels/stable.json.uploading' '$remote_root/channels/stable.json.sig.uploading' && mv '$remote_root/channels/stable.json.sig.uploading' '$remote_root/channels/stable.json.sig' && mv '$remote_root/channels/stable.json.uploading' '$remote_root/channels/stable.json'"
printf 'manifest=%s/channels/stable.json\n' "$base_url"
