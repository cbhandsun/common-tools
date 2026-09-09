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
  [switch]$SkipJobWait
)

$ErrorActionPreference = 'Stop'
$applyScript = Join-Path $PSScriptRoot 'team-runtime-local-apply.ps1'
$userScript = Join-Path $PSScriptRoot 'team-keycloak-local-test-user.ps1'
$jobSmokeScript = Join-Path $PSScriptRoot 'team-runtime-local-job-smoke.ps1'

foreach ($script in @($applyScript, $userScript, $jobSmokeScript)) {
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Local acceptance helper script is unavailable' }
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
