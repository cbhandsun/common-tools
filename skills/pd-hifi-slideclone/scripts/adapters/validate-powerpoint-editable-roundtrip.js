"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { run } = require("../lib/exec");

const MODES = new Set(["auto", "shape-text", "smartart-text", "geometry"]);

async function validatePowerPointEditableRoundTrip(cases, options = {}) {
  const normalized = normalizeCases(cases);
  const outputDir = path.resolve(options.outputDir || path.join(process.cwd(), "runs", "powerpoint-editable-roundtrip"));
  fs.mkdirSync(outputDir, { recursive: true });
  const manifestFile = path.join(outputDir, "powerpoint-editable-roundtrip-input.json");
  const reportFile = path.join(outputDir, "powerpoint-editable-roundtrip-report.json");
  const scriptFile = path.join(outputDir, "validate-powerpoint-editable-roundtrip.ps1");
  fs.writeFileSync(scriptFile, editableRoundTripScript(), "utf8");
  fs.writeFileSync(manifestFile, `\uFEFF${JSON.stringify({ cases: normalized, stagingRoot: createAsciiStagingRoot(outputDir) }, null, 2)}\n`, "utf8");
  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile, "-ManifestFile", manifestFile, "-ReportFile", reportFile], {
    timeout: positiveInt(options.timeoutMs, 240_000)
  });
  const report = readReport(reportFile);
  if (report?.passed !== true) throw new Error(`PowerPoint editable round-trip gate rejected ${report?.failed || "one or more"} PPTX case(s).`);
  return report;
}

function normalizeCases(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) throw new TypeError("PowerPoint editable round-trip gate requires 1 to 64 cases.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError(`PowerPoint editable round-trip case ${index + 1} is invalid.`);
    const file = path.resolve(String(item.file || ""));
    const mode = String(item.mode || "auto").toLowerCase();
    if (!MODES.has(mode)) throw new TypeError(`PowerPoint editable round-trip case ${index + 1} has an invalid mode.`);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size <= 0 || stat.size > 512 * 1024 * 1024 || path.extname(file).toLowerCase() !== ".pptx")
      throw new Error(`PowerPoint editable round-trip file is invalid: ${file}`);
    return { file, mode };
  });
}

function readReport(file) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "")); } catch { return null; }
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function createAsciiStagingRoot(outputDir) {
  const preferred = path.resolve(os.tmpdir());
  const root = /^[\x00-\x7F]+$/u.test(preferred) ? preferred : path.resolve("C:\\Temp");
  fs.mkdirSync(root, { recursive: true });
  const id = crypto.createHash("sha256").update(`${path.resolve(outputDir)}|${process.pid}|${Date.now()}|${crypto.randomBytes(8).toString("hex")}`).digest("hex").slice(0, 20);
  const staging = path.join(root, "slideclone-powerpoint-editable-roundtrip", id);
  fs.mkdirSync(staging, { recursive: true });
  return staging;
}

function editableRoundTripScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$ManifestFile,
  [Parameter(Mandatory=$true)][string]$ReportFile
)
$ErrorActionPreference = "Stop"
$msoFalse = 0
$msoTrue = -1
$ppSaveAsOpenXMLPresentation = 24
$marker = " [slideclone-edit-check]"
$app = $null
$mutex = $null
$held = $false
$results = @()

