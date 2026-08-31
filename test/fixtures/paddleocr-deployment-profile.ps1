param([Parameter(Mandatory = $true)][string]$DeploymentScript)
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($DeploymentScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Deployment script parse failed' }
$definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Resolve-PaddleRawImageOcrProfile' }, $true)
if ($null -eq $definition) { throw 'PaddleOCR profile function is missing' }
# Load just the function, never the deployment script's entrypoint.
. ([scriptblock]::Create($definition.Extent.Text))
$resolvedRawImageOcrImage = 'fixture-image'
$script:probeStatus = 0
$script:profileLines = @('a', 'b', 'c', 'd', 'e', 'f') | ForEach-Object { $_ * 64 }
$script:profileLines += @('3.3.1', '3.7.0')
function docker {
  if ($args[0] -eq 'image') { $global:LASTEXITCODE = 0; return ('sha256:' + ('1' * 64)) }
  if ($args[0] -ne 'run') { throw 'Unexpected Docker operation' }
  $probe = $args[-1]
  if (-not $probe.Contains('/opt/paddleocr/healthcheck.png /opt/paddleocr/paddleocr_protocol.py')) { throw 'Protocol digest must follow healthcheck digest' }
  $global:LASTEXITCODE = $script:probeStatus
  return $script:profileLines
}
$profile = Resolve-PaddleRawImageOcrProfile
if ($profile.paddlepaddleVersion -ne '3.3.1' -or $profile.paddleocrVersion -ne '3.7.0') { throw 'Version positions changed' }
$expected = @{ PYTHON = 'a'; ADAPTER = 'b'; WORKER = 'c'; IMAGE_NORMALIZER = 'd'; HEALTHCHECK = 'e'; PROTOCOL = 'f' }
foreach ($entry in $expected.GetEnumerator()) {
  $value = [Environment]::GetEnvironmentVariable("COMMON_TOOLS_IMAGE_PADDLEOCR_$($entry.Key)_SHA256", 'Process')
  if ($value -ne ($entry.Value * 64)) { throw 'Digest positions changed' }
}
$validLines = $script:profileLines.Clone()
foreach ($scenario in @('empty', 'missing-protocol', 'bad-hash', 'bad-version', 'extra-line', 'failed-probe')) {
  $script:profileLines = $validLines.Clone()
  $script:probeStatus = 0
  switch ($scenario) {
    'empty' { $script:profileLines = @() }
    'missing-protocol' { $script:profileLines = @($validLines[0..4]) + @($validLines[6..7]) }
    'bad-hash' { $script:profileLines[5] = 'invalid' }
    'bad-version' { $script:profileLines[6] = 'latest' }
    'extra-line' { $script:profileLines += 'unexpected' }
    'failed-probe' { $script:probeStatus = 1 }
  }
  $rejected = $false
  try { Resolve-PaddleRawImageOcrProfile | Out-Null }
  catch {
    if ($_.Exception.Message -notin @('PaddleOCR image profile is invalid', 'Raw image OCR image verification failed')) { throw }
    $rejected = $true
  }
  if (-not $rejected) { throw 'Invalid deployment profile was accepted' }
}
Write-Output 'profile-boundaries-passed'
