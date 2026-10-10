#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
# Official builds inject the installed-app OAuth client as release configuration. It is not a
# user secret, but the source path remains ignored so forks can publish their own client identity.
config_file="${COLAB_R2_CONFIG:-$repo_root/packaging/.env.local}"
if [[ -f "$config_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$config_file"
  set +a
fi
source_revision=$(python3 "$repo_root/packaging/source-revision.py")
export COLAB_CODE_REVISION="$source_revision"
export VITE_COLAB_CODE_REVISION="$source_revision"
core_version=$(tr -d '[:space:]' < "$repo_root/local/VERSION")
ui_version=$(tr -d '[:space:]' < "$repo_root/desktop/ui/VERSION")
skill_version=$(tr -d '[:space:]' < "$repo_root/skills/colab/VERSION")
shell_version=$(tr -d '[:space:]' < "$repo_root/desktop/shell/VERSION")
platform=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
dist="${COLAB_ARTIFACT_DIST_DIR:-$repo_root/dist}"
# A private deployment owns independent component versions and an isolated output directory.
# The public build remains unchanged when no profile directory is provided.
if [[ -n "${COLAB_COMPONENT_VERSIONS_DIR:-}" ]]; then
  [[ -n "${COLAB_ARTIFACT_DIST_DIR:-}" ]] || { echo "private builds require COLAB_ARTIFACT_DIST_DIR" >&2; exit 2; }
  python3 - "$repo_root/integration" "$dist" <<'PYPATH'
import pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2]).resolve()
try:
    relative = output.relative_to(root)
except ValueError:
    sys.exit("enterprise artifacts must stay under integration/.../artifacts")
if "artifacts" not in relative.parts:
    sys.exit("enterprise artifacts must stay under integration/.../artifacts")
PYPATH
  export COLAB_ARTIFACT_CONFIG="${COLAB_ARTIFACT_CONFIG:-$(dirname "$COLAB_COMPONENT_VERSIONS_DIR")/config.json}"
  deployment_mode=enterprise
  core_version=$(tr -d '[:space:]' < "$COLAB_COMPONENT_VERSIONS_DIR/local-core")
  ui_version=$(tr -d '[:space:]' < "$COLAB_COMPONENT_VERSIONS_DIR/desktop-ui")
  skill_version=$(tr -d '[:space:]' < "$COLAB_COMPONENT_VERSIONS_DIR/colab-skill")
  shell_version=$(tr -d '[:space:]' < "$COLAB_COMPONENT_VERSIONS_DIR/electron-shell")
else
  export COLAB_ARTIFACT_CONFIG="${COLAB_ARTIFACT_CONFIG:-$repo_root/packaging/artifact-config.local.json}"
  deployment_mode=public
fi
mkdir -p "$dist"
dist=$(cd "$dist" && pwd)
build_work=$(mktemp -d "$dist/.build-XXXXXXXX")
trap 'rm -rf "$build_work"' EXIT
python3 "$repo_root/packaging/artifact-config.py" --config "$COLAB_ARTIFACT_CONFIG" --mode "$deployment_mode" --out "$dist/bootstrap"
export CARGO_TARGET_DIR="$dist/.cargo-target"

build_core=false
build_ui=false
build_skill=false
build_shell=false
if [[ $# -eq 0 ]]; then
  build_core=true
  build_ui=true
  build_skill=true
else
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --component)
        case "${2:-}" in
          local-core) build_core=true ;;
          desktop-ui) build_ui=true ;;
          colab-skill) build_skill=true ;;
          electron-shell) build_shell=true ;;
          *) echo "unknown component: ${2:-}" >&2; exit 2 ;;
        esac
        shift 2
        ;;
      --with-shell)
        build_shell=true
        shift
        ;;
      *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
  done
fi

# Never rebuild an existing independent version in place.
for entry in "local-core:$build_core:$core_version" "desktop-ui:$build_ui:$ui_version" "colab-skill:$build_skill:$skill_version" "electron-shell:$build_shell:$shell_version"; do
  IFS=: read -r component enabled version <<< "$entry"
  if [[ "$enabled" == true && -e "$dist/$component/$version" ]]; then
    echo "artifact version already exists: $component/$version; advance its owning version" >&2
    exit 2
  fi
done

# Each archive is independently installable and versioned. The optional
# Electron launcher is built separately and is not required by Core, GUI, or Skill.
if $build_core; then
  # esbuild uses its pinned platform package; no dependency lifecycle scripts are needed.
  CI=true npx --yes pnpm@10.18.3 --dir "$repo_root/local/canvas-codec" install --frozen-lockfile --ignore-scripts
  npx --yes pnpm@10.18.3 --dir "$repo_root/local/canvas-codec" exec esbuild "$repo_root/local/canvas-codec/cli.mjs" --bundle --platform=node --format=cjs --outfile="$build_work/codec.cjs"
  COLAB_LOCAL_CORE_VERSION="$core_version" cargo build --locked --release --manifest-path "$repo_root/local/Cargo.toml" -p colabd
  mkdir -p "$dist/local-core/$core_version/$platform-$arch"
  cp "$CARGO_TARGET_DIR/release/colabd" "$dist/local-core/$core_version/$platform-$arch/colabd"
  mkdir -p "$dist/local-core/$core_version/$platform-$arch/canvas-codec"
  cp "$build_work/codec.cjs" "$dist/local-core/$core_version/$platform-$arch/canvas-codec/codec.cjs"
  node_runtime=$(command -v node)
  cp "$node_runtime" "$dist/local-core/$core_version/$platform-$arch/canvas-codec/node"
  if [[ -n "${COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE:-}" ]]; then
    [[ -f "$COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE" ]] || {
      echo "COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE does not exist" >&2
      exit 2
    }
    cp "$COLAB_DESKTOP_GOOGLE_OAUTH_CREDENTIALS_FILE" "$dist/local-core/$core_version/$platform-$arch/google-oauth.json"
  fi
  tar -C "$dist/local-core/$core_version/$platform-$arch" -czf "$dist/local-core/$core_version/$platform-$arch.tar.gz" .
