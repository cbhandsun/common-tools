[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [string]$Capabilities = 'image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit',
  [ValidatePattern('^$|^http://127\.0\.0\.1:[1-9][0-9]{3,4}$')]
  [string]$GatewayUrl = '',
  [switch]$RequireIdentityProvider
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $repositoryRoot 'packages/cli/bin/common-tools.js'
$localConfiguration = $null

function Invoke-CommonTools([string[]]$Arguments, [string]$Failure) {
  $output = & node $cli @Arguments
  if ($LASTEXITCODE -ne 0) { throw $Failure }
  return ($output | Out-String).Trim()
}

function Read-JsonObject([string]$Json, [string]$Failure) {
  try { $value = $Json | ConvertFrom-Json -ErrorAction Stop }
  catch { throw $Failure }
  if ($null -eq $value) { throw $Failure }
  return $value
}

function Read-LocalConfiguration {
  if ($null -ne $script:localConfiguration) { return $script:localConfiguration }
  $raw = Invoke-CommonTools @('team', 'local-config', '--project', $Project) 'Local team gateway configuration is unavailable'
  $report = Read-JsonObject $raw 'Local team gateway configuration is invalid'
  $script:localConfiguration = $report
  return $report
}

function Resolve-GatewayOrigin {
  if (-not [string]::IsNullOrWhiteSpace($GatewayUrl)) { return $GatewayUrl.Trim() }
  $report = Read-LocalConfiguration
  $origin = [string]$report.configuration.COMMON_TOOLS_REMOTE_PUBLIC_URL
  if ([string]::IsNullOrWhiteSpace($origin)) { throw 'Local team gateway URL is unavailable' }
  return $origin.Trim()
}

function Resolve-LocalOidcIssuer {
  $report = Read-LocalConfiguration
  $issuer = [string]$report.configuration.COMMON_TOOLS_OIDC_ISSUER
  if ([string]::IsNullOrWhiteSpace($issuer)) { throw 'Local team identity provider is unavailable' }
  try { $uri = [Uri]$issuer } catch { throw 'Local team OIDC issuer is invalid' }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.AbsolutePath -ne '/realms/common-tools' -or -not [string]::IsNullOrWhiteSpace($uri.Query) -or -not [string]::IsNullOrWhiteSpace($uri.Fragment) -or $uri.Port -lt 1024 -or $uri.Port -gt 65535) {
    throw 'Local team OIDC issuer must be a loopback realm URL'
  }
  return $issuer.TrimEnd('/')
}

function Assert-LoopbackOrigin([string]$Origin) {
  try { $uri = [Uri]$Origin } catch { throw 'Local team gateway URL is invalid' }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.AbsolutePath -ne '/' -or -not [string]::IsNullOrWhiteSpace($uri.Query) -or -not [string]::IsNullOrWhiteSpace($uri.Fragment) -or $uri.Port -lt 1024 -or $uri.Port -gt 65535) {
    throw 'Local team gateway URL must be a loopback HTTP origin'
  }
}

function Invoke-BoundedHttp([string]$Method, [string]$Url, [string]$Body = '') {
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(8)
  try {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Url)
    $request.Headers.TryAddWithoutValidation('Accept', 'application/json, text/event-stream') | Out-Null
    if ($Method -eq 'POST') {
      $request.Headers.TryAddWithoutValidation('Origin', (Resolve-GatewayOrigin)) | Out-Null
      $request.Content = [System.Net.Http.StringContent]::new($Body, [System.Text.Encoding]::UTF8, 'application/json')
    }
    $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    try {
      $declaredLength = $response.Content.Headers.ContentLength
      if ($null -ne $declaredLength -and $declaredLength -gt 65536) { throw 'Remote response is too large' }
      $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      if ($text.Length -gt 65536) { throw 'Remote response is too large' }
      return [pscustomobject]@{
        statusCode = [int]$response.StatusCode
        body = $text
        wwwAuthenticate = [string]($response.Headers.WwwAuthenticate | Select-Object -First 1)
      }
    } finally {
      $response.Dispose()
    }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Parse-Capabilities([string]$Value) {
  $items = @($Value.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($items.Count -eq 0) { throw 'At least one capability is required' }
  if (@($items | Where-Object { $_ -notmatch '^[a-z][a-z0-9-]{0,63}$' }).Count -ne 0) { throw 'Capabilities contain invalid values' }
  if (@($items | Select-Object -Unique).Count -ne $items.Count) { throw 'Capabilities must not contain duplicates' }
  return $items
}

$selectedCapabilities = Parse-Capabilities $Capabilities
$origin = Resolve-GatewayOrigin
Assert-LoopbackOrigin $origin

$runtimeRaw = Invoke-CommonTools @('team', 'runtime', '--project', $Project, '--capabilities', ($selectedCapabilities -join ','), '--require-gateway') 'Local team runtime is not ready'
$runtime = Read-JsonObject $runtimeRaw 'Local team runtime report is invalid'
if ($runtime.runtime.ok -ne $true) { throw 'Local team runtime is not ready' }

$ready = Invoke-BoundedHttp 'GET' "$origin/readyz"
if ($ready.statusCode -ne 200) { throw 'Local team gateway readiness endpoint is not ready' }
$readyBody = Read-JsonObject $ready.body 'Local team gateway readiness response is invalid'
if ($readyBody.status -ne 'ok') { throw 'Local team gateway readiness endpoint is not ready' }

$metadata = Invoke-BoundedHttp 'GET' "$origin/.well-known/oauth-protected-resource/mcp"
if ($metadata.statusCode -ne 200) { throw 'Local team OAuth resource metadata is unavailable' }
$metadataBody = Read-JsonObject $metadata.body 'Local team OAuth resource metadata is invalid'
if ($metadataBody.resource -ne "$origin/mcp") { throw 'Local team OAuth resource metadata has an invalid resource' }
$scopes = @($metadataBody.scopes_supported)
foreach ($capability in $selectedCapabilities) {
  if ($scopes -notcontains "common-tools:capability:$capability") { throw "Local team OAuth resource metadata is missing capability scope: $capability" }
}

$identityProviderVerified = $false
if ($RequireIdentityProvider) {
  $issuer = Resolve-LocalOidcIssuer
  if (@($metadataBody.authorization_servers) -notcontains $issuer) { throw 'Local team OAuth resource metadata is missing the local OIDC issuer' }
  $openid = Invoke-BoundedHttp 'GET' "$issuer/.well-known/openid-configuration"
  if ($openid.statusCode -ne 200) { throw 'Local team OIDC discovery is unavailable' }
  $openidBody = Read-JsonObject $openid.body 'Local team OIDC discovery response is invalid'
  if ($openidBody.issuer -ne $issuer) { throw 'Local team OIDC discovery issuer does not match metadata' }
  $identityProviderVerified = $true
}

$unauthorized = Invoke-BoundedHttp 'POST' "$origin/mcp" '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
if ($unauthorized.statusCode -ne 401 -or $unauthorized.wwwAuthenticate -notmatch '/\.well-known/oauth-protected-resource/mcp') {
  throw 'Local team MCP endpoint did not return the expected OAuth challenge'
}

[pscustomobject]@{
  project = $Project
  gatewayUrl = $origin
  capabilities = $selectedCapabilities
  runtimeOk = $true
  readyz = 'ok'
  metadataScopesVerified = $selectedCapabilities.Count
  identityProviderVerified = $identityProviderVerified
  unauthorizedChallengeVerified = $true
} | ConvertTo-Json -Compress
