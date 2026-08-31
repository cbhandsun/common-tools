"use strict";

const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { run } = require("../lib/exec");
const { emitOpenGateEvidence, powerPointOpenEvidenceScript, readOpenGateEvidence } = require("../lib/powerpoint-open-evidence");

async function validatePowerPointOpen(pptxFiles, options = {}, dependencies = {}) {
  const execute = dependencies.run || run;
  const pause = dependencies.wait || wait;
  const files = normalizePptxFiles(pptxFiles);
  const outputDir = path.resolve(options.outputDir || path.join(process.cwd(), "runs", "powerpoint-open-gate"));
  fs.mkdirSync(outputDir, { recursive: true });

  const manifestFile = path.join(outputDir, "powerpoint-open-gate-input.json");
  const reportFile = path.join(outputDir, "powerpoint-open-gate-report.json");
  const scriptFile = path.join(outputDir, "validate-powerpoint-open.ps1");
  const evidenceFile = path.join(outputDir, "powerpoint-open-evidence.json");
  const launchAttempts = Math.min(positiveInt(options.launchAttempts, 3), 3);
  // Windows PowerShell 5 treats BOM-less JSON as the active ANSI codepage.
  // The BOM preserves non-ASCII paths such as the user's Chinese PPT folder.
  fs.writeFileSync(scriptFile, powerPointOpenValidationScript(), "utf8");

  for (let launchAttempt = 1; launchAttempt <= launchAttempts; launchAttempt += 1) {
    const invocationId = crypto.randomUUID();
    const startedAt = Date.now();
    let succeeded = false;
    let retryDelayMs = 0;
    fs.rmSync(reportFile, { force: true });
    fs.writeFileSync(manifestFile, `\uFEFF${JSON.stringify({
      files,
      repairInPlace: options.repairInPlace === true,
      stagingRoot: createValidationStagingRoot(outputDir)
    }, null, 2)}\n`, "utf8");
    try {
      await execute("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptFile,
        "-ManifestFile",
        manifestFile,
        "-ReportFile",
        reportFile,
        "-EvidenceFile", evidenceFile,
        "-InvocationId", invocationId
      ], { timeout: positiveInt(options.timeoutMs, 170_000) });
      const evidence = readOpenGateEvidence(evidenceFile, invocationId);
      if (evidence.status !== "valid" || evidence.finished !== true) throw new Error("PowerPoint open evidence is incomplete");
      succeeded = true;
      break;
    } catch (error) {
      const report = readValidationReport(reportFile);
      if (launchAttempt < launchAttempts && isRetryableColdStartReport(report)) {
        retryDelayMs = launchAttempt * 3000;
        await pause(retryDelayMs);
        continue;
      }
      throw new Error("PowerPoint open gate failed; inspect bounded phase evidence", { cause: error });
    } finally {
      emitOpenGateEvidence(readOpenGateEvidence(evidenceFile, invocationId), {
        launchAttempt, succeeded, retryDelayMs, elapsedMs: Math.min(86400000, Math.max(0, Date.now() - startedAt))
      }, dependencies.evidenceStream);
    }
  }

  if (!fs.existsSync(reportFile)) throw new Error("PowerPoint open gate did not write a report.");
  const report = readValidationReport(reportFile);
  if (report?.passed !== true) {
    const failures = Array.isArray(report?.results)
      ? report.results.filter((item) => item?.opened !== true).map((item) => item.file).filter(Boolean)
      : [];
    throw new Error(`PowerPoint open gate rejected ${failures.length || "one or more"} PPTX file(s)`);
  }
  return report;
}

