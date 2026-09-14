[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'common-tools-public',
  [ValidatePattern('^[a-zA-Z0-9._-]{1,64}$')]
  [string]$KeycloakAdmin = 'common-tools-admin',
  [ValidatePattern('^https://[^?#]+$')]
  [string]$SingleIngressPublicUrl = 'https://plugins.iepose.cn',
  [string]$Out = '',
  [switch]$Interactive,
  [switch]$PromptForPassword,
  [switch]$Redeploy,
  [switch]$ResetState,
  [switch]$ConfirmReset,
  [ValidateRange(30, 600)]
  [int]$WaitTimeoutSeconds = 240,
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [string]$Capabilities = 'image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit,siyuan-note',
  [string]$SiyuanConfigPath = (Join-Path $env:USERPROFILE 'SiYuan/conf/conf.json')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')
. (Join-Path $PSScriptRoot 'team-runtime-operation-lock.ps1')

$minimumSharedPasswordLength = 8

function Resolve-SecretFilePath([string]$Path, [string]$ComposeProject) {
  $candidate = if ([string]::IsNullOrWhiteSpace($Path)) {
    Join-Path (Split-Path -Parent $repositoryRoot) "common-tools-secrets/$ComposeProject.env"
  } else {
    $Path
  }
  if ($candidate.IndexOf([char]0) -ge 0) { throw 'Secret file path is invalid' }
  if (-not [System.IO.Path]::IsPathRooted($candidate)) { throw 'Secret file path must be absolute' }
  $fullPath = [System.IO.Path]::GetFullPath($candidate)
  $repoPrefix = $repositoryRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ($fullPath.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Secret file must be outside the repository root'
  }
  if ([System.IO.Directory]::Exists($fullPath)) { throw 'Secret file path must target a file' }
  return $fullPath
}

function New-SharedPassword {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Read-SecretValue([string]$Prompt) {
  Write-Host "$Prompt. Input is hidden; type the value and press Enter."
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ([string]::IsNullOrWhiteSpace($value)) { throw 'Shared password is required' }
  if ($value.Length -lt $minimumSharedPasswordLength) { throw "Shared password must contain at least $minimumSharedPasswordLength characters" }
  return $value
}

function Read-ConfirmedSecretValue([string]$Prompt) {
  while ($true) {
    try {
      $first = Read-SecretValue $Prompt
      $second = Read-SecretValue 'Confirm new shared Common Tools password'
      if ($first -cne $second) {
        Write-Warning 'Shared password confirmation did not match; please try again.'
        continue
      }
      return $first
    } catch {
      Write-Warning $_.Exception.Message
    }
  }
}

function Read-YesNo([string]$Prompt, [bool]$DefaultNo = $true) {
  $suffix = if ($DefaultNo) { ' [y/N]' } else { ' [Y/n]' }
  while ($true) {
    $answer = (Read-Host -Prompt "$Prompt$suffix").Trim()
    if ([string]::IsNullOrWhiteSpace($answer)) { return (-not $DefaultNo) }
    if ($answer -match '^(y|yes)$') { return $true }
    if ($answer -match '^(n|no)$') { return $false }
    Write-Host 'Please answer y or n.'
  }
}

function Read-SiyuanToken([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
  $raw = Get-Content -Raw -LiteralPath $Path
  try { $config = $raw | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'SiYuan configuration is invalid JSON' }
  $token = [string]$config.api.token
  if ([string]::IsNullOrWhiteSpace($token)) { return '' }
  return $token
}

function Write-SecretFile([string]$Path, [hashtable]$Values) {
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Move-Item -LiteralPath $Path -Destination "$Path.$stamp.bak"
  }
  $orderedKeys = @(
    'COMMON_TOOLS_PROJECT',
    'COMMON_TOOLS_KEYCLOAK_ADMIN',
    'COMMON_TOOLS_SHARED_PASSWORD',
    'COMMON_TOOLS_POSTGRES_PASSWORD',
    'COMMON_TOOLS_DATABASE_PASSWORD',
    'COMMON_TOOLS_REDIS_PASSWORD',
    'COMMON_TOOLS_MINIO_PASSWORD',
    'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD',
    'COMMON_TOOLS_REMOTE_PORT',
    'COMMON_TOOLS_REMOTE_PUBLIC_URL',
    'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS',
    'COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT',
    'COMMON_TOOLS_OIDC_ISSUER',
    'COMMON_TOOLS_OIDC_JWKS_URL',
    'COMMON_TOOLS_OIDC_AUDIENCE',
    'COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_URL',
    'COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_HOST',
    'COMMON_TOOLS_SINGLE_INGRESS_OIDC_ISSUER',
    'COMMON_TOOLS_KEYCLOAK_PUBLIC_URL',
    'COMMON_TOOLS_TEAM_CAPABILITIES',
    'COMMON_TOOLS_SIYUAN_URL',
    'COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME',
    'COMMON_TOOLS_SIYUAN_TOKEN'
  )
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add('# Common Tools local runtime secrets. Keep this file outside the repository.')
  foreach ($key in $orderedKeys) {
    if ($Values.ContainsKey($key)) { $lines.Add("$key=$($Values[$key])") }
  }
  Set-Content -LiteralPath $Path -Value $lines -Encoding utf8NoBOM
  try {
    icacls $directory /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
    icacls $Path /inheritance:r /grant:r "$($env:USERNAME):F" 'SYSTEM:F' 'Administrators:F' | Out-Null
  } catch {
    Write-Warning 'Secret file was written, but ACL hardening failed.'
  }
}

function Import-SecretFile([string]$Path) {
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trim = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trim) -or $trim.StartsWith('#')) { continue }
    $parts = $trim -split '=', 2
    if ($parts.Count -ne 2) { throw "Invalid secret file line for key: $($parts[0])" }
    if ($parts[0] -cnotmatch '^COMMON_TOOLS_[A-Z0-9_]{1,120}$') { throw "Unsupported secret variable name: $($parts[0])" }
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process')
  }
}

