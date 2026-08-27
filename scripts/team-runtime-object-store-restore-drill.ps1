[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [AllowEmptyString()]
  [ValidatePattern('^$|^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')]
  [string]$SourceContainer = '',
  [ValidateRange(5, 60)]
  [int]$DockerEngineTimeoutSeconds = 20,
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-tools-docker-engine.ps1')

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker command failed during object-store restore drill' }
}

Assert-DockerEngineAvailable -TimeoutSeconds $DockerEngineTimeoutSeconds
$apiContainers = @(& docker ps --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.service=remote-mcp' --format '{{.Names}}' 2>$null | Where-Object { $_ -is [string] -and $_.Trim() } | ForEach-Object { $_.Trim() })
if ($apiContainers.Count -lt 1) { throw 'No running remote MCP API container exists for this Compose project' }
if ([string]::IsNullOrWhiteSpace($SourceContainer)) { $SourceContainer = @($apiContainers | Sort-Object)[0] }
if ($apiContainers -notcontains $SourceContainer) { throw 'Source container is not a running remote MCP API container for this Compose project' }
$running = [string](& docker inspect --type container --format '{{.State.Running}}' $SourceContainer 2>$null)
if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne 'true') { throw 'Source remote MCP API container is not running' }

if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    sourceContainer = $SourceContainer
    changed = $false
    applyRequires = 'explicit -Confirm'
    drill = 'Runs the fixed isolated bucket restore drill inside a running project API container; it does not print or inspect configuration values or secrets.'
  } | ConvertTo-Json -Compress
  exit 0
}

if (-not $Confirm) { throw 'Apply requires -Confirm' }
Invoke-Docker @('exec', $SourceContainer, 'node', 'packages/remote-mcp-server/bin/common-tools-team-object-store-restore-drill.js')
