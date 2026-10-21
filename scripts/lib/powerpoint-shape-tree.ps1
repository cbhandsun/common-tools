# The caller supplies Release-Com. Traversal emits identities only; lookup
# transfers the selected shape reference to its caller for release after use.
function Get-PowerPointShapeTreeIds($Shapes, $State = $null, [int]$Depth = 0) {
  if ($null -eq $State) { $State = @{Ids=[Collections.Generic.HashSet[int]]::new(); Count=0} }
  if ($null -eq $Shapes -or $Depth -gt 32) { throw 'The PowerPoint object tree is invalid.' }
  $count = $Shapes.Count
  if ($count -isnot [int]) { throw 'The PowerPoint object count is invalid.' }
  if ($count -lt 0 -or $count -gt 100000) { throw 'The PowerPoint object tree exceeds limits.' }
  for ($index=1; $index -le $count; $index++) {
    $shape=$null; $children=$null
    try {
      $shape=$Shapes.Item($index)
      if ($null -eq $shape) { throw 'The PowerPoint object tree contains a null shape.' }
      $id=[int]$shape.Id
      if ($id -lt 1 -or -not $State.Ids.Add($id)) { throw 'The PowerPoint object identity is invalid or ambiguous.' }
      $State.Count++
      if ($State.Count -gt 100000) { throw 'The PowerPoint object tree exceeds limits.' }
      Write-Output $id
      if ([int]$shape.Type -eq 6) {
        $children=$shape.GroupItems
        Get-PowerPointShapeTreeIds $children $State ($Depth+1)
      }
    } finally {
      Release-Com $children
      Release-Com $shape
    }
  }
}

function Find-PowerPointShapeInTree($Shapes, [int]$ShapeId, [int]$Depth = 0, $State = $null) {
  if ($ShapeId -lt 1 -or $null -eq $Shapes -or $Depth -gt 32) { throw 'The PowerPoint object lookup is invalid.' }
  if ($null -eq $State) { $State=@{Count=0} }
  $count=$Shapes.Count
  if ($count -isnot [int]) { throw 'The PowerPoint object count is invalid.' }
  if ($count -lt 0 -or $count -gt 100000) { throw 'The PowerPoint object tree exceeds limits.' }
  for ($index=1; $index -le $count; $index++) {
    $shape=$null; $children=$null; $retained=$false
    try {
      $shape=$Shapes.Item($index)
      if ($null -eq $shape) { throw 'The PowerPoint object tree contains a null shape.' }
      $State.Count++
      if ($State.Count -gt 100000) { throw 'The PowerPoint object tree exceeds limits.' }
      if ([int]$shape.Id -eq $ShapeId) { $retained=$true; return $shape }
      if ([int]$shape.Type -eq 6) {
        $children=$shape.GroupItems
        $found=Find-PowerPointShapeInTree $children $ShapeId ($Depth+1) $State
        if ($null -ne $found) { return $found }
      }
    } finally {
      Release-Com $children
      if (-not $retained) { Release-Com $shape }
    }
  }
  return $null
}
