param(
  [string]$GeneratedScript, [string]$ManifestFile, [string]$ReportFile,
  [string]$EvidenceFile, [string]$InvocationId, [string]$Scenario
)
$ErrorActionPreference = 'Stop'
$script:fakeScenario = $Scenario
$script:fakeOpenCount = 0
function Start-Sleep { param([int]$Milliseconds) }
function New-Object {
  param([string]$TypeName, [object[]]$ArgumentList, [string]$ComObject)
  if ($TypeName -eq 'System.Threading.Mutex') {
    $mutex = [pscustomobject]@{}
    $mutex | Add-Member ScriptMethod WaitOne { param($timeout) return $script:fakeScenario -ne 'lock-failure' }
    $mutex | Add-Member ScriptMethod ReleaseMutex { }
    $mutex | Add-Member ScriptMethod Dispose { }
    return $mutex
  }
  if ($ComObject -eq 'PowerPoint.Application') {
    $presentations = [pscustomobject]@{}
    $presentations | Add-Member ScriptMethod Open {
      param($file, $readOnly, $untitled, $window)
      $script:fakeOpenCount++
      if ($script:fakeScenario -eq 'retry' -and $script:fakeOpenCount -eq 1) { throw 'PRIVATE_VALUE' }
      $presentation = [pscustomobject]@{ Saved = -1; Slides = [pscustomobject]@{ Count = 1 } }
      $presentation | Add-Member ScriptMethod Close { }
      $presentation | Add-Member ScriptMethod SaveCopyAs { param($destination, $format) [IO.File]::WriteAllText($destination, 'fake') }
      return $presentation
    }
    $app = [pscustomobject]@{ Presentations = $presentations; DisplayAlerts = 1 }
    $app | Add-Member ScriptMethod Quit { }
    return $app
  }
  throw 'Unexpected object creation in controlled COM fixture'
}
function Release-FakeComObject { param($value) }
# Keep the production script intact except COM release, which rejects fake objects.
# The exact replacement count prevents a silent failure to exercise the script.
$source = [IO.File]::ReadAllText($GeneratedScript)
$pattern = '\[void\]\[Runtime.InteropServices.Marshal\]::ReleaseComObject\((\$[a-zA-Z]+)\)'
if ([regex]::Matches($source, $pattern).Count -ne 4) { throw 'Unexpected COM release sites' }
$source = [regex]::Replace($source, $pattern, 'Release-FakeComObject $1')
& ([scriptblock]::Create($source)) -ManifestFile $ManifestFile -ReportFile $ReportFile -EvidenceFile $EvidenceFile -InvocationId $InvocationId
