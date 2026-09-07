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
$composeFiles = @()
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

function Resolve-PreflightComposeFiles([object[]]$ReportedFiles, [string]$CredentialSource) {
  if ($CredentialSource -cnotin @('direct', 'files')) {
    throw 'Production deployment preflight returned an unsupported credential source'
  }
  $allowedFiles = @(
    'deploy/compose.team-api.yaml',
    'deploy/compose.team-production.yaml',
    'deploy/compose.team-production-secrets.yaml',
    'deploy/compose.team-siyuan-secret.yaml'
  )
  $relativeFiles = @($ReportedFiles)
  if ($relativeFiles.Count -lt 2 -or $relativeFiles.Count -gt $allowedFiles.Count) {
    throw 'Production deployment preflight returned an invalid Compose file set'
  }
  if (@($relativeFiles | Select-Object -Unique).Count -ne $relativeFiles.Count) {
    throw 'Production deployment preflight returned duplicate Compose files'
  }
  foreach ($requiredFile in @('deploy/compose.team-api.yaml', 'deploy/compose.team-production.yaml')) {
    if ($requiredFile -notin $relativeFiles) { throw 'Production deployment preflight omitted a required Compose file' }
  }
  $hasSecrets = $relativeFiles -ccontains 'deploy/compose.team-production-secrets.yaml'
  if ($hasSecrets -ne ($CredentialSource -ceq 'files')) {
    throw 'Production deployment Compose files do not match the credential source'
  }
  $expectedFiles = @('deploy/compose.team-api.yaml', 'deploy/compose.team-production.yaml')
  if ($hasSecrets) { $expectedFiles += 'deploy/compose.team-production-secrets.yaml' }
  if ($relativeFiles -ccontains 'deploy/compose.team-siyuan-secret.yaml') { $expectedFiles += 'deploy/compose.team-siyuan-secret.yaml' }
  $resolvedFiles = @()
  foreach ($relativeFile in $relativeFiles) {
    if ($relativeFile -isnot [string] -or $relativeFile -cnotin $allowedFiles) {
      throw 'Production deployment preflight returned an unsupported Compose file'
    }
    $resolvedFile = Join-Path $repositoryRoot $relativeFile
    if (-not (Test-Path -LiteralPath $resolvedFile -PathType Leaf)) {
      throw 'Production deployment preflight returned a missing Compose file'
    }
    $resolvedFiles += $resolvedFile
  }
  for ($index = 0; $index -lt $relativeFiles.Count; $index++) {
    if ($relativeFiles[$index] -cne $expectedFiles[$index]) {
      throw 'Production deployment preflight returned an invalid Compose file order'
    }
  }
  return $resolvedFiles
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
  if ($null -eq $plan -or $null -eq $plan.workerProfiles -or $null -eq $plan.capabilities) { throw 'Production deployment plan returned an invalid result' }
  return $plan
}

Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
$preflight = Invoke-ProductionPreflight
$composeFiles = @(Resolve-PreflightComposeFiles -ReportedFiles @($preflight.composeFiles) -CredentialSource $preflight.credentialSource)
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
    composeFiles = @($preflight.composeFiles)
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
