[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Apply',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidateRange(1, 16)]
  [int]$ApiReplicas = 2,
  [ValidateRange(30, 600)]
  [int]$WaitTimeoutSeconds = 180,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [string]$Capabilities = 'image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$')]
  [string]$KeycloakAdmin = 'local-admin',
  [switch]$EnableRawImageOcr,
  [ValidateSet('PaddleOCR', 'Tesseract')]
  [string]$RawImageOcrProvider = 'PaddleOCR',
  [ValidatePattern('^$|^[a-z0-9][a-z0-9._/-]{0,127}:[a-z0-9][a-z0-9._-]{0,63}$')]
  [string]$RawImageOcrImage = '',
  [switch]$SkipRawImageOcrBuild
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$localDeployScript = Join-Path $PSScriptRoot 'team-runtime-local-deploy.ps1'
if (-not (Test-Path -LiteralPath $localDeployScript -PathType Leaf)) {
  throw 'Local deployment script is unavailable'
}

$managedEnvironment = @(
  'COMMON_TOOLS_REMOTE_PUBLIC_URL',
  'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS',
  'COMMON_TOOLS_OIDC_ISSUER',
  'COMMON_TOOLS_OIDC_JWKS_URL',
  'COMMON_TOOLS_OIDC_AUDIENCE',
  'COMMON_TOOLS_KEYCLOAK_ADMIN'
)
$originalEnvironment = @{}
foreach ($name in $managedEnvironment) {
  $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function Set-DefaultEnvironment([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Name) -or $Name -cnotmatch '^COMMON_TOOLS_[A-Z0-9_]{1,120}$') {
    throw 'Default environment variable name is invalid'
  }
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Contains("`r") -or $Value.Contains("`n") -or $Value.IndexOf([char]0) -ge 0) {
    throw "$Name default value is invalid"
  }
  $existing = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($existing)) {
    [Environment]::SetEnvironmentVariable($Name, $Value.Trim(), 'Process')
  }
}

try {
  $remotePort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_REMOTE_PORT', 'Process')
  if ([string]::IsNullOrWhiteSpace($remotePort)) { $remotePort = '54000' }
  $keycloakPort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_PORT', 'Process')
  if ([string]::IsNullOrWhiteSpace($keycloakPort)) { $keycloakPort = '58080' }
  if ($remotePort -notmatch '^[1-9][0-9]{0,4}$' -or [int]$remotePort -gt 65535) { throw 'COMMON_TOOLS_REMOTE_PORT is invalid' }
  if ($keycloakPort -notmatch '^[1-9][0-9]{0,4}$' -or [int]$keycloakPort -gt 65535) { throw 'COMMON_TOOLS_KEYCLOAK_PORT is invalid' }

  $remoteOrigin = "http://127.0.0.1:$remotePort"
  Set-DefaultEnvironment 'COMMON_TOOLS_REMOTE_PUBLIC_URL' $remoteOrigin
  Set-DefaultEnvironment 'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS' $remoteOrigin
  Set-DefaultEnvironment 'COMMON_TOOLS_OIDC_ISSUER' "http://127.0.0.1:$keycloakPort/realms/common-tools"
  Set-DefaultEnvironment 'COMMON_TOOLS_OIDC_JWKS_URL' 'http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs'
  Set-DefaultEnvironment 'COMMON_TOOLS_OIDC_AUDIENCE' 'common-tools-mcp'
  Set-DefaultEnvironment 'COMMON_TOOLS_KEYCLOAK_ADMIN' $KeycloakAdmin

  $arguments = @(
    '-Mode', $Mode,
    '-Project', $Project,
    '-ApiReplicas', "$ApiReplicas",
    '-WaitTimeoutSeconds', "$WaitTimeoutSeconds",
    '-DockerEngineTimeoutSeconds', "$DockerEngineTimeoutSeconds",
    '-DiscoverLocalConfiguration',
    '-DiscoverLocalPorts',
    '-PromptForSecrets',
    '-Capabilities', $Capabilities
  )
  if ($EnableRawImageOcr) { $arguments += '-EnableRawImageOcr' }
  $arguments += @('-RawImageOcrProvider', $RawImageOcrProvider)
  if (-not [string]::IsNullOrWhiteSpace($RawImageOcrImage)) { $arguments += @('-RawImageOcrImage', $RawImageOcrImage) }
  if ($SkipRawImageOcrBuild) { $arguments += '-SkipRawImageOcrBuild' }

  & $localDeployScript @arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  foreach ($name in $managedEnvironment) {
    [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
  }
}