function Release-Com($Value) {
  if ($null -ne $Value) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) } catch {} }
}
function Open-Deck([string]$File) {
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    try {
      $deck = $app.Presentations.Open($File, $msoFalse, $msoFalse, $msoFalse)
      if ($null -ne $deck) { Start-Sleep -Milliseconds 800; return $deck }
    } catch { if ($attempt -eq 12) { throw } }
    Start-Sleep -Milliseconds (400 * $attempt)
  }
  throw "PowerPoint did not open the editable round-trip deck."
}
function Find-Target($Deck, [string]$Mode) {
  foreach ($slide in @($Deck.Slides)) {
    foreach ($shape in @($slide.Shapes)) {
      if ($Mode -eq "smartart-text" -or $Mode -eq "auto") {
        try {
          if ($shape.HasSmartArt -eq $msoTrue -and $shape.SmartArt.AllNodes.Count -gt 0) {
            return [pscustomobject]@{ Kind="smartart-text"; Slide=[int]$slide.SlideIndex; Shape=[int]$shape.Id }
          }
        } catch {}
      }
      if ($Mode -eq "shape-text" -or $Mode -eq "auto") {
        try {
          if ($shape.HasTextFrame -eq $msoTrue -and $shape.TextFrame2.HasText -eq $msoTrue) {
            return [pscustomobject]@{ Kind="shape-text"; Slide=[int]$slide.SlideIndex; Shape=[int]$shape.Id }
          }
        } catch {}
      }
      if ($Mode -eq "geometry" -or $Mode -eq "auto") {
        $expectedLeft = [single]($shape.Left + 1.0)
        return [pscustomobject]@{
          Kind="geometry"
          Slide=[int]$slide.SlideIndex
          Shape=[int]$shape.Id
          ExpectedLeft=$expectedLeft
        }
      }
    }
  }
  throw "No editable object matched the requested round-trip mode."
}
function Find-TargetWithRetry($Deck, [string]$Mode) {
  for ($attempt = 1; $attempt -le 8; $attempt++) {
    try { return (Find-Target $Deck $Mode) }
    catch {
      if ($attempt -eq 8) { throw }
      Start-Sleep -Milliseconds (300 * $attempt)
    }
  }
}
function Get-ShapeById($Deck, $Target) {
  $slide = $Deck.Slides.Item([int]$Target.Slide)
  foreach ($shape in @($slide.Shapes)) { if ([int]$shape.Id -eq [int]$Target.Shape) { return $shape } }
  throw "The edited object could not be resolved after reopen."
}
function Set-SmartArtMarker($Shape) {
  $nodes = $Shape.SmartArt.AllNodes
  for ($nodeIndex = 1; $nodeIndex -le $nodes.Count; $nodeIndex++) {
    $node = $nodes.Item($nodeIndex)
    try {
      $nodeShapes = $node.Shapes
      for ($shapeIndex = 1; $shapeIndex -le $nodeShapes.Count; $shapeIndex++) {
        $nodeShape = $nodeShapes.Item($shapeIndex)
        try {
          if ($nodeShape.TextFrame2.HasText -eq $msoTrue) {
            $nodeShape.TextFrame2.TextRange.Text = ([string]$nodeShape.TextFrame2.TextRange.Text) + $marker
            return
          }
        } finally { Release-Com $nodeShape }
      }
    } finally { Release-Com $node }
  }
  throw "The SmartArt contains no editable text node."
}
function Test-SmartArtMarker($Shape) {
  $nodes = $Shape.SmartArt.AllNodes
  for ($nodeIndex = 1; $nodeIndex -le $nodes.Count; $nodeIndex++) {
    $node = $nodes.Item($nodeIndex)
    try {
      $nodeShapes = $node.Shapes
      for ($shapeIndex = 1; $shapeIndex -le $nodeShapes.Count; $shapeIndex++) {
        $nodeShape = $nodeShapes.Item($shapeIndex)
        try { if (([string]$nodeShape.TextFrame2.TextRange.Text).Contains($marker)) { return $true } }
        catch {} finally { Release-Com $nodeShape }
      }
    } finally { Release-Com $node }
  }
  return $false
}
function Apply-Edit($Deck, $Target) {
  $shape = Get-ShapeById $Deck $Target
  try {
    if ($Target.Kind -eq "smartart-text") {
      Set-SmartArtMarker $shape
    } elseif ($Target.Kind -eq "shape-text") {
      $shape.TextFrame2.TextRange.Text = ([string]$shape.TextFrame2.TextRange.Text) + $marker
    } else {
      $shape.Left = [single]($shape.Left + 1.0)
    }
  } finally { Release-Com $shape }
}
function Verify-Edit($Deck, $Target) {
  $shape = Get-ShapeById $Deck $Target
  try {
    if ($Target.Kind -eq "smartart-text") {
      return (Test-SmartArtMarker $shape)
    }
    if ($Target.Kind -eq "shape-text") { return ([string]$shape.TextFrame2.TextRange.Text).Contains($marker) }
    return ([Math]::Abs(([double]$shape.Left - [double]$Target.ExpectedLeft)) -le 0.05)
  } finally { Release-Com $shape }
}

try {
  $mutex = New-Object System.Threading.Mutex($false, "Local\SlideclonePowerPointOpenGate")
  $held = $mutex.WaitOne(210000)
  if (-not $held) { throw "Timed out waiting for the PowerPoint COM validation lock." }
  $manifest = Get-Content -LiteralPath $ManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $app = New-Object -ComObject PowerPoint.Application
  Start-Sleep -Milliseconds 2000
  foreach ($case in @($manifest.cases)) {
    $deck = $null; $reopened = $null
    $source = [string]$case.file
    $staging = Join-Path ([string]$manifest.stagingRoot) (([Guid]::NewGuid().ToString("N")) + ".pptx")
    $edited = Join-Path ([string]$manifest.stagingRoot) (([Guid]::NewGuid().ToString("N")) + ".edited.pptx")
    try {
      Copy-Item -LiteralPath $source -Destination $staging -Force
      $deck = Open-Deck $staging
      $target = Find-TargetWithRetry $deck ([string]$case.mode)
      Apply-Edit $deck $target
      $deck.SaveCopyAs($edited, $ppSaveAsOpenXMLPresentation)
      Start-Sleep -Milliseconds 1200
      $deck.Saved = $msoTrue; $deck.Close(); Release-Com $deck; $deck = $null
      Start-Sleep -Milliseconds 800
      $reopened = Open-Deck $edited
      if (-not (Verify-Edit $reopened $target)) { throw "The edit did not survive PowerPoint save and reopen." }
      $results += [pscustomobject]@{ file=$source; mode=[string]$case.mode; editedKind=[string]$target.Kind; opened=$true; saved=$true; reopened=$true; verified=$true }
    } catch {
      $results += [pscustomobject]@{ file=$source; mode=[string]$case.mode; opened=($null -ne $deck); saved=(Test-Path -LiteralPath $edited); reopened=($null -ne $reopened); verified=$false; error=$_.Exception.Message }
    } finally {
      if ($null -ne $reopened) { try { $reopened.Saved=$msoTrue; $reopened.Close() } catch {}; Release-Com $reopened }
      if ($null -ne $deck) { try { $deck.Saved=$msoTrue; $deck.Close() } catch {}; Release-Com $deck }
    }
  }
} catch {
  $results += [pscustomobject]@{ opened=$false; saved=$false; reopened=$false; verified=$false; error=$_.Exception.Message }
} finally {
  if ($null -ne $app) { try { $app.Quit() } catch {}; Release-Com $app }
  if ($held -and $null -ne $mutex) { try { $mutex.ReleaseMutex() } catch {} }
  if ($null -ne $mutex) { $mutex.Dispose() }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
$failed = @($results | Where-Object { $_.verified -ne $true }).Count
$report = [pscustomobject]@{ provider="powerpoint-editable-roundtrip-v1"; passed=($failed -eq 0 -and $results.Count -gt 0); failed=$failed; results=$results }
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportFile -Encoding UTF8
if (-not $report.passed) { exit 1 }
`;
}

module.exports = { editableRoundTripScript, normalizeCases, validatePowerPointEditableRoundTrip };
