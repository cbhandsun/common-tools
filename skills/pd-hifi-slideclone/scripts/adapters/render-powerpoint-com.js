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
  const renderPptxFile = path.join(renderDir, "render-input.pptx");
  fs.copyFileSync(pptxFile, renderPptxFile);
  const firstPage = (input.ir?.pages || [])[0];
  const sourceSize = firstPage?.sourceImage && fs.existsSync(firstPage.sourceImage)
    ? readImageSize(firstPage.sourceImage)
    : { widthPx: 1920, heightPx: 1080 };
  const scriptFile = path.join(renderDir, "export-pptx.ps1");
  fs.writeFileSync(scriptFile, powerPointExportScript(), "utf8");

  await exportWithRetry({
    scriptFile,
    renderPptxFile,
    renderDir,
    exportWidth: sourceSize.widthPx || sourceSize.width || 1920,
    exportHeight: sourceSize.heightPx || sourceSize.height || 1080,
    maxPages: positiveInt(input.maxPages, 2_147_483_647),
    timeoutMs: positiveInt(context.config?.powerPoint?.exportTimeoutMs, 60_000)
  });

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

async function exportWithRetry({ scriptFile, renderPptxFile, renderDir, exportWidth, exportHeight, maxPages, timeoutMs }) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      clearRenderedPages(renderDir);
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
        String(exportWidth),
        "-ExportHeight",
        String(exportHeight),
        "-MaxPages",
        String(maxPages)
      ], { timeout: timeoutMs });
      const exportedPages = fs.readdirSync(renderDir)
        .filter((name) => /^page-\d+\.png$/i.test(name));
      if (exportedPages.length === 0) {
        const error = new Error("PowerPoint export produced no rendered pages.");
        error.code = "POWERPOINT_EMPTY_EXPORT";
        throw error;
      }
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableComError(error) || attempt === 4) throw error;
      await delay(500 * attempt);
    }
  }
  throw lastError;
}

function isRetryableComError(error) {
  const stderr = String(error?.stderr || "");
  const stdout = String(error?.stdout || "");
  const message = String(error?.message || "");
  const text = `${stderr}\n${stdout}\n${message}`;
  if (/RPC_E_CALL_REJECTED|0x80010001|0x800706BE|ETIMEDOUT|timed out|timeout|call rejected|remote procedure call failed|InvokeMethodOnNull|Presentations is not ready yet|presentation open returned null|no rendered pages/i.test(text)) return true;
  return !stderr.trim() && !stdout.trim()
    && /Command failed:\s*powershell(?:\.exe)?\b[\s\S]*\bexport-pptx\.ps1\b/i.test(message);
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clearRenderedPages(renderDir) {
  for (const name of fs.readdirSync(renderDir)) {
    if (!/^page-\d+\.png$/i.test(name)) continue;
    fs.rmSync(path.join(renderDir, name), { force: true });
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function powerPointExportScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$PptxFile,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [Parameter(Mandatory=$true)][int]$ExportWidth,
  [Parameter(Mandatory=$true)][int]$ExportHeight,
  [Parameter(Mandatory=$true)][int]$MaxPages
)
$ErrorActionPreference = "Stop"
$msoTrue = -1
$msoFalse = 0
$app = $null
$presentation = $null
function Wait-PowerPointReady {
  param([Parameter(Mandatory=$true)]$Application)
  if ($Application -eq $null) { return $false }
  try {
    $null = $Application.Presentations.Count
    return $true
  }
  catch {
    return $false
  }
}
function Export-SlideWithRetry {
  param(
    [Parameter(Mandatory=$true)]$Presentation,
    [Parameter(Mandatory=$true)][int]$SlideIndex,
    [Parameter(Mandatory=$true)][string]$OutputFile,
    [Parameter(Mandatory=$true)][int]$Width,
    [Parameter(Mandatory=$true)][int]$Height
  )
  $lastError = $null
  for ($exportAttempt = 1; $exportAttempt -le 6; $exportAttempt++) {
    try {
      Start-Sleep -Milliseconds (250 * $exportAttempt)
      $Slide = $Presentation.Slides.Item($SlideIndex)
      $Slide.Export($OutputFile, "PNG", $Width, $Height)
      if (Test-Path $OutputFile) { return }
      throw "PowerPoint slide export produced no file."
    }
    catch {
      $lastError = $_
      if ($exportAttempt -eq 6) { throw $lastError }
      Start-Sleep -Milliseconds (500 * $exportAttempt)
    }
  }
}
function Get-SlideCountWithRetry {
  param([Parameter(Mandatory=$true)]$Presentation)
  $lastError = $null
  for ($countAttempt = 1; $countAttempt -le 8; $countAttempt++) {
    try {
      Start-Sleep -Milliseconds (250 * $countAttempt)
      $count = [int]$Presentation.Slides.Count
      if ($count -gt 0) { return $count }
      throw "PowerPoint temporarily reported an empty presentation."
    }
    catch {
      $lastError = $_
      if ($countAttempt -eq 8) { throw $lastError }
      Start-Sleep -Milliseconds (400 * $countAttempt)
    }
  }
}

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
      if (-not (Wait-PowerPointReady -Application $app)) { throw "PowerPoint.Application Presentations is not ready yet." }
      $presentation = $app.Presentations.Open($PptxFile, $msoTrue, $msoFalse, $msoFalse)
      if ($presentation -eq $null) { throw "PowerPoint presentation open returned null." }
      break
    }
    catch {
      if ($attempt -eq 4) { throw }
      Start-Sleep -Milliseconds (500 * $attempt)
    }
  }
  $slideCount = [Math]::Min((Get-SlideCountWithRetry -Presentation $presentation), $MaxPages)
  for ($i = 1; $i -le $slideCount; $i++) {
    $out = Join-Path $OutputDir ("page-{0}.png" -f $i)
    Export-SlideWithRetry -Presentation $presentation -SlideIndex $i -OutputFile $out -Width $ExportWidth -Height $ExportHeight
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

module.exports.powerPointExportScript = powerPointExportScript;
module.exports.isRetryableComError = isRetryableComError;
