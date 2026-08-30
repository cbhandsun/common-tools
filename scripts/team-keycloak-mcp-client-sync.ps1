[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidateRange(1, 65535)]
  [int]$KeycloakPort = 58080,
  [switch]$PromptForAdmin
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$promptedEnvironmentNames = [System.Collections.Generic.List[string]]::new()

function Set-MissingPromptedEnvironment([string]$Name, [string]$Prompt, [switch]$Secret) {
  $existing = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($existing)) { return }
  if (-not $PromptForAdmin) { throw "$Name is required; set it only for this process or rerun with -PromptForAdmin" }
  if ($Secret) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } else {
    $value = Read-Host -Prompt $Prompt
  }
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$Name is required" }
  [Environment]::SetEnvironmentVariable($Name, $value, 'Process')
  $script:promptedEnvironmentNames.Add($Name)
}

$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_KEYCLOAK_ADMIN' 'Keycloak admin username'
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD' 'Keycloak admin password' -Secret
  $timestamp = Get-Date -Format 'yyyyMMddTHHmmss'
  $realmBackupDirectory = Join-Path $repositoryRoot 'artifacts/keycloak-realm-backups'
  $realmEvidenceDirectory = Join-Path $repositoryRoot 'artifacts/keycloak-realm-evidence'
  $clientBackupDirectory = Join-Path $repositoryRoot 'artifacts/keycloak-mcp-client-backups'
  New-Item -ItemType Directory -Path $realmBackupDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $realmEvidenceDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $clientBackupDirectory -Force | Out-Null
  $realmBackupFile = Join-Path $realmBackupDirectory ("before-hardening-$timestamp-$([Guid]::NewGuid().ToString('N')).json")
  $realmEvidenceFile = Join-Path $realmEvidenceDirectory ("closed-realm-$timestamp-$([Guid]::NewGuid().ToString('N')).json")
  $clientBackupFile = Join-Path $clientBackupDirectory ("before-loopback-redirect-$timestamp-$([Guid]::NewGuid().ToString('N')).json")
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  & node $cli team keycloak-realm --base-url "http://127.0.0.1:$KeycloakPort/id" --apply --backup-file $realmBackupFile --evidence-file $realmEvidenceFile
  if ($LASTEXITCODE -ne 0) { throw 'Keycloak closed realm synchronization failed' }
  & node $cli team keycloak-mcp-client --base-url "http://127.0.0.1:$KeycloakPort/id" --apply --backup-file $clientBackupFile
  if ($LASTEXITCODE -ne 0) { throw 'Keycloak MCP OAuth client synchronization failed' }
} finally {
  foreach ($name in $promptedEnvironmentNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
