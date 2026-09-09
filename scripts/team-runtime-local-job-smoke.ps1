[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidatePattern('^[a-z][a-z0-9-]{2,63}$')]
  [string]$Capability = 'image-to-editable',
  [ValidatePattern('^[A-Z][A-Z0-9_]{0,127}$')]
  [string]$TokenEnv = 'COMMON_TOOLS_JOB_SMOKE_TOKEN',
  [ValidatePattern('^$|^http://127\.0\.0\.1:[1-9][0-9]{3,4}$')]
  [string]$GatewayUrl = '',
  [switch]$Wait,
  [ValidatePattern('^$|^[A-Za-z0-9._-]{1,128}$')]
  [string]$ArtifactName = ''
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
$jobSmoke = Join-Path $PSScriptRoot 'team-runtime-authenticated-job-smoke.js'

if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Common Tools CLI is unavailable' }
if (-not (Test-Path -LiteralPath $jobSmoke -PathType Leaf)) { throw 'Authenticated job smoke script is unavailable' }

$token = [Environment]::GetEnvironmentVariable($TokenEnv, 'Process')
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "Set $TokenEnv to a bearer token with the required Common Tools capability scope, then rerun this command."
  Write-Host 'This helper prepares the local smoke input and gateway URL; it does not mint or print OAuth tokens.'
  exit 2
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("common-tools-local-job-smoke-" + [Guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
try {
  $sourceImage = Join-Path $temporaryRoot 'source.png'
  $archive = Join-Path $temporaryRoot 'input.tar.gz'
  $pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  [System.IO.File]::WriteAllBytes($sourceImage, [Convert]::FromBase64String($pngBase64))

  & node $cli 'team' 'raw-image-archive' '--workspace' $temporaryRoot '--input' 'source.png' '--out' 'input.tar.gz' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Local authenticated job smoke input archive could not be prepared' }

  $arguments = @('--project', $Project, '--capability', $Capability, '--input-file', $archive, '--token-env', $TokenEnv)
  if (-not [string]::IsNullOrWhiteSpace($GatewayUrl)) { $arguments += @('--gateway-url', $GatewayUrl) }
  if ($Wait) {
    $arguments += '--wait'
    if ([string]::IsNullOrWhiteSpace($ArtifactName) -and $Capability -eq 'image-to-editable') {
      $arguments += @('--artifact-name', 'deck.pptx')
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($ArtifactName)) { $arguments += @('--artifact-name', $ArtifactName) }

  & node $jobSmoke @arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  try { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction Stop } catch { }
}
