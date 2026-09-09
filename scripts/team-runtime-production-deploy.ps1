[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'common-tools',
  [ValidateRange(30, 900)]
  [int]$WaitTimeoutSeconds = 300,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [string]$ProductionEnvFile
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
$composeFiles = @()
$profiles = @('team-api', 'team-maintenance')

function Import-ProductionEnvironmentFile([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if ($Path.IndexOf([char]0) -ge 0) { throw 'Production env file path is invalid' }
  if (-not [System.IO.Path]::IsPathRooted($Path)) { throw 'Production env file path must be absolute' }
  $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
  if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) { throw 'Production env file must be a file' }
  $item = Get-Item -LiteralPath $resolvedPath
  if ($item.Length -gt 65536) { throw 'Production env file is too large' }
  $seen = @{}
  $lineNumber = 0
  foreach ($line in Get-Content -LiteralPath $resolvedPath) {
    $lineNumber += 1
    $trimmed = $line.TrimStart()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
    $assignment = $trimmed
    if ($assignment.StartsWith('export ')) { $assignment = $assignment.Substring(7).TrimStart() }
    $separator = $assignment.IndexOf('=')
    if ($separator -le 0) { throw "Production env file line $lineNumber must be KEY=VALUE" }
    $name = $assignment.Substring(0, $separator).Trim()
    if ($name -cnotmatch '^COMMON_TOOLS_[A-Z0-9_]{1,120}$') { throw "Production env file line $lineNumber has an unsupported variable name" }
    if ($seen.ContainsKey($name)) { throw "Production env file line $lineNumber duplicates $name" }
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "Production env file duplicates existing $name" }
    $value = $assignment.Substring($separator + 1).Trim()
    if ($value.IndexOf([char]0) -ge 0) { throw "Production env file line $lineNumber contains an invalid value" }
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -or $first -eq "'") -or ($last -eq '"' -or $last -eq "'")) {
        if (-not (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'"))) {
          throw "Production env file line $lineNumber has an unterminated quoted value"
        }
        $value = $value.Substring(1, $value.Length - 2)
      }
    } elseif ($value.StartsWith('"') -or $value.StartsWith("'") -or $value.EndsWith('"') -or $value.EndsWith("'")) {
      throw "Production env file line $lineNumber has an unterminated quoted value"
    }
    $seen[$name] = $true
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

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

function New-ProductionPreApplyChecklist {
  return @(
    'Run common-tools team migration-status in the target production environment and archive the redacted JSON result.',
    'Confirm the managed PostgreSQL backup, restore target, and rollback evidence before applying pending migrations.',
    'Approve only immutable release evidence revisions and image digests; never roll forward or back to tags.',
    'Keep ingress from accepting new production jobs until migration status, worker readiness, and release evidence are reviewed.'
  )
}

Import-ProductionEnvironmentFile $ProductionEnvFile
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
    schemaMigrations = $preflight.schemaMigrations
    releaseEvidenceRevision = $preflight.releaseEvidence.revision
    releaseImages = @($preflight.releaseEvidence.images)
    releaseSignatureRequired = ($preflight.releaseSignature.required -eq $true)
    releaseSignatureVerified = ($preflight.releaseSignature.verified -eq $true)
    oidcDiscoveryValidated = $true
    composeConfigurationValidated = ($preflight.composeValidated -eq $true)
    preApplyChecklist = @(New-ProductionPreApplyChecklist)
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
