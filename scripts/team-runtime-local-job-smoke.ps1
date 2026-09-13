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
  [switch]$DirectLogin,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$')]
  [string]$Username = 'local-tester',
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

function Resolve-LocalKeycloakRealmContext {
  param([Parameter(Mandatory)][string]$Issuer)
  $match = [regex]::Match($Issuer, '^(?<base>https?://[^/]+)/realms/(?<realm>[A-Za-z0-9._-]+)$')
  if (-not $match.Success) { throw 'Local OIDC issuer is invalid' }
  $baseUrl = $match.Groups['base'].Value
  $realm = $match.Groups['realm'].Value
  if ($baseUrl -notmatch '^http://(127\.0\.0\.1|localhost):[1-9][0-9]{3,4}$') { throw 'Local direct login only supports loopback Keycloak' }
  return [pscustomobject]@{ BaseUrl = $baseUrl; Realm = $realm }
}

function Read-RequiredEnvironmentValue {
  param([Parameter(Mandatory)][string]$Name)
  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$Name is required for local direct login" }
  return $value
}

function Request-LocalKeycloakAdminToken {
  param(
    [Parameter(Mandatory)][string]$BaseUrl,
    [Parameter(Mandatory)][string]$AdminUsername,
    [Parameter(Mandatory)][string]$AdminPassword
  )
  $body = @{
    grant_type = 'password'
    client_id = 'admin-cli'
    username = $AdminUsername
    password = $AdminPassword
  }
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body $body
  } catch {
    throw 'Local Keycloak admin authentication failed'
  }
  $accessToken = [string]$response.access_token
  if ([string]::IsNullOrWhiteSpace($accessToken) -or $accessToken.Length -gt 20000) { throw 'Local Keycloak admin token response is invalid' }
  return $accessToken
}

function Invoke-LocalKeycloakForm {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)][hashtable]$Body,
    [Parameter(Mandatory)][string]$Failure
  )
  try {
    $response = Invoke-WebRequest -Method Post -Uri $Uri -ContentType 'application/x-www-form-urlencoded' -Body $Body -SkipHttpErrorCheck
  } catch {
    throw $Failure
  }
  if ($response.StatusCode -lt 200 -or $response.StatusCode -gt 299) {
    $message = $Failure
    try {
      $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop
      $code = [string]$payload.error
      $description = [string]$payload.error_description
      if (-not [string]::IsNullOrWhiteSpace($code) -and $code -match '^[A-Za-z0-9._ -]{1,128}$') { $message = "$message ($code)" }
      if (-not [string]::IsNullOrWhiteSpace($description) -and $description -match '^[A-Za-z0-9._ :,-]{1,256}$') { $message = "$message`: $description" }
    } catch { }
    throw $message
  }
  try {
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "$Failure response is invalid"
  }
}

function Read-LocalMcpClient {
  param(
    [Parameter(Mandatory)][string]$BaseUrl,
    [Parameter(Mandatory)][string]$Realm,
    [Parameter(Mandatory)][hashtable]$Headers
  )
  $encodedRealm = [Uri]::EscapeDataString($Realm)
  try {
    $clients = Invoke-RestMethod -Method Get -Uri "$BaseUrl/admin/realms/$encodedRealm/clients?clientId=common-tools-mcp" -Headers $Headers
  } catch {
    throw 'Local Keycloak MCP client lookup failed'
  }
  $matching = @($clients | Where-Object { $_.clientId -eq 'common-tools-mcp' -and -not [string]::IsNullOrWhiteSpace([string]$_.id) })
  if ($matching.Count -ne 1) { throw 'Local Keycloak MCP client is unavailable' }
  $clientId = [Uri]::EscapeDataString([string]$matching[0].id)
  $clientUrl = "$BaseUrl/admin/realms/$encodedRealm/clients/$clientId"
  try {
    $client = Invoke-RestMethod -Method Get -Uri $clientUrl -Headers $Headers
  } catch {
    throw 'Local Keycloak MCP client read failed'
  }
  return [pscustomobject]@{ Url = $clientUrl; Client = $client }
}

function Set-LocalMcpClientDirectGrant {
  param(
    [Parameter(Mandatory)][string]$ClientUrl,
    [Parameter(Mandatory)][object]$Client,
    [Parameter(Mandatory)][hashtable]$Headers,
    [Parameter(Mandatory)][bool]$Enabled
  )
  $updated = $Client.PSObject.Copy()
  $updated.directAccessGrantsEnabled = $Enabled
  $json = $updated | ConvertTo-Json -Depth 16
  try {
    Invoke-RestMethod -Method Put -Uri $ClientUrl -Headers ($Headers + @{ 'content-type' = 'application/json' }) -Body $json | Out-Null
  } catch {
    throw 'Local Keycloak MCP client direct grant update failed'
  }
}

