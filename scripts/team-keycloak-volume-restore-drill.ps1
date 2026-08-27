[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidatePattern('^[a-z0-9][a-z0-9_.-]{0,127}$')]
  [string]$SourceVolume,
  [ValidateRange(30, 120)]
  [int]$StartupTimeoutSeconds = 90,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
  $liveVolume = "$Project`_common-tools-keycloak"
  if ($SourceVolume -eq $liveVolume -or $SourceVolume -notlike "$liveVolume-backup-*") {
    throw 'SourceVolume must name a project-scoped Keycloak backup volume, not the live volume'
  }
  $suffix = [Guid]::NewGuid().ToString('N')
  $targetVolume = "$liveVolume-restore-drill-$suffix"
  $targetContainer = "$Project-keycloak-restore-drill-$suffix"

  function Invoke-Docker([string[]]$Arguments) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker command failed during Keycloak restore drill' }
  }

  function Test-KeycloakReady([string]$Container) {
    & docker exec $Container bash -ec '{ printf "HEAD /health/ready HTTP/1.0\r\n\r\n" >&0; grep -q "HTTP/1.0 200"; } 0<>/dev/tcp/127.0.0.1/9000' 1>$null 2>$null
    return $LASTEXITCODE -eq 0
  }

  function Wait-KeycloakReady([string]$Container) {
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    do {
      if (Test-KeycloakReady $Container) { return }
      Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Isolated Keycloak restore drill did not become ready before the timeout'
  }

  Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
  if (-not (Test-DockerVolumeExists -Name $SourceVolume)) { throw 'Source Keycloak backup volume does not exist' }
  if (Test-DockerVolumeExists -Name $targetVolume) { throw 'Restore drill target volume already exists; refusing to overwrite it' }

  if ($Mode -eq 'Plan') {
    [pscustomobject]@{
      mode = 'plan'
      project = $Project
      sourceVolume = $SourceVolume
      targetVolume = $targetVolume
      targetContainer = $targetContainer
      changed = $false
      applyRequires = 'explicit -Confirm'
      drill = 'Copies the selected backup to a unique temporary volume, boots an isolated no-network Keycloak container, checks its local ready endpoint, then removes only the temporary container and volume.'
    } | ConvertTo-Json -Compress
    return
  }

  if (-not $Confirm) { throw 'Apply requires -Confirm' }
  $targetCreated = $false
  $containerStarted = $false
  try {
    Invoke-Docker @('volume', 'create', $targetVolume)
    $targetCreated = $true
    # The copy helper has no network. It can only read the selected backup
    # volume and write to the unique drill volume; it never emits realm data.
    Invoke-Docker @('run', '--rm', '--network', 'none', '--read-only', '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'FOWNER', '--entrypoint', '/bin/sh', '--mount', "type=volume,source=$SourceVolume,target=/source,readonly", '--mount', "type=volume,source=$targetVolume,target=/target", 'quay.io/keycloak/keycloak:26.4.0', '-ec', 'test -d /source && cp -a /source/. /target/')
    $bootstrapPassword = "restore-$([Guid]::NewGuid().ToString('N'))"
    $null = Invoke-Docker @('run', '--detach', '--rm', '--name', $targetContainer, '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL', '--env', 'KC_BOOTSTRAP_ADMIN_USERNAME=restore-drill', '--env', "KC_BOOTSTRAP_ADMIN_PASSWORD=$bootstrapPassword", '--mount', "type=volume,source=$targetVolume,target=/opt/keycloak/data", 'quay.io/keycloak/keycloak:26.4.0', 'start-dev', '--http-port=8080', '--health-enabled=true')
    $containerStarted = $true
    Wait-KeycloakReady $targetContainer
    [pscustomobject]@{ mode = 'apply'; project = $Project; sourceVolume = $SourceVolume; changed = $true; restored = $true } | ConvertTo-Json -Compress
  } finally {
    $cleanupFailed = $false
    if ($containerStarted) {
      & docker rm '--force' $targetContainer 1>$null 2>$null
      if ($LASTEXITCODE -ne 0) { $cleanupFailed = $true }
    }
    if ($targetCreated) {
      & docker volume rm $targetVolume 1>$null 2>$null
      if ($LASTEXITCODE -ne 0) { $cleanupFailed = $true }
    }
    if ($cleanupFailed) { throw 'Keycloak restore drill cleanup failed; inspect only the reported temporary drill resources' }
  }
} finally {
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
