[CmdletBinding()]
param(
  [string]$Out = '',
  [switch]$Force,
  [switch]$UseCredentialFiles,
  [switch]$IncludeOptionalImages,
  [switch]$IncludeReleaseSignature,
  [switch]$IncludeSiyuan,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$defaultOut = Join-Path (Split-Path -Parent $repositoryRoot) 'common-tools.production.env'

function Write-Usage {
  Write-Host 'Prepare a production env file for Common Tools without printing secret values.'
  Write-Host ''
  Write-Host 'Examples:'
  Write-Host '  .\scripts\prepare-production-env.ps1'
  Write-Host '  .\scripts\prepare-production-env.ps1 -Out E:\DEV\WorkSpace\Efficiency\common-tools.production.env -Force'
  Write-Host '  .\scripts\prepare-production-env.ps1 -UseCredentialFiles -IncludeReleaseSignature'
  Write-Host ''
  Write-Host 'Next validation command:'
  Write-Host '  npm run common-tools:production-acceptance-plan -- --production-env-file <absolute.env>'
}

if ($Help) {
  Write-Usage
  exit 0
}

function Resolve-OutputPath([string]$Path) {
  $candidate = if ([string]::IsNullOrWhiteSpace($Path)) { $defaultOut } else { $Path }
  if ($candidate.IndexOf([char]0) -ge 0) { throw 'Output path is invalid' }
  if (-not [System.IO.Path]::IsPathRooted($candidate)) { throw 'Output path must be absolute' }
  $fullPath = [System.IO.Path]::GetFullPath($candidate)
  $repoPrefix = $repositoryRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ($fullPath.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output path must be outside the repository root to avoid committing production secrets'
  }
  if ([System.IO.Directory]::Exists($fullPath)) { throw 'Output path must be a file' }
  return $fullPath
}

function Assert-EnvironmentName([string]$Name) {
  if ($Name -cnotmatch '^COMMON_TOOLS_[A-Z0-9_]{1,120}$') {
    throw "Unsupported production environment variable name: $Name"
  }
}

function Assert-EnvironmentValue([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "$Name is required" }
  if ($Value.IndexOf([char]0) -ge 0 -or $Value.Contains("`r") -or $Value.Contains("`n")) {
    throw "$Name contains an invalid value"
  }
  if ($Value -ne $Value.Trim()) { throw "$Name must not start or end with whitespace" }
}

function Read-RequiredValue([string]$Name, [string]$Prompt, [string]$Default = '') {
  Assert-EnvironmentName $Name
  $displayPrompt = if ([string]::IsNullOrWhiteSpace($Default)) { $Prompt } else { "$Prompt [$Default]" }
  $value = Read-Host -Prompt $displayPrompt
  if ([string]::IsNullOrWhiteSpace($value) -and -not [string]::IsNullOrWhiteSpace($Default)) {
    $value = $Default
  }
  Assert-EnvironmentValue $Name $value
  return @{ Name = $Name; Value = $value }
}

function Read-RequiredSecret([string]$Name, [string]$Prompt) {
  Assert-EnvironmentName $Name
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  Assert-EnvironmentValue $Name $value
  return @{ Name = $Name; Value = $value }
}

function Add-Entry([System.Collections.Generic.List[object]]$Entries, [hashtable]$Entry) {
  Assert-EnvironmentName $Entry.Name
  Assert-EnvironmentValue $Entry.Name $Entry.Value
  if ($Entries | Where-Object { $_.Name -ceq $Entry.Name }) {
    throw "Duplicate production environment variable name: $($Entry.Name)"
  }
  $Entries.Add([pscustomobject]$Entry)
}

function Add-CredentialEntries([System.Collections.Generic.List[object]]$Entries) {
  if ($UseCredentialFiles) {
    Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_DATABASE_USER_FILE' 'Database username file')
    Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_DATABASE_PASSWORD_FILE' 'Database password file')
    Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_REDIS_USERNAME_FILE' 'Redis username file')
    Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_REDIS_PASSWORD_FILE' 'Redis password file')
    Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID_FILE' 'Object store access key id file')
    Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY_FILE' 'Object store secret access key file')
    return
  }
  Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_DATABASE_USER' 'Database username')
  Add-Entry $Entries (Read-RequiredSecret 'COMMON_TOOLS_DATABASE_PASSWORD' 'Database password')
  Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_REDIS_USERNAME' 'Redis username')
  Add-Entry $Entries (Read-RequiredSecret 'COMMON_TOOLS_REDIS_PASSWORD' 'Redis password')
  Add-Entry $Entries (Read-RequiredValue 'COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID' 'Object store access key id')
  Add-Entry $Entries (Read-RequiredSecret 'COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY' 'Object store secret access key')
}

function Test-ImageWorkerCapabilityEnabled([string]$Capabilities) {
  $enabled = @($Capabilities.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  return ($enabled -contains 'image-to-editable') -or ($enabled -contains 'ppt-create')
}

$outputPath = Resolve-OutputPath $Out
$outputDirectory = Split-Path -Parent $outputPath
if (-not [System.IO.Directory]::Exists($outputDirectory)) {
  [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}
$existingOutputItem = if (Test-Path -LiteralPath $outputPath) { Get-Item -LiteralPath $outputPath -Force } else { $null }
if ($existingOutputItem -and (($existingOutputItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
  throw 'Output file must not be a symbolic link'
}
if ($existingOutputItem -and $existingOutputItem.PSIsContainer) {
  throw 'Output path must be a file'
}
if ($existingOutputItem -and $existingOutputItem.Length -gt 0 -and -not $Force) {
  throw 'Output file already exists and is not empty; pass -Force to replace it'
}

$entries = [System.Collections.Generic.List[object]]::new()
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_DATABASE_URL' 'Database URL')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_REDIS_URL' 'Redis URL')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_OBJECT_STORE_ENDPOINT' 'Object store endpoint')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_OBJECT_STORE_BUCKET' 'Object store bucket')
Add-CredentialEntries $entries
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_REMOTE_PUBLIC_URL' 'Remote MCP public URL')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS' 'Allowed browser origins')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_OIDC_ISSUER' 'OIDC issuer')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_OIDC_JWKS_URL' 'OIDC JWKS URL')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_OIDC_AUDIENCE' 'OIDC audience')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_REMOTE_IMAGE' 'Remote MCP runtime image')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_RELEASE_EVIDENCE_FILE' 'Release evidence file')
Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_RELEASE_REVISION' 'Release revision')
$capabilitiesEntry = Read-RequiredValue 'COMMON_TOOLS_TEAM_CAPABILITIES' 'Enabled capabilities' 'image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit'
Add-Entry $entries $capabilitiesEntry

