[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [ValidateRange(1, 16)]
  [int]$ApiReplicas = 2,
  [ValidateRange(30, 600)]
  [int]$WaitTimeoutSeconds = 180,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [switch]$DiscoverLocalConfiguration,
  [switch]$DiscoverLocalPorts,
  [switch]$EnableRawImageOcr,
  [switch]$EnableSingleIngress,
  [string]$SingleIngressPublicUrl,
  [switch]$PromptForSecrets,
  [string]$Capabilities,
  [ValidateSet('PaddleOCR', 'Tesseract')]
  [string]$RawImageOcrProvider = 'PaddleOCR',
  [ValidatePattern('^$|^[a-z0-9][a-z0-9._/-]{0,127}:[a-z0-9][a-z0-9._-]{0,63}$')]
  [string]$RawImageOcrImage = '',
  [switch]$SkipRawImageOcrBuild
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')
$promptedEnvironmentNames = [System.Collections.Generic.List[string]]::new()
$originalCapabilities = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_TEAM_CAPABILITIES', 'Process')
$restoreCapabilities = $false
$resolvedRawImageOcrImage = if (-not [string]::IsNullOrWhiteSpace($RawImageOcrImage)) {
  $RawImageOcrImage
} elseif ($RawImageOcrProvider -eq 'PaddleOCR') {
  'common-tools-image-to-editable-paddleocr:local'
} else {
  'common-tools-image-to-editable-ocr:local'
}

function Set-MissingPromptedEnvironment([string]$Name, [string]$Prompt, [switch]$Secret) {
  $existing = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($existing)) { return }
  if ($Secret) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } else {
    $value = Read-Host -Prompt $Prompt
  }
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$Name is required" }
  [Environment]::SetEnvironmentVariable($Name, $value, 'Process')
  $script:promptedEnvironmentNames.Add($Name)
}

function Set-MissingDeploymentSecretsFromPrompt {
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_POSTGRES_PASSWORD' 'PostgreSQL password' -Secret
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_REDIS_PASSWORD' 'Redis password' -Secret
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_MINIO_PASSWORD' 'MinIO password' -Secret
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_KEYCLOAK_ADMIN' 'Keycloak admin username'
  Set-MissingPromptedEnvironment 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD' 'Keycloak admin password' -Secret
}

$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
$composeFiles = @(
  (Join-Path $repositoryRoot 'deploy/compose.team-infra.yaml'),
  (Join-Path $repositoryRoot 'deploy/compose.team-api.yaml'),
  (Join-Path $repositoryRoot 'deploy/compose.team-gateway.yaml')
)
$profiles = @('team-infra', 'team-api', 'team-gateway', 'team-maintenance')
$requiredEnvironment = @(
  'COMMON_TOOLS_POSTGRES_PASSWORD',
  'COMMON_TOOLS_REDIS_PASSWORD',
  'COMMON_TOOLS_MINIO_PASSWORD',
  'COMMON_TOOLS_REMOTE_PUBLIC_URL',
  'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS',
  'COMMON_TOOLS_OIDC_ISSUER',
  'COMMON_TOOLS_OIDC_JWKS_URL',
  'COMMON_TOOLS_OIDC_AUDIENCE'
)

function Invoke-Compose([string[]]$Arguments) {
  $baseArguments = @('compose', '--project-name', $Project)
  foreach ($composeFile in $composeFiles) {
    $baseArguments += @('--file', $composeFile)
  }
  foreach ($profile in $profiles) {
    $baseArguments += @('--profile', $profile)
  }
  & docker @baseArguments @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose command failed' }
}

function Invoke-RawImageOcrImageBuild {
  $dockerfileName = if ($RawImageOcrProvider -eq 'PaddleOCR') { 'Dockerfile.image-to-editable-paddleocr' } else { 'Dockerfile.image-to-editable-ocr' }
  $dockerfile = Join-Path $repositoryRoot "deploy/docker/$dockerfileName"
  if (-not (Test-Path -LiteralPath $dockerfile -PathType Leaf)) { throw 'Raw image OCR Dockerfile is unavailable' }
  & docker build '--file' $dockerfile '--tag' $resolvedRawImageOcrImage $repositoryRoot
  if ($LASTEXITCODE -ne 0) { throw 'Raw image OCR image build failed' }
}

function Resolve-TesseractRawImageOcrProfile {
  $inspect = & docker image inspect '--format' '{{.Id}}' $resolvedRawImageOcrImage
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($inspect | Out-String))) { throw 'Raw image OCR image is unavailable' }
  $probe = @'