function Remove-ComposeProjectContainers([string]$ComposeProject) {
  $ids = @(& docker ps -a --filter "label=com.docker.compose.project=$ComposeProject" --format '{{.ID}}') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if ($LASTEXITCODE -ne 0) { throw "Docker container inventory failed for project '$ComposeProject'" }
  if ($ids.Count -gt 0) {
    & docker rm --force @ids | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker container cleanup failed for project '$ComposeProject'" }
  }
}

function Remove-ComposeProjectVolumes([string]$ComposeProject) {
  $volumes = @(& docker volume ls --filter "label=com.docker.compose.project=$ComposeProject" --format '{{.Name}}') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if ($LASTEXITCODE -ne 0) { throw "Docker volume inventory failed for project '$ComposeProject'" }
  if ($volumes.Count -gt 0) {
    & docker volume rm @volumes | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker volume cleanup failed for project '$ComposeProject'" }
  }
}

$interactiveSharedPassword = $null
if ($Interactive) {
  if (-not $PSBoundParameters.ContainsKey('Mode')) { $Mode = 'Apply' }
  $PromptForPassword = $true
  $interactiveSharedPassword = Read-ConfirmedSecretValue 'New shared Common Tools password'
  if (-not $PSBoundParameters.ContainsKey('Redeploy')) {
    $Redeploy = Read-YesNo "Reset local Docker state and redeploy project '$Project' now so the new password takes effect?"
  }
  if ($Redeploy -and (-not $ResetState) -and (-not $PSBoundParameters.ContainsKey('ResetState'))) {
    $ResetState = $true
  }
  if ($Redeploy -and $ResetState -and (-not $ConfirmReset) -and (-not $PSBoundParameters.ContainsKey('ConfirmReset'))) {
    $ConfirmReset = Read-YesNo "This will remove Docker volumes for project '$Project' before redeploying. Continue?"
  }
}

$secretFile = Resolve-SecretFilePath $Out $Project
$publicUri = [Uri]$SingleIngressPublicUrl
$publicOrigin = $publicUri.GetLeftPart([System.UriPartial]::Authority)
$keycloakPublicUrl = "$publicOrigin/id"
$oidcIssuer = "$keycloakPublicUrl/realms/common-tools"
$sharedPassword = if ($null -ne $interactiveSharedPassword) { $interactiveSharedPassword } elseif ($PromptForPassword) { Read-SecretValue 'New shared Common Tools password' } else { New-SharedPassword }
$siyuanToken = Read-SiyuanToken $SiyuanConfigPath

