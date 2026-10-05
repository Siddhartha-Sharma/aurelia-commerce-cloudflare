$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop and start its Linux container engine first.' }
if (-not $env:SONAR_TOKEN) { throw 'Set SONAR_TOKEN using a token generated in your local SonarQube account.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  docker run --rm -e SONAR_TOKEN -e SONAR_HOST_URL=http://host.docker.internal:9000 --mount "type=bind,source=$projectRoot,target=/usr/src" sonarsource/sonar-scanner-cli:latest
  if ($LASTEXITCODE -ne 0) { throw 'Sonar scan failed; inspect scanner output.' }
} finally { Pop-Location }

