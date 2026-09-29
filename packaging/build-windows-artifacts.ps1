$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CoreVersion = (Get-Content (Join-Path $RepoRoot "local/VERSION") -Raw).Trim()
$ShellVersion = (Get-Content (Join-Path $RepoRoot "desktop/shell/VERSION") -Raw).Trim()
$Dist = Join-Path $RepoRoot "dist"

# This script intentionally runs on Windows: MSVC produces a native Core and
# electron-builder can produce the portable launcher without Wine.
cargo build --locked --release --manifest-path (Join-Path $RepoRoot "local/Cargo.toml") -p colabd
$CoreDir = Join-Path $Dist "local-core/$CoreVersion/windows-x86_64"
New-Item -ItemType Directory -Force $CoreDir | Out-Null
Copy-Item (Join-Path $RepoRoot "local/target/release/colabd.exe") $CoreDir
Compress-Archive -Path (Join-Path $CoreDir "colabd.exe") -DestinationPath (Join-Path $Dist "local-core/$CoreVersion/windows-x86_64.zip") -Force

node (Join-Path $RepoRoot "desktop/shell/scripts/prepare-windows-bootstrap.cjs")
npx --yes pnpm@10.18.3 --dir (Join-Path $RepoRoot "desktop/shell") exec electron-builder --win portable --x64
$ShellDir = Join-Path $Dist "electron-shell/$ShellVersion"
New-Item -ItemType Directory -Force $ShellDir | Out-Null
Copy-Item (Join-Path $RepoRoot "desktop/shell/dist/Colab-$ShellVersion-x64.exe") $ShellDir

Get-FileHash (Join-Path $Dist "local-core/$CoreVersion/windows-x86_64.zip") -Algorithm SHA256
Get-FileHash (Join-Path $ShellDir "Colab-$ShellVersion-x64.exe") -Algorithm SHA256
