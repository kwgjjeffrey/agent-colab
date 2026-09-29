param(
  [string]$GoogleCredentials,
  [ValidateSet("codex", "claude", "myflicker")][string[]]$Agent = @("codex"),
  [string]$Manifest = "https://artifacts.agent-colab.zhiyuanwangluo.online/channels/stable.json"
)

$ErrorActionPreference = "Stop"
if ($GoogleCredentials -and -not (Test-Path -LiteralPath $GoogleCredentials -PathType Leaf)) {
  throw "GoogleCredentials must point to the Google Desktop OAuth JSON file"
}
foreach ($command in @("py", "ssh-keygen", "git")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Missing required command: $command" }
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) ("agent-colab-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  $manifestPath = Join-Path $temporary "stable.json"
  $signaturePath = Join-Path $temporary "stable.json.sig"
  $allowedPath = Join-Path $temporary "release-allowed-signers"
  Invoke-WebRequest -UseBasicParsing -Uri $Manifest -OutFile $manifestPath
  Invoke-WebRequest -UseBasicParsing -Uri ($Manifest + ".sig") -OutFile $signaturePath
  Set-Content -LiteralPath $allowedPath -Encoding ascii -Value "agent-colab ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDCxpnhppbE+x96B8Y0Y/kqaIOXm5hweIrP4zpOAQeHz"
  Get-Content -Raw -LiteralPath $manifestPath | & ssh-keygen -Y verify -f $allowedPath -I agent-colab -n agent-colab-release -s $signaturePath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Release manifest signature verification failed" }

  $release = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $skill = $release.artifacts | Where-Object { $_.name -eq "colab-skill" -and -not $_.platform } | Select-Object -First 1
  if (-not $skill) { throw "Release has no universal colab-skill artifact" }
  $archive = Join-Path $temporary "colab-skill.zip"
  Invoke-WebRequest -UseBasicParsing -Uri $skill.url -OutFile $archive
  if ((Get-Item $archive).Length -ne [int64]$skill.size -or (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $skill.sha256) {
    throw "Colab Skill artifact verification failed"
  }
  $expanded = Join-Path $temporary "skill"
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded
  $setup = Get-ChildItem -Path $expanded -Recurse -File -Filter "colab-setup" | Where-Object { $_.FullName -match '[\\/]setup[\\/]colab-setup$' } | Select-Object -First 1
  if (-not $setup) { throw "Colab Skill setup entry is missing" }
  $arguments = @($setup.FullName, "install", "--manifest", $Manifest)
  if ($GoogleCredentials) { $arguments += @("--google-credentials", (Resolve-Path $GoogleCredentials).Path) }
  foreach ($target in $Agent) { $arguments += @("--agent", $target) }
  & py @arguments
  if ($LASTEXITCODE -ne 0) { throw "Agent Colab setup failed" }
} finally {
  Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
