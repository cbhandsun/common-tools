[CmdletBinding()]
param(
    [switch]$Execute,
    [ValidateRange(1, 8)]
    [int]$ThrottleLimit = 4
)

$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runsRoot = (Resolve-Path -LiteralPath (Join-Path $workspace 'runs')).Path
$pptRoot = (Resolve-Path -LiteralPath (Join-Path $workspace 'ppt文档')).Path
$keepRuns = @('current-all-graphics-ir-v2', 'plugin-component-inventory')
$keepPptDirectories = @('可编辑版本', '最终可编辑版本_已验证_20260724')

$targets = [System.Collections.Generic.List[string]]::new()
foreach ($directory in [System.IO.Directory]::EnumerateDirectories($runsRoot)) {
    if ([System.IO.Path]::GetFileName($directory) -notin $keepRuns) {
        $targets.Add($directory)
    }
}
foreach ($directory in [System.IO.Directory]::EnumerateDirectories($pptRoot)) {
    if ([System.IO.Path]::GetFileName($directory) -notin $keepPptDirectories) {
        $targets.Add($directory)
    }
}

# Refuse targets outside the two audited output roots before deletion begins.
foreach ($target in $targets) {
    $fullPath = [System.IO.Path]::GetFullPath($target)
    $insideRuns = $fullPath.StartsWith("$runsRoot$([System.IO.Path]::DirectorySeparatorChar)", [System.StringComparison]::OrdinalIgnoreCase)
    $insidePpt = $fullPath.StartsWith("$pptRoot$([System.IO.Path]::DirectorySeparatorChar)", [System.StringComparison]::OrdinalIgnoreCase)
    if (-not ($insideRuns -or $insidePpt)) {
        throw "Unsafe cleanup target: $fullPath"
    }
}

Write-Host "Audited cleanup targets: $($targets.Count) directories"
Write-Host "Preserved runs: $($keepRuns -join ', ')"
Write-Host "Preserved PPT directories: $($keepPptDirectories -join ', ')"

if (-not $Execute) {
    $targets | ForEach-Object { Write-Host $_ }
    Write-Host "Preview only. Run with -Execute to delete these directories."
    return
}

$freeBefore = (Get-PSDrive -Name E).Free
$completed = 0
$failed = [System.Collections.Generic.List[string]]::new()

$targets | ForEach-Object -Parallel {
    try {
        [System.IO.Directory]::Delete($_, $true)
        [pscustomobject]@{ Path = $_; Error = $null }
    }
    catch {
        [pscustomobject]@{ Path = $_; Error = $_.Exception.Message }
    }
} -ThrottleLimit $ThrottleLimit | ForEach-Object {
    $completed++
    $percent = [math]::Round(($completed / $targets.Count) * 100, 1)
    Write-Progress -Activity 'Deleting historical PPT artifacts' -Status "$completed / $($targets.Count)" -PercentComplete $percent
    if ($_.Error) {
        $failed.Add("$($_.Path): $($_.Error)")
        Write-Warning "Failed: $($_.Path)"
    }
    else {
        Write-Host "[$completed/$($targets.Count)] Deleted $($_.Path)"
    }
}

$freeAfter = (Get-PSDrive -Name E).Free
$reclaimedGiB = [math]::Round(($freeAfter - $freeBefore) / 1GB, 2)
Write-Host "Cleanup complete. Reclaimed: $reclaimedGiB GiB"

if ($failed.Count -gt 0) {
    Write-Warning "$($failed.Count) directories could not be deleted. Close PowerPoint/Explorer handles and rerun the script."
    $failed | ForEach-Object { Write-Warning $_ }
    exit 1
}
