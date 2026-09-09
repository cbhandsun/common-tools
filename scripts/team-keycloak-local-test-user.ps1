[CmdletBinding()]
param(
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$')]
  [string]$Username = 'local-tester',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')]
  [string]$ProjectId = 'deploy',
  [ValidateSet('viewer', 'editor', 'admin')]
  [string]$Role = 'editor',
  [ValidatePattern('^$|^http://127\.0\.0\.1:[1-9][0-9]{3,4}(/id)?$')]
  [string]$BaseUrl = '',
  [ValidatePattern('^[A-Za-z0-9._-]{1,64}$')]
  [string]$Realm = 'common-tools',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$')]
  [string]$AdminUsername = 'local-admin'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Common Tools CLI is unavailable' }

function Read-SecretValue([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ([string]::IsNullOrWhiteSpace($value)) { throw 'Secret value is required' }
  return $value
}

$managedNames = @(
  'COMMON_TOOLS_KEYCLOAK_ADMIN',
  'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD',
  'COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD'
)
$originalEnvironment = @{}
foreach ($name in $managedNames) {
  $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', 'Process'))) {
    [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', $AdminUsername, 'Process')
  }
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD', 'Process'))) {
    [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD', (Read-SecretValue 'Local Keycloak admin password'), 'Process')
  }
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD', 'Process'))) {
    [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD', (Read-SecretValue "Password for local Keycloak test user '$Username'"), 'Process')
  }

  $arguments = @($cli, 'team', 'keycloak-local-test-user', '--apply', '--username', $Username, '--project-id', $ProjectId, '--role', $Role, '--realm', $Realm)
  if (-not [string]::IsNullOrWhiteSpace($BaseUrl)) { $arguments += @('--base-url', $BaseUrl) }
  & node @arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
  }
}