if ($IncludeOptionalImages -or (Test-ImageWorkerCapabilityEnabled $capabilitiesEntry.Value)) {
  Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_IMAGE_WORKER_IMAGE' 'Image worker runtime image')
}

if ($IncludeReleaseSignature) {
  Add-Entry $entries @{ Name = 'COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE'; Value = 'true' }
  Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_RELEASE_SIGNATURE_FILE' 'Release signature file')
  Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE' 'Cosign public key file')
}

if ($IncludeSiyuan) {
  Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_SIYUAN_URL' 'SiYuan URL' 'http://host.docker.internal:6806')
  if ($UseCredentialFiles) {
    Add-Entry $entries (Read-RequiredValue 'COMMON_TOOLS_SIYUAN_TOKEN_FILE' 'SiYuan token file')
  } else {
    Add-Entry $entries (Read-RequiredSecret 'COMMON_TOOLS_SIYUAN_TOKEN' 'SiYuan API token')
  }
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# Generated by scripts/prepare-production-env.ps1')
$lines.Add('# Keep this file outside the repository. Do not paste these values into chat or commit history.')
foreach ($entry in $entries) {
  $lines.Add("$($entry.Name)=$($entry.Value)")
}
$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($outputPath, $content, $utf8NoBom)

Write-Host "Wrote production env file: $outputPath"
Write-Host ''
Write-Host 'Next validation command:'
Write-Host "  npm run common-tools:production-acceptance-plan -- --production-env-file `"$outputPath`""
