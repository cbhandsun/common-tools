"use strict";

const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");
const { cropRegions } = require("../lib/region-proposal");

async function normalizePowerPointCom(input, context = {}) {
  const normalizedDir = path.join(input.outputDir, "normalized");
  fs.mkdirSync(normalizedDir, { recursive: true });

  const files = fs.existsSync(input.inputDir)
    ? fs.readdirSync(input.inputDir)
      .map((name) => path.resolve(input.inputDir, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }))
    : [];

  const pageImages = [];
  const reports = [];
  const warnings = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      const target = path.join(normalizedDir, `${String(pageImages.length + 1).padStart(3, "0")}${ext}`);
      fs.copyFileSync(file, target);
      pageImages.push({ sourceImage: target, originalSource: file, sourceKind: "image", ...readImageSize(target) });
      continue;
    }
    if ([".ppt", ".pptx"].includes(ext)) {
      const exportResult = await exportPresentation(file, normalizedDir, pageImages.length, context);
      pageImages.push(...exportResult.pageImages);
      reports.push(exportResult.report);
      continue;
    }
    warnings.push(`Skipped unsupported input for normalize-powerpoint-com: ${file}`);
  }

  const reportFile = path.join(input.outputDir, "reports", "pptx-normalize-report.json");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify({ provider: "normalize-powerpoint-com", reports, warnings }, null, 2)}\n`, "utf8");

  return {
    ok: true,
    data: {
      provider: "normalize-powerpoint-com",
      pageImages,
      normalizedDir,
      reportFile,
      reports,
      warnings
    }
  };
};

async function exportPresentation(file, normalizedDir, startIndex, context) {
  const staging = createPowerPointStaging(file);
  const exportDir = staging.exportDir;
  const scriptFile = staging.scriptFile;
  const reportFile = staging.reportFile;
  fs.mkdirSync(staging.root, { recursive: true });
  fs.mkdirSync(exportDir, { recursive: true });
  fs.copyFileSync(file, staging.inputFile);
  fs.writeFileSync(scriptFile, powerPointExportScript(), "utf8");

  const exportWidth = context.config?.normalize?.exportWidthPx || 1920;
  const exportHeight = context.config?.normalize?.exportHeightPx || 1080;
  const maxPages = Number(context.config?.normalize?.maxPages || 0);
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptFile,
    "-PptxFile",
    staging.inputFile,
    "-OutputDir",
    exportDir,
    "-ReportFile",
    reportFile,
    "-ExportWidth",
    String(exportWidth),
    "-ExportHeight",
    String(exportHeight),
    "-MaxPages",
    String(Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : 0)
  ]);

  try {
    const slideReport = JSON.parse(stripBom(fs.readFileSync(reportFile, "utf8")));
    const exported = fs.readdirSync(exportDir)
      .filter((name) => /^slide-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const regionsDir = path.join(normalizedDir, "regions");
    fs.mkdirSync(regionsDir, { recursive: true });
    const regionOptions = context.config?.regionProposal || {};
    const includeFullPage = regionOptions.includeFullPage !== false;
    const emitRegionPages = regionOptions.emitRegionPages === true || !includeFullPage;
    const regionReports = [];
    const pageImages = [];
    exported.forEach((name, index) => {
      const source = path.join(exportDir, name);
      const target = path.join(normalizedDir, `${String(startIndex + index + 1).padStart(3, "0")}.png`);
      fs.rmSync(target, { force: true });
      fs.copyFileSync(source, target);
    const slide = slideReport.slides[index] || {};
    const crops = cropRegions(target, regionsDir, regionOptions);
    const regionProposals = crops.map(({ sourceImage, originalSource, widthPx, heightPx, ...region }) => ({
      ...region,
      cropImage: sourceImage,
      widthPx,
      heightPx
    }));
    regionReports.push({
      sourceImage: target,
      sourceSlideIndex: index,
      sourceSlideNumber: index + 1,
      regions: regionProposals
    });
    if (includeFullPage) {
      pageImages.push({
        sourceImage: target,
        originalSource: file,
        sourceKind: "pptx-slide-render",
        sourceSlideIndex: index,
        sourceSlideNumber: index + 1,
        imageOnly: Boolean(slide.imageOnly),
        slideShapeCount: slide.shapeCount,
        slidePictureCount: slide.pictureCount,
        slideTextBoxCount: slide.textBoxCount,
        regionRole: "full-page",
        regionProposals,
        ...readImageSize(target)
      });
    }
    if (!emitRegionPages) return;
    crops.forEach((crop) => {
      pageImages.push({
        sourceImage: crop.sourceImage,
        originalSource: crop.originalSource,
        sourceKind: "pptx-slide-region",
        sourceSlideIndex: index,
        sourceSlideNumber: index + 1,
        regionRole: crop.type,
        regionBox: crop.box,
        regionConfidence: crop.confidence,
        widthPx: crop.widthPx,
        heightPx: crop.heightPx
      });
    });
    });

    if (!includeFullPage) {
      exported.forEach((name, index) => {
        const slide = slideReport.slides[index] || {};
        if ((regionReports[index]?.regions || []).length > 0) return;
        const target = path.join(normalizedDir, `${String(startIndex + index + 1).padStart(3, "0")}.png`);
        pageImages.push({
          sourceImage: target,
          originalSource: file,
          sourceKind: "pptx-slide-render",
          sourceSlideIndex: index,
          sourceSlideNumber: index + 1,
          imageOnly: Boolean(slide.imageOnly),
          slideShapeCount: slide.shapeCount,
          slidePictureCount: slide.pictureCount,
          slideTextBoxCount: slide.textBoxCount,
          regionRole: "full-page-fallback",
          regionProposals: [],
          ...readImageSize(target)
        });
      });
    }

    return {
      pageImages,
      report: {
        source: file,
        exportDir: normalizedDir,
        reportFile: path.join(normalizedDir, `${staging.id}.slides.json`),
        slideCount: slideReport.slideCount,
        exportedSlideCount: slideReport.exportedSlideCount ?? (slideReport.slides || []).length,
        imageOnlySlideCount: (slideReport.slides || []).filter((slide) => slide.imageOnly).length,
        slides: slideReport.slides || [],
        regionReports
      }
    };
  } finally {
    if (process.env.SLIDECLONE_KEEP_POWERPOINT_STAGING !== "1") {
      fs.rmSync(staging.root, { recursive: true, force: true });
    }
  }
}

function createPowerPointStaging(file) {
  const source = path.resolve(file);
  const sourceId = crypto.createHash("sha256").update(source.toLowerCase()).digest("hex").slice(0, 16);
  const parent = path.join(resolveAsciiTempRoot(), "slideclone-powerpoint-com");
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, `pptx-${sourceId}-`));
  const id = path.basename(root);
  return {
    id,
    root,
    inputFile: path.join(root, "input.pptx"),
    exportDir: path.join(root, "export"),
    scriptFile: path.join(root, "export-presentation.ps1"),
    reportFile: path.join(root, "slides.json")
  };
}

function resolveAsciiTempRoot() {
  const preferred = path.resolve(os.tmpdir());
  if (/^[\x00-\x7F]+$/.test(preferred)) return preferred;
  const fallback = path.resolve("C:\\Temp");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value;
}

function powerPointExportScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$PptxFile,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [Parameter(Mandatory=$true)][string]$ReportFile,
  [Parameter(Mandatory=$true)][int]$ExportWidth,
  [Parameter(Mandatory=$true)][int]$ExportHeight,
  [int]$MaxPages = 0
)
$ErrorActionPreference = "Stop"
$msoTrue = -1
$msoFalse = 0
$msoPicture = 13
$msoTextBox = 17
$app = $null
$presentation = $null
try {
  for ($appAttempt = 1; $appAttempt -le 4; $appAttempt++) {
    try {
      Start-Sleep -Milliseconds (300 * $appAttempt)
      $app = New-Object -ComObject PowerPoint.Application
      if ($app -ne $null) { break }
    }
    catch {
      if ($appAttempt -eq 4) { throw }
      Start-Sleep -Milliseconds (600 * $appAttempt)
    }
  }
  if ($app -eq $null) { throw "PowerPoint.Application COM object is null." }
  try { $app.DisplayAlerts = 1 } catch {}
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      Start-Sleep -Milliseconds (250 * $attempt)
      $presentation = $app.Presentations.Open($PptxFile, $msoTrue, $msoFalse, $msoFalse)
      break
    }
    catch {
      if ($attempt -eq 4) { throw }
      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
  if ($presentation -eq $null) { throw "PowerPoint returned null while opening the presentation." }
  # PowerPoint may still be initializing add-ins or layout after Open. Give it
  # a bounded retry window instead of treating RPC_E_CALL_REJECTED as corruption.
  Start-Sleep -Milliseconds 800
  $slides = @()
  $presentationSlideCount = 0
  for ($slidesAttempt = 1; $slidesAttempt -le 12; $slidesAttempt++) {
    try {
      $presentationSlideCount = [int]$presentation.Slides.Count
      if ($presentationSlideCount -gt 0) { break }
    }
    catch [System.Runtime.InteropServices.COMException] {
      if ($slidesAttempt -eq 12) { throw }
    }
    Start-Sleep -Milliseconds (400 * $slidesAttempt)
  }
  if ($presentationSlideCount -le 0) { throw "PowerPoint opened the presentation but did not load any slides." }
  $slideLimit = $presentationSlideCount
  if ($MaxPages -gt 0) { $slideLimit = [Math]::Min($slideLimit, $MaxPages) }
  for ($i = 1; $i -le $slideLimit; $i++) {
    $slide = $presentation.Slides.Item($i)
    $out = Join-Path $OutputDir ("slide-{0}.png" -f $i)
    $exported = $false
    for ($exportAttempt = 1; $exportAttempt -le 6; $exportAttempt++) {
      try {
        if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue }
        $slide.Export($out, "PNG", $ExportWidth, $ExportHeight)
        for ($writeAttempt = 1; $writeAttempt -le 10; $writeAttempt++) {
          if ((Test-Path -LiteralPath $out) -and ((Get-Item -LiteralPath $out).Length -gt 0)) {
            $exported = $true
            break
          }
          Start-Sleep -Milliseconds 200
        }
        if ($exported) { break }
      }
      catch [System.Runtime.InteropServices.COMException] {
        if ($exportAttempt -eq 6) { throw }
        Start-Sleep -Milliseconds (400 * $exportAttempt)
      }
    }
    if (-not $exported) { throw "PowerPoint did not export a non-empty PNG for slide $i." }
    $shapeCount = $slide.Shapes.Count
    $pictureCount = 0
    $textBoxCount = 0
    $largePictureCount = 0
    for ($j = 1; $j -le $shapeCount; $j++) {
      $shape = $slide.Shapes.Item($j)
      if ($shape.Type -eq $msoPicture) {
        $pictureCount += 1
        $areaRatio = 0
        if (($presentation.PageSetup.SlideWidth * $presentation.PageSetup.SlideHeight) -gt 0) {
          $areaRatio = ($shape.Width * $shape.Height) / ($presentation.PageSetup.SlideWidth * $presentation.PageSetup.SlideHeight)
        }
        if ($areaRatio -ge 0.72) { $largePictureCount += 1 }
      }
      if ($shape.Type -eq $msoTextBox -or $shape.HasTextFrame) {
        try {
          if ($shape.HasTextFrame -and $shape.TextFrame.HasText) { $textBoxCount += 1 }
        } catch {}
      }
    }
    $imageOnly = ($shapeCount -le 2 -and $largePictureCount -ge 1 -and $textBoxCount -eq 0)
    $slides += [PSCustomObject]@{
      slideIndex = $i - 1
      slideNumber = $i
      shapeCount = $shapeCount
      pictureCount = $pictureCount
      textBoxCount = $textBoxCount
      largePictureCount = $largePictureCount
      imageOnly = $imageOnly
      exportedImage = $out
    }
  }
  $json = [PSCustomObject]@{
    source = $PptxFile
    slideCount = $presentationSlideCount
    exportedSlideCount = $slideLimit
    exportWidth = $ExportWidth
    exportHeight = $ExportHeight
    slides = $slides
  } | ConvertTo-Json -Depth 6
  if ($PSVersionTable.PSVersion.Major -ge 6) {
    Set-Content -Encoding utf8NoBOM -Path $ReportFile -Value $json
  } else {
    [System.IO.File]::WriteAllText($ReportFile, $json, [System.Text.UTF8Encoding]::new($false))
  }
}
finally {
  if ($presentation -ne $null) {
    try { $presentation.Close() | Out-Null } catch { Write-Verbose $_.Exception.Message }
  }
  if ($app -ne $null) {
    try { $app.Quit() | Out-Null } catch { Write-Verbose $_.Exception.Message }
  }
}
`;
}

normalizePowerPointCom._private = {
  createPowerPointStaging,
  powerPointExportScript,
  resolveAsciiTempRoot
};

module.exports = normalizePowerPointCom;
