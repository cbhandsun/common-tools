[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'common-tools',
  [ValidateRange(30, 900)]
  [int]$WaitTimeoutSeconds = 300,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
$composeFiles = @(
  (Join-Path $repositoryRoot 'deploy/compose.team-api.yaml'),
  (Join-Path $repositoryRoot 'deploy/compose.team-production.yaml')
)
$profiles = @('team-api', 'team-maintenance')

function Invoke-Compose([string[]]$Arguments) {
  $baseArguments = @('compose', '--project-name', $Project)
  foreach ($composeFile in $composeFiles) {
    $baseArguments += @('--file', $composeFile)
  }
  foreach ($profile in $profiles) {
    $baseArguments += @('--profile', $profile)
  }
  & docker @baseArguments @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose production command failed' }
}

function Invoke-ProductionPreflight {
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  $raw = & node $cli team production-preflight
  if ($LASTEXITCODE -ne 0) { throw 'Production deployment preflight failed' }
  try { return ($raw | Out-String | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw 'Production deployment preflight returned an invalid result' }
}

function Invoke-OidcDiscoveryPreflight {
  $preflight = Join-Path $repositoryRoot 'packages/remote-mcp-server/bin/common-tools-oidc-preflight.js'
  # Keep Plan mode's stdout machine-readable. The OIDC helper intentionally
  # emits only a generic success line, so discard it after the exit code is set.
  & node $preflight | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'OIDC discovery preflight failed' }
}

function Read-DeploymentPlan([string[]]$Capabilities) {
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  $raw = & node $cli team deployment-plan --capabilities ($Capabilities -join ',')
  if ($LASTEXITCODE -ne 0) { throw 'Production deployment plan is invalid' }
  try { $plan = ($raw | Out-String | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw 'Production deployment plan returned an invalid result' }
  if ($null -eq $plan -or $null -eq $plan.workerProfiles -or @($plan.workerProfiles).Count -eq 0) { throw 'Production deployment plan returned an invalid result' }
  return $plan
}

Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
$preflight = Invoke-ProductionPreflight
if ($preflight.credentialSource -eq 'files') {
  $composeFiles += (Join-Path $repositoryRoot 'deploy/compose.team-production-secrets.yaml')
} elseif ($preflight.credentialSource -ne 'direct') {
  throw 'Production deployment preflight returned an unsupported credential source'
}
if ($null -eq $preflight.releaseSignature -or $preflight.releaseSignature.required -notin @($true, $false) -or $preflight.releaseSignature.verified -notin @($true, $false)) {
  throw 'Production deployment preflight returned an invalid release signature result'
}
if ($preflight.releaseSignature.required -eq $true -and $preflight.releaseSignature.verified -ne $true) {
  throw 'Production deployment preflight did not verify the required release signature'
}
Invoke-OidcDiscoveryPreflight
$deploymentPlan = Read-DeploymentPlan @($preflight.enabledCapabilities)
$profiles += @($deploymentPlan.workerProfiles)

if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    credentialSource = $preflight.credentialSource
    enabledCapabilities = @($preflight.enabledCapabilities)
    releaseEvidenceRevision = $preflight.releaseEvidence.revision
    releaseImages = @($preflight.releaseEvidence.images)
    releaseSignatureRequired = ($preflight.releaseSignature.required -eq $true)
    releaseSignatureVerified = ($preflight.releaseSignature.verified -eq $true)
    oidcDiscoveryValidated = $true
    composeConfigurationValidated = ($preflight.composeValidated -eq $true)
    deployment = 'No containers or images were changed.'
  } | ConvertTo-Json -Compress
  return
}

# The production overlay removes build instructions. Keep --no-build as a
# second guardrail, and retain the migration gate by never adding --no-deps.
Invoke-Compose @('up', '--detach', '--no-build', '--wait', '--wait-timeout', $WaitTimeoutSeconds)
Invoke-Compose @('ps', '--format', 'json')
} finally {
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
