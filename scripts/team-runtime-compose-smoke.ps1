[CmdletBinding()]
param(
  [Nullable[int]]$BasePort,
  [ValidateRange(60, 900)]
  [int]$WaitTimeoutSeconds = 600,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
$project = "ctsmoke-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$composeFiles = @(
  (Join-Path $repositoryRoot 'deploy/compose.team-infra.yaml'),
  (Join-Path $repositoryRoot 'deploy/compose.team-idp.yaml'),
  (Join-Path $repositoryRoot 'deploy/compose.team-api.yaml'),
  (Join-Path $repositoryRoot 'deploy/compose.team-gateway.yaml')
)
$profiles = @('team-infra', 'team-idp', 'team-api', 'team-gateway', 'team-maintenance', 'team-worker-audit', 'team-worker-image', 'team-worker-ppt-create', 'team-worker-ppt-improve', 'team-worker-ppt-quality')
$temporaryVariables = @(
  'COMMON_TOOLS_POSTGRES_PASSWORD', 'COMMON_TOOLS_REDIS_PASSWORD', 'COMMON_TOOLS_MINIO_PASSWORD',
  'COMMON_TOOLS_KEYCLOAK_ADMIN', 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD',
  'COMMON_TOOLS_POSTGRES_PORT', 'COMMON_TOOLS_REDIS_PORT', 'COMMON_TOOLS_MINIO_PORT',
  'COMMON_TOOLS_MINIO_CONSOLE_PORT', 'COMMON_TOOLS_KEYCLOAK_PORT', 'COMMON_TOOLS_REMOTE_PORT',
  'COMMON_TOOLS_REMOTE_PUBLIC_URL', 'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS', 'COMMON_TOOLS_OIDC_ISSUER',
  'COMMON_TOOLS_OIDC_JWKS_URL', 'COMMON_TOOLS_OIDC_AUDIENCE', 'COMMON_TOOLS_TEAM_CAPABILITIES'
)
$originalEnvironment = @{}

function New-LocalSecret {
  $alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.ToCharArray()
  $bytes = New-Object byte[] 36
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}
function Test-LoopbackPortAvailable([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}
function Assert-LoopbackPortAvailable([int]$Port) {
  if (-not (Test-LoopbackPortAvailable $Port)) { throw "Smoke-test loopback port is unavailable: $Port" }
}
function Find-LoopbackPortRange {
  # Choose a high ephemeral range rather than assuming a fixed group is free.
  # The project name is already random; randomizing the ports prevents a local
  # service on one common port from blocking every isolated smoke run.
  for ($attempt = 0; $attempt -lt 128; $attempt += 1) {
    $candidate = Get-Random -Minimum 20000 -Maximum 60000
    $available = $true
    for ($offset = 0; $offset -lt 6; $offset += 1) {
      if (-not (Test-LoopbackPortAvailable ($candidate + $offset))) { $available = $false; break }
    }
    if ($available) { return $candidate }
  }
  throw 'Could not reserve a six-port loopback range for the Compose smoke test'
}
function Invoke-Compose([string[]]$Arguments) {
  $baseArguments = @('compose', '--project-name', $project)
  foreach ($composeFile in $composeFiles) { $baseArguments += @('--file', $composeFile) }
  foreach ($profile in $profiles) { $baseArguments += @('--profile', $profile) }
  & docker @baseArguments @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose smoke-test command failed' }
}

if ($null -eq $BasePort) {
  $BasePort = Find-LoopbackPortRange
} elseif ($BasePort -lt 1024 -or $BasePort + 5 -gt 65535) {
  throw 'Smoke-test base port is invalid'
}
for ($port = $BasePort; $port -le $BasePort + 5; $port += 1) { Assert-LoopbackPortAvailable $port }

try {
  foreach ($name in $temporaryVariables) { $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  $env:COMMON_TOOLS_POSTGRES_PASSWORD = New-LocalSecret
  $env:COMMON_TOOLS_REDIS_PASSWORD = New-LocalSecret
  $env:COMMON_TOOLS_MINIO_PASSWORD = New-LocalSecret
  $env:COMMON_TOOLS_KEYCLOAK_ADMIN = 'ctsmoke-admin'
  $env:COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD = New-LocalSecret
  $env:COMMON_TOOLS_POSTGRES_PORT = "$BasePort"
  $env:COMMON_TOOLS_REDIS_PORT = "$($BasePort + 1)"
  $env:COMMON_TOOLS_MINIO_PORT = "$($BasePort + 2)"
  $env:COMMON_TOOLS_MINIO_CONSOLE_PORT = "$($BasePort + 3)"
  $env:COMMON_TOOLS_KEYCLOAK_PORT = "$($BasePort + 4)"
  $env:COMMON_TOOLS_REMOTE_PORT = "$($BasePort + 5)"
  $env:COMMON_TOOLS_REMOTE_PUBLIC_URL = "http://127.0.0.1:$($BasePort + 5)"
  $env:COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS = $env:COMMON_TOOLS_REMOTE_PUBLIC_URL
  $env:COMMON_TOOLS_OIDC_ISSUER = "http://127.0.0.1:$($BasePort + 4)/realms/common-tools"
  $env:COMMON_TOOLS_OIDC_JWKS_URL = 'http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs'
  $env:COMMON_TOOLS_OIDC_AUDIENCE = 'common-tools-mcp'
  # Keep the enabled API capabilities exactly aligned with all Workers that this
  # isolated smoke test starts; a Worker must never run for a disabled capability.
  $env:COMMON_TOOLS_TEAM_CAPABILITIES = 'image-to-editable,project-audit,ppt-create,ppt-improve,ppt-quality'

  Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
  Invoke-Compose @('config', '--quiet')
  Invoke-Compose @('up', '--detach', '--build', '--wait', '--wait-timeout', $WaitTimeoutSeconds)
  $ready = Invoke-WebRequest -UseBasicParsing "$($env:COMMON_TOOLS_REMOTE_PUBLIC_URL)/readyz"
  if ($ready.StatusCode -ne 200 -or $ready.Content -ne '{"status":"ok"}') { throw 'Team Runtime readiness response is invalid' }
  [pscustomobject]@{ project = $project; remoteUrl = $env:COMMON_TOOLS_REMOTE_PUBLIC_URL; status = 'passed' } | ConvertTo-Json -Compress
} finally {
  if (-not $KeepArtifacts) {
    try { Invoke-Compose @('down', '--volumes', '--remove-orphans') } catch { Write-Warning 'Smoke-test cleanup failed; inspect only the reported ctsmoke project.' }
  }
  foreach ($name in $temporaryVariables) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process') }
}
