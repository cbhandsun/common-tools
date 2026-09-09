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
  [string]$ArtifactName = '',
  [switch]$Login,
  [ValidatePattern('^$|^http://127\.0\.0\.1:[1-9][0-9]{3,4}/realms/[A-Za-z0-9._/-]{1,128}$')]
  [string]$OidcIssuer = '',
  [ValidateRange(15, 600)]
  [int]$LoginTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
$jobSmoke = Join-Path $PSScriptRoot 'team-runtime-authenticated-job-smoke.js'
$loopbackRedirectUri = 'http://127.0.0.1:43123/callback/common-tools-mcp/'

if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Common Tools CLI is unavailable' }
if (-not (Test-Path -LiteralPath $jobSmoke -PathType Leaf)) { throw 'Authenticated job smoke script is unavailable' }

function ConvertTo-Base64Url {
  param([byte[]]$Bytes)
  return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-Base64UrlRandom {
  param([ValidateRange(16, 96)][int]$ByteCount)
  $bytes = [byte[]]::new($ByteCount)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return ConvertTo-Base64Url $bytes
}

function New-PkceChallenge {
  param([Parameter(Mandatory)][string]$Verifier)
  $bytes = [System.Text.Encoding]::ASCII.GetBytes($Verifier)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return ConvertTo-Base64Url $hash
}

function Resolve-LocalOidcIssuer {
  param([string]$ExplicitIssuer)
  if (-not [string]::IsNullOrWhiteSpace($ExplicitIssuer)) { return $ExplicitIssuer.TrimEnd('/') }
  $processIssuer = [Environment]::GetEnvironmentVariable('COMMON_TOOLS_OIDC_ISSUER', 'Process')
  if (-not [string]::IsNullOrWhiteSpace($processIssuer)) { return $processIssuer.TrimEnd('/') }
  return 'http://127.0.0.1:58080/realms/common-tools'
}

function Send-LoopbackOAuthResponse {
  param(
    [Parameter(Mandatory)]$Response,
    [Parameter(Mandatory)][string]$Message,
    [int]$StatusCode = 200
  )
  $html = "<!doctype html><html><head><meta charset='utf-8'><title>Common Tools login</title></head><body><p>$Message</p></body></html>"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = 'text/html; charset=utf-8'
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Request-LocalOidcAccessToken {
  param(
    [Parameter(Mandatory)][string]$Issuer,
    [Parameter(Mandatory)][string]$CapabilityName,
    [ValidateRange(15, 600)][int]$TimeoutSeconds
  )
  $verifier = New-Base64UrlRandom 32
  $challenge = New-PkceChallenge $verifier
  $state = New-Base64UrlRandom 24
  $scope = "openid offline_access common-tools:capability:$CapabilityName"
  $authorizationEndpoint = "$Issuer/protocol/openid-connect/auth"
  $tokenEndpoint = "$Issuer/protocol/openid-connect/token"
  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Add($loopbackRedirectUri)
  try {
    $listener.Start()
    $query = @{
      response_type = 'code'
      client_id = 'common-tools-mcp'
      redirect_uri = $loopbackRedirectUri
      scope = $scope
      state = $state
      code_challenge = $challenge
      code_challenge_method = 'S256'
    }
    $encoded = ($query.GetEnumerator() | Sort-Object Name | ForEach-Object {
      "$([Uri]::EscapeDataString($_.Key))=$([Uri]::EscapeDataString([string]$_.Value))"
    }) -join '&'
    Write-Host 'Opening browser for Common Tools local OAuth login. The script will not read, store or print your password or token.'
    Start-Process "$authorizationEndpoint`?$encoded"
    $contextTask = $listener.GetContextAsync()
    if (-not $contextTask.Wait([TimeSpan]::FromSeconds($TimeoutSeconds))) {
      throw 'Local OAuth login timed out before the browser callback was received'
    }
    $context = $contextTask.Result
    $request = $context.Request
    if ($request.Url.AbsolutePath -ne '/callback/common-tools-mcp/') {
      Send-LoopbackOAuthResponse -Response $context.Response -Message 'Invalid Common Tools OAuth callback path.' -StatusCode 400
      throw 'Local OAuth callback path is invalid'
    }
    $errorValue = $request.QueryString['error']
    if (-not [string]::IsNullOrWhiteSpace($errorValue)) {
      Send-LoopbackOAuthResponse -Response $context.Response -Message 'Common Tools OAuth login was rejected.' -StatusCode 400
      throw 'Local OAuth login was rejected'
    }
    if ($request.QueryString['state'] -ne $state) {
      Send-LoopbackOAuthResponse -Response $context.Response -Message 'Common Tools OAuth state did not match.' -StatusCode 400
      throw 'Local OAuth state did not match'
    }
    $code = $request.QueryString['code']
    if ([string]::IsNullOrWhiteSpace($code) -or $code.Length -gt 4096) {
      Send-LoopbackOAuthResponse -Response $context.Response -Message 'Common Tools OAuth callback did not include a valid code.' -StatusCode 400
      throw 'Local OAuth code is invalid'
    }
    Send-LoopbackOAuthResponse -Response $context.Response -Message 'Common Tools login succeeded. You can return to PowerShell.'
    $body = @{
      grant_type = 'authorization_code'
      client_id = 'common-tools-mcp'
      code = $code
      redirect_uri = $loopbackRedirectUri
      code_verifier = $verifier
    }
    $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenEndpoint -ContentType 'application/x-www-form-urlencoded' -Body $body
    $accessToken = [string]$tokenResponse.access_token
    if ([string]::IsNullOrWhiteSpace($accessToken) -or $accessToken.Length -gt 20000) {
      throw 'Local OAuth token response did not include a valid access token'
    }
    return $accessToken
  } finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
  }
}

$token = [Environment]::GetEnvironmentVariable($TokenEnv, 'Process')
$temporaryToken = $false
if ([string]::IsNullOrWhiteSpace($token)) {
  if (-not $Login) {
    Write-Host "Set $TokenEnv to a bearer token with the required Common Tools capability scope, or rerun with -Login to authorize through the local browser."
    Write-Host 'This helper prepares the local smoke input and gateway URL; it does not print OAuth tokens.'
    exit 2
  }
  $token = Request-LocalOidcAccessToken -Issuer (Resolve-LocalOidcIssuer $OidcIssuer) -CapabilityName $Capability -TimeoutSeconds $LoginTimeoutSeconds
  [Environment]::SetEnvironmentVariable($TokenEnv, $token, 'Process')
  $temporaryToken = $true
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
  if ($temporaryToken) { [Environment]::SetEnvironmentVariable($TokenEnv, $null, 'Process') }
  try { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction Stop } catch { }
}
