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
$composeFile = Join-Path $repositoryRoot 'deploy/compose.team-idp.yaml'
$targetVolume = "$Project`_common-tools-keycloak"
$requiredEnvironment = @('COMMON_TOOLS_KEYCLOAK_ADMIN', 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD')

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker command failed during Keycloak persistence migration' }
}

function Invoke-IdpCompose([string[]]$Arguments) {
  $composeArguments = @('compose', '--project-name', $Project, '--file', $composeFile, '--profile', 'team-idp')
  $composeArguments += $Arguments
  Invoke-Docker $composeArguments
}

function Read-KeycloakContainer {
  $raw = & docker ps -a --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.service=keycloak' --format '{{json .}}'
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose Keycloak runtime could not be inspected' }
  $rows = @($raw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json -ErrorAction Stop })
  if ($rows.Count -eq 0) { throw 'No Compose Keycloak container exists for this project' }
  if ($rows.Count -ne 1) { throw 'Expected exactly one Compose Keycloak container for this project' }
  $id = [string]$rows[0].ID
  if ($id -notmatch '^[a-f0-9]{12,64}$') { throw 'Compose Keycloak container identity is invalid' }
  return [pscustomobject]@{ Id = $id; Running = ([string]$rows[0].Status -like 'Up *') }
}

function Read-KeycloakDataMount([string]$ContainerId) {
  $raw = & docker inspect $ContainerId --format '{{json .Mounts}}'
  if ($LASTEXITCODE -ne 0) { throw 'Compose Keycloak data mount could not be inspected' }
  try { $mounts = $raw | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'Compose Keycloak data mount is invalid' }
  return @($mounts | Where-Object { [string]$_.Destination -eq '/opt/keycloak/data' })
}

function Test-TargetVolumeExists {
  return Test-DockerVolumeExists -Name $targetVolume
}

function Assert-ApplyConfiguration {
  if (-not $Confirm) { throw 'Apply requires -Confirm' }
  foreach ($name in $requiredEnvironment) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
      throw 'Keycloak administrator configuration is required in the current process'
    }
  }
  Invoke-IdpCompose @('config', '--quiet')
}

Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
$container = Read-KeycloakContainer
$dataMounts = @(Read-KeycloakDataMount $container.Id)
if ($dataMounts.Count -gt 1) { throw 'Compose Keycloak data mount is ambiguous' }

if ($dataMounts.Count -eq 1) {
  $dataMount = $dataMounts[0]
  if ([string]$dataMount.Type -eq 'volume') {
    [pscustomobject]@{
      mode = $Mode.ToLowerInvariant()
      project = $Project
      state = 'already_persistent'
      changed = $false
    } | ConvertTo-Json -Compress
    return
  }
  throw 'Keycloak data is mounted from an unsupported source; do not overwrite it automatically'
}

if (Test-TargetVolumeExists) { throw 'The target Keycloak volume already exists; refusing to overwrite it' }

if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    state = 'migration_required'
    changed = $false
    applyRequires = @('current-process Keycloak administrator configuration', 'explicit -Confirm')
    migration = 'Stops Keycloak, copies its existing data directory to a new managed volume, recreates Keycloak, and waits for health.'
  } | ConvertTo-Json -Compress
  return
}

Assert-ApplyConfiguration
$originalContainerId = $container.Id
try {
  if ($container.Running) { Invoke-Docker @('stop', '--time', '60', $originalContainerId) }
  Invoke-Docker @('volume', 'create', $targetVolume)
  # The source container is stopped before copying, which keeps the embedded
  # development database consistent. The helper has no network and only the
  # source container mounts plus the new target volume.
  Invoke-Docker @('run', '--rm', '--network', 'none', '--read-only', '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--volumes-from', $originalContainerId, '--mount', "type=volume,source=$targetVolume,target=/target", 'quay.io/keycloak/keycloak:26.4.0', 'sh', '-ec', 'test -d /opt/keycloak/data && cp -a /opt/keycloak/data/. /target/')
  Invoke-IdpCompose @('up', '--detach', '--wait', '--wait-timeout', $WaitTimeoutSeconds, '--force-recreate', 'keycloak')
  $current = Read-KeycloakContainer
  $currentDataMounts = @(Read-KeycloakDataMount $current.Id)
  if ($currentDataMounts.Count -ne 1 -or [string]$currentDataMounts[0].Type -ne 'volume' -or [string]$currentDataMounts[0].Name -ne $targetVolume) {
    throw 'Keycloak did not start with the expected persistent volume'
  }
  [pscustomobject]@{ mode = 'apply'; project = $Project; state = 'persistent'; changed = $true } | ConvertTo-Json -Compress
} catch {
  # Until Compose replaces it, the original stopped container remains the
  # quickest rollback path. Do not inspect its environment or emit error text.
  & docker container inspect $originalContainerId 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { & docker start $originalContainerId 1>$null 2>$null }
  throw 'Keycloak persistence migration failed; the original container restart was attempted when still available'
}
} finally {
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
