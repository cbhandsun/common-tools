[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidatePattern('^[a-z0-9][a-z0-9_.-]{0,127}$')]
  [string]$BackupVolume = '',
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {

$sourceVolume = "$Project`_common-tools-keycloak"
if ([string]::IsNullOrWhiteSpace($BackupVolume)) {
  $BackupVolume = "$sourceVolume-backup-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
}

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker command failed during Keycloak volume backup' }
}

function Test-VolumeExists([string]$Name) {
  return Test-DockerVolumeExists -Name $Name
}

function Read-KeycloakContainer {
  $raw = & docker ps -a --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.service=keycloak' --format '{{json .}}'
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose Keycloak runtime could not be inspected' }
  $rows = @($raw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json -ErrorAction Stop })
  if ($rows.Count -ne 1) { throw 'Expected exactly one Compose Keycloak container for this project' }
  $id = [string]$rows[0].ID
  if ($id -notmatch '^[a-f0-9]{12,64}$') { throw 'Compose Keycloak container identity is invalid' }
  return [pscustomobject]@{ Id = $id; State = [string]$rows[0].State }
}

Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
if (-not (Test-VolumeExists $sourceVolume)) { throw 'Source Keycloak volume does not exist' }
if (Test-VolumeExists $BackupVolume) { throw 'Backup volume already exists; refusing to overwrite it' }
$keycloak = Read-KeycloakContainer

if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    sourceVolume = $sourceVolume
    backupVolume = $BackupVolume
    sourceState = $keycloak.State
    changed = $false
    applyRequires = 'explicit -Confirm'
    backup = 'Stops a running Keycloak container, copies the complete named volume without network access, then restarts it only when it was previously running.'
  } | ConvertTo-Json -Compress
  return
}

if (-not $Confirm) { throw 'Apply requires -Confirm' }
$shouldRestart = $keycloak.State -eq 'running'
$mustStopBeforeCopy = $keycloak.State -in @('running', 'restarting')
try {
  if ($mustStopBeforeCopy) { Invoke-Docker @('stop', '--time', '60', $keycloak.Id) }
  Invoke-Docker @('volume', 'create', $BackupVolume)
  # Keycloak's embedded local state must be copied while stopped. The helper
  # has no network, sees the source only read-only, and never emits realm data.
  Invoke-Docker @('run', '--rm', '--network', 'none', '--read-only', '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'FOWNER', '--entrypoint', '/bin/sh', '--mount', "type=volume,source=$sourceVolume,target=/source,readonly", '--mount', "type=volume,source=$BackupVolume,target=/target", 'quay.io/keycloak/keycloak:26.4.0', '-ec', 'test -d /source && cp -a /source/. /target/')
  if ($shouldRestart) { Invoke-Docker @('start', $keycloak.Id) }
  [pscustomobject]@{ mode = 'apply'; project = $Project; sourceVolume = $sourceVolume; backupVolume = $BackupVolume; changed = $true } | ConvertTo-Json -Compress
} catch {
  if ($shouldRestart) { & docker start $keycloak.Id 1>$null 2>$null }
  throw 'Keycloak volume backup failed; restart of the original Keycloak container was attempted when it was previously healthy'
}
} finally {
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