set -eu
sha256sum /usr/bin/tesseract | awk '{print $1}'
tesseract --list-langs | grep -E '^(eng|chi_sim)$' | sort
'@
  $raw = & docker run '--rm' '--network' 'none' '--read-only' '--user' '10001:10001' '--tmpfs' '/tmp:rw,noexec,nosuid,size=64m' '--entrypoint' '/bin/sh' $resolvedRawImageOcrImage '-c' $probe
  if ($LASTEXITCODE -ne 0) { throw 'Raw image OCR image verification failed' }
  $lines = @($raw | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
  if ($lines.Count -ne 3 -or $lines[0] -notmatch '^[a-f0-9]{64}$' -or @($lines | Select-Object -Skip 1) -notcontains 'eng' -or @($lines | Select-Object -Skip 1) -notcontains 'chi_sim') { throw 'Raw image OCR image profile is invalid' }
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE', 'tesseract-tsv-v1', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE', '/usr/bin/tesseract', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_RAW_OCR_SHA256', $lines[0], 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES', 'eng,chi_sim', 'Process')
  return [pscustomobject]@{ provider = 'Tesseract'; image = $resolvedRawImageOcrImage; executableSha256 = $lines[0]; languages = @('eng', 'chi_sim') }
}

function Resolve-PaddleRawImageOcrProfile {
  $inspect = & docker image inspect '--format' '{{.Id}}' $resolvedRawImageOcrImage
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($inspect | Out-String))) { throw 'Raw image OCR image is unavailable' }
  $probe = @'
set -eu
sha256sum /opt/paddleocr/venv/bin/python /opt/paddleocr/skill/scripts/adapters/ocr-paddleocr-local.js /opt/paddleocr/paddleocr_worker.py /opt/paddleocr/healthcheck.png | awk '{print $1}'
/opt/paddleocr/venv/bin/python -c 'import importlib.metadata as m; print(m.version("paddlepaddle")); print(m.version("paddleocr"))'
test -d /opt/paddleocr/models
'@
  $raw = & docker run '--rm' '--network' 'none' '--read-only' '--user' '10001:10001' '--tmpfs' '/tmp:rw,noexec,nosuid,size=64m' '--entrypoint' '/bin/sh' $resolvedRawImageOcrImage '-c' $probe
  if ($LASTEXITCODE -ne 0) { throw 'Raw image OCR image verification failed' }
  $lines = @($raw | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
  if ($lines.Count -ne 6 -or @($lines | Select-Object -First 4 | Where-Object { $_ -notmatch '^[a-f0-9]{64}$' }).Count -ne 0 -or $lines[4] -ne '3.3.1' -or $lines[5] -ne '3.7.0') { throw 'PaddleOCR image profile is invalid' }
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE', 'paddleocr-ppocrv6-v1', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_PYTHON', '/opt/paddleocr/venv/bin/python', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_PYTHON_SHA256', $lines[0], 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER', '/opt/paddleocr/skill/scripts/adapters/ocr-paddleocr-local.js', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER_SHA256', $lines[1], 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER', '/opt/paddleocr/paddleocr_worker.py', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER_SHA256', $lines[2], 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK', '/opt/paddleocr/healthcheck.png', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK_SHA256', $lines[3], 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE', '/opt/paddleocr/models', 'Process')
  return [pscustomobject]@{ provider = 'PaddleOCR'; profile = 'paddleocr-ppocrv6-v1'; image = $resolvedRawImageOcrImage; paddlepaddleVersion = $lines[4]; paddleocrVersion = $lines[5] }
}

function Resolve-RawImageOcrProfile {
  if ($RawImageOcrProvider -eq 'PaddleOCR') { return Resolve-PaddleRawImageOcrProfile }
  return Resolve-TesseractRawImageOcrProfile
}