function readValidationReport(reportFile) {
  if (!fs.existsSync(reportFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportFile, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function isRetryableColdStartReport(report) {
  const results = Array.isArray(report?.results) ? report.results : [];
  return report?.passed === false
    && results.length > 0
    && results.every((result) => /RPC_E_CALL_REJECTED|被呼叫方拒绝接收呼叫/i.test(String(result?.error || "")));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizePptxFiles(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("PowerPoint open gate requires at least one PPTX file.");
  return value.map((file, index) => {
    if (typeof file !== "string" || !file.trim()) throw new TypeError(`PowerPoint open gate file ${index + 1} is invalid.`);
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`PowerPoint open gate file was not found: ${resolved}`);
    }
    return resolved;
  });
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createValidationStagingRoot(outputDir) {
  const seed = `${path.resolve(outputDir)}|${Date.now()}|${process.pid}|${crypto.randomBytes(8).toString("hex")}`;
  const id = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 20);
  const root = path.join(resolveAsciiTempRoot(), "slideclone-powerpoint-open-gate", id);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function resolveAsciiTempRoot() {
  const preferred = path.resolve(os.tmpdir());
  if (Array.from(preferred).every(character => character.codePointAt(0) <= 127)) return preferred;
  const fallback = path.resolve("C:\\Temp");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function powerPointOpenValidationScript() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$ManifestFile,
  [Parameter(Mandatory=$true)][string]$ReportFile,
  [Parameter(Mandatory=$true)][string]$EvidenceFile,
  [Parameter(Mandatory=$true)][string]$InvocationId
)
$ErrorActionPreference = "Stop"
${powerPointOpenEvidenceScript()}
$msoFalse = 0
$msoTrue = -1
$ppSaveAsOpenXMLPresentation = 24
$app = $null
$results = @()
$comMutex = $null
$comMutexHeld = $false
try {
  # PowerPoint COM is process-global. Parallel validation processes can open
  # each other's automation session and report false package failures.
  $comMutex = New-Object System.Threading.Mutex($false, "Local\SlideclonePowerPointOpenGate")
  $lockTimer = Start-OpenGateStep 'lock'
  try { $comMutexHeld = $comMutex.WaitOne(150000) }
  finally { Complete-OpenGateStep 'lock' $lockTimer }
  if (-not $comMutexHeld) { throw "Timed out waiting for the PowerPoint COM validation lock." }
  $manifest = Get-Content -LiteralPath $ManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $repairInPlace = ($manifest.repairInPlace -eq $true)
  $comTimer = Start-OpenGateStep 'com-start'
  try { $app = New-Object -ComObject PowerPoint.Application }
  finally { Complete-OpenGateStep 'com-start' $comTimer }
  if ($app -eq $null) { throw "PowerPoint.Application COM object is null." }
  # Fresh PowerPoint processes can still reject automation calls while their
  # first-run add-ins and repair services are initializing.
  $warmupTimer = Start-OpenGateStep 'warmup'
  try { Start-Sleep -Milliseconds 2500 }
  finally { Complete-OpenGateStep 'warmup' $warmupTimer }
  # Do not let a repair prompt deadlock the unattended validation process.
  # A repaired file is still rejected below because PowerPoint marks it dirty.
  try { $app.DisplayAlerts = 1 } catch {}
  function Open-PresentationWithRetry([string]$FilePath) {
    for ($openAttempt = 1; $openAttempt -le 12; $openAttempt++) {
      $candidate = $null
      $presentations = $null
      $accepted = $false
      $openTimer = Start-OpenGateStep 'open'
      try {
        # Open a writable staging copy. Read-only opens hide the dirty state
        # after a silent repair, which would let broken delivery files pass.
        # Balance each acquired collection reference before its owner quits.
        # Chained COM access otherwise leaves collection release to finalizers.
        $presentations = $app.Presentations
        $candidate = $presentations.Open($FilePath, $msoFalse, $msoFalse, $msoFalse)
        if ($candidate -ne $null) {
          Start-Sleep -Milliseconds 1200
          $accepted = $true
          return $candidate
        }
      }
      catch [System.Runtime.InteropServices.COMException] {
        if ($openAttempt -eq 12) { throw }
      }
      catch {
        # The PowerPoint process can expose a null Presentations collection
        # during cold initialization. Treat that same transient condition as
        # a retryable open rather than rejecting an otherwise valid package.
        if ($openAttempt -eq 12) { throw }
      }
      finally {
        try {
          if ($presentations -ne $null) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentations)
            $presentations = $null
          }
        }
        catch {
          # A release failure is not an open retry: reject the candidate and
          # still close it instead of returning an unowned presentation.
          $accepted = $false
          throw
        }
        finally {
          if ($candidate -ne $null -and -not $accepted) {
            try { $candidate.Saved = $msoTrue } catch {}
            try { $candidate.Close() | Out-Null } catch {}
            try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($candidate) } catch {}
          }
          Complete-OpenGateStep 'open' $openTimer
        }
      }
      Wait-OpenGateRetry 'open' (600 * $openAttempt)
    }
    throw "PowerPoint presentation open returned null after retries."
  }
  function Get-SlideCountWithRetry($Presentation) {
    $slideCount = 0
    # Cold PowerPoint instances can take noticeably longer than the initial
    # COM open to hydrate the Slides collection, especially after an update.
    $maxSlideLoadAttempts = 60
    for ($slideAttempt = 1; $slideAttempt -le $maxSlideLoadAttempts; $slideAttempt++) {
      $slides = $null
      $slideTimer = Start-OpenGateStep 'slide-count'
      try {
        $slides = $Presentation.Slides
        $slideCount = [int]$slides.Count
        if ($slideCount -gt 0) { return $slideCount }
      }
      catch [System.Runtime.InteropServices.COMException] {
        if ($slideAttempt -eq $maxSlideLoadAttempts) { throw }
      }
      catch {
        # PowerPoint can expose a null Slides collection for a short time
        # immediately after startup. Treat that transient state like a COM
        # retry rather than rejecting an otherwise valid presentation.
        if ($slideAttempt -eq $maxSlideLoadAttempts) { throw }
      }
      finally {
        try {
          if ($slides -ne $null) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($slides)
            $slides = $null
          }
        }
        finally { Complete-OpenGateStep 'slide-count' $slideTimer }
      }
      Wait-OpenGateRetry 'slide-count' 500
    }
    throw "PowerPoint opened the presentation but did not load any slides."
  }
  function Get-PresentationModifiedWithRetry($Presentation) {
    for ($savedAttempt = 1; $savedAttempt -le 12; $savedAttempt++) {
      $savedTimer = Start-OpenGateStep 'saved-state'
      try {
        return ($Presentation.Saved -ne $msoTrue)
      }
      catch [System.Runtime.InteropServices.COMException] {
        # PowerPoint can reject a property call while it finalizes a load or
        # save. Retry instead of confusing this transient RPC state with a
        # repaired or malformed package.
        if ($savedAttempt -eq 12) { throw }
      }
      finally { Complete-OpenGateStep 'saved-state' $savedTimer }
      Wait-OpenGateRetry 'saved-state' (250 * $savedAttempt)
    }
    throw "PowerPoint did not report the presentation saved state."
  }
  function Save-PresentationCopyWithRetry($Presentation, [string]$FilePath) {
    for ($saveAttempt = 1; $saveAttempt -le 12; $saveAttempt++) {
      $saveTimer = Start-OpenGateStep 'save-copy'
      try {
        $Presentation.SaveCopyAs($FilePath, $ppSaveAsOpenXMLPresentation)
        if ((Test-Path -LiteralPath $FilePath) -and ((Get-Item -LiteralPath $FilePath).Length -gt 0)) { return }
      }
      catch [System.Runtime.InteropServices.COMException] {
        if ($saveAttempt -eq 12) { throw }
      }
      finally { Complete-OpenGateStep 'save-copy' $saveTimer }
      Wait-OpenGateRetry 'save-copy' 500
    }
    throw "PowerPoint did not write a finalized Open XML presentation."
  }
  foreach ($file in @($manifest.files)) {
    $presentation = $null
    $stagingFile = $null
    $repairedFile = $null
    try {
      $extension = [System.IO.Path]::GetExtension([string]$file)
      if ([string]::IsNullOrWhiteSpace($extension)) { $extension = ".pptx" }
      $stagingName = "{0}{1}" -f ([Guid]::NewGuid().ToString("N")), $extension
      $stagingFile = Join-Path ([string]$manifest.stagingRoot) $stagingName
      Copy-Item -LiteralPath ([string]$file) -Destination $stagingFile -Force
      $presentation = Open-PresentationWithRetry($stagingFile)
      if ($presentation -eq $null) { throw "PowerPoint presentation open returned null." }
      # A malformed package can open only because PowerPoint silently repairs
      # it. In that case the presentation becomes dirty, so reject it instead
      # of treating a successful Open call as a safe delivery.
      $slideCount = Get-SlideCountWithRetry($presentation)
      $modifiedAfterOpen = Get-PresentationModifiedWithRetry $presentation
      $repairAttempted = $false
      $repairedInPlace = $false
      $finalizedByPowerPoint = $false
      if ($repairInPlace) {
        # PowerPoint does not consistently expose a dirty flag after every
        # repair dialog. Always canonicalize generated deliveries through a
        # writable staging copy, then require a clean second open.
        $repairAttempted = $modifiedAfterOpen
        $finalizedByPowerPoint = $true
        $repairedFile = Join-Path ([string]$manifest.stagingRoot) ("{0}.powerpoint-finalized{1}" -f [Guid]::NewGuid().ToString("N"), $extension)
        try {
          # SaveCopyAs keeps the source untouched until the staged package has
          # passed a second clean PowerPoint open.
          Save-PresentationCopyWithRetry $presentation $repairedFile
          $presentation.Saved = $msoTrue
          $closeTimer = Start-OpenGateStep 'close'
          try { $presentation.Close() | Out-Null }
          finally { Complete-OpenGateStep 'close' $closeTimer }
          [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
          $presentation = $null
          $presentation = Open-PresentationWithRetry($repairedFile)
          if ($presentation -eq $null) { throw "PowerPoint could not reopen the finalized presentation." }
          $slideCount = Get-SlideCountWithRetry($presentation)
          $modifiedAfterOpen = Get-PresentationModifiedWithRetry $presentation
          $repairedInPlace = $repairAttempted -and (-not $modifiedAfterOpen)
          if (-not $modifiedAfterOpen) {
            Copy-Item -LiteralPath $repairedFile -Destination ([string]$file) -Force
          }
        }
        finally {
          if (Test-Path -LiteralPath $repairedFile) { Remove-Item -LiteralPath $repairedFile -Force -ErrorAction SilentlyContinue }
        }
      }
      $results += [PSCustomObject]@{
        file = [string]$file
        opened = (-not $modifiedAfterOpen)
        slideCount = $slideCount
        modifiedAfterOpen = $modifiedAfterOpen
        repairAttempted = $repairAttempted
        repairedInPlace = $repairedInPlace
        finalizedByPowerPoint = $finalizedByPowerPoint
        error = if ($modifiedAfterOpen) { "PowerPoint modified the presentation while opening it; the package requires repair." } else { $null }
      }
    }
    catch {
      Set-OpenGateFailure
      $results += [PSCustomObject]@{
        file = [string]$file
        opened = $false
        slideCount = 0
        modifiedAfterOpen = $null
        repairAttempted = $false
        repairedInPlace = $false
        finalizedByPowerPoint = $false
        error = $_.Exception.Message
      }
    }
    finally {
      if ($presentation -ne $null) {
        # Never allow a repair-induced dirty state to trigger a save prompt.
        try { $presentation.Saved = $msoTrue } catch {}
        $closeTimer = Start-OpenGateStep 'close'
        try { $presentation.Close() | Out-Null } catch {}
        finally { Complete-OpenGateStep 'close' $closeTimer }
        try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) } catch {}
        $presentation = $null
      }
      if ($stagingFile -and (Test-Path -LiteralPath $stagingFile)) {
        Remove-Item -LiteralPath $stagingFile -Force -ErrorAction SilentlyContinue
      }
    }
  }
}
catch {
  Set-OpenGateFailure
  throw
}
finally {
  if ($app -ne $null) {
    $quitTimer = Start-OpenGateStep 'quit'
    try { $app.Quit() | Out-Null } catch {}
    finally { Complete-OpenGateStep 'quit' $quitTimer }
    try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch {}
    $app = $null
  }
  $finalizerTimer = Start-OpenGateStep 'finalizers'
  try {
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  } finally { Complete-OpenGateStep 'finalizers' $finalizerTimer }
  $cleanupTimer = Start-OpenGateStep 'cleanup'
  try {
    if ($manifest -and $manifest.stagingRoot -and (Test-Path -LiteralPath ([string]$manifest.stagingRoot))) {
      Remove-Item -LiteralPath ([string]$manifest.stagingRoot) -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($comMutexHeld -and $comMutex -ne $null) {
      try { $comMutex.ReleaseMutex() } catch {}
    }
    if ($comMutex -ne $null) {
      try { $comMutex.Dispose() } catch {}
    }
  } finally { Complete-OpenGateStep 'cleanup' $cleanupTimer }
  $script:openGateEvidence.finished = $true
  Write-OpenGateEvidence
}
$report = [PSCustomObject]@{
  provider = "powerpoint-com-open-gate"
  passed = (@($results | Where-Object { $_.opened -ne $true }).Count -eq 0)
  results = $results
}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportFile -Encoding UTF8
if ($report.passed -ne $true) { exit 1 }
`;
}

module.exports = {
  createValidationStagingRoot,
  isRetryableColdStartReport,
  normalizePptxFiles,
  powerPointOpenValidationScript,
  resolveAsciiTempRoot,
  validatePowerPointOpen
};
