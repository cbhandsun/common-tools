"use strict";

// Discovery and identity lookup use the same bounded group traversal so an edit
// is resolved against the actual child again after Office saves and reopens it.
function shapeTargetScript() {
  return String.raw`
function Find-RoundTripShape($Shapes, [string]$Mode, [int]$Slide, [int]$ShapeId = 0, [int]$Depth = 0, $Budget = $null) {
  if ($Depth -lt 0 -or $Depth -gt 32) { throw "The editable group nesting exceeds its boundary." }
  if ($null -eq $Budget) { $Budget = [pscustomobject]@{ Remaining=100000 } }
  $count = [int]$Shapes.Count
  if ($null -eq $Shapes -or $count -lt 0 -or $count -gt 100000) { throw "The slide shape collection is unavailable or out of bounds." }
  $groups = @()
  for ($index = 1; $index -le $count; $index++) {
    if ($Budget.Remaining -le 0) { throw "The editable shape traversal exceeds its boundary." }
    $Budget.Remaining--
    $shape = $Shapes.Item($index)
    $id = $shape.Id
    if ($id -isnot [int] -or $id -lt 1) {
      # A lazy sibling is not a target. Continue searching for a real identity;
      # a group can still contain an available child before its own ID is ready.
      # Never synthesize IDs: no valid match still fails the bounded caller retry.
      if ($shape.Type -eq 6) { $groups += $shape }
      continue
    }
    if ($Mode -eq "identity") {
      if ($id -eq $ShapeId) { return $shape }
    } else {
      if ($Mode -eq "smartart-text" -or $Mode -eq "auto") {
        try {
          if ($shape.HasSmartArt -eq -1 -and $shape.SmartArt.AllNodes.Count -gt 0) {
            return [pscustomobject]@{ Kind="smartart-text"; Slide=$Slide; Shape=$id }
          }
        } catch {}
      }
      if ($Mode -eq "shape-text" -or $Mode -eq "auto") {
        try {
          if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame2.HasText -eq -1) {
            return [pscustomobject]@{ Kind="shape-text"; Slide=$Slide; Shape=$id }
          }
        } catch {}
      }
      if ($Mode -eq "geometry" -or $Mode -eq "auto") {
        return [pscustomobject]@{ Kind="geometry"; Slide=$Slide; Shape=$id; ExpectedLeft=[single]($shape.Left + 1.0) }
      }
    }
    if ($shape.Type -eq 6) { $groups += $shape }
  }
  # Resolve a direct sibling before touching unrelated group children. Office
  # can expose a group's own identity before its GroupItems are ready.
  foreach ($group in $groups) {
    $found = Find-RoundTripShape $group.GroupItems $Mode $Slide $ShapeId ($Depth + 1) $Budget
    if ($null -ne $found) { return $found }
  }
  return $null
}
`;
}
module.exports = { shapeTargetScript };
