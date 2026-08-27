[CmdletBinding()]
param(
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy',
  [AllowEmptyString()]
  [ValidatePattern('^$|^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')]
  [string]$SourceContainer = '',
  [ValidateRange(10, 180)]
  [int]$StartupTimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$drillId = [Guid]::NewGuid().ToString('N')
$SourceContainer = if ([string]::IsNullOrWhiteSpace($SourceContainer)) { "$Project-postgres-1" } else { $SourceContainer }
$targetContainer = "common-tools-postgres-restore-drill-$drillId"
$sourceDump = "common-tools-restore-drill-$drillId.dump"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "common-tools-postgres-restore-drill-$drillId"
$temporaryDump = Join-Path $temporaryRoot $sourceDump
$temporaryEnvironment = Join-Path $temporaryRoot 'target-postgres.env'
$summaryScriptFile = Join-Path $temporaryRoot 'read-summary.sh'
$dumpScriptFile = Join-Path $temporaryRoot 'dump-source.sh'
$restoreScriptFile = Join-Path $temporaryRoot 'restore-target.sh'
$summaryScriptPath = "/tmp/common-tools-restore-summary-$drillId.sh"
$dumpScriptPath = "/tmp/common-tools-restore-dump-$drillId.sh"
$restoreScriptPath = "/tmp/common-tools-restore-apply-$drillId.sh"
$randomBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($randomBytes)
$targetPassword = [Convert]::ToBase64String($randomBytes)

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($Arguments[0])" }
}

function Test-DockerContainerExists([string]$Container) {
  $command = Get-Command -Name 'docker.exe' -CommandType Application -ErrorAction SilentlyContinue
  if ($null -eq $command) { $command = Get-Command -Name 'docker' -CommandType Application -ErrorAction Stop }
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $command.Source
  $startInfo.Arguments = "inspect --type container --format {{.Id}} $Container"
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { return $false }
    $null = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return $process.ExitCode -eq 0
  } finally {
    $process.Dispose()
  }
}

function Read-PostgresRestoreSummary([string]$Container) {
  $query = "SELECT (SELECT count(*) FROM capability_jobs)::text || ':' || COALESCE((SELECT string_agg(filename || ':' || sha256, ',' ORDER BY filename) FROM common_tools_schema_migrations), '');"
  $encodedQuery = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($query))
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $rawSummary = & docker exec $Container sh $summaryScriptPath $encodedQuery 2>$null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  $summary = if ($null -eq $rawSummary) { '' } else { ([string]$rawSummary).Trim() }
  if ($exitCode -ne 0 -or $summary -notmatch '^[0-9]+:(?:[0-9]{3}_[a-z0-9_]+\.sql:[a-f0-9]{64})(?:,[0-9]{3}_[a-z0-9_]+\.sql:[a-f0-9]{64})*$') { throw 'PostgreSQL restore summary is invalid' }
  return $summary
}

function Write-PostgresDrillScripts {
  [System.IO.File]::WriteAllText($summaryScriptFile, @'
#!/bin/sh
printf '%s' "$1" | base64 -d | PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA
'@)
  [System.IO.File]::WriteAllText($dumpScriptFile, @'
#!/bin/sh
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file "$1"
'@)
  [System.IO.File]::WriteAllText($restoreScriptFile, @'
#!/bin/sh
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$1"
'@)
}

function Install-PostgresDrillScript([string]$Container, [string]$LocalPath, [string]$ContainerPath) {
  Invoke-Docker @('cp', $LocalPath, "${Container}:$ContainerPath")
  Invoke-Docker @('exec', $Container, 'chmod', '700', $ContainerPath)
}

try {
  $sourceNames = @(& docker ps --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.service=postgres' --format '{{.Names}}' 2>$null | Where-Object { $_ -is [string] -and $_.Trim() })
  $sourceName = if ($sourceNames.Count -eq 1) { ([string]$sourceNames[0]).Trim() } else { '' }
  $sourceRunning = [string](& docker inspect --type container --format '{{.State.Running}}' $SourceContainer 2>$null)
  if ($LASTEXITCODE -ne 0 -or $sourceNames.Count -ne 1 -or $sourceName -ne $SourceContainer -or $sourceRunning.Trim() -ne 'true') { throw 'Source PostgreSQL container is not the running PostgreSQL service for this Compose project' }
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  [System.IO.File]::WriteAllText($temporaryEnvironment, "POSTGRES_PASSWORD=$targetPassword`n")
  Write-PostgresDrillScripts
  Install-PostgresDrillScript $SourceContainer $summaryScriptFile $summaryScriptPath
  Install-PostgresDrillScript $SourceContainer $dumpScriptFile $dumpScriptPath
  $sourceSummary = Read-PostgresRestoreSummary $SourceContainer

  Invoke-Docker @('exec', $SourceContainer, 'sh', $dumpScriptPath, "/tmp/$sourceDump")
  Invoke-Docker @('cp', "${SourceContainer}:/tmp/$sourceDump", $temporaryDump)
  Invoke-Docker @('exec', $SourceContainer, 'rm', '-f', "/tmp/$sourceDump")

  $null = Invoke-Docker @('run', '--detach', '--rm', '--name', $targetContainer, '--network', 'none', '--env-file', $temporaryEnvironment, '--env', 'POSTGRES_USER=common_tools', '--env', 'POSTGRES_DB=common_tools', 'postgres:16.10-alpine')
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  do {
    $ready = (& docker exec $targetContainer pg_isready -h 127.0.0.1 -U common_tools -d common_tools 2>$null)
    if ($LASTEXITCODE -eq 0 -and $ready -match 'accepting connections') { break }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0 -or $ready -notmatch 'accepting connections') { throw 'Isolated PostgreSQL restore target did not become ready' }

  Install-PostgresDrillScript $targetContainer $summaryScriptFile $summaryScriptPath
  Install-PostgresDrillScript $targetContainer $restoreScriptFile $restoreScriptPath
  Invoke-Docker @('cp', $temporaryDump, "${targetContainer}:/tmp/$sourceDump")
  Invoke-Docker @('exec', $targetContainer, 'sh', $restoreScriptPath, "/tmp/$sourceDump")
  $targetSummary = Read-PostgresRestoreSummary $targetContainer
  if ($targetSummary -ne $sourceSummary) { throw 'Restored PostgreSQL schema or Job count verification failed' }
  Write-Output 'team-runtime PostgreSQL restore drill passed'
} finally {
  & docker exec $SourceContainer rm -f "/tmp/$sourceDump" $summaryScriptPath $dumpScriptPath *> $null
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
  if (Test-DockerContainerExists $targetContainer) { & docker rm --force $targetContainer *> $null }
}