function Request-LocalDirectAccessToken {
  param(
    [Parameter(Mandatory)][string]$Issuer,
    [Parameter(Mandatory)][string]$CapabilityName,
    [Parameter(Mandatory)][string]$Username
  )
  $context = Resolve-LocalKeycloakRealmContext $Issuer
  $adminUsername = Read-RequiredEnvironmentValue 'COMMON_TOOLS_KEYCLOAK_ADMIN'
  $adminPassword = Read-RequiredEnvironmentValue 'COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD'
  $userPassword = Read-RequiredEnvironmentValue 'COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD'
  $adminToken = Request-LocalKeycloakAdminToken -BaseUrl $context.BaseUrl -AdminUsername $adminUsername -AdminPassword $adminPassword
  $headers = @{ Authorization = "Bearer $adminToken"; Accept = 'application/json' }
  $clientState = Read-LocalMcpClient -BaseUrl $context.BaseUrl -Realm $context.Realm -Headers $headers
  $originalDirectGrant = [bool]$clientState.Client.directAccessGrantsEnabled
  $changedDirectGrant = $false
  try {
    if (-not $originalDirectGrant) {
      Set-LocalMcpClientDirectGrant -ClientUrl $clientState.Url -Client $clientState.Client -Headers $headers -Enabled $true
      $changedDirectGrant = $true
    }
    $body = @{
      grant_type = 'password'
      client_id = 'common-tools-mcp'
      username = $Username
      password = $userPassword
      scope = "openid offline_access common-tools:capability:$CapabilityName"
    }
    $tokenResponse = Invoke-LocalKeycloakForm -Uri "$Issuer/protocol/openid-connect/token" -Body $body -Failure 'Local direct login token request failed'
    $accessToken = [string]$tokenResponse.access_token
    if ([string]::IsNullOrWhiteSpace($accessToken) -or $accessToken.Length -gt 20000) {
      throw 'Local direct login token response did not include a valid access token'
    }
    return $accessToken
  } finally {
    if ($changedDirectGrant) {
      try {
        $latestState = Read-LocalMcpClient -BaseUrl $context.BaseUrl -Realm $context.Realm -Headers $headers
        Set-LocalMcpClientDirectGrant -ClientUrl $latestState.Url -Client $latestState.Client -Headers $headers -Enabled $false
      } catch {
        Write-Warning 'Local Keycloak MCP client direct grant restore failed; rerun the Keycloak mapper repair helper.'
      }
    }
  }
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
  if (-not $Login -and -not $DirectLogin) {
    Write-Host "Set $TokenEnv to a bearer token with the required Common Tools capability scope, rerun with -DirectLogin for local Keycloak test credentials, or rerun with -Login to authorize through the local browser."
    Write-Host 'This helper prepares the local smoke input and gateway URL; it does not print OAuth tokens.'
    exit 2
  }
  if ($DirectLogin) {
    $token = Request-LocalDirectAccessToken -Issuer (Resolve-LocalOidcIssuer $OidcIssuer) -CapabilityName $Capability -Username $Username
  } else {
    $token = Request-LocalOidcAccessToken -Issuer (Resolve-LocalOidcIssuer $OidcIssuer) -CapabilityName $Capability -TimeoutSeconds $LoginTimeoutSeconds
  }
  [Environment]::SetEnvironmentVariable($TokenEnv, $token, 'Process')
  $temporaryToken = $true
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("common-tools-local-job-smoke-" + [Guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null
try {
  $deckFile = Join-Path $temporaryRoot 'deck.json'
  $archive = Join-Path $temporaryRoot 'input.tar.gz'
  $archiveScript = Join-Path $temporaryRoot 'pack-smoke-input.cjs'
  $deckJson = @'
{"version":"1.0","slideSize":{"widthPt":960,"heightPt":540},"pages":[{"pageIndex":0,"background":{"fill":"#FFFFFF"},"textBoxes":[{"id":"title","text":"Common Tools local authenticated smoke","box":{"x":48,"y":48,"w":720,"h":56},"font":{"family":"Arial","sizePt":28}}],"shapes":[{"id":"accent","type":"rect","box":{"x":48,"y":128,"w":240,"h":24},"fill":"#4472C4"}],"images":[],"tables":[],"charts":[],"icons":[]}]}
'@
  [System.IO.File]::WriteAllText($deckFile, $deckJson, [System.Text.UTF8Encoding]::new($false))
  $archiveScriptSource = @'
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const repositoryRoot = process.argv[2];
const deckFile = process.argv[3];
const archiveFile = process.argv[4];
if (!repositoryRoot || !deckFile || !archiveFile) throw new Error("smoke archive arguments are required");
const { tarEntry } = require(path.join(repositoryRoot, "packages", "slideclone-worker-adapter", "team-raw-image-archive.js"));
const body = fs.readFileSync(deckFile);
const archive = zlib.gzipSync(Buffer.concat([tarEntry("deck.json", body), Buffer.alloc(1024)]), { level: 9 });
fs.writeFileSync(archiveFile, archive, { mode: 0o600, flag: "wx" });
'@
  [System.IO.File]::WriteAllText($archiveScript, $archiveScriptSource, [System.Text.UTF8Encoding]::new($false))

  & node $archiveScript $repositoryRoot $deckFile $archive
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
