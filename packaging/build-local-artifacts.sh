#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
core_version=$(tr -d '[:space:]' < "$repo_root/local/VERSION")
ui_version=$(tr -d '[:space:]' < "$repo_root/desktop/ui/VERSION")
skill_version=$(tr -d '[:space:]' < "$repo_root/skills/colab/VERSION")
shell_version=$(tr -d '[:space:]' < "$repo_root/desktop/shell/VERSION")
platform=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
dist="$repo_root/dist"

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

# Each archive is independently installable and versioned. The optional
# Electron launcher is built separately and is not required by Core, GUI, or Skill.
if $build_core; then
  cargo build --locked --release --manifest-path "$repo_root/local/Cargo.toml" -p colabd
  mkdir -p "$dist/local-core/$core_version/$platform-$arch"
  cp "$repo_root/local/target/release/colabd" "$dist/local-core/$core_version/$platform-$arch/colabd"
  tar -C "$dist/local-core/$core_version/$platform-$arch" -czf "$dist/local-core/$core_version/$platform-$arch.tar.gz" colabd
fi

if $build_ui; then
  cd "$repo_root/desktop"
  npx --yes pnpm@10.18.3 --dir ui build
  mkdir -p "$dist/desktop-ui/$ui_version"
  cp -R "$repo_root/desktop/ui/dist/." "$dist/desktop-ui/$ui_version/"
  printf '{"package":"colab-desktop-ui","version":"%s","hostProtocol":1,"localApi":">=0.1.0 <0.2.0"}\n' "$ui_version" > "$dist/desktop-ui/$ui_version/ui.json"
  rm -f "$dist/desktop-ui/$ui_version.zip"
  (cd "$dist/desktop-ui/$ui_version" && /usr/bin/zip -qr "$dist/desktop-ui/$ui_version.zip" .)
fi

if $build_skill; then
  mkdir -p "$dist/colab-skill/$skill_version"
  cp "$repo_root/skills/colab/SKILL.md" "$dist/colab-skill/$skill_version/"
  cp "$repo_root/skills/colab/AGENTS.md" "$dist/colab-skill/$skill_version/"
  cp -R "$repo_root/skills/colab/agents" "$repo_root/skills/colab/bin" "$repo_root/skills/colab/lib" "$repo_root/skills/colab/setup" "$repo_root/skills/colab/references" "$dist/colab-skill/$skill_version/"
  cp "$repo_root/skills/colab/packaging/artifact.json" "$dist/colab-skill/$skill_version/installed.json"
  rm -f "$dist/colab-skill/$skill_version.zip"
  (cd "$dist/colab-skill" && /usr/bin/zip -qr "$dist/colab-skill/$skill_version.zip" "$skill_version")
fi

# Electron is an optional launcher artifact. It is packaged separately from
# the required GUI/Core/Skill combination and therefore updates infrequently.
if $build_shell; then
  npx --yes pnpm@10.18.3 --dir "$repo_root/desktop/shell" exec electron-builder --mac dir --arm64
  codesign --force --deep --sign - "$repo_root/desktop/shell/dist/mac-arm64/Colab.app"
  codesign --verify --deep --strict "$repo_root/desktop/shell/dist/mac-arm64/Colab.app"
  mkdir -p "$dist/electron-shell/$shell_version"
  ditto -c -k --sequesterRsrc --keepParent "$repo_root/desktop/shell/dist/mac-arm64/Colab.app" "$dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip"
fi

for artifact in "$dist/local-core/$core_version/$platform-$arch.tar.gz" "$dist/desktop-ui/$ui_version.zip" "$dist/colab-skill/$skill_version.zip" "$dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip"; do
  shasum -a 256 "$artifact"
done
