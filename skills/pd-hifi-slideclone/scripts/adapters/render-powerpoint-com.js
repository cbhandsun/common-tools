"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");

module.exports = async function renderPowerPointCom(input, context) {
  const pptxFile = input.pptx?.pptxFile;
  if (!pptxFile) {
    return {
      ok: false,
      error: "pptx.pptxFile is required for render-powerpoint-com"
    };
  }

  const renderDir = path.join(context.outputDir, "render", `iteration-${input.iteration || 0}`);
  fs.mkdirSync(renderDir, { recursive: true });
  if (context.config?.powerPoint?.cleanupHidden !== false) {
    await cleanupHiddenPowerPoint().catch(() => {});
  }
  const renderPptxFile = path.join(renderDir, "render-input.pptx");
  fs.copyFileSync(pptxFile, renderPptxFile);
  const firstPage = (input.ir?.pages || [])[0];
  const sourceSize = firstPage?.sourceImage && fs.existsSync(firstPage.sourceImage)
    ? readImageSize(firstPage.sourceImage)
    : { widthPx: 1920, heightPx: 1080 };
  const scriptFile = path.join(renderDir, "export-pptx.ps1");
  fs.writeFileSync(scriptFile, powerPointExportScript(), "utf8");

  try {
    await run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptFile,
      "-PptxFile",
      path.resolve(renderPptxFile),
      "-OutputDir",
      renderDir,
      "-ExportWidth",
      String(sourceSize.widthPx || sourceSize.width || 1920),
      "-ExportHeight",
      String(sourceSize.heightPx || sourceSize.height || 1080)
    ]);
  } finally {
    if (context.config?.powerPoint?.cleanupHidden !== false) {
      await cleanupHiddenPowerPoint().catch(() => {});
    }
  }

  const renderedPages = fs.readdirSync(renderDir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, pageIndex) => {
      const image = path.join(renderDir, name);
      return { pageIndex, image, ...readImageSize(image) };
    });

  return {
    ok: true,
    data: {
      provider: "render-powerpoint-com",
      renderDir,
      renderedPages
    }
  };
};

async function cleanupHiddenPowerPoint() {
  await run("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-Process POWERPNT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -eq 0 } | Stop-Process -Force -ErrorAction SilentlyContinue"
  ]);
}

function powerPointExportScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$PptxFile,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [Parameter(Mandatory=$true)][int]$ExportWidth,
  [Parameter(Mandatory=$true)][int]$ExportHeight
)
$ErrorActionPreference = "Stop"
$msoTrue = -1
$msoFalse = 0
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
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      Start-Sleep -Milliseconds (250 * $attempt)
      if ($app -eq $null) { throw "PowerPoint.Application COM object is null before open." }
      $presentation = $app.Presentations.Open($PptxFile, $msoTrue, $msoFalse, $msoFalse)
      break
    }
    catch {
      if ($attempt -eq 4) { throw }
      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $out = Join-Path $OutputDir ("page-{0}.png" -f $i)
    $presentation.Slides.Item($i).Export($out, "PNG", $ExportWidth, $ExportHeight)
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