function Read-DeploymentPlan([string]$Capabilities) {
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  $arguments = @($cli, 'team', 'deployment-plan')
  if (-not [string]::IsNullOrWhiteSpace($Capabilities)) { $arguments += @('--capabilities', $Capabilities) }
  $raw = & node @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Team deployment plan is invalid' }
  try { $plan = ($raw | Out-String | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw 'Team deployment plan returned an invalid result' }
  if ($null -eq $plan -or $null -eq $plan.workerProfiles -or @($plan.workerProfiles).Count -eq 0) { throw 'Team deployment plan returned an invalid result' }
  return $plan
}

function Assert-LocalRuntime([string[]]$Capabilities) {
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  & node $cli team runtime --project $Project --capabilities ($Capabilities -join ',') --require-gateway | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Local team runtime gateway verification failed' }
}

function Synchronize-SingleIngressMcpOAuthClient {
  if (-not $EnableSingleIngress) { return }
  $keycloakPort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_PORT', 'Process')
  if ([string]::IsNullOrWhiteSpace($keycloakPort)) { $keycloakPort = '58080' }
  if ($keycloakPort -notmatch '^[1-9][0-9]{0,4}$' -or [int]$keycloakPort -gt 65535) { throw 'COMMON_TOOLS_KEYCLOAK_PORT is invalid' }
  $backupDirectory = Join-Path $repositoryRoot 'artifacts/keycloak-mcp-client-backups'
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  $backupFile = Join-Path $backupDirectory ("before-loopback-redirect-$(Get-Date -Format 'yyyyMMddTHHmmss')-$([Guid]::NewGuid().ToString('N')).json")
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  & node $cli team keycloak-mcp-client --base-url "http://127.0.0.1:$keycloakPort/id" --apply --backup-file $backupFile
  if ($LASTEXITCODE -ne 0) { throw 'Keycloak MCP OAuth client synchronization failed' }
}

function Assert-SingleIngressRuntime([string[]]$Capabilities) {
  if (-not $EnableSingleIngress) { return }
  $doctor = Join-Path $repositoryRoot 'scripts/team-runtime-doctor.js'
  & node $doctor '--project' $Project '--scope' 'core' '--gateway-url' $SingleIngressPublicUrl '--allow-remote' '--expected-capabilities' ($Capabilities -join ',') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Single ingress remote MCP verification failed' }
}

function Set-MissingLocalConfiguration {
  $cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
  $raw = & node $cli team local-config --project $Project
  if ($LASTEXITCODE -ne 0) { throw 'Local Docker configuration could not be discovered' }
  try { $report = ($raw | Out-String | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw 'Local Docker configuration returned an invalid result' }
  if ($null -eq $report -or $null -eq $report.configuration) { throw 'Local Docker configuration is unavailable' }
  foreach ($name in @(
    'COMMON_TOOLS_REMOTE_PUBLIC_URL',
    'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS',
    'COMMON_TOOLS_OIDC_ISSUER',
    'COMMON_TOOLS_OIDC_JWKS_URL',
    'COMMON_TOOLS_OIDC_AUDIENCE'
  )) {
    $existing = [Environment]::GetEnvironmentVariable($name, 'Process')
    $value = [string]$report.configuration.$name
    if ([string]::IsNullOrWhiteSpace($existing) -and -not [string]::IsNullOrWhiteSpace($value)) {
      [Environment]::SetEnvironmentVariable($name, $value.Trim(), 'Process')
    }
  }
}

function Test-LoopbackPortAvailable([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}

function Set-SingleIngressConfiguration([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw 'SingleIngressPublicUrl is required when EnableSingleIngress is set' }
  try { $uri = [Uri]$Value } catch { throw 'SingleIngressPublicUrl must be an absolute HTTPS origin URL' }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or -not [string]::IsNullOrWhiteSpace($uri.UserInfo) -or $uri.AbsolutePath -ne '/' -or -not [string]::IsNullOrWhiteSpace($uri.Query) -or -not [string]::IsNullOrWhiteSpace($uri.Fragment)) {
    throw 'SingleIngressPublicUrl must be an absolute HTTPS origin URL'
  }
    $origin = $uri.GetLeftPart([System.UriPartial]::Authority)
    [Environment]::SetEnvironmentVariable('COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_URL', $origin, 'Process')
    [Environment]::SetEnvironmentVariable('COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_HOST', $uri.Authority, 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_PUBLIC_URL', "$origin/id", 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_SINGLE_INGRESS_OIDC_ISSUER', "$origin/id/realms/common-tools", 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_REMOTE_PUBLIC_URL', $origin, 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS', $origin, 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_OIDC_ISSUER', "$origin/id/realms/common-tools", 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_OIDC_JWKS_URL', 'http://keycloak:8080/id/realms/common-tools/protocol/openid-connect/certs', 'Process')
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_OIDC_AUDIENCE', 'common-tools-mcp', 'Process')
}

function Set-MissingLocalMinioPorts {
  $apiPort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_PORT', 'Process')
  $consolePort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_CONSOLE_PORT', 'Process')
  $needsApiPort = [string]::IsNullOrWhiteSpace($apiPort)
  $needsConsolePort = [string]::IsNullOrWhiteSpace($consolePort)
  if (-not $needsApiPort -and -not $needsConsolePort) { return }
  if ($needsApiPort -and $needsConsolePort -and (Test-LoopbackPortAvailable 59000) -and (Test-LoopbackPortAvailable 59001)) { return }
  for ($attempt = 0; $attempt -lt 128; $attempt += 1) {
    $candidate = Get-Random -Minimum 20000 -Maximum 65535
    $apiCandidate = if ($needsApiPort) { $candidate } else { [int]$apiPort }
    $consoleCandidate = if ($needsConsolePort) { if ($needsApiPort) { $candidate + 1 } else { $candidate } } else { [int]$consolePort }
    if ($apiCandidate -ne $consoleCandidate -and ($needsApiPort -eq $false -or (Test-LoopbackPortAvailable $apiCandidate)) -and ($needsConsolePort -eq $false -or (Test-LoopbackPortAvailable $consoleCandidate))) {
      if ($needsApiPort) { [Environment]::SetEnvironmentVariable('COMMON_TOOLS_MINIO_PORT', "$apiCandidate", 'Process') }
      if ($needsConsolePort) { [Environment]::SetEnvironmentVariable('COMMON_TOOLS_MINIO_CONSOLE_PORT', "$consoleCandidate", 'Process') }
      return
    }
  }
  throw 'Could not find available loopback ports for local MinIO'
}

$dockerEngineChecked = $false
if ($DiscoverLocalConfiguration) {
  Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
  $dockerEngineChecked = $true
  Set-MissingLocalConfiguration
}
if ($DiscoverLocalPorts) { Set-MissingLocalMinioPorts }
if ($EnableSingleIngress) {
  Set-SingleIngressConfiguration $SingleIngressPublicUrl
  $composeFiles += (Join-Path $repositoryRoot 'deploy/compose.team-idp.yaml')
  $composeFiles += (Join-Path $repositoryRoot 'deploy/compose.team-single-ingress.yaml')
  $profiles += 'team-idp'
}
if ($PromptForSecrets) { Set-MissingDeploymentSecretsFromPrompt }
if (-not [string]::IsNullOrWhiteSpace($Capabilities)) {
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_TEAM_CAPABILITIES', $Capabilities.Trim(), 'Process')
  $restoreCapabilities = $true
}

$missingEnvironment = @()
foreach ($name in $requiredEnvironment) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) { $missingEnvironment += $name }
}
if ($missingEnvironment.Count -gt 0) {
  throw "Required deployment configuration is missing: $($missingEnvironment -join ', ')"
}
$minioPassword = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_PASSWORD', 'Process')
if ($minioPassword.Length -lt 8) { throw 'COMMON_TOOLS_MINIO_PASSWORD must contain at least 8 characters' }
$deploymentPlan = Read-DeploymentPlan ([Environment]::GetEnvironmentVariable('COMMON_TOOLS_TEAM_CAPABILITIES', 'Process'))
$profiles += @($deploymentPlan.workerProfiles)

