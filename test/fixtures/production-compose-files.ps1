param([Parameter(Mandatory = $true)][string]$RepositoryRoot)
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $RepositoryRoot 'scripts/team-runtime-production-deploy.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Deployment script parse failed' }
$definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Resolve-PreflightComposeFiles' }, $true)
if ($null -eq $definition) { throw 'Compose resolver is missing' }
# Evaluate only the resolver; never execute deployment, Docker or identity operations.
. ([scriptblock]::Create($definition.Extent.Text))
$reports = [Console]::In.ReadToEnd() | ConvertFrom-Json
$results = @()
foreach ($report in $reports) {
  try {
    $resolved = @(Resolve-PreflightComposeFiles -ReportedFiles @($report.composeFiles) -CredentialSource $report.credentialSource)
    $results += [pscustomobject]@{ accepted = $true; count = $resolved.Count; unique = @($resolved | Select-Object -Unique).Count }
  } catch {
    $results += [pscustomobject]@{ accepted = $false; count = 0; unique = 0 }
  }
}
ConvertTo-Json -InputObject @($results) -Compress
