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

assets=(
  "$repo_root/packaging/colab-install"
  "$repo_root/packaging/colab-install.ps1"
  "$repo_root/dist/release-$release_version.json"
  "$repo_root/dist/release-$release_version.json.sig"
  "$repo_root/dist/local-core/$core_version/darwin-arm64.tar.gz"
  "$repo_root/dist/local-core/$core_version/windows-x86_64.zip"
  "$repo_root/dist/desktop-ui/$ui_version.zip"
  "$repo_root/dist/colab-skill/$skill_version.zip"
  "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-arm64.zip"
  "$repo_root/dist/electron-shell/$shell_version/Colab-$shell_version-x64.exe"
)

for asset in "${assets[@]}"; do
  [[ -f "$asset" ]] || { echo "Missing release asset: $asset" >&2; exit 2; }
done

notes="$(mktemp -t agent-colab-release-notes)"
trap 'rm -f "$notes"' EXIT
printf '%s\n' \
  'Public alpha release for evaluation.' \
  '' \
  'The artifacts have independent versions:' \
  "- Local Core: $core_version" \
  "- Desktop UI: $ui_version" \
  "- Agent Colab Skill: $skill_version" \
  "- Electron Shell: $shell_version" \
  '' \
  'Use `colab-install` on macOS or `colab-install.ps1` on Windows. The desktop builds are not yet notarized or code-signed for public distribution.' \
  > "$notes"

# GitHub Releases are a public mirror. R2 remains the signed update origin used by installed clients.
gh release create "$tag" "${assets[@]}" \
  --title "Agent Colab $release_version (Alpha)" \
  --notes-file "$notes" \
  --prerelease \
  --verify-tag