if (-not $dockerEngineChecked) { Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds }
$rawImageOcrProfile = $null
if ($EnableRawImageOcr) {
  if ($Mode -eq 'Apply' -and -not $SkipRawImageOcrBuild) { Invoke-RawImageOcrImageBuild }
  $rawImageOcrProfile = Resolve-RawImageOcrProfile
  $ocrComposeFile = if ($RawImageOcrProvider -eq 'PaddleOCR') { 'deploy/compose.team-image-paddleocr.yaml' } else { 'deploy/compose.team-image-ocr.yaml' }
  $composeFiles += (Join-Path $repositoryRoot $ocrComposeFile)
}
Invoke-Compose @('config', '--quiet')

if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    apiReplicas = $ApiReplicas
    enabledCapabilities = @($deploymentPlan.capabilities)
    workerProfiles = @($deploymentPlan.workerProfiles)
    rawImageOcrProfile = $rawImageOcrProfile
    localMinioPorts = @{
      api = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_PORT', 'Process')
      console = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_MINIO_CONSOLE_PORT', 'Process')
    }
    composeConfigurationValid = $true
    deployment = 'No containers or images were changed.'
  } | ConvertTo-Json -Compress
  return
}

# This intentionally includes the migration gate and all enabled local profiles.
# Do not replace it with --no-deps: API and Workers must wait for team-migrate.
# Validate the existing persistent object store before rebuilding the API and
# Workers. A root-password mismatch must not trigger a costly partial rollout.
Invoke-Compose @('up', '--detach', '--wait', '--wait-timeout', $WaitTimeoutSeconds, 'minio')
Invoke-Compose @('up', '--detach', '--build', '--wait', '--wait-timeout', $WaitTimeoutSeconds, '--scale', "remote-mcp=$ApiReplicas")
Assert-LocalRuntime @($deploymentPlan.capabilities)
Synchronize-SingleIngressMcpOAuthClient
Assert-SingleIngressRuntime @($deploymentPlan.capabilities)
Invoke-Compose @('ps', '--format', 'json')
} finally {
  foreach ($name in $promptedEnvironmentNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  if ($restoreCapabilities) { [Environment]::SetEnvironmentVariable('COMMON_TOOLS_TEAM_CAPABILITIES', $originalCapabilities, 'Process') }
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
