param([Parameter(Mandatory=$true)][string]$GeneratedScript)
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($GeneratedScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Generated PowerPoint script did not parse.' }
$functions = @('Find-Target', 'Get-ShapeById', 'Apply-Edit', 'Verify-Edit', 'Release-Com', 'Set-SmartArtMarker', 'Test-SmartArtMarker')
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  if ($functions -contains $definition.Name) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
$msoTrue = -1
$marker = ' [slideclone-edit-check]'
Add-Type @'
using System;
using System.Collections;
public class RoundTripCollection : IEnumerable {
  private object[] entries;
  public RoundTripCollection(object[] value) { entries = value; }
  public int Count { get { return entries.Length; } }
  public object Item(int index) {
    if (index < 1 || index > Count) throw new ArgumentOutOfRangeException("index");
    return entries[index - 1];
  }
  public IEnumerator GetEnumerator() { return entries.GetEnumerator(); }
}
'@
function New-Collection([object[]]$Entries) { return ,([RoundTripCollection]::new($Entries)) }
function Require($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Require-Failure([scriptblock]$Action) {
  $failed = $false
  try { & $Action | Out-Null } catch { $failed = $true }
  Require $failed 'Invalid target unexpectedly succeeded.'
}
$checks = 0
foreach ($mode in @('geometry', 'shape-text', 'smartart-text', 'auto')) {
  $text = [pscustomobject]@{ TextRange = [pscustomobject]@{ Text = 'fixture' }; HasText = -1 }
  $nodeShape = [pscustomobject]@{ TextFrame2 = $text }
  $node = [pscustomobject]@{ Shapes = (New-Collection @($nodeShape)) }
  $shape = [pscustomobject]@{ Id = 17; Left = [single]10; HasSmartArt = -1; HasTextFrame = -1; TextFrame2 = $text; SmartArt = [pscustomobject]@{ AllNodes = (New-Collection @($node)) } }
  $emptySlide = [pscustomobject]@{ SlideIndex = 0; Shapes = (New-Collection @()) }
  $slide = [pscustomobject]@{ SlideIndex = 0; Shapes = (New-Collection @($shape)) }
  $deck = [pscustomobject]@{ Slides = (New-Collection @($emptySlide, $slide)) }
  $target = Find-Target $deck $mode
  Require ($target.Slide -eq 2) 'Target must use the one-based collection index, even when SlideIndex is zero.'
  Require ($target.Shape -eq 17) 'Shape identity changed.'
  Apply-Edit $deck $target
  Require (Verify-Edit $deck $target) 'Edit did not survive target resolution.'
  $checks++
}
foreach ($badSlide in @($null, 0, -1, 3, 1.5, '2', [int]::MaxValue)) {
  Require-Failure { Get-ShapeById $deck ([pscustomobject]@{ Slide=$badSlide; Shape=17; Kind='geometry' }) }
  $checks++
}
foreach ($badShape in @($null, 0, -1, 18, '17', [int]::MaxValue)) {
  Require-Failure { Get-ShapeById $deck ([pscustomobject]@{ Slide=2; Shape=$badShape; Kind='geometry' }) }
  $checks++
}
Require-Failure { Find-Target ([pscustomobject]@{ Slides=(New-Collection @()) }) 'auto' }
Require-Failure { Find-Target $deck 'unsupported' }
Require-Failure { Find-Target $null 'auto' }
$checks += 3
$shape.Id = 0
Require-Failure { Find-Target $deck 'geometry' }
$checks++
$shape.Id = 17
foreach ($badCount in @(-1, 100001)) {
  Require-Failure { Find-Target ([pscustomobject]@{ Slides=[pscustomobject]@{ Count=$badCount } }) 'geometry' }
  $badSlide = [pscustomobject]@{ Shapes=[pscustomobject]@{ Count=$badCount } }
  Require-Failure { Find-Target ([pscustomobject]@{ Slides=(New-Collection @($badSlide)) }) 'geometry' }
  $checks += 2
}
function New-LargeCollection($Value) {
  $collection = [pscustomobject]@{ Count=100000; Value=$Value }
  $collection | Add-Member ScriptMethod Item { param($Index) return ,$this.Value }
  return ,$collection
}
$largeDeck = [pscustomobject]@{ Slides=(New-LargeCollection $slide) }
Require ((Find-Target $largeDeck 'geometry').Slide -eq 1) 'Maximum slide count should accept a valid first target.'
$largeSlide = [pscustomobject]@{ Shapes=(New-LargeCollection $shape) }
Require ((Find-Target ([pscustomobject]@{ Slides=(New-Collection @($largeSlide)) }) 'geometry').Shape -eq 17) 'Maximum shape count should accept a valid first target.'
$brokenSlides = [pscustomobject]@{ Count=1 }
$brokenSlides | Add-Member ScriptMethod Item { throw 'controlled collection failure' }
Require-Failure { Find-Target ([pscustomobject]@{ Slides=$brokenSlides }) 'geometry' }
Require-Failure { Find-Target ([pscustomobject]@{ Slides=(New-Collection @([pscustomobject]@{ Shapes=$null })) }) 'geometry' }
Require-Failure { Get-ShapeById $deck $null }
$checks += 5
# A COM-backed layout can update between target selection and mutation. Apply
# the recorded edit intent, not a second offset computed from a new position.
$shape.Left = [single]10
$target = Find-Target $deck 'geometry'
$shape.Left = [single]20
Apply-Edit $deck $target
Require ($shape.Left -eq $target.ExpectedLeft) 'Geometry mutation diverged from the recorded expected position.'
Require (Verify-Edit $deck $target) 'Recorded geometry edit did not survive target resolution.'
$shape.Left = [single]10
Require (-not (Verify-Edit $deck $target)) 'A lost geometry edit must still fail verification.'
$checks += 3
[pscustomobject]@{ passed=$true; checks=$checks } | ConvertTo-Json -Compress
