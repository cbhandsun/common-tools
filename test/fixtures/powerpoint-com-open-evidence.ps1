param(
  [string]$GeneratedScript, [string]$ManifestFile, [string]$ReportFile,
  [string]$EvidenceFile, [string]$InvocationId, [string]$Scenario, [string]$LifetimeFile
)
$ErrorActionPreference = 'Stop'
$script:fakeScenario = $Scenario
$script:fakeOpenCount = 0
$script:fakeCollectionReads = 0
$script:fakeSlideReads = 0
$script:fakeLifetimeFile = $LifetimeFile
$script:fakeEvents = @()
function Record-FakeLifetime([string]$Action, [string]$Kind) {
  $script:fakeEvents += [pscustomobject]@{ action = $Action; kind = $Kind }
  $script:fakeEvents | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $script:fakeLifetimeFile -Encoding UTF8
}
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
    $app = [pscustomobject]@{ DisplayAlerts = 1; FakeKind = 'app' }
    $app | Add-Member ScriptProperty Presentations {
      $script:fakeCollectionReads++
      if ($script:fakeScenario -eq 'null-collections' -and $script:fakeCollectionReads -eq 1) { return $null }
      Record-FakeLifetime 'acquire' 'presentations'
      $presentations = [pscustomobject]@{ FakeKind = 'presentations' }
      $presentations | Add-Member ScriptMethod Open {
        param($file, $readOnly, $untitled, $window)
        $script:fakeOpenCount++
        if ($script:fakeScenario -eq 'open-failure' -or ($script:fakeScenario -eq 'retry' -and $script:fakeOpenCount -eq 1)) { throw 'PRIVATE_VALUE' }
        Record-FakeLifetime 'acquire' 'presentation'
        $presentation = [pscustomobject]@{ Saved = -1; FakeKind = 'presentation' }
        $presentation | Add-Member ScriptProperty Slides {
          $script:fakeSlideReads++
          if ($script:fakeScenario -eq 'null-collections' -and $script:fakeSlideReads -eq 1) { return $null }
          Record-FakeLifetime 'acquire' 'slides'
          $slides = [pscustomobject]@{ FakeKind = 'slides' }
          $slides | Add-Member ScriptProperty Count {
            if ($script:fakeScenario -eq 'slide-failure' -or ($script:fakeScenario -eq 'slide-retry' -and $script:fakeSlideReads -eq 1)) { throw 'PRIVATE_VALUE' }
            return 1
          }
          return $slides
        }
        $presentation | Add-Member ScriptMethod Close { }
        $presentation | Add-Member ScriptMethod SaveCopyAs { param($destination, $format) [IO.File]::WriteAllText($destination, 'fake') }
        return $presentation
      }
      return $presentations
    }
    $app | Add-Member ScriptMethod Quit { Record-FakeLifetime 'quit' 'app' }
    Record-FakeLifetime 'acquire' 'app'
    return $app
  }
  throw 'Unexpected object creation in controlled COM fixture'
}
function Release-FakeComObject {
  param($value)
  Record-FakeLifetime 'release' $value.FakeKind
  if (($script:fakeScenario -eq 'open-release-failure' -and $value.FakeKind -eq 'presentations') -or
      ($script:fakeScenario -eq 'slide-release-failure' -and $value.FakeKind -eq 'slides')) { throw 'PRIVATE_VALUE' }
}
# Keep the production script intact except COM release, which rejects fake objects.
# The exact replacement count prevents a silent failure to exercise the script.
$source = [IO.File]::ReadAllText($GeneratedScript)
$pattern = '\[void\]\[Runtime.InteropServices.Marshal\]::ReleaseComObject\((\$[a-zA-Z]+)\)'
if ([regex]::Matches($source, $pattern).Count -ne 6) { throw 'Unexpected COM release sites' }
$source = [regex]::Replace($source, $pattern, 'Release-FakeComObject $1')
& ([scriptblock]::Create($source)) -ManifestFile $ManifestFile -ReportFile $ReportFile -EvidenceFile $EvidenceFile -InvocationId $InvocationId