fi

if $build_ui; then
  cd "$repo_root/desktop"
  npx --yes pnpm@10.18.3 --dir ui exec tsc --noEmit --incremental false
  COLAB_DESKTOP_UI_VERSION="$ui_version" npx --yes pnpm@10.18.3 --dir ui exec vite build --outDir "$build_work/ui"
  mkdir -p "$dist/desktop-ui/$ui_version"
  cp -R "$build_work/ui/." "$dist/desktop-ui/$ui_version/"
  cp -R "$repo_root/desktop/ui/tracing" "$dist/desktop-ui/$ui_version/"
  printf '{"package":"colab-desktop-ui","version":"%s","hostProtocol":1,"localApi":">=0.1.0 <0.2.0"}\n' "$ui_version" > "$dist/desktop-ui/$ui_version/ui.json"
  rm -f "$dist/desktop-ui/$ui_version.zip"
  (cd "$dist/desktop-ui/$ui_version" && /usr/bin/zip -qr "$dist/desktop-ui/$ui_version.zip" .)
fi

if $build_skill; then
  mkdir -p "$dist/colab-skill/$skill_version"
  cp "$COLAB_ARTIFACT_CONFIG" "$dist/colab-skill/$skill_version/artifact-config.json"
  cp "$repo_root/skills/colab/SKILL.md" "$dist/colab-skill/$skill_version/"
  cp "$repo_root/skills/colab/AGENTS.md" "$dist/colab-skill/$skill_version/"
  cp -R "$repo_root/skills/colab/agents" "$repo_root/skills/colab/bin" "$repo_root/skills/colab/lib" "$repo_root/skills/colab/setup" "$repo_root/skills/colab/references" "$repo_root/skills/colab/tracing" "$dist/colab-skill/$skill_version/"
  python3 "$repo_root/packaging/artifact-config.py" --config "$COLAB_ARTIFACT_CONFIG" --skill-out "$dist/colab-skill/$skill_version"
  rm -f "$dist/colab-skill/$skill_version/lib/trace-registry.generated.json"
  python3 "$repo_root/packaging/bundle-skill-telemetry.py" "$dist/colab-skill/$skill_version"
  python3 - "$repo_root/skills/colab/packaging/artifact.json" "$dist/colab-skill/$skill_version/installed.json" "$source_revision" "$skill_version" <<'PYMETA'
import json, sys
from pathlib import Path
value=json.loads(Path(sys.argv[1]).read_text()); value["codeRevision"]=sys.argv[3]; value["version"]=sys.argv[4]
Path(sys.argv[2]).write_text(json.dumps(value, indent=2)+"\n")
PYMETA
  rm -f "$dist/colab-skill/$skill_version.zip"
  (cd "$dist/colab-skill" && /usr/bin/zip -qr "$dist/colab-skill/$skill_version.zip" "$skill_version")
fi

# Electron is an optional launcher artifact. It is packaged separately from
# the required GUI/Core/Skill combination and therefore updates infrequently.
if $build_shell; then
  # ZIP remains the machine-consumed launcher/update artifact. DMG is the
  # human-facing macOS evaluation installer mirrored by GitHub Releases.
  npx --yes pnpm@10.18.3 --dir "$repo_root/desktop/shell" exec electron-builder --mac dir --arm64 --config.directories.output="$build_work/shell" --config.mac.extraResources.0.from="$dist/bootstrap/colab-install"
  codesign --force --deep --sign - "$build_work/shell/mac-arm64/Colab.app"
  codesign --verify --deep --strict "$build_work/shell/mac-arm64/Colab.app"
  # Package only after signing; otherwise the DMG would contain the unsigned
  # pre-signing App even though the adjacent build directory verifies.
  npx --yes pnpm@10.18.3 --dir "$repo_root/desktop/shell" exec electron-builder --prepackaged "$build_work/shell/mac-arm64/Colab.app" --mac dmg --arm64 --config.directories.output="$build_work/shell" --config.mac.extraResources.0.from="$dist/bootstrap/colab-install"
  mkdir -p "$dist/electron-shell/$shell_version"
  ditto -c -k --sequesterRsrc --keepParent "$build_work/shell/mac-arm64/Colab.app" "$dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip"
  cp "$build_work/shell/Colab-$shell_version-arm64.dmg" "$dist/electron-shell/$shell_version/"
fi

artifacts=()
$build_core && artifacts+=("$dist/local-core/$core_version/$platform-$arch.tar.gz")
$build_ui && artifacts+=("$dist/desktop-ui/$ui_version.zip")
$build_skill && artifacts+=("$dist/colab-skill/$skill_version.zip")
if $build_shell; then
  artifacts+=("$dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip")
  artifacts+=("$dist/electron-shell/$shell_version/Colab-$shell_version-arm64.dmg")
fi
for artifact in "${artifacts[@]}"; do
  shasum -a 256 "$artifact"
done
