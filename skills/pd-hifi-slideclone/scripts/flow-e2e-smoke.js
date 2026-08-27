#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { writePng } = require("./lib/png");

const skillRoot = path.resolve(__dirname, "..");
const slidecloneScript = path.join(skillRoot, "scripts", "slideclone.js");
const visionFlowDiagramRules = require(path.join(skillRoot, "scripts", "adapters", "vision-flow-diagram-rules.js"));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = normalizeProfile(args.profile || args["quality-profile"] || "fast-batch");
  const defaults = profileDefaults(profile);
  const pageCount = parsePositiveInt(args.pages || args["page-count"], 1);
  const suffix = [
    "flow-e2e-smoke",
    profile,
    args["font-fit"] === true ? "fontfit" : null,
    args["container-style-fit"] === true ? "stylefit" : null
  ].filter(Boolean).join("-");
  const outputRoot = path.resolve(args.out || path.join(process.cwd(), "runs", suffix));
  const seedDir = path.join(outputRoot, "seed");
  const pipelineDir = path.join(outputRoot, "pipeline");
  const inputDir = path.join(outputRoot, "input");
  ensureDir(seedDir);
  ensureDir(pipelineDir);
  ensureDir(inputDir);

  const seedPage = path.join(seedDir, "seed-page.png");
  const uiCrop = path.join(seedDir, "ui-screenshot.png");
  const docCrop = path.join(seedDir, "doc-screenshot.png");
  writePng(seedPage, makeCanvas(2667, 1488, [255, 255, 255, 255]));
  writePng(uiCrop, makeUiCrop(488, 604));
  writePng(docCrop, makeDocCrop(536, 604));

  const regionProposals = [
    {
      type: "embedded-ui-screenshot",
      box: { x: 1090, y: 590, w: 420, h: 520 },
      containerBox: { x: 1056, y: 536, w: 488, h: 604 },
      cropImage: uiCrop,
      confidence: 0.95,
      strategy: "smoke-seed"
    },
    {
      type: "embedded-document-screenshot",
      box: { x: 1592, y: 590, w: 470, h: 520 },
      containerBox: { x: 1560, y: 536, w: 536, h: 604 },
      cropImage: docCrop,
      confidence: 0.95,
      strategy: "smoke-seed"
    }
  ];

  const slideSize = { widthPt: 960, heightPt: 540 };
  const renderedSources = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageSeed = path.join(seedDir, `seed-page-${String(pageIndex + 1).padStart(3, "0")}.png`);
    fs.copyFileSync(seedPage, pageSeed);
    const pageRegionProposals = regionProposals.map((proposal) => ({ ...proposal }));
    const visionResult = await visionFlowDiagramRules({
      pageIndex,
      sourceImage: pageSeed,
      page: {
        sourceImage: pageSeed,
        widthPx: 2667,
        heightPx: 1488,
        regionProposals: pageRegionProposals
      },
      slideSize
    }, {
      outputDir: outputRoot,
      config: {},
      skillRoot
    });
    if (visionResult?.ok !== true) throw new Error(visionResult?.error || "vision-flow-diagram-rules returned non-ok");
    const sourceIr = {
      version: "1.0",
      slideSize,
      pages: [{
        pageIndex: 0,
        sourceImage: pageSeed,
        background: visionResult.data.background || { fill: "#FFFFFF" },
        textBoxes: visionResult.data.textBoxes || [],
        shapes: visionResult.data.shapes || [],
        images: visionResult.data.images || [],
        tables: [],
        charts: [],
        icons: []
      }]
    };
    const renderedSource = path.join(seedDir, `source-page-${String(pageIndex + 1).padStart(3, "0")}.png`);
    renderSyntheticSource(sourceIr, renderedSource);
    if (!fs.existsSync(renderedSource)) throw new Error("Synthetic source render did not produce source-page.png.");
    const inputPage = path.join(inputDir, `page-${String(pageIndex + 1).padStart(3, "0")}.png`);
    fs.copyFileSync(renderedSource, inputPage);
    renderedSources.push(renderedSource);
  }

  const configFile = path.join(outputRoot, "flow-e2e-smoke.config.json");
  writeJson(configFile, createPipelineConfig({
    inputDir,
    outputDir: pipelineDir,
    profile,
    enableFontFit: args["font-fit"] === true,
    enableContainerStyleFit: args["container-style-fit"] === true,
    fontFitMaxTrialsPerRole: parsePositiveInt(args["font-fit-max-trials-per-role"], defaults.fontFitMaxTrialsPerRole),
    containerStyleFitMaxTrialsPerTarget: parseNonNegativeInt(args["container-style-fit-max-trials-per-target"], defaults.containerStyleFitMaxTrialsPerTarget)
  }));

  const runResult = spawnSync(process.execPath, [slidecloneScript, "run", "--config", configFile], {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (runResult.status !== 0) {
    throw new Error(`slideclone run failed.\nSTDOUT:\n${runResult.stdout || ""}\nSTDERR:\n${runResult.stderr || ""}`);
  }

  const deliverySummaryFile = path.join(pipelineDir, "reports", "delivery-summary.json");
  const deliverySummary = JSON.parse(fs.readFileSync(deliverySummaryFile, "utf8"));
  const summary = {
    provider: "flow-e2e-smoke",
    profile,
    pageCount,
    seedSourcePng: renderedSources[0] || null,
    seedSourcePngs: renderedSources,
    inputDir,
    configFile,
    deliverySummaryFile,
    status: deliverySummary.status,
    passed: deliverySummary.passed,
    metrics: deliverySummary.metrics,
    checks: deliverySummary.checks,
    fontFit: deliverySummary.fontFit,
    containerStyleFit: deliverySummary.containerStyleFit,
    artifacts: deliverySummary.artifacts
  };
  const reportFile = path.join(outputRoot, "reports", "flow-e2e-smoke.summary.json");
  writeJson(reportFile, summary);
  process.stdout.write(`${JSON.stringify({ passed: summary.passed, status: summary.status, reportFile }, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeProfile(value) {
  const profile = String(value || "").trim().toLowerCase();
  if (profile === "deep" || profile === "deep-polish") return "deep-polish";
  if (profile === "balanced" || profile === "quality") return "balanced";
  return "fast-batch";
}

function profileDefaults(profile) {
  if (profile === "deep-polish") {
    return {
      fontFitMaxTrialsPerRole: 4,
      containerStyleFitMaxTrialsPerTarget: 4,
      fastRankPreselectOnly: false,
      verifyCompressed: true,
      containerFitEnabledByDefault: true
    };
  }
  if (profile === "balanced") {
    return {
      fontFitMaxTrialsPerRole: 2,
      containerStyleFitMaxTrialsPerTarget: 1,
      fastRankPreselectOnly: true,
      verifyCompressed: true,
      containerFitEnabledByDefault: true
    };
  }
  return {
    fontFitMaxTrialsPerRole: 1,
    containerStyleFitMaxTrialsPerTarget: 1,
    fastRankPreselectOnly: true,
    verifyCompressed: true,
    containerFitEnabledByDefault: false
  };
}

function createPipelineConfig({
  inputDir,
  outputDir,
  profile,
  enableFontFit,
  enableContainerStyleFit,
  fontFitMaxTrialsPerRole,
  containerStyleFitMaxTrialsPerTarget
}) {
  const defaults = profileDefaults(profile);
  return {
    inputDir,
    outputDir,
    pagePattern: "*.png",
    slide: {
      widthPt: 960,
      heightPt: 540
    },
    adapters: {
      normalize: "scripts/adapters/normalize-regions.js",
      ocr: "scripts/adapters/ocr-placeholder.js",
      vision: "scripts/adapters/vision-flow-diagram-rules.js",
      pptx: "scripts/adapters/pptx-python-pptx.js",
      render: "scripts/adapters/render-powerpoint-com.js",
      diff: "scripts/adapters/diff-pixel-png.js",
      compare: "scripts/adapters/compare-placeholder.js",
      polish: "scripts/adapters/polish-flow-diagram-rules.js",
      compress: "scripts/adapters/compress-pptx-media.js"
    },
    regionProposal: {
      includeFullPage: true,
      emitRegionPages: false,
      cropContainer: false,
      minConfidence: 0.45,
      minAreaRatio: 0.035,
      maxAreaRatio: 0.72,
      paddingPx: 4,
      innerPaddingPx: 4,
      innerHeaderSkipRatio: 0.18
    },
    thresholds: {
      pixelDiffRatio: 0.08,
      foregroundMissingRatio: 0.12,
      layoutMeanIoU: 0.86,
      textCoverage: 0.95,
      maxCriticalOffsetPt: 8,
      maxOutOfBoundsPt: 1,
      maxImageAspectRatioDelta: 0.03,
      maxRasterImageAreaRatio: 0.25
    },
    powerPoint: {
      cleanupHidden: true,
      exportTimeoutMs: 60000
    },
    compress: {
      jpegQuality: 88,
      pngCompressLevel: 9,
      maxImagePixels: 0,
      minSavingBytes: 128
    },
    diff: {
      foregroundTolerancePx: 2,
      foregroundToleranceDelta: 54
    },
    fontFit: {
      enabled: enableFontFit === true,
      mode: "role-greedy",
      maxTrialsPerRole: fontFitMaxTrialsPerRole,
      fastRank: {
        enabled: true,
        topN: fontFitMaxTrialsPerRole,
        preselectOnly: defaults.fastRankPreselectOnly
      },
      candidates: ["Microsoft YaHei", "SimHei"],
      onlyRoles: ["title", "banner", "card-title", "button"],
      roleOrder: ["title", "banner", "card-title", "button"],
      roleCandidates: {
        title: { sizeAdjustPt: [-1, 0, 1], weights: ["bold"] },
        banner: { sizeAdjustPt: [-1, 0, 1], weights: ["bold"] },
        "card-title": { sizeAdjustPt: [-0.5, 0, 0.5], weights: ["bold"] },
        button: { sizeAdjustPt: [-0.5, 0, 0.5], weights: ["bold", "regular"] }
      }
    },
    containerStyleFit: {
      enabled: enableContainerStyleFit === true || defaults.containerFitEnabledByDefault === true,
      mode: "container-greedy",
      maxTrialsPerTarget: containerStyleFitMaxTrialsPerTarget,
      targetIds: ["banner", "ui-card", "portal-button"],
      kindCandidates: {
        banner: { radiusRatio: [0.03, 0.035], shadowAlpha: [0.11, 0.13], shadowBlurPt: [3.8], shadowDistancePt: [1.0], shadowAngleDeg: [45] },
        card: { radiusRatio: [0.05, 0.06], shadowAlpha: [0.14, 0.16], shadowBlurPt: [4.2], shadowDistancePt: [1.3], shadowAngleDeg: [45] },
        "strong-card": { radiusRatio: [0.05, 0.055], shadowAlpha: [0.18, 0.2], shadowBlurPt: [4.6], shadowDistancePt: [1.6], shadowAngleDeg: [45] }
      }
    },
    textOcr: {
      enabled: true,
      adapter: "scripts/adapters/ocr-paddleocr-local.js",
      mode: "anchored",
      paddingPt: 16,
      upscale: 1,
      psm: 6,
      preprocess: false
    },
    umiOcr: {
      paddleBin: "C:\\Program Files\\Umi-OCR_Paddle_v2.1.5\\UmiOCR-data\\plugins\\win7_x64_PaddleOCR-json\\PaddleOCR-json.exe",
      initTimeoutMs: 60000
    },
    textMicroAdjust: {
      enabled: true,
      minCoverage: 0.995,
      paddingPt: 16,
      maxMovePt: 3,
      maxHeightAdjustPt: 2.5,
      minDeltaPt: 0.15
    },
    maxIterations: 1,
    postprocess: {
      compare: true,
      polish: true,
      compress: true,
      verifyCompressed: defaults.verifyCompressed,
      stopWhenThresholdPassed: true
    }
  };
}

function makeCanvas(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  fillRect({ rgba, width, height }, 0, 0, width, height, color);
  return { width, height, rgba };
}

function makeUiCrop(width, height) {
  const image = makeCanvas(width, height, [246, 248, 251, 255]);
  fillRect(image, 0, 0, width, 54, [34, 116, 200, 255]);
  fillRect(image, 24, 86, width - 48, 44, [255, 255, 255, 255]);
  fillRect(image, 24, 150, width - 48, 160, [255, 255, 255, 255]);
  fillRect(image, 24, 340, width - 48, 220, [255, 255, 255, 255]);
  strokeRect(image, 24, 86, width - 48, 44, [210, 217, 222, 255]);
  strokeRect(image, 24, 150, width - 48, 160, [210, 217, 222, 255]);
  strokeRect(image, 24, 340, width - 48, 220, [210, 217, 222, 255]);
  fillRect(image, width - 140, 20, 92, 16, [124, 200, 255, 255]);
  return image;
}

function makeDocCrop(width, height) {
  const image = makeCanvas(width, height, [255, 255, 255, 255]);
  fillRect(image, 0, 0, width, 44, [240, 243, 246, 255]);
  fillRect(image, 34, 90, width - 68, 14, [64, 64, 64, 255]);
  fillRect(image, 34, 132, width - 120, 10, [110, 110, 110, 255]);
  fillRect(image, 34, 160, width - 96, 10, [110, 110, 110, 255]);
  fillRect(image, 34, 188, width - 140, 10, [110, 110, 110, 255]);
  fillRect(image, 34, 244, width - 68, 220, [248, 250, 252, 255]);
  strokeRect(image, 34, 244, width - 68, 220, [210, 217, 222, 255]);
  return image;
}

function fillRect(image, x, y, w, h, rgba) {
  for (let row = Math.max(0, y); row < Math.min(image.height, y + h); row += 1) {
    for (let col = Math.max(0, x); col < Math.min(image.width, x + w); col += 1) {
      const offset = (row * image.width + col) * 4;
      image.rgba[offset] = rgba[0];
      image.rgba[offset + 1] = rgba[1];
      image.rgba[offset + 2] = rgba[2];
      image.rgba[offset + 3] = rgba[3];
    }
  }
}

function strokeRect(image, x, y, w, h, rgba) {
  fillRect(image, x, y, w, 2, rgba);
  fillRect(image, x, y + h - 2, w, 2, rgba);
  fillRect(image, x, y, 2, h, rgba);
  fillRect(image, x + w - 2, y, 2, h, rgba);
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderSyntheticSource(ir, outFile) {
  const irFile = path.join(path.dirname(outFile), "synthetic-source.ir.json");
  const scriptFile = path.join(path.dirname(outFile), "render-synthetic-source.ps1");
  writeJson(irFile, ir);
  fs.writeFileSync(scriptFile, syntheticRenderScript(), "utf8");
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptFile,
    "-IrFile",
    irFile,
    "-OutFile",
    outFile
  ], {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`Synthetic source render failed.\nSTDOUT:\n${result.stdout || ""}\nSTDERR:\n${result.stderr || ""}`);
  }
}

function syntheticRenderScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$IrFile,
  [Parameter(Mandatory=$true)][string]$OutFile
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function ColorFromHex([string]$hex, [int]$alpha = 255) {
  $value = if ([string]::IsNullOrWhiteSpace($hex)) { "000000" } else { $hex.Trim().TrimStart('#') }
  if ($value.Length -ne 6) { $value = "000000" }
  return [System.Drawing.Color]::FromArgb($alpha, [Convert]::ToInt32($value.Substring(0,2),16), [Convert]::ToInt32($value.Substring(2,2),16), [Convert]::ToInt32($value.Substring(4,2),16))
}

function New-RoundedPath($x, $y, $w, $h, $radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Max(2, [int]([Math]::Round($radius * 2)))
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $w - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $w - $diameter, $y + $h - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $h - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$deckJson = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($IrFile))
$deck = $deckJson | ConvertFrom-Json
$page = $deck.pages[0]
$width = 2667
$height = 1488
$slideWidth = [double]$deck.slideSize.widthPt
$slideHeight = [double]$deck.slideSize.heightPt
$scaleX = $width / $slideWidth
$scaleY = $height / $slideHeight
$unitScale = [Math]::Min($scaleX, $scaleY)
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$bgFill = if ($page.background -and $page.background.fill) { [string]$page.background.fill } else { "#FFFFFF" }
$g.Clear((ColorFromHex $bgFill))

foreach ($shape in $page.shapes) {
  $box = $shape.box
  $x = [single]([double]$box.x * $scaleX)
  $y = [single]([double]$box.y * $scaleY)
  $w = [single]([double]$box.w * $scaleX)
  $h = [single]([double]$box.h * $scaleY)
  $style = $shape.style
  $fill = if ($style.fill -and $style.fill -ne "none") { New-Object System.Drawing.SolidBrush (ColorFromHex $style.fill) } else { $null }
  $strokeColor = if ($style.stroke -and $style.stroke -ne "none") { ColorFromHex $style.stroke } else { $null }
  $strokeWidthPt = if ($null -ne $style.strokeWidthPt) { [double]$style.strokeWidthPt } else { 1.5 }
  $pen = if ($strokeColor) { New-Object System.Drawing.Pen $strokeColor, ([single]($strokeWidthPt * $unitScale)) } else { $null }
  if ($shape.type -eq "rounded-rect") {
    $radiusRatio = if ($null -ne $style.radiusRatio) { [double]$style.radiusRatio } else { 0.05 }
    $radius = [Math]::Max(4, [single]$radiusRatio * [Math]::Min($w, $h) * 1.9)
    $path = New-RoundedPath $x $y $w $h $radius
    if ($style.shadow) {
      $shadowAlphaValue = if ($null -ne $style.shadow.alpha) { [double]$style.shadow.alpha } else { 0.18 }
      $shadowColorValue = if ($style.shadow.color) { [string]$style.shadow.color } else { "#000000" }
      $shadowAngleDeg = if ($null -ne $style.shadow.angleDeg) { [double]$style.shadow.angleDeg } else { 45 }
      $shadowDistancePt = if ($null -ne $style.shadow.distancePt) { [double]$style.shadow.distancePt } else { 1.5 }
      $shadowAlpha = [int]([Math]::Round($shadowAlphaValue * 255))
      $shadowBrush = New-Object System.Drawing.SolidBrush (ColorFromHex $shadowColorValue $shadowAlpha)
      $shadowDx = [single]([Math]::Cos($shadowAngleDeg * [Math]::PI / 180.0) * ($shadowDistancePt * $unitScale))
      $shadowDy = [single]([Math]::Sin($shadowAngleDeg * [Math]::PI / 180.0) * ($shadowDistancePt * $unitScale))
      $shadowPath = New-RoundedPath ($x + $shadowDx) ($y + $shadowDy) $w $h $radius
      $g.FillPath($shadowBrush, $shadowPath)
      $shadowBrush.Dispose()
      $shadowPath.Dispose()
    }
    if ($fill) { $g.FillPath($fill, $path) }
    if ($pen) { $g.DrawPath($pen, $path) }
    $path.Dispose()
  } elseif ($shape.type -eq "line") {
    if ($pen) {
      if ($style.endArrow) { $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::ArrowAnchor }
      $g.DrawLine($pen, $x, $y, $x + $w, $y + $h)
    }
  } else {
    if ($fill) { $g.FillRectangle($fill, $x, $y, $w, $h) }
    if ($pen) { $g.DrawRectangle($pen, $x, $y, $w, $h) }
  }
  if ($fill) { $fill.Dispose() }
  if ($pen) { $pen.Dispose() }
}

foreach ($image in $page.images) {
  if (-not $image.assetPath) { continue }
  if ([System.IO.Path]::IsPathRooted($image.assetPath)) {
    $asset = $image.assetPath
  } else {
    $asset = Join-Path (Split-Path -Parent $IrFile) $image.assetPath
  }
  if (-not (Test-Path $asset)) { continue }
  $bitmap = [System.Drawing.Image]::FromFile($asset)
  try {
    $box = $image.box
    $g.DrawImage($bitmap, [single]([double]$box.x * $scaleX), [single]([double]$box.y * $scaleY), [single]([double]$box.w * $scaleX), [single]([double]$box.h * $scaleY))
  }
  finally {
    $bitmap.Dispose()
  }
}

foreach ($textBox in $page.textBoxes) {
  $fontInfo = $textBox.font
  $family = if ($fontInfo.family) { [string]$fontInfo.family } else { "Microsoft YaHei" }
  $weightValue = if ($fontInfo.weight) { [string]$fontInfo.weight } else { "" }
  $style = if ($weightValue.ToLower() -eq "bold") { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $fontSizePt = if ($null -ne $fontInfo.sizePt) { [double]$fontInfo.sizePt } else { 14 }
  $fontSize = [single]($fontSizePt * $unitScale)
  $font = New-Object System.Drawing.Font($family, $fontSize, $style)
  $fontColor = if ($fontInfo.color) { [string]$fontInfo.color } else { "#111111" }
  $brush = New-Object System.Drawing.SolidBrush (ColorFromHex $fontColor)
  $format = New-Object System.Drawing.StringFormat
  $alignValue = if ($fontInfo.align) { [string]$fontInfo.align } else { "" }
  if ($alignValue.ToLower() -eq "center") { $format.Alignment = [System.Drawing.StringAlignment]::Center }
  elseif ($alignValue.ToLower() -eq "right") { $format.Alignment = [System.Drawing.StringAlignment]::Far }
  else { $format.Alignment = [System.Drawing.StringAlignment]::Near }
  $valignValue = if ($fontInfo.valign) { [string]$fontInfo.valign } else { "" }
  if ($valignValue.ToLower() -eq "middle") { $format.LineAlignment = [System.Drawing.StringAlignment]::Center }
  else { $format.LineAlignment = [System.Drawing.StringAlignment]::Near }
  $box = $textBox.box
  $rect = New-Object System.Drawing.RectangleF([single]([double]$box.x * $scaleX), [single]([double]$box.y * $scaleY), [single]([double]$box.w * $scaleX), [single]([double]$box.h * $scaleY))
  $g.DrawString([string]$textBox.text, $font, $brush, $rect, $format)
  $brush.Dispose()
  $font.Dispose()
  $format.Dispose()
}

[System.IO.Directory]::CreateDirectory((Split-Path -Parent $OutFile)) | Out-Null
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
