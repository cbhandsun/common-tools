"use strict";

const { types } = require("node:util");

function normalizeConnectorTarget(value) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(p => !("value" in p))) {
    throw new TypeError("PowerPoint connector target is invalid.");
  }
  const keys = ["name", "fromName", "toName"];
  const optional = ["fromChildName", "toChildName"].filter(k => Object.hasOwn(value, k));
  const all = [...keys, ...optional];
  if (Object.keys(value).length !== all.length || all.some(k => typeof value[k] !== "string"
    || !/^[A-Za-z0-9_.:-]{1,256}$/u.test(value[k])) || new Set(keys.map(k => value[k])).size !== 3) {
    throw new TypeError("PowerPoint connector target is invalid.");
  }
  if (new Set(all.map(k => value[k])).size !== all.length) throw new TypeError("PowerPoint connector target is invalid.");
  return Object.fromEntries(all.map(k => [k, value[k]]));
}

function connectorRoundTripScript() {
  return String.raw`
function Find-ConnectorChild($Owner, $Name) {
  if ([string]::IsNullOrEmpty($Name)) { return $Owner }
  if ($Owner.Type -ne 6 -or $null -eq $Owner.GroupItems -or $Owner.GroupItems.Count -lt 1 -or $Owner.GroupItems.Count -gt 512) {
    throw "The connector group owner is invalid."
  }
  $found=$null
  for ($j=1; $j -le $Owner.GroupItems.Count; $j++) {
    $child=$Owner.GroupItems.Item($j)
    if ($child.Name -ceq $Name) {
      if ($null -ne $found -or $child.Type -eq 6 -or $child.HasTextFrame -ne -1 -or $child.Id -lt 1) {
        throw "The connector text child is invalid or ambiguous."
      }
      $found=$child
    }
  }
  if ($null -eq $found) { throw "The connector text child is missing." }
  return $found
}
function Find-ConnectorTarget($Deck, $Spec) {
  $found = @()
  $count = [int]$Deck.Slides.Count
  if ($count -lt 1 -or $count -gt 100000) { throw "The connector slide collection is invalid." }
  for ($i = 1; $i -le $count; $i++) {
    $shapes = $Deck.Slides.Item($i).Shapes
    if ($shapes.Count -lt 1 -or $shapes.Count -gt 100000) { throw "The connector shape collection is invalid." }
    $matches = @($null, $null, $null)
    for ($j = 1; $j -le $shapes.Count; $j++) {
      $shape = $shapes.Item($j)
      $names = @($Spec.name, $Spec.fromName, $Spec.toName)
      for ($k = 0; $k -lt 3; $k++) {
        if ($shape.Name -ceq $names[$k]) {
          if ($null -ne $matches[$k]) { throw "The connector target name is ambiguous." }
          $matches[$k] = $shape
        }
      }
    }
    if ($null -eq $matches[0]) { continue }
    if ($null -eq $matches[1] -or $null -eq $matches[2]) { throw "The connector endpoint is missing." }
    $c = $matches[0]; $a = $matches[1]; $b = $matches[2]
    $attachedA = Find-ConnectorChild $a $Spec.fromChildName
    $attachedB = Find-ConnectorChild $b $Spec.toChildName
    if ($c.Connector -ne -1 -or $c.ConnectorFormat.BeginConnected -ne -1 -or $c.ConnectorFormat.EndConnected -ne -1 -or
      $c.ConnectorFormat.BeginConnectedShape.Id -ne $attachedA.Id -or $c.ConnectorFormat.EndConnectedShape.Id -ne $attachedB.Id) {
      throw "The connector is not attached to the required endpoints."
    }
    $found += [pscustomobject]@{ Kind="connector"; Slide=$i; Shape=[int]$c.Id; FromShape=[int]$a.Id; ToShape=[int]$b.Id;
      FromAttachment=[int]$attachedA.Id; ToAttachment=[int]$attachedB.Id;
      ExpectedFromLeft=([double]$a.Left + 8); ExpectedToTop=([double]$b.Top + 8); ExpectedWeight=([double]$c.Line.Weight + 0.25);
      ConnectorType=[int]$c.ConnectorFormat.Type; DashStyle=$c.Line.DashStyle;
      BeginArrow=[int]$c.Line.BeginArrowheadStyle; EndArrow=[int]$c.Line.EndArrowheadStyle;
      Before=@([double]$c.Left,[double]$c.Top,[double]$c.Width,[double]$c.Height); After=$null }
  }
  if ($found.Count -ne 1) { throw "The named connector target is missing or ambiguous." }
  return $found[0]
}
function Apply-ConnectorEdit($Deck, $Target) {
  $a = Get-ShapeById $Deck ([pscustomobject]@{Slide=$Target.Slide;Shape=$Target.FromShape})
  $b = Get-ShapeById $Deck ([pscustomobject]@{Slide=$Target.Slide;Shape=$Target.ToShape})
  $c = Get-ShapeById $Deck $Target
  $a.Left = [single]$Target.ExpectedFromLeft; $b.Top = [single]$Target.ExpectedToTop
  $c.Line.Weight = [single]$Target.ExpectedWeight
  $Target.After = @([double]$c.Left,[double]$c.Top,[double]$c.Width,[double]$c.Height)
  $changed = $false
  for ($i = 0; $i -lt 4; $i++) { if ([Math]::Abs($Target.After[$i]-$Target.Before[$i]) -gt 0.05) { $changed=$true } }
  if (-not $changed) { throw "The connector geometry did not follow its moved endpoints." }
}
function Verify-ConnectorEdit($Deck, $Target) {
  $a = Get-ShapeById $Deck ([pscustomobject]@{Slide=$Target.Slide;Shape=$Target.FromShape})
  $b = Get-ShapeById $Deck ([pscustomobject]@{Slide=$Target.Slide;Shape=$Target.ToShape})
  $c = Get-ShapeById $Deck $Target
  if ($c.Connector -ne -1 -or $c.ConnectorFormat.BeginConnected -ne -1 -or $c.ConnectorFormat.EndConnected -ne -1 -or
    $c.ConnectorFormat.BeginConnectedShape.Id -ne $Target.FromAttachment -or $c.ConnectorFormat.EndConnectedShape.Id -ne $Target.ToAttachment -or
    $c.ConnectorFormat.Type -ne $Target.ConnectorType -or $c.Line.DashStyle -ne $Target.DashStyle -or
    $c.Line.BeginArrowheadStyle -ne $Target.BeginArrow -or $c.Line.EndArrowheadStyle -ne $Target.EndArrow -or
    [Math]::Abs($a.Left-$Target.ExpectedFromLeft) -gt 0.05 -or [Math]::Abs($b.Top-$Target.ExpectedToTop) -gt 0.05 -or
    [Math]::Abs($c.Line.Weight-$Target.ExpectedWeight) -gt 0.05 -or $null -eq $Target.After) { return $false }
  $geometry = @([double]$c.Left,[double]$c.Top,[double]$c.Width,[double]$c.Height)
  for ($i = 0; $i -lt 4; $i++) { if ([Math]::Abs($geometry[$i]-$Target.After[$i]) -gt 0.05) { return $false } }
  return $true
}
function Read-ConnectorDash([string]$File, [int]$Slide, [int]$Shape) {
  if ($Slide -lt 1 -or $Shape -lt 1) { throw "The connector package identity is invalid." }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Add-Type -AssemblyName System.IO.Compression
  $zip=$null; $stream=$null; $reader=$null
  try {
    $zip=[IO.Compression.ZipFile]::OpenRead($File)
    if ($zip.Entries.Count -gt 20000) { throw "The connector package is oversized." }
    $entry=$zip.GetEntry("ppt/slides/slide$Slide.xml")
    if ($null -eq $entry -or $entry.Length -gt 4194304) { throw "The connector slide XML is unavailable or oversized." }
    $stream=$entry.Open()
    $settings=New-Object Xml.XmlReaderSettings
    $settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit; $settings.XmlResolver=$null; $settings.MaxCharactersInDocument=4194304
    $reader=[Xml.XmlReader]::Create($stream,$settings)
    $xml=New-Object Xml.XmlDocument; $xml.XmlResolver=$null; $xml.Load($reader)
    $ns=New-Object Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
    $ns.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
    $matches=$xml.SelectNodes("//p:cxnSp[p:nvCxnSpPr/p:cNvPr[@id='$Shape']]/p:spPr/a:ln",$ns)
    if ($matches.Count -ne 1) { throw "The connector package target is missing or ambiguous." }
    $dash=$matches[0].SelectNodes('a:custDash|a:prstDash',$ns)
    if ($dash.Count -eq 0) { return 'preset:solid' }
    if ($dash.Count -ne 1) { throw "The connector dash is ambiguous." }
    if ($dash[0].LocalName -eq 'prstDash') { return ('preset:'+$dash[0].GetAttribute('val')) }
    $runs=$dash[0].SelectNodes('a:ds',$ns)
    if ($runs.Count -lt 1 -or $runs.Count -gt 16) { throw "The connector dash count is invalid." }
    $values=@()
    foreach ($run in $runs) {
      foreach ($attribute in @('d','sp')) {
        $v=$run.GetAttribute($attribute)
        if ($v -notmatch '^[0-9]{1,9}$' -or [long]$v -lt 1) { throw "The connector dash value is invalid." }
        $values += [long]$v
      }
    }
    return ('custom:'+($values -join ','))
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
    if ($null -ne $zip) { $zip.Dispose() }
  }
}
`;
}

module.exports = { normalizeConnectorTarget, connectorRoundTripScript };
