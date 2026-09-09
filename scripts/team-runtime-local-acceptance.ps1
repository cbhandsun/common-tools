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
  [string]$EvidenceFile = '',
  [switch]$SeparateTestUserPassword,
  [switch]$SkipJobWait
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$applyScript = Join-Path $PSScriptRoot 'team-runtime-local-apply.ps1'
$localSmokeScript = Join-Path $PSScriptRoot 'team-runtime-local-smoke.ps1'
$userScript = Join-Path $PSScriptRoot 'team-keycloak-local-test-user.ps1'
$jobSmokeScript = Join-Path $PSScriptRoot 'team-runtime-local-job-smoke.ps1'

foreach ($script in @($applyScript, $localSmokeScript, $userScript, $jobSmokeScript)) {
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

function Resolve-EvidenceFile([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    $directory = Join-Path $repositoryRoot 'artifacts/local-acceptance'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    return Join-Path $directory ("local-acceptance-{0}-{1}.json" -f (Get-Date -Format 'yyyyMMddTHHmmss'), [Guid]::NewGuid().ToString('N'))
  }
  if ($Value.Length -gt 4096 -or $Value.Contains("`r") -or $Value.Contains("`n") -or $Value.IndexOf([char]0) -ge 0) { throw 'Local acceptance evidence file is invalid' }
  $target = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Value))
  if ([System.IO.Path]::GetExtension($target).ToLowerInvariant() -ne '.json' -or (Test-Path -LiteralPath $target)) { throw 'Local acceptance evidence file is invalid' }
  $root = [System.IO.Path]::GetFullPath($repositoryRoot)
  $relative = [System.IO.Path]::GetRelativePath($root, $target)
  if ($relative -eq '..' -or $relative.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)") -or [System.IO.Path]::IsPathRooted($relative)) { throw 'Local acceptance evidence file must stay inside the repository' }
  New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force | Out-Null
  return $target
}

function Read-JsonOutput([object[]]$Output, [string]$Failure) {
  $text = ($Output | Out-String).Trim()
  try { $value = $text | ConvertFrom-Json -ErrorAction Stop }
  catch { throw $Failure }
  if ($null -eq $value) { throw $Failure }
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
$evidenceTarget = Resolve-EvidenceFile $EvidenceFile
$startedAt = Get-Date
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
$localSmokeOutput = & $localSmokeScript -Project $Project -Capabilities $Capabilities -RequireIdentityProvider
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$localSmoke = Read-JsonOutput $localSmokeOutput 'Local acceptance smoke evidence is invalid'

Write-Host 'Step 2/3: preparing local Keycloak test user and project claim.'
$userOutput = & $userScript -Username $Username -ProjectId $ProjectId -Role $Role
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$userOutput | Write-Output
$testUser = Read-JsonOutput $userOutput 'Local acceptance test user evidence is invalid'

Write-Host 'Step 3/3: running authenticated local job smoke through browser PKCE login.'
$jobArguments = @('-Project', $Project, '-Capability', $Capability, '-Login')
if (-not $SkipJobWait) { $jobArguments += '-Wait' }
$jobOutput = & $jobSmokeScript @jobArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$jobOutput | Write-Output
$jobSmoke = Read-JsonOutput $jobOutput 'Local acceptance authenticated job smoke evidence is invalid'

$evidence = [ordered]@{
  schemaVersion = 1
  capturedAt = (Get-Date).ToString('o')
  startedAt = $startedAt.ToString('o')
  project = $Project
  capability = $Capability
  capabilities = @($Capabilities.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  username = $Username
  projectId = $ProjectId
  role = $Role
  localSmoke = $localSmoke
  testUser = $testUser
  authenticatedJobSmoke = $jobSmoke
  passed = (($localSmoke.runtimeOk -eq $true) -and ($localSmoke.identityProviderVerified -eq $true) -and ($testUser.changed -eq $true -or $testUser.status -eq 'current') -and ($jobSmoke.passed -eq $true))
}
$evidence | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $evidenceTarget -Encoding UTF8 -NoNewline
Write-Host "Local acceptance evidence written to $evidenceTarget"
} finally {
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
  }
}
