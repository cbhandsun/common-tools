[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidatePattern('^[A-Za-z0-9._-]{1,64}$')]
  [string]$RecoveryAdminUsername = 'recovery-admin',
  [ValidateRange(1, 65535)]
  [int]$KeycloakPort = 58080,
  [switch]$PromptForPassword,
  [ValidateRange(30, 300)]
  [int]$WaitTimeoutSeconds = 150
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$recoveryPasswordName = 'COMMON_TOOLS_KEYCLOAK_RECOVERY_ADMIN_PASSWORD'
$originalAdminUsername = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', 'Process')
$originalAdminPassword = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD', 'Process')
$promptedRecoveryPassword = $false

function Read-RecoveryPassword {
  $existing = [Environment]::GetEnvironmentVariable($recoveryPasswordName, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($existing)) { return $existing }
  if (-not $PromptForPassword) { throw "$recoveryPasswordName is required; set it only for this process or rerun with -PromptForPassword" }
  $secure = Read-Host -Prompt 'Temporary Keycloak recovery admin password' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -lt 8) { throw 'Temporary Keycloak recovery admin password must contain at least 8 characters' }
  [Environment]::SetEnvironmentVariable($recoveryPasswordName, $value, 'Process')
  $script:promptedRecoveryPassword = $true
  return $value
}

function Invoke-Docker([string[]]$Arguments, [string]$FailureMessage) {
  $result = & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
  return @($result | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
}

function Get-KeycloakContainer {
  $ids = @(Invoke-Docker @('ps', '--all', '--filter', "label=com.docker.compose.project=$Project", '--filter', 'label=com.docker.compose.service=keycloak', '--format', '{{.ID}}') 'Keycloak container lookup failed')
  if ($ids.Count -ne 1 -or $ids[0] -notmatch '^[a-f0-9]{12,64}$') { throw 'Exactly one Keycloak container is required for recovery' }
  $details = @(Invoke-Docker @('inspect', '--format', '{{.State.Running}}|{{.Config.Image}}|{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/opt/keycloak/data")}}{{.Name}}{{end}}{{end}}', $ids[0]) 'Keycloak container inspection failed')
  if ($details.Count -ne 1) { throw 'Keycloak container inspection is invalid' }
  $parts = $details[0].Split('|', 3)
  if ($parts.Count -ne 3 -or $parts[0] -notin @('true', 'false') -or $parts[1] -notmatch '^quay\.io/keycloak/keycloak:[A-Za-z0-9._-]{1,128}$' -or $parts[2] -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$') { throw 'Keycloak container recovery target is invalid' }
  return [pscustomobject]@{ id = $ids[0]; running = ($parts[0] -eq 'true'); image = $parts[1]; volume = $parts[2] }
}

function Wait-KeycloakHealthy([string]$ContainerId) {
  $deadline = [DateTime]::UtcNow.AddSeconds($WaitTimeoutSeconds)
  do {
    $status = @(Invoke-Docker @('inspect', '--format', '{{.State.Health.Status}}', $ContainerId) 'Keycloak health inspection failed')
    if ($status.Count -eq 1 -and $status[0] -eq 'healthy') { return }
    Start-Sleep -Seconds 2
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Keycloak did not become healthy after recovery'
}

$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
$container = $null
$stopped = $false
try {
  $password = Read-RecoveryPassword
  $container = Get-KeycloakContainer
  if (-not $PSCmdlet.ShouldProcess("Keycloak container $($container.id), volume $($container.volume)", "create temporary admin '$RecoveryAdminUsername', restart Keycloak, and synchronize MCP OAuth redirects")) { return }
  if ($container.running) {
    Invoke-Docker @('stop', '--time', '30', $container.id) 'Keycloak stop failed' | Out-Null
    $stopped = $true
  }
  Invoke-Docker @('run', '--rm', '--network', 'none', '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--mount', "type=volume,source=$($container.volume),target=/opt/keycloak/data", '--env', $recoveryPasswordName, $container.image, 'bootstrap-admin', 'user', '--username', $RecoveryAdminUsername, '--password:env', $recoveryPasswordName, '--no-prompt') 'Keycloak recovery administrator creation failed' | Out-Null
  Invoke-Docker @('start', $container.id) 'Keycloak start failed' | Out-Null
  $stopped = $false
  Wait-KeycloakHealthy $container.id
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', $RecoveryAdminUsername, 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD', $password, 'Process')
  & (Join-Path $PSScriptRoot 'team-keycloak-mcp-client-sync.ps1') -Project $Project -KeycloakPort $KeycloakPort
  if ($LASTEXITCODE -ne 0) { throw 'Keycloak MCP OAuth client synchronization failed after recovery' }
  [pscustomobject]@{ status = 'recovered-and-synchronized'; recoveryAdmin = $RecoveryAdminUsername; keycloakContainer = $container.id } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $container -and $stopped) {
    try { Invoke-Docker @('start', $container.id) 'Keycloak recovery restart failed' | Out-Null } catch { Write-Error 'Keycloak was stopped and could not be restarted automatically' }
  }
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', $originalAdminUsername, 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD', $originalAdminPassword, 'Process')
  if ($promptedRecoveryPassword) { [Environment]::SetEnvironmentVariable($recoveryPasswordName, $null, 'Process') }
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
