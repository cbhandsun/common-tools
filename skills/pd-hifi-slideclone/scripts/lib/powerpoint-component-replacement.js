"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { run } = require("./exec");

async function applyComponentReplacementsWithPowerPoint(options = {}) {
  const planFile = requiredFile(options.planFile, ".json", "component replacement plan");
  const outFile = options.out ? safeOutputFile(options.out) : "";
  if (!outFile && options.dryRun !== true) throw new Error("out is required unless dryRun is set.");
  const tempRoot = fs.mkdtempSync(path.join(resolveAsciiTempRoot(), "slideclone-component-replacement-"));
  const scriptFile = path.join(tempRoot, "apply-component-replacements.ps1");
  const reportFile = path.join(tempRoot, "report.json");
  fs.writeFileSync(scriptFile, powerPointComponentReplacementScript(), "utf8");
  const args = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile,
    "-PlanFile", planFile,
    "-ReportFile", reportFile,
    "-AllowMissing", options.allowMissing === true ? "true" : "false",
    "-DryRun", options.dryRun === true ? "true" : "false"
  ];
  if (outFile) args.push("-OutFile", outFile);
  const runner = typeof options.runner === "function" ? options.runner : run;
  try {
    const completed = await runner("powershell.exe", args, {
      cwd: path.dirname(planFile),
      timeout: positiveInteger(options.timeoutMs, 180_000),
      maxBuffer: 20 * 1024 * 1024
    });
    const reportText = fs.statSync(reportFile, { throwIfNoEntry: false })?.isFile()
      ? fs.readFileSync(reportFile, "utf8")
      : completed.stdout;
    return parsePowerPointComponentReport(reportText);
  } finally {
    if (process.env.SLIDECLONE_KEEP_POWERPOINT_STAGING !== "1") {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function parsePowerPointComponentReport(stdout) {
  const text = String(stdout || "").replace(/^\uFEFF/u, "").trim();
  if (!text) throw new Error("PowerPoint component replacement returned empty output.");
  try {
    const report = JSON.parse(text);
    if (!report || typeof report !== "object" || Array.isArray(report)) throw new TypeError("report must be an object");
    return report;
  } catch (error) {
    throw new Error(`PowerPoint component replacement returned invalid JSON: ${text.slice(0, 300)}`);
  }
}

function requiredFile(value, extension, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.includes("\0")) {
    throw new TypeError(`${label} path is invalid.`);
  }
  const file = path.resolve(value);
  if (path.extname(file).toLowerCase() !== extension || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} was not found: ${file}`);
  }
  return file;
}

function safeOutputFile(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.includes("\0")) {
    throw new TypeError("component replacement output path is invalid.");
  }
  const file = path.resolve(value);
  if (path.extname(file).toLowerCase() !== ".pptx") throw new TypeError("component replacement output must be a .pptx file.");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed >= 1000 && parsed <= 600_000 ? parsed : fallback;
}

function resolveAsciiTempRoot() {
  const preferred = path.resolve(os.tmpdir());
  if (/^[\x00-\x7F]+$/u.test(preferred)) return preferred;
  const fallback = path.resolve("C:\\Temp");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function powerPointComponentReplacementScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$PlanFile,
  [Parameter(Mandatory=$true)][string]$ReportFile,
  [string]$OutFile = "",
  [string]$AllowMissing = "false",
  [string]$DryRun = "false"
)
$ErrorActionPreference = "Stop"
$msoTrue = -1
$msoFalse = 0
$msoGroup = 6
$msoLinkedPicture = 11
$msoPicture = 13
$allowMissingValue = $AllowMissing -eq "true"
$dryRunValue = $DryRun -eq "true"
$app = $null
$target = $null
$startedAt = [DateTimeOffset]::UtcNow

function Invoke-ComWithRetry([scriptblock]$Action, [string]$Label) {
  $lastError=$null
  for($attempt=1;$attempt -le 8;$attempt++){
    try {
      Start-Sleep -Milliseconds (180*$attempt)
      $result=& $Action
      Write-Output -NoEnumerate $result
      return
    }
    catch {
      $lastError=$_
      if($attempt -eq 8){throw "$Label failed after bounded retries: $($lastError.Exception.Message)"}
      Start-Sleep -Milliseconds (320*$attempt)
    }
  }
  throw "$Label failed."
}
function Open-PresentationWithRetry($Application,[string]$File,[int]$ReadOnly) {
  return Invoke-ComWithRetry { $Application.Presentations.Open($File,$ReadOnly,$msoFalse,$msoFalse) } "PowerPoint presentation open"
}
function Copy-PasteShapeWithRetry($SourceShape,$TargetSlide) {
  return Invoke-ComWithRetry {
    $beforeCount=[int]$TargetSlide.Shapes.Count
    $SourceShape.Copy(); Start-Sleep -Milliseconds 180
    $pastedRange=$TargetSlide.Shapes.Paste()
    $afterCount=[int]$TargetSlide.Shapes.Count
    $shape=$null
    if($pastedRange -ne $null -and [int]$pastedRange.Count -ge 1){$shape=$pastedRange.Item(1)}
    elseif($afterCount -gt $beforeCount){$shape=$TargetSlide.Shapes.Item($afterCount)}
    if($shape -eq $null){throw "PowerPoint paste returned no shapes."}
    [PSCustomObject]@{ Shape=$shape }
  } "PowerPoint native shape copy/paste"
}

function Get-Bounds([object[]]$Shapes) {
  if ($Shapes.Count -eq 0) { return $null }
  $left = [double]::PositiveInfinity; $top = [double]::PositiveInfinity
  $right = [double]::NegativeInfinity; $bottom = [double]::NegativeInfinity
  foreach ($shape in $Shapes) {
    $geometry=Invoke-ComWithRetry {[PSCustomObject]@{X=[double]$shape.Left;Y=[double]$shape.Top;W=[double]$shape.Width;H=[double]$shape.Height}} "PowerPoint shape bounds read"
    $left = [Math]::Min($left, $geometry.X); $top = [Math]::Min($top, $geometry.Y)
    $right = [Math]::Max($right, $geometry.X + $geometry.W)
    $bottom = [Math]::Max($bottom, $geometry.Y + $geometry.H)
  }
  return [PSCustomObject]@{ X=$left; Y=$top; W=[Math]::Max(0.1, $right-$left); H=[Math]::Max(0.1, $bottom-$top) }
}
function Get-IoU($A, $B) {
  $left=[Math]::Max($A.X,$B.X); $top=[Math]::Max($A.Y,$B.Y)
  $right=[Math]::Min($A.X+$A.W,$B.X+$B.W); $bottom=[Math]::Min($A.Y+$A.H,$B.Y+$B.H)
  $intersection=[Math]::Max(0,$right-$left)*[Math]::Max(0,$bottom-$top)
  if ($intersection -le 0) { return 0.0 }
  return $intersection/[Math]::Max(0.1,($A.W*$A.H)+($B.W*$B.H)-$intersection)
}
function Get-CenterOffset($A, $B) {
  $dx=($A.X+$A.W/2)-($B.X+$B.W/2); $dy=($A.Y+$A.H/2)-($B.Y+$B.H/2)
  return [Math]::Sqrt($dx*$dx+$dy*$dy)
}
function Is-Cloneable($Shape) {
  $state=Invoke-ComWithRetry {
    $visible=$msoTrue;try{$visible=[int]$Shape.Visible}catch{}
    [PSCustomObject]@{Visible=$visible;W=[double]$Shape.Width;H=[double]$Shape.Height;Name=[string]$Shape.Name}
  } "PowerPoint shape state read"
  return ($state.Visible -ne 0) -and ($state.W -gt 0.1) -and ($state.H -gt 0.1) -and ($state.Name -ne "background")
}
function Get-ShapeItems($Shapes) {
  $count=Invoke-ComWithRetry {[int]$Shapes.Count} "PowerPoint shape count read"
  $items=@()
  for($i=1;$i -le $count;$i++){$items += Invoke-ComWithRetry {$Shapes.Item($i)} "PowerPoint shape read"}
  Write-Output -NoEnumerate $items
}
function Matches-Target($Shape, $Operation) {
  $metadata=Invoke-ComWithRetry {
    $alt="";try{$alt=[string]$Shape.AlternativeText}catch{}
    [PSCustomObject]@{Name=[string]$Shape.Name;Alt=$alt}
  } "PowerPoint shape metadata read"
  foreach ($name in @($Operation.drawingNames)) { if ($metadata.Name -eq $name) { return $true } }
  $alt = $metadata.Alt
  if (-not $alt.StartsWith("slideclone:componentReplacementPlan")) { return $false }
  if ([string]::IsNullOrWhiteSpace([string]$Operation.componentId) -or -not $alt.Contains("id=$($Operation.componentId)")) { return $false }
  return [string]::IsNullOrWhiteSpace([string]$Operation.layer) -or $alt.Contains("layer=$($Operation.layer)")
}
function Select-SampleShapes($Slide, $RecommendedGroup) {
  $groups = @()
  $slideShapes=Get-ShapeItems $Slide.Shapes
  foreach($shape in $slideShapes) {
    $shapeType=Invoke-ComWithRetry {[int]$shape.Type} "PowerPoint shape type read"
    if (($shapeType -eq $msoGroup) -and (Is-Cloneable $shape)) { $groups += $shape }
  }
  if ($RecommendedGroup -ne $null -and $groups.Count -gt 0) {
    $selected=$null; $id=[string]$RecommendedGroup.id
    if (-not [string]::IsNullOrWhiteSpace($id)) {
      foreach ($group in $groups) {
        $metadata=Invoke-ComWithRetry {$alt="";try{$alt=[string]$group.AlternativeText}catch{};[PSCustomObject]@{Name=[string]$group.Name;Alt=$alt}} "PowerPoint group metadata read"
        if ($metadata.Name -eq $id -or $metadata.Alt.Contains($id)) { $selected=$group; break }
      }
    }
    if ($selected -eq $null) {
      $groupIndex=[int]$RecommendedGroup.groupIndex
      if ($groupIndex -gt 0 -and $groupIndex -le $groups.Count) { $selected=$groups[$groupIndex-1] }
    }
    if ($selected -eq $null) { $selected=$groups[0] }
    $selectedName=Invoke-ComWithRetry {[string]$selected.Name} "PowerPoint group name read"
    return [PSCustomObject]@{ Shapes=@($selected); GroupId=if($id){$id}else{$selectedName}; Mode="recommended-group" }
  }
  $shapes=@()
  foreach($shape in $slideShapes){if (Is-Cloneable $shape) { $shapes += $shape }}
  return [PSCustomObject]@{ Shapes=$shapes; GroupId=$null; Mode="slide-fallback" }
}
function New-OperationReport($Operation,$Applied,$Removed,$Cloned,$SamplePath,$GroupId,$Mode,$Reason,$TargetBounds,$AppliedBounds) {
  return [PSCustomObject]@{
    GroupKey=$Operation.groupKey; Status=if($Operation.status){$Operation.status}else{"unknown"}; Applied=$Applied
    RemovedShapeCount=$Removed; ClonedShapeCount=$Cloned; SamplePath=$SamplePath
    SampleGroupId=$GroupId; SampleSelectionMode=$Mode; Reason=$Reason
    TargetBounds=$TargetBounds; AppliedBounds=$AppliedBounds
    BoundsIoU=if($AppliedBounds -ne $null){Get-IoU $AppliedBounds $TargetBounds}else{$null}
    CenterOffsetPt=if($AppliedBounds -ne $null){Get-CenterOffset $AppliedBounds $TargetBounds}else{$null}
  }
}
function Write-JsonUtf8($Path,$Value) {
  $json=$Value|ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($Path,$json,[Text.UTF8Encoding]::new($false))
}

try {
  $plan=Get-Content -LiteralPath $PlanFile -Raw|ConvertFrom-Json
  $source=[IO.Path]::GetFullPath([string]$plan.pptx)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Replacement source PPTX was not found." }
  $targetFile=$source
  if (-not $dryRunValue) {
    if ([string]::IsNullOrWhiteSpace($OutFile)) { throw "Output PPTX is required." }
    $targetFile=[IO.Path]::GetFullPath($OutFile)
    $parent=[IO.Path]::GetDirectoryName($targetFile); [IO.Directory]::CreateDirectory($parent)|Out-Null
    Copy-Item -LiteralPath $source -Destination $targetFile -Force
  }
  $app=New-Object -ComObject PowerPoint.Application
  if ($app -eq $null) { throw "PowerPoint.Application COM object is unavailable." }
  try{$app.DisplayAlerts=1}catch{}
  $target=Open-PresentationWithRetry $app $targetFile $msoFalse
  if ($target -eq $null) { throw "PowerPoint could not open the target presentation." }
  $reports=@()
  foreach ($operation in @($plan.operations)) {
    if ([string]$operation.status -ne "ready") {
      $reports += New-OperationReport $operation $false 0 0 $null $null $null "operation_not_ready" $null $null
      if (-not $allowMissingValue) { throw "Component replacement operation is not ready." }
      continue
    }
    $slideIndex=[int](@($operation.slides)[0])
    if ($slideIndex -le 0 -or $slideIndex -gt [int]$target.Slides.Count) {
      $reports += New-OperationReport $operation $false 0 0 $null $null $null "target_slide_not_found" $null $null
      if (-not $allowMissingValue) { throw "Target slide was not found." }; continue
    }
    $samplePath=[IO.Path]::GetFullPath([string]$operation.sample.path)
    if (-not (Test-Path -LiteralPath $samplePath -PathType Leaf)) {
      $reports += New-OperationReport $operation $false 0 0 $samplePath $null $null "sample_not_found" $null $null
      if (-not $allowMissingValue) { throw "Component sample was not found." }; continue
    }
    $targetSlide=Invoke-ComWithRetry {$target.Slides.Item($slideIndex)} "PowerPoint target slide read"; $targetShapes=@()
    $allTargetShapes=Get-ShapeItems $targetSlide.Shapes
    foreach($shape in $allTargetShapes){if(Matches-Target $shape $operation){$targetShapes+=$shape}}
    $targetBounds=Get-Bounds $targetShapes
    if($targetBounds -eq $null -and $operation.target.box -ne $null){$b=$operation.target.box;$targetBounds=[PSCustomObject]@{X=[double]$b.x;Y=[double]$b.y;W=[double]$b.w;H=[double]$b.h}}
    if($targetBounds -eq $null -or $targetBounds.W -le 0 -or $targetBounds.H -le 0){
      $reports += New-OperationReport $operation $false 0 0 $samplePath $null $null "target_anchor_shapes_not_found" $null $null
      if(-not $allowMissingValue){throw "Target component bounds were not found."};continue
    }
    if($targetShapes.Count -eq 0){
      foreach($shape in $allTargetShapes){
        $shapeType=Invoke-ComWithRetry {[int]$shape.Type} "PowerPoint target shape type read"
        if(($shapeType -eq $msoPicture -or $shapeType -eq $msoLinkedPicture) -and (Get-IoU (Get-Bounds @($shape)) $targetBounds) -ge 0.88){$targetShapes+=$shape}
      }
    }
    $sample=$null
    try {
      $sample=Open-PresentationWithRetry $app $samplePath $msoTrue
      if($sample -eq $null -or [int]$sample.Slides.Count -eq 0){throw "Component sample has no slides."}
      $sampleSlideIndex=[Math]::Max(1,[int]$operation.sample.recommendedGroup.slide);$sampleSlideCount=Invoke-ComWithRetry {[int]$sample.Slides.Count} "PowerPoint sample slide count read";if($sampleSlideIndex -gt $sampleSlideCount){$sampleSlideIndex=1}
      $sampleSlide=Invoke-ComWithRetry {$sample.Slides.Item($sampleSlideIndex)} "PowerPoint sample slide read"
      $selection=Select-SampleShapes $sampleSlide $operation.sample.recommendedGroup
      if($selection.Shapes.Count -eq 0){throw "Component sample has no cloneable shapes."}
      $sampleBounds=Get-Bounds $selection.Shapes; $pasted=@()
      foreach($sourceShape in $selection.Shapes){
        $sourceGeometry=Invoke-ComWithRetry {
          [PSCustomObject]@{X=[double]$sourceShape.Left;Y=[double]$sourceShape.Top;W=[double]$sourceShape.Width;H=[double]$sourceShape.Height}
        } "PowerPoint source shape geometry read"
        $pasteResult=Copy-PasteShapeWithRetry $sourceShape $targetSlide
        $clone=$pasteResult.Shape
        if($clone -eq $null){throw "PowerPoint native shape copy/paste returned an invalid shape."}
        Invoke-ComWithRetry {
          try{$clone.LockAspectRatio=$msoFalse}catch{}
          $clone.Left=$targetBounds.X+(($sourceGeometry.X-$sampleBounds.X)/$sampleBounds.W)*$targetBounds.W
          $clone.Top=$targetBounds.Y+(($sourceGeometry.Y-$sampleBounds.Y)/$sampleBounds.H)*$targetBounds.H
          $clone.Width=[Math]::Max(0.1,($sourceGeometry.W/$sampleBounds.W)*$targetBounds.W)
          $clone.Height=[Math]::Max(0.1,($sourceGeometry.H/$sampleBounds.H)*$targetBounds.H)
          try{$clone.Name="$($operation.componentId)-replacement-$($pasted.Count+1)"}catch{}
          try{$clone.AlternativeText="slideclone:appliedComponentReplacement source=$($operation.provider):$($operation.componentId) group=$($operation.groupKey) sampleGroup=$($selection.GroupId)"}catch{}
        } "PowerPoint pasted shape placement"|Out-Null
        $pasted+=$clone
      }
      if($pasted.Count -eq 0){throw "PowerPoint component replacement pasted no editable shapes."}
      # PowerPoint may preserve a shape's aspect or rotation semantics while
      # pasting. Normalize the union twice so the editable component lands on
      # the requested target box instead of inheriting that small COM drift.
      for($geometryPass=1;$geometryPass -le 2;$geometryPass++){
        $currentBounds=Get-Bounds $pasted
        if($currentBounds -eq $null -or $currentBounds.W -le 0 -or $currentBounds.H -le 0){break}
        foreach($clone in $pasted){
          $geometry=Invoke-ComWithRetry {[PSCustomObject]@{X=[double]$clone.Left;Y=[double]$clone.Top;W=[double]$clone.Width;H=[double]$clone.Height}} "PowerPoint pasted geometry read"
          Invoke-ComWithRetry {
            try{$clone.LockAspectRatio=$msoFalse}catch{}
            $clone.Left=$targetBounds.X+(($geometry.X-$currentBounds.X)/$currentBounds.W)*$targetBounds.W
            $clone.Top=$targetBounds.Y+(($geometry.Y-$currentBounds.Y)/$currentBounds.H)*$targetBounds.H
            $clone.Width=[Math]::Max(0.1,($geometry.W/$currentBounds.W)*$targetBounds.W)
            $clone.Height=[Math]::Max(0.1,($geometry.H/$currentBounds.H)*$targetBounds.H)
          } "PowerPoint pasted geometry normalization"|Out-Null
        }
      }
      foreach($shape in $targetShapes){Invoke-ComWithRetry {$shape.Delete()} "PowerPoint target shape removal"|Out-Null}
      $appliedBounds=Get-Bounds $pasted
      $reason=if($targetShapes.Count -gt 0){$null}else{"applied_with_ir_target_box_fallback_without_crop_removal"}
      $reports += New-OperationReport $operation $true $targetShapes.Count $pasted.Count $samplePath $selection.GroupId $selection.Mode $reason $targetBounds $appliedBounds
    } finally { if($sample -ne $null){try{$sample.Close()|Out-Null}catch{}} }
  }
  if(-not $dryRunValue){Invoke-ComWithRetry {$target.Save()} "PowerPoint presentation save"|Out-Null}
  $report=[PSCustomObject]@{
    provider="powerpoint-component-replacement-apply-v1";plan=[IO.Path]::GetFullPath($PlanFile);sourcePptx=$source
    outFile=if($dryRunValue){$null}else{$targetFile};dryRun=$dryRunValue;allowMissing=$allowMissingValue
    elapsedMs=[long]([DateTimeOffset]::UtcNow-$startedAt).TotalMilliseconds;operations=$reports
    summary=[PSCustomObject]@{operationCount=$reports.Count;appliedCount=@($reports|Where-Object Applied).Count;skippedCount=@($reports|Where-Object{-not $_.Applied}).Count;removedShapeCount=($reports|Measure-Object RemovedShapeCount -Sum).Sum;clonedShapeCount=($reports|Measure-Object ClonedShapeCount -Sum).Sum}
  }
  Write-JsonUtf8 $ReportFile $report
  $report|ConvertTo-Json -Depth 20
}
catch {
  [Console]::Error.WriteLine([string]$_.ScriptStackTrace)
  throw
}
finally {
  if($target -ne $null){try{$target.Close()|Out-Null}catch{}}
  if($app -ne $null){try{$app.Quit()|Out-Null}catch{}}
}`;
}

module.exports = {
  applyComponentReplacementsWithPowerPoint,
  parsePowerPointComponentReport,
  powerPointComponentReplacementScript,
  requiredFile,
  safeOutputFile
};
