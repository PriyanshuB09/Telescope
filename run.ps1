$ErrorActionPreference = 'Stop'

$bunBin = Join-Path $env:USERPROFILE '.bun\bin'
$bunExe = Join-Path $bunBin 'bun.exe'

if (-not (Test-Path -LiteralPath $bunExe)) {
  Write-Host 'Installing Bun for the current Windows user...'
  irm bun.sh/install.ps1 | iex
}

$env:Path = "$bunBin;$env:Path"
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun was installed but is not available at $bunExe. Restart Codex and run .\run.ps1 again."
}

Push-Location $PSScriptRoot
try {
  Write-Host 'Installing project dependencies with Bun...'
  bun install
  if ($LASTEXITCODE -ne 0) { throw 'bun install failed.' }

  $authMarker = Join-Path $PSScriptRoot '.convex-auth-configured'
  if (-not (Test-Path -LiteralPath $authMarker)) {
    Write-Host 'Linking your Convex development deployment...'
    bunx convex dev --once
    if ($LASTEXITCODE -ne 0) { throw 'Convex setup failed.' }

    Write-Host 'Setting up Convex Auth signing keys for this deployment...'
    bunx @convex-dev/auth --web-server-url http://localhost:5173
    if ($LASTEXITCODE -ne 0) { throw 'Convex Auth setup failed.' }
    New-Item -ItemType File -Path $authMarker -Force | Out-Null
  }

  Write-Host 'Starting Convex. On first setup, sign in and select your personal team when prompted.'
  bunx convex dev --start 'bun run dev'
  if ($LASTEXITCODE -ne 0) { throw 'Convex development server stopped with an error.' }
}
finally {
  Pop-Location
}
