param([Parameter(Mandatory=$true)][string]$GeneratedScript)
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($GeneratedScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Generated PowerPoint script did not parse.' }
$functions = @('Find-RoundTripShape', 'Find-Target', 'Find-TargetWithRetry', 'Get-ShapeById', 'Apply-Edit', 'Apply-EditWithRetry', 'Test-RetryableEditFailure', 'Verify-Edit', 'Verify-EditWithRetry', 'Release-Com', 'Set-SmartArtMarker', 'Test-SmartArtMarker', 'Get-ErrorCode', 'Test-TransientComFailure', 'Close-DeckWithRetry', 'Find-ConnectorChild', 'Find-ConnectorTarget', 'Apply-ConnectorEdit', 'Verify-ConnectorEdit', 'Read-ConnectorDash')
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  if ($functions -contains $definition.Name) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
$msoTrue = -1
$marker = ' [slideclone-edit-check]'
function Start-Sleep { param([int]$Milliseconds) }
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
# A real regional group owns its editable child texts. Resolve the same child
# identity through nested groups before and after save/reopen, without ungrouping.
$childText = [pscustomobject]@{ Id=71; Type=17; HasTextFrame=-1; TextFrame2=[pscustomobject]@{ HasText=-1; TextRange=[pscustomobject]@{ Text='nested fixture' } } }
$inner = [pscustomobject]@{ Id=70; Type=6; GroupItems=(New-Collection @($childText)) }
$outer = [pscustomobject]@{ Id=69; Type=6; GroupItems=(New-Collection @($inner)) }
$groupDeck = [pscustomobject]@{ Slides=(New-Collection @([pscustomobject]@{ Shapes=(New-Collection @($outer)) })) }
$nestedTarget = Find-Target $groupDeck 'shape-text'
Require ($nestedTarget.Shape -eq 71) 'Grouped editable text was not discovered.'
Apply-Edit $groupDeck $nestedTarget
Require (Verify-Edit $groupDeck $nestedTarget) 'Grouped text edit did not survive identity lookup.'
$childText.TextFrame2.TextRange.Text='lost edit'
Require (-not (Verify-Edit $groupDeck $nestedTarget)) 'Grouped missing edit was accepted.'
$checks += 3
$emptyGroup = [pscustomobject]@{ Id=80; Type=6; GroupItems=(New-Collection @()) }
Require ($null -eq (Find-RoundTripShape (New-Collection @($emptyGroup)) 'shape-text' 1)) 'Empty group invented a text target.'
Require-Failure { Find-RoundTripShape (New-Collection @($outer)) 'shape-text' 1 0 33 }
Require-Failure { Find-RoundTripShape (New-Collection @($outer)) 'shape-text' 1 0 0 ([pscustomobject]@{ Remaining=1 }) }
$brokenGroup = [pscustomobject]@{ Id=81; Type=6; GroupItems=$null }
Require-Failure { Find-RoundTripShape (New-Collection @($brokenGroup)) 'shape-text' 1 }
$cycle = [pscustomobject]@{ Id=82; Type=6; GroupItems=$null }
$cycle.GroupItems = New-Collection @($cycle)
Require-Failure { Find-RoundTripShape (New-Collection @($cycle)) 'shape-text' 1 }
$checks += 5
# GroupItems can be present before Office exposes a child's ID. Only bounded
# readiness retries may recover; permanent invalid identities remain failures.
$readyChildren = [pscustomobject]@{ Reads=0; Shape=$childText; Count=1 }
$readyChildren | Add-Member ScriptMethod Item {
  param($Index)
  $this.Reads++
  if($this.Reads -le 3){return [pscustomobject]@{Id=0}}
  return $this.Shape
}
$readyGroup=[pscustomobject]@{Id=83;Type=6;GroupItems=$readyChildren}
$readyDeck=[pscustomobject]@{Slides=(New-Collection @([pscustomobject]@{Shapes=(New-Collection @($readyGroup))}))}
$childText.TextFrame2.TextRange.Text='ready fixture'
$readyTarget=[pscustomobject]@{Slide=1;Shape=71;Kind='shape-text'}
Apply-EditWithRetry $readyDeck $readyTarget
Require ($readyChildren.Reads -eq 4) 'Delayed grouped child identity was not retried.'
Require (Verify-EditWithRetry $readyDeck $readyTarget) 'Grouped child edit was not verified after readiness.'
$neverReady=[pscustomobject]@{Reads=0;Count=1}
$neverReady|Add-Member ScriptMethod Item {param($Index) $this.Reads++;return [pscustomobject]@{Id=0}}
$invalidDeck=[pscustomobject]@{Slides=(New-Collection @([pscustomobject]@{Shapes=$neverReady}))}
Require-Failure {Apply-EditWithRetry $invalidDeck $readyTarget}
Require ($neverReady.Reads -eq 8) 'Invalid identities exceeded or bypassed the retry bound.'
$checks += 4
$unreadyGroup=[pscustomobject]@{Id=84;Type=6;GroupItems=(New-Collection @([pscustomobject]@{Id=0}))}
$directShape=[pscustomobject]@{Id=85;Type=1;Left=[single]10}
$siblingDeck=[pscustomobject]@{Slides=(New-Collection @([pscustomobject]@{Shapes=(New-Collection @($unreadyGroup,$directShape))}))}
Require ((Get-ShapeById $siblingDeck ([pscustomobject]@{Slide=1;Shape=85})).Id -eq 85) 'Unrelated lazy group blocked a direct sibling identity.'
Require-Failure {Get-ShapeById $siblingDeck ([pscustomobject]@{Slide=1;Shape=999})}
$checks += 2
$unreadableDeck=[pscustomobject]@{Slides=(New-Collection @([pscustomobject]@{Shapes=(New-Collection @([pscustomobject]@{Id=0},$directShape))}))}
Require ((Get-ShapeById $unreadableDeck ([pscustomobject]@{Slide=1;Shape=85})).Id -eq 85) 'Unreadable sibling displaced an exact available identity.'
Require-Failure {Get-ShapeById $unreadableDeck ([pscustomobject]@{Slide=1;Shape=999})}
$checks += 2
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
$transientClose = [pscustomobject]@{ Saved=0; Attempts=0 }
$transientClose | Add-Member ScriptMethod Close {
  $this.Attempts++
  if ($this.Attempts -lt 3) { throw [Runtime.InteropServices.COMException]::new('busy', -2147418111) }
}
Close-DeckWithRetry $transientClose
Require ($transientClose.Attempts -eq 3) 'Transient Office close failures were not retried to success.'
Require ($transientClose.Saved -eq $msoTrue) 'The successfully closed deck was not marked saved.'
$checks += 2
$permanentClose = [pscustomobject]@{ Saved=0; Attempts=0 }
$permanentClose | Add-Member ScriptMethod Close {
  $this.Attempts++
  throw [InvalidOperationException]::new('permanent')
}
Require-Failure { Close-DeckWithRetry $permanentClose }
Require ($permanentClose.Attempts -eq 1) 'A non-transient close failure must not be retried.'
$checks += 2
$delayedSlides = [pscustomobject]@{ Reads=0; Slide=$slide }
$delayedSlides | Add-Member ScriptProperty Count {
  $this.Reads++
  if ($this.Reads -le 8) { return 0 }
  return 1
}
$delayedSlides | Add-Member ScriptMethod Item { param($Index) return $this.Slide }
$delayedTarget = Find-TargetWithRetry ([pscustomobject]@{ Slides=$delayedSlides }) 'geometry'
Require ($delayedTarget.Shape -eq 17) 'Target discovery did not survive a delayed PowerPoint collection.'
Require ($delayedSlides.Reads -eq 9) 'Target discovery did not use the bounded extended readiness window.'
$checks += 2
$delayedShapes = [pscustomobject]@{ Reads=0; Shape=$shape }
$delayedShapes | Add-Member ScriptProperty Count { return 1 }
$delayedShapes | Add-Member ScriptMethod Item {
  param($Index)
  $this.Reads++
  if ($this.Reads -le 3) { return [pscustomobject]@{ Id=999 } }
  return $this.Shape
}
$delayedEditDeck = [pscustomobject]@{ Slides=(New-Collection @([pscustomobject]@{ Shapes=$delayedShapes })) }
$delayedEditTarget = [pscustomobject]@{ Slide=1; Shape=17; Kind='geometry'; ExpectedLeft=[single]11 }
Apply-EditWithRetry $delayedEditDeck $delayedEditTarget
Require ($delayedShapes.Reads -eq 4) 'Edit did not retry only the temporarily unresolved target.'
Require ($shape.Left -eq [single]11) 'Retried edit did not apply the recorded absolute intent.'
$checks += 2
$delayedVerifySlides = [pscustomobject]@{ Reads=0; Slide=$slide }
$delayedVerifySlides | Add-Member ScriptProperty Count {
  $this.Reads++
  if ($this.Reads -le 3) { return 0 }
  return 1
}
$delayedVerifySlides | Add-Member ScriptMethod Item { param($Index) return $this.Slide }
$delayedVerifyDeck = [pscustomobject]@{ Slides=$delayedVerifySlides }
Require (Verify-EditWithRetry $delayedVerifyDeck $delayedEditTarget) 'Verification did not survive a delayed reopened collection.'
Require ($delayedVerifySlides.Reads -eq 4) 'Verification did not use the bounded reopened-collection retry.'
Require-Failure { Verify-EditWithRetry $delayedVerifyDeck ([pscustomobject]@{ Slide='1'; Shape=17; Kind='geometry'; ExpectedLeft=[single]11 }) }
$checks += 3
$a = [pscustomobject]@{Id=31;Name='from';Left=[single]10;Top=[single]20}
$b = [pscustomobject]@{Id=32;Name='to';Left=[single]110;Top=[single]120}
$c = [pscustomobject]@{Id=33;Name='curve';Connector=-1;From=$a;To=$b;Fixed=$false;
  ConnectorFormat=[pscustomobject]@{BeginConnected=-1;EndConnected=-1;BeginConnectedShape=$a;EndConnectedShape=$b;Type=3};
  Line=[pscustomobject]@{Weight=[single]3;DashStyle=1;BeginArrowheadStyle=1;EndArrowheadStyle=3}}
$c | Add-Member ScriptProperty Left { if($this.Fixed){return 10}; return $this.From.Left }
$c | Add-Member ScriptProperty Top { return $this.From.Top }
$c | Add-Member ScriptProperty Width { if($this.Fixed){return 100}; return $this.To.Left-$this.From.Left }
$c | Add-Member ScriptProperty Height { if($this.Fixed){return 100}; return $this.To.Top-$this.From.Top }
$background = [pscustomobject]@{Id=30;Name='background';Connector=0}
$deck = [pscustomobject]@{Slides=(New-Collection @([pscustomobject]@{Shapes=(New-Collection @($background,$a,$b,$c))}))}
$spec = [pscustomobject]@{name='curve';fromName='from';toName='to'}
$target = Find-ConnectorTarget $deck $spec
Require ($target.Shape -eq 33) 'Connector selection used the background.'
Apply-Edit $deck $target
Require (Verify-Edit $deck $target) 'Connector node movement or line edit failed.'
$checks += 2
foreach ($property in @('BeginConnected','EndConnected','Type')) {
  $original=$c.ConnectorFormat.$property; $c.ConnectorFormat.$property=0
  Require (-not (Verify-Edit $deck $target)) 'Lost connector topology passed.'
  $c.ConnectorFormat.$property=$original; $checks++
}
foreach ($property in @('DashStyle','BeginArrowheadStyle','EndArrowheadStyle','Weight')) {
  $original=$c.Line.$property; $c.Line.$property=99
  Require (-not (Verify-Edit $deck $target)) 'Lost connector style passed.'
  $c.Line.$property=$original; $checks++
}
$c.ConnectorFormat.BeginConnectedShape=$b
Require-Failure {Find-ConnectorTarget $deck $spec}
Require (-not (Verify-Edit $deck $target)) 'Wrong endpoint identity passed.'
$c.ConnectorFormat.BeginConnectedShape=$a
$checks += 2
Require-Failure {Find-ConnectorTarget $deck ([pscustomobject]@{name='missing';fromName='from';toName='to'})}
Require-Failure {Find-ConnectorTarget $deck ([pscustomobject]@{name='background';fromName='from';toName='to'})}
$duplicate=[pscustomobject]@{Slides=(New-Collection @([pscustomobject]@{Shapes=(New-Collection @($a,$b,$c,$c))}))}
Require-Failure {Find-ConnectorTarget $duplicate $spec}
$checks += 3
$c.Fixed=$true
$target=Find-ConnectorTarget $deck $spec
Require-Failure {Apply-Edit $deck $target}
$checks++
# Custom dash arrays have no reliable COM enum. Check the exact bounded OOXML
# pattern rather than coercing an unavailable COM property to the solid enum.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
function New-DashPackage([string]$Name, [string]$Dash, [string]$Mode='normal') {
  $file=Join-Path (Split-Path $GeneratedScript) ($Name+'.pptx')
  $shape="<p:cxnSp><p:nvCxnSpPr><p:cNvPr id='33'/></p:nvCxnSpPr><p:spPr><a:ln>$Dash</a:ln></p:spPr></p:cxnSp>"
  if ($Mode -eq 'missing') { $shape='' }
  if ($Mode -eq 'duplicate') { $shape=$shape+$shape }
  $xml="<p:sld xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main' xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main'>$shape</p:sld>"
  if ($Mode -eq 'dtd') { $xml='<!DOCTYPE x [<!ENTITY external SYSTEM "file:///secret">]>'+$xml }
  if ($Mode -eq 'oversized') { $xml=$xml+(' ' * 4194304) }
  $zip=[IO.Compression.ZipFile]::Open($file,[IO.Compression.ZipArchiveMode]::Create)
  try { $entry=$zip.CreateEntry('ppt/slides/slide1.xml'); $writer=New-Object IO.StreamWriter($entry.Open()); try{$writer.Write($xml)}finally{$writer.Dispose()} }
  finally { $zip.Dispose() }
  return $file
}
$dash="<a:custDash><a:ds d='400000' sp='250000'/><a:ds d='500000' sp='300000'/></a:custDash>"
Require ((Read-ConnectorDash (New-DashPackage 'custom' $dash) 1 33) -ceq 'custom:400000,250000,500000,300000') 'Custom dash values changed.'
Require ((Read-ConnectorDash (New-DashPackage 'solid' '') 1 33) -ceq 'preset:solid') 'Default solid dash changed.'
$checks+=2
foreach ($mode in @('missing','duplicate','dtd','oversized','zero','invalid','many')) {
  $bad=$dash
  if ($mode -eq 'zero') { $bad=$dash.Replace("d='400000'","d='0'") }
  if ($mode -eq 'invalid') { $bad=$dash.Replace("d='400000'","d='NaN'") }
  if ($mode -eq 'many') { $bad='<a:custDash>'+(("<a:ds d='1' sp='1'/>"*17))+'</a:custDash>' }
  $file=New-DashPackage $mode $bad $mode
  Require-Failure {Read-ConnectorDash $file 1 33}; $checks++
}
$textChild=[pscustomobject]@{Id=101;Name='real-text';Type=17;HasTextFrame=-1}
$owner=[pscustomobject]@{Id=100;Name='owner';Type=6;GroupItems=(New-Collection @($textChild))}
Require ((Find-ConnectorChild $owner 'real-text').Id -eq 101) 'Real text attachment was not resolved.'
Require ((Find-ConnectorChild $owner $null).Id -eq 100) 'Direct owner semantics changed.'
Require-Failure { Find-ConnectorChild $owner 'absent' }
Require-Failure { Find-ConnectorChild $textChild 'real-text' }
Require-Failure { Find-ConnectorChild ([pscustomobject]@{Type=6;GroupItems=(New-Collection @())}) 'real-text' }
Require-Failure { Find-ConnectorChild ([pscustomobject]@{Type=6;GroupItems=(New-Collection @($textChild,$textChild))}) 'real-text' }
Require-Failure { Find-ConnectorChild ([pscustomobject]@{Type=6;GroupItems=(New-Collection @([pscustomobject]@{Name='nested';Id=102;Type=6;HasTextFrame=-1}))}) 'nested' }
Require-Failure { Find-ConnectorChild ([pscustomobject]@{Type=6;GroupItems=[pscustomobject]@{Count=513}}) 'real-text' }
$checks+=8
[pscustomobject]@{ passed=$true; checks=$checks } | ConvertTo-Json -Compress
