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
  [switch]$PreflightOnly,
  [switch]$SkipFreshReset
)

$ErrorActionPreference = 'Stop'
$freshResetScript = Join-Path $PSScriptRoot 'team-runtime-local-fresh-reset.ps1'
$acceptanceScript = Join-Path $PSScriptRoot 'team-runtime-local-acceptance.ps1'
$closeoutScript = Join-Path $PSScriptRoot 'verify-architecture-closeout.js'
$doctorScript = Join-Path $PSScriptRoot 'team-runtime-doctor.js'

foreach ($script in @($freshResetScript, $acceptanceScript, $closeoutScript, $doctorScript)) {
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Local closeout helper script is unavailable' }
}

function Read-SecretValue([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ([string]::IsNullOrWhiteSpace($value)) { throw 'Secret value is required' }
  return $value
}

function Invoke-LocalCloseoutDoctor([string]$Phase) {
  Write-Warning "Local closeout failed during $Phase; collecting sanitized runtime diagnostics."
  $remotePort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_REMOTE_PORT', 'Process')
  if ([string]::IsNullOrWhiteSpace($remotePort)) { $remotePort = '54000' }
  & node $doctorScript '--project' $Project '--scope' 'all' '--gateway-url' "http://127.0.0.1:$remotePort" '--expected-capabilities' $Capabilities
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Sanitized runtime diagnostics reported an unhealthy local runtime.' }
}

function Assert-ExistingLocalRuntimeReady {
  Write-Host 'Preflight: checking existing local Common Tools runtime before prompting for secrets.'
  $remotePort = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_REMOTE_PORT', 'Process')
  & node $doctorScript '--project' $Project '--scope' 'all' '--gateway-url' "http://127.0.0.1:$remotePort" '--expected-capabilities' $Capabilities
  if ($LASTEXITCODE -ne 0) { throw 'Existing local Common Tools runtime is not ready for authenticated closeout' }
}

function Set-MissingLocalGatewayPortFromCompose {
  $existing = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_REMOTE_PORT', 'Process')
  if (-not [string]::IsNullOrWhiteSpace($existing)) { return }
  $rows = @(& docker compose -p $Project ps --format json)
  if ($LASTEXITCODE -ne 0) { throw 'Local gateway port discovery failed' }
  foreach ($line in $rows) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $record = $line | ConvertFrom-Json -ErrorAction Stop
    if ($record.Service -ne 'remote-mcp-gateway') { continue }
    foreach ($publisher in @($record.Publishers)) {
      if ($publisher.TargetPort -eq 8080 -and $publisher.URL -eq '127.0.0.1' -and $publisher.PublishedPort -gt 0) {
        [Environment]::SetEnvironmentVariable('COMMON_TOOLS_REMOTE_PORT', "$($publisher.PublishedPort)", 'Process')
        return
      }
    }
  }
  throw 'Local gateway port could not be discovered'
}

$managedNames = @(
  'COMMON_TOOLS_POSTGRES_PASSWORD',
  'COMMON_TOOLS_DATABASE_PASSWORD',
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
  if ($PreflightOnly) {
    [pscustomobject]@{
      schemaVersion = 1
      project = $Project
      capability = $Capability
      capabilities = @($Capabilities.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      username = $Username
      projectId = $ProjectId
      role = $Role
      stateVolumes = @("$Project`_common-tools-postgres", "$Project`_common-tools-redis", "$Project`_common-tools-minio", "$Project`_common-tools-keycloak")
      willPromptForSharedPassword = $true
      minimumPasswordLength = 8
      willFreshResetLocalState = (-not $SkipFreshReset)
      willDeploy = (-not $SkipFreshReset)
      willKeepIdentityProvider = $true
      willDiscoverGatewayPort = $true
      willRunAuthenticatedAcceptance = $true
      willOpenBrowserLogin = $true
      willVerifyLocalAcceptanceEvidence = $true
      willVerifyArchitectureCloseout = $true
      writesEvidence = $false
      changed = $false
      passed = $true
    } | ConvertTo-Json -Depth 8 -Compress
    return
  }

  if ($SkipFreshReset) {
    Set-MissingLocalGatewayPortFromCompose
    Assert-ExistingLocalRuntimeReady
  }

  $sharedPassword = Read-SecretValue 'Shared local closeout password'
  if ($sharedPassword.Length -lt 8) { throw 'Shared local closeout password must contain at least 8 characters' }
  foreach ($name in @(
    'COMMON_TOOLS_POSTGRES_PASSWORD',
    'COMMON_TOOLS_DATABASE_PASSWORD',
    'COMMON_TOOLS_REDIS_PASSWORD',
    'COMMON_TOOLS_MINIO_PASSWORD',
    'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD',
    'COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD'
  )) {
    [Environment]::SetEnvironmentVariable($name, $sharedPassword, 'Process')
  }
  [Environment]::SetEnvironmentVariable('COMMON_TOOLS_KEYCLOAK_ADMIN', 'local-admin', 'Process')

  if ($SkipFreshReset) {
    Write-Host 'Step 1/3: reusing existing local Common Tools runtime.'
  } else {
    Write-Host 'Step 1/3: fresh resetting and deploying local Common Tools runtime.'
    & $freshResetScript -Mode Apply -Project $Project -WaitTimeoutSeconds $WaitTimeoutSeconds -Confirm
    if ($LASTEXITCODE -ne 0) {
      Invoke-LocalCloseoutDoctor 'fresh-reset'
      exit $LASTEXITCODE
    }
  }

  if (-not $SkipFreshReset) { Set-MissingLocalGatewayPortFromCompose }
  Write-Host 'Step 2/3: running authenticated acceptance against the local runtime.'
  $acceptanceArguments = @(
    '-Project', $Project,
    '-ApiReplicas', $ApiReplicas,
    '-WaitTimeoutSeconds', $WaitTimeoutSeconds,
    '-Capabilities', $Capabilities,
    '-Username', $Username,
    '-ProjectId', $ProjectId,
    '-Role', $Role,
    '-Capability', $Capability,
    '-SkipDeploy'
  )
  if (-not [string]::IsNullOrWhiteSpace($EvidenceFile)) {
    $acceptanceArguments += @('-EvidenceFile', $EvidenceFile)
  }
  & $acceptanceScript @acceptanceArguments
  if ($LASTEXITCODE -ne 0) {
    Invoke-LocalCloseoutDoctor 'authenticated-acceptance'
    exit $LASTEXITCODE
  }

  Write-Host 'Step 3/3: verifying architecture closeout.'
  & node $closeoutScript
  if ($LASTEXITCODE -ne 0) {
    Invoke-LocalCloseoutDoctor 'architecture-closeout'
    exit $LASTEXITCODE
  }
} finally {
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
  }
}
