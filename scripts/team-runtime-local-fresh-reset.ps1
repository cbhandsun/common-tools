[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidateRange(30, 600)]
  [int]$WaitTimeoutSeconds = 180,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
$infraFile = Join-Path $repositoryRoot 'deploy/compose.team-infra.yaml'
$idpFile = Join-Path $repositoryRoot 'deploy/compose.team-idp.yaml'
$apiFile = Join-Path $repositoryRoot 'deploy/compose.team-api.yaml'
$gatewayFile = Join-Path $repositoryRoot 'deploy/compose.team-gateway.yaml'
$allProfiles = @('team-infra', 'team-idp', 'team-api', 'team-gateway', 'team-maintenance', 'team-worker-audit', 'team-worker-image', 'team-worker-ppt-improve', 'team-worker-ppt-quality')
$requiredEnvironment = @(
  'COMMON_TOOLS_POSTGRES_PASSWORD', 'COMMON_TOOLS_REDIS_PASSWORD', 'COMMON_TOOLS_MINIO_PASSWORD',
  'COMMON_TOOLS_KEYCLOAK_ADMIN', 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD',
  'COMMON_TOOLS_REMOTE_PUBLIC_URL', 'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS', 'COMMON_TOOLS_OIDC_ISSUER',
  'COMMON_TOOLS_OIDC_JWKS_URL', 'COMMON_TOOLS_OIDC_AUDIENCE'
)

function Invoke-FreshCompose([string[]]$Arguments) {
  $baseArguments = @('compose', '--project-name', $Project)
  foreach ($composeFile in @($infraFile, $idpFile, $apiFile, $gatewayFile)) { $baseArguments += @('--file', $composeFile) }
  foreach ($profile in $allProfiles) { $baseArguments += @('--profile', $profile) }
  & docker @baseArguments @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose command failed during fresh local reset' }
}

function Invoke-InitialCompose([string[]]$Arguments) {
  $baseArguments = @('compose', '--project-name', $Project, '--file', $infraFile, '--file', $idpFile, '--profile', 'team-infra', '--profile', 'team-idp')
  & docker @baseArguments @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose infrastructure bootstrap failed' }
}

function Set-MissingLocalDefaults {
  $defaults = [ordered]@{
    COMMON_TOOLS_REMOTE_PUBLIC_URL = 'http://127.0.0.1:54000'
    COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS = 'http://127.0.0.1:54000'
    COMMON_TOOLS_OIDC_ISSUER = 'http://127.0.0.1:58080/realms/common-tools'
    COMMON_TOOLS_OIDC_JWKS_URL = 'http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs'
    COMMON_TOOLS_OIDC_AUDIENCE = 'common-tools-mcp'
    COMMON_TOOLS_TEAM_CAPABILITIES = 'image-to-editable,project-audit,ppt-quality,ppt-improve'
  }
  foreach ($entry in $defaults.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($entry.Key, 'Process'))) {
      [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
  }
}

function Test-LoopbackPortAvailable([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}

function Set-MissingLocalMinioPorts {
  $apiPort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_PORT', 'Process')
  $consolePort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_CONSOLE_PORT', 'Process')
  if (-not [string]::IsNullOrWhiteSpace($apiPort) -or -not [string]::IsNullOrWhiteSpace($consolePort)) { return }
  if ((Test-LoopbackPortAvailable 59000) -and (Test-LoopbackPortAvailable 59001)) { return }
  for ($attempt = 0; $attempt -lt 128; $attempt += 1) {
    $candidate = Get-Random -Minimum 20000 -Maximum 65535
    if ((Test-LoopbackPortAvailable $candidate) -and (Test-LoopbackPortAvailable ($candidate + 1))) {
      [Environment]::SetEnvironmentVariable('COMMON_TOOLS_MINIO_PORT', "$candidate", 'Process')
      [Environment]::SetEnvironmentVariable('COMMON_TOOLS_MINIO_CONSOLE_PORT', "$($candidate + 1)", 'Process')
      return
    }
  }
  throw 'Could not find available loopback ports for local MinIO'
}

Set-MissingLocalDefaults
Set-MissingLocalMinioPorts
$missing = @($requiredEnvironment | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process')) })
if ($missing.Count -gt 0) { throw "Required fresh-reset configuration is missing: $($missing -join ', ')" }
$sharedPasswords = @('COMMON_TOOLS_POSTGRES_PASSWORD', 'COMMON_TOOLS_REDIS_PASSWORD', 'COMMON_TOOLS_MINIO_PASSWORD', 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD') | ForEach-Object { [Environment]::GetEnvironmentVariable($_, 'Process') }
if (($sharedPasswords | Select-Object -Unique).Count -ne 1) { throw 'Fresh local reset requires one shared local password for PostgreSQL, Redis, MinIO, and Keycloak' }
if ($sharedPasswords[0].Length -lt 8) { throw 'Fresh local reset password must contain at least 8 characters' }

Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
Invoke-FreshCompose @('config', '--quiet')
if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    stateVolumes = @("$Project`_common-tools-postgres", "$Project`_common-tools-redis", "$Project`_common-tools-minio", "$Project`_common-tools-keycloak")
    capabilities = @('image-to-editable', 'project-audit', 'ppt-quality', 'ppt-improve')
    localMinioPorts = @{
      api = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_PORT', 'Process')
      console = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_CONSOLE_PORT', 'Process')
    }
    changed = $false
    applyRequires = 'explicit -Confirm'
  } | ConvertTo-Json -Compress
  return
}

if (-not $Confirm) { throw 'Apply requires -Confirm' }
# This is intentionally scoped to declared services and volumes for this exact
# project. Do not add --remove-orphans: unknown containers are not reset.
Invoke-FreshCompose @('down', '--volumes')
Invoke-InitialCompose @('up', '--detach', '--wait', '--wait-timeout', $WaitTimeoutSeconds)
$localDeploy = Join-Path $PSScriptRoot 'team-runtime-local-deploy.ps1'
& $localDeploy -Mode Apply -Project $Project -WaitTimeoutSeconds $WaitTimeoutSeconds -DockerEngineTimeoutSeconds $DockerEngineTimeoutSeconds -DiscoverLocalPorts
if ($LASTEXITCODE -ne 0) { throw 'Fresh local API and Worker deployment failed' }
} finally {
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
