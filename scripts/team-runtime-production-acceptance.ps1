[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Evidence')]
  [string]$Mode = 'Plan',
  [string]$ProductionEnvFile = '',
  [string]$Out = '.codex-tmp/production-acceptance-evidence'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$defaultProductionEnvFile = Join-Path (Split-Path -Parent $repositoryRoot) 'common-tools.production.env'
$cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'

if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
  throw 'Common Tools CLI is unavailable'
}

function Resolve-ProductionEnvFile([string]$Value) {
  $candidate = if ([string]::IsNullOrWhiteSpace($Value)) { $defaultProductionEnvFile } else { $Value }
  if ($candidate.IndexOf([char]0) -ge 0) { throw 'Production env file path is invalid' }
  if (-not [System.IO.Path]::IsPathRooted($candidate)) { throw 'Production env file path must be absolute' }
  return [System.IO.Path]::GetFullPath($candidate)
}

function Write-MissingEnvFilePlan([string]$Path) {
  [pscustomobject]@{
    schemaVersion = 1
    status = 'blocked-by-missing-production-env-file'
    productionEnvFile = $Path
    writesEvidence = $false
    mutatesProduction = $false
    nextCommands = @(
      ".\scripts\prepare-production-env.ps1 -ProductionRelease -Out `"$Path`" -Force",
      'npm run common-tools:production-acceptance-preflight',
      'npm run common-tools:production-acceptance-collect'
    )
  } | ConvertTo-Json -Depth 8
}

$envFile = Resolve-ProductionEnvFile $ProductionEnvFile
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  Write-MissingEnvFilePlan $envFile
  if ($Mode -eq 'Evidence') { exit 2 }
  exit 0
}

if ($Mode -eq 'Plan') {
  & node $cli 'team' 'production-acceptance-plan' '--production-env-file' $envFile
  exit $LASTEXITCODE
}

& node $cli 'team' 'production-acceptance-evidence' '--production-env-file' $envFile '--out' $Out
exit $LASTEXITCODE
