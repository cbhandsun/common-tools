"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");
const DEFAULT_EXPORT_TIMEOUT_MS = 120_000;
const MAX_EXPORT_TIMEOUT_MS = 2_147_483_647;

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
  const sourceSize = resolveSourceSize(input, context);
  const scriptFile = path.join(renderDir, "export-pptx.ps1");
  fs.writeFileSync(scriptFile, powerPointExportScript(), "utf8");

  await exportWithRetry({
    scriptFile,
    renderPptxFile,
    renderDir,
    exportWidth: sourceSize.widthPx || sourceSize.width || 1920,
    exportHeight: sourceSize.heightPx || sourceSize.height || 1080,
    maxPages: positiveInt(input.maxPages, 2_147_483_647),
    timeoutMs: exportTimeoutMs(context.config?.powerPoint?.exportTimeoutMs)
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
  // renderer-process reports a structured exit instead of the old command text.
  // Preserve the bounded empty-diagnostic retry without retrying cancellation
  // or an unconfirmed process termination.
  return !stderr.trim() && !stdout.trim()
    && (message === "renderer process failed" && Number.isSafeInteger(error?.code) && error.code !== 0
      || /Command failed:\s*powershell(?:\.exe)?\b[\s\S]*\bexport-pptx\.ps1\b/i.test(message));
}

/** @param {unknown} value @returns {number} */
function exportTimeoutMs(value) {
  // Match the renderer's integer timer bound without coercing objects or
  // accepting a numeric prefix from a malformed configuration string.
  if (typeof value === "string") {
    if (value.length > 32) return DEFAULT_EXPORT_TIMEOUT_MS;
    const trimmed = value.trim();
    if (!/^\d+$/u.test(trimmed)) return DEFAULT_EXPORT_TIMEOUT_MS;
    value = Number(trimmed);
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_EXPORT_TIMEOUT_MS
    ? value : DEFAULT_EXPORT_TIMEOUT_MS;
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

function resolveSourceSize(input, context) {
  const sourceImage = firstSourceImage(input);
  const sourceFile = sourceImage ? resolveSourceImageFile(sourceImage, context) : "";
  if (sourceFile) {
    const size = readImageSize(sourceFile);
    if (positiveInt(size.widthPx, 0) && positiveInt(size.heightPx, 0)) return size;
  }
  return { widthPx: 1920, heightPx: 1080 };
}

function firstSourceImage(input) {
  if (typeof input?.sourceImage === "string" && input.sourceImage) return input.sourceImage;
  if (Array.isArray(input?.sourceImages) && typeof input.sourceImages[0] === "string" && input.sourceImages[0]) return input.sourceImages[0];
  const firstPage = Array.isArray(input?.ir?.pages) ? input.ir.pages[0] : null;
  return typeof firstPage?.sourceImage === "string" && firstPage.sourceImage ? firstPage.sourceImage : "";
}

function resolveSourceImageFile(sourceImage, context) {
  const candidates = [];
  if (path.isAbsolute(sourceImage)) candidates.push(sourceImage);
  else {
    candidates.push(path.resolve(sourceImage));
    if (typeof context?.sourceRoot === "string") candidates.push(path.resolve(context.sourceRoot, sourceImage));
    if (typeof context?.root === "string") candidates.push(path.resolve(context.root, sourceImage));
    if (typeof context?.outputDir === "string") candidates.push(path.resolve(context.outputDir, "..", sourceImage));
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) return candidate;
    } catch {
      // Ignore inaccessible candidates and continue to the next bounded location.
    }
  }
  return "";
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
    $presentations = $Application.Presentations
    if ($null -eq $presentations) { return $false }
    $count = $presentations.Count
    return ($count -is [int] -and $count -ge 0)
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
    try {
      $remainingPresentations = $app.Presentations
      if ($null -ne $remainingPresentations) {
        $remaining = $remainingPresentations.Count
        if ($remaining -is [int] -and $remaining -eq 0) { $app.Quit() | Out-Null }
      }
    } catch { Write-Verbose "PowerPoint cleanup could not confirm an empty session." }
  }
}
`;
}

module.exports.powerPointExportScript = powerPointExportScript;
module.exports.isRetryableComError = isRetryableComError;
module.exports._private = { resolveSourceSize };