$values = @{
  COMMON_TOOLS_PROJECT = $Project
  COMMON_TOOLS_KEYCLOAK_ADMIN = $KeycloakAdmin
  COMMON_TOOLS_SHARED_PASSWORD = $sharedPassword
  COMMON_TOOLS_POSTGRES_PASSWORD = $sharedPassword
  COMMON_TOOLS_DATABASE_PASSWORD = $sharedPassword
  COMMON_TOOLS_REDIS_PASSWORD = $sharedPassword
  COMMON_TOOLS_MINIO_PASSWORD = $sharedPassword
  COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD = $sharedPassword
  COMMON_TOOLS_REMOTE_PORT = '3000'
  COMMON_TOOLS_REMOTE_PUBLIC_URL = $publicOrigin
  COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS = $publicOrigin
  COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT = $publicOrigin
  COMMON_TOOLS_OIDC_ISSUER = $oidcIssuer
  COMMON_TOOLS_OIDC_JWKS_URL = 'http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs'
  COMMON_TOOLS_OIDC_AUDIENCE = 'common-tools-mcp'
  COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_URL = $publicOrigin
  COMMON_TOOLS_SINGLE_INGRESS_PUBLIC_HOST = $publicUri.Authority
  COMMON_TOOLS_SINGLE_INGRESS_OIDC_ISSUER = $oidcIssuer
  COMMON_TOOLS_KEYCLOAK_PUBLIC_URL = $keycloakPublicUrl
  COMMON_TOOLS_TEAM_CAPABILITIES = $Capabilities
  COMMON_TOOLS_SIYUAN_URL = 'http://host.docker.internal:6806'
  COMMON_TOOLS_SIYUAN_DEFAULT_NOTEBOOK_NAME = 'AI 助手笔记'
  COMMON_TOOLS_SIYUAN_TOKEN = $siyuanToken
}

$operationLock = Enter-CommonToolsTeamRuntimeOperationLock -Project $Project
try {
  Write-SecretFile $secretFile $values
  $plan = [ordered]@{
    mode = $Mode.ToLowerInvariant()
    project = $Project
    secretFile = $secretFile
    keycloakAdmin = $KeycloakAdmin
    singleIngressPublicUrl = $publicOrigin
    passwordSource = if ($PromptForPassword) { 'prompt' } else { 'generated' }
    passwordWritten = $true
    redeployRequested = [bool]$Redeploy
    resetStateRequested = [bool]$ResetState
    resetStateConfirmed = [bool]$ConfirmReset
    stateVolumes = @(
      "$Project`_common-tools-postgres",
      "$Project`_common-tools-redis",
      "$Project`_common-tools-minio",
      "$Project`_common-tools-keycloak"
    )
  }
  if ($Mode -eq 'Plan') {
    $plan.applyRequires = if ($Redeploy) { 'rerun with -Mode Apply and explicit reset switches when needed' } else { 'none; secret file only' }
    $plan | ConvertTo-Json -Depth 4
    return
  }

  if ($ResetState -and (-not $Redeploy)) { throw '-ResetState requires -Redeploy' }
  if ($ResetState -and (-not $ConfirmReset)) { throw 'State reset requires -ConfirmReset' }
  if ($Redeploy -and (-not $ResetState)) {
    throw 'Redeploying with a new shared password requires -ResetState because persisted local service passwords are stored in Docker volumes'
  }

  if ($Redeploy) {
    Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
    Remove-ComposeProjectContainers $Project
    if ($ResetState) { Remove-ComposeProjectVolumes $Project }
    Import-SecretFile $secretFile
    $deployScript = Join-Path $PSScriptRoot 'team-runtime-local-deploy.ps1'
    & $deployScript -Mode Apply -Project $Project -EnableIdentityProvider -EnableSingleIngress -SingleIngressPublicUrl $publicOrigin -Capabilities $Capabilities -WaitTimeoutSeconds $WaitTimeoutSeconds -DockerEngineTimeoutSeconds $DockerEngineTimeoutSeconds
    if ($LASTEXITCODE -ne 0) { throw 'Unified-password redeploy failed' }
  }

  $plan.applied = $true
  $plan | ConvertTo-Json -Depth 4
} finally {
  Exit-CommonToolsTeamRuntimeOperationLock -Lock $operationLock
}
