[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',
  [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
  [string]$Project = 'deploy'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$postgresContainer = "$Project-postgres-1"
$repairableMigrations = @('010_retention_recheck.sql', '011_delivery_outbox.sql')

function Invoke-Docker([string[]]$Arguments, [string]$Failure) {
  $output = & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw $Failure }
  return $output
}

function Invoke-PostgresScalar([string]$Sql) {
  $output = Invoke-Docker @('exec', $postgresContainer, 'psql', '-U', 'common_tools', '-d', 'common_tools', '-tA', '-c', $Sql) 'PostgreSQL query failed'
  return ($output | Out-String).Trim()
}

function Assert-LocalPostgresContainer {
  $raw = Invoke-Docker @('inspect', $postgresContainer) 'Local PostgreSQL container is unavailable'
  try { $container = @($raw | Out-String | ConvertFrom-Json -ErrorAction Stop)[0] }
  catch { throw 'Docker container inspection returned invalid JSON' }
  if ($container.Config.Labels.'com.docker.compose.project' -ne $Project) { throw 'Refusing to repair another Compose project' }
  if ($container.Config.Labels.'com.docker.compose.service' -ne 'postgres') { throw 'Refusing to repair a non-PostgreSQL service' }
  if ($container.State.Running -ne $true) { throw 'Local PostgreSQL container is not running' }
  $volumeMounts = @($container.Mounts | Where-Object { $_.Type -eq 'volume' })
  if ($volumeMounts.Count -ne 1) { throw 'Local PostgreSQL container volume layout is unexpected' }
}

function Assert-RepairableSchemaPresent {
  $sql = @"
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'capability_jobs' AND column_name = 'retention_last_swept_at')
  AND to_regclass('public.capability_jobs_retention_recheck_idx') IS NOT NULL
  AND to_regclass('public.capability_job_deliveries') IS NOT NULL
  AND to_regclass('public.capability_job_deliveries_order_idx') IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'maintain_capability_job_delivery')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'capability_job_delivery_intent')
THEN 'ready' ELSE 'missing' END;
"@
  $status = Invoke-PostgresScalar $sql
  if ($status -ne 'ready') { throw 'Local schema does not contain the repairable 010/011 migration objects' }
}

function Get-CurrentMigrationChecksums {
  $checksums = @{}
  foreach ($migration in $repairableMigrations) {
    $file = Join-Path $repositoryRoot "packages/team-runtime/schema/$migration"
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Migration file is unavailable: $migration" }
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -notmatch '^[a-f0-9]{64}$') { throw "Migration checksum is invalid: $migration" }
    $checksums[$migration] = $hash
  }
  return $checksums
}

function Get-AppliedMigrationChecksums {
  $sql = "SELECT filename || '|' || sha256 FROM common_tools_schema_migrations WHERE filename IN ('010_retention_recheck.sql','011_delivery_outbox.sql') ORDER BY filename;"
  $rows = @(Invoke-Docker @('exec', $postgresContainer, 'psql', '-U', 'common_tools', '-d', 'common_tools', '-tA', '-c', $sql) 'PostgreSQL migration ledger query failed')
  $applied = @{}
  foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row)) { continue }
    $parts = $row.Split('|')
    if ($parts.Count -ne 2 -or $parts[0] -notin $repairableMigrations -or $parts[1] -notmatch '^[a-f0-9]{64}$') {
      throw 'PostgreSQL migration ledger returned invalid rows'
    }
    $applied[$parts[0]] = $parts[1]
  }
  return $applied
}

function Update-MigrationLedger([hashtable]$Current, [hashtable]$Applied) {
  foreach ($migration in $repairableMigrations) {
    if (-not $Applied.ContainsKey($migration)) { throw "Migration has not been applied yet: $migration" }
    if ($Applied[$migration] -eq $Current[$migration]) { continue }
    $sql = "UPDATE common_tools_schema_migrations SET sha256 = '$($Current[$migration])' WHERE filename = '$migration';"
    Invoke-Docker @('exec', $postgresContainer, 'psql', '-U', 'common_tools', '-d', 'common_tools', '-v', 'ON_ERROR_STOP=1', '-c', $sql) 'PostgreSQL migration ledger update failed' | Out-Null
  }
}

Assert-LocalPostgresContainer
Assert-RepairableSchemaPresent
$current = Get-CurrentMigrationChecksums
$applied = Get-AppliedMigrationChecksums
$drifted = @($repairableMigrations | Where-Object { $applied.ContainsKey($_) -and $applied[$_] -ne $current[$_] })

if ($Mode -eq 'Plan') {
  [pscustomobject]@{
    mode = 'plan'
    project = $Project
    repairableMigrations = $repairableMigrations
    driftedMigrations = $drifted
    action = if ($drifted.Count -eq 0) { 'No ledger repair is needed.' } else { 'Run with -Mode Apply to update the local migration ledger checksums.' }
  } | ConvertTo-Json -Compress
  return
}

Update-MigrationLedger $current $applied
[pscustomobject]@{
  mode = 'apply'
  project = $Project
  repairedMigrations = $drifted
  status = 'local migration ledger repaired'
} | ConvertTo-Json -Compress
