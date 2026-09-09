[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidateRange(1, 16)]
  [int]$ApiReplicas = 2,
  [ValidateRange(30, 600)]
  [int]$WaitTimeoutSeconds = 180,
  [string]$Capabilities = 'image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$')]
  [string]$Username = 'local-tester',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')]
  [string]$ProjectId = 'deploy',
  [ValidateSet('viewer', 'editor', 'admin')]
  [string]$Role = 'editor',
  [ValidatePattern('^[a-z][a-z0-9-]{2,63}$')]
  [string]$Capability = 'image-to-editable',
  [switch]$SeparateTestUserPassword,
  [switch]$SkipJobWait
)

$ErrorActionPreference = 'Stop'
$applyScript = Join-Path $PSScriptRoot 'team-runtime-local-apply.ps1'
$userScript = Join-Path $PSScriptRoot 'team-keycloak-local-test-user.ps1'
$jobSmokeScript = Join-Path $PSScriptRoot 'team-runtime-local-job-smoke.ps1'

foreach ($script in @($applyScript, $userScript, $jobSmokeScript)) {
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Local acceptance helper script is unavailable' }
}

function Read-SecretValue([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ([string]::IsNullOrWhiteSpace($value)) { throw 'Secret value is required' }
  return $value
}

$managedNames = @(
  'COMMON_TOOLS_POSTGRES_PASSWORD',
  'COMMON_TOOLS_REDIS_PASSWORD',
  'COMMON_TOOLS_MINIO_PASSWORD',
  'COMMON_TOOLS_KEYCLOAK_ADMIN',
  'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD',
  'COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD'
)
$originalEnvironment = @{}
foreach ($name in $managedNames) {
  $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
$sharedPassword = $null
if (
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_POSTGRES_PASSWORD', 'Process')) -or
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_REDIS_PASSWORD', 'Process')) -or
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_PASSWORD', 'Process')) -or
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD', 'Process')) -or
  (-not $SeparateTestUserPassword -and [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD', 'Process')))
) {
  $sharedPassword = Read-SecretValue 'Shared local acceptance password'
  if ($sharedPassword.Length -lt 12) { throw 'Shared local acceptance password must contain at least 12 characters' }
}

foreach ($name in @(
  'COMMON_TOOLS_POSTGRES_PASSWORD',
  'COMMON_TOOLS_REDIS_PASSWORD',
  'COMMON_TOOLS_MINIO_PASSWORD',
  'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD'
)) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
    [Environment]::SetEnvironmentVariable($name, $sharedPassword, 'Process')
  }
}
if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', 'Process'))) {
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', 'local-admin', 'Process')
}
if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD', 'Process'))) {
  $testUserPassword = if ($SeparateTestUserPassword) { Read-SecretValue "Password for local Keycloak test user '$Username'" } else { $sharedPassword }
  if ($testUserPassword.Length -lt 12) { throw 'Local Keycloak test user password must contain at least 12 characters' }
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD', $testUserPassword, 'Process')
}

Write-Host 'Step 1/3: deploying local Common Tools runtime with Keycloak enabled.'
& $applyScript -Project $Project -ApiReplicas $ApiReplicas -WaitTimeoutSeconds $WaitTimeoutSeconds -Capabilities $Capabilities -EnableIdentityProvider
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Step 2/3: preparing local Keycloak test user and project claim.'
& $userScript -Username $Username -ProjectId $ProjectId -Role $Role
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Step 3/3: running authenticated local job smoke through browser PKCE login.'
$jobArguments = @('-Project', $Project, '-Capability', $Capability, '-Login')
if (-not $SkipJobWait) { $jobArguments += '-Wait' }
& $jobSmokeScript @jobArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
  }
}
