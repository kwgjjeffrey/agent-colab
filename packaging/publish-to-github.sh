#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
release_version="$(tr -d '[:space:]' < "$repo_root/VERSION")"
core_version="$(tr -d '[:space:]' < "$repo_root/local/VERSION")"
ui_version="$(tr -d '[:space:]' < "$repo_root/desktop/ui/VERSION")"
skill_version="$(tr -d '[:space:]' < "$repo_root/skills/colab/VERSION")"
shell_version="$(tr -d '[:space:]' < "$repo_root/desktop/shell/VERSION")"
tag="v$release_version"

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required" >&2; exit 2; }
gh auth status >/dev/null

sources=(
  "$repo_root/packaging/colab-install"
  "$repo_root/packaging/colab-install.ps1"
  "$repo_root/dist/release-$release_version.json"
  "$repo_root/dist/release-$release_version.json.sig"
  "$repo_root/dist/local-core/$core_version/darwin-arm64.tar.gz"
  "$repo_root/dist/local-core/$core_version/windows-x86_64.zip"
  "$repo_root/dist/desktop-ui/$ui_version.zip"
  "$repo_root/dist/colab-skill/$skill_version.zip"
  "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-arm64.dmg"
  "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip"
  "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-x64.exe"
)

for asset in "${sources[@]}"; do
  [[ -f "$asset" ]] || { echo "Missing release asset: $asset" >&2; exit 2; }
done

notes="$(mktemp -t agent-colab-release-notes)"
stage="$(mktemp -d -t agent-colab-github-release)"
trap 'rm -f "$notes"; rm -rf "$stage"' EXIT
# Descriptive names keep independent artifacts unambiguous in GitHub's flat asset list.
cp "$repo_root/packaging/colab-install" "$stage/colab-install"
cp "$repo_root/packaging/colab-install.ps1" "$stage/colab-install.ps1"
cp "$repo_root/dist/release-$release_version.json" "$stage/release-$release_version.json"
cp "$repo_root/dist/release-$release_version.json.sig" "$stage/release-$release_version.json.sig"
cp "$repo_root/dist/local-core/$core_version/darwin-arm64.tar.gz" "$stage/agent-colab-local-core-$core_version-darwin-arm64.tar.gz"
cp "$repo_root/dist/local-core/$core_version/windows-x86_64.zip" "$stage/agent-colab-local-core-$core_version-windows-x86_64.zip"
cp "$repo_root/dist/desktop-ui/$ui_version.zip" "$stage/agent-colab-desktop-ui-$ui_version.zip"
cp "$repo_root/dist/colab-skill/$skill_version.zip" "$stage/agent-colab-skill-$skill_version.zip"
cp "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-arm64.dmg" "$stage/Colab-$shell_version-arm64.dmg"
cp "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip" "$stage/Colab-$shell_version-arm64.zip"
cp "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-x64.exe" "$stage/Colab-$shell_version-x64.exe"
assets=("$stage"/*)
printf '%s\n' \
  'Public alpha release for evaluation.' \
  '' \
  'The artifacts have independent versions:' \
  "- Local Core: $core_version" \
  "- Desktop UI: $ui_version" \
  "- Agent Colab Skill: $skill_version" \
  "- Electron Shell: $shell_version" \
  '' \
  'On Windows, `Colab-*-x64.exe` bootstraps the bundled Core, GUI, and Agent Skill on first launch; `colab-install.ps1` remains available for headless or Skill-first setup. On macOS, use the DMG for the launcher and `colab-install` for Core, GUI, and Skill setup. The desktop builds are not yet notarized or publicly signed.' \
  > "$notes"

# GitHub Releases are a public mirror. R2 remains the signed update origin used by installed clients.
gh release create "$tag" "${assets[@]}" \
  --title "Agent Colab $release_version (Alpha)" \
  --notes-file "$notes" \
  --prerelease \
  --verify-tag
