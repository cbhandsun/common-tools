"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  harvestAppliedPptComponents,
  sanitizeProvider
} = require("./harvest-applied-ppt-components");

const DEFAULT_MANUAL_ROOT = path.join("runs", "plugin-component-inventory", "manual-applied-components");
const DEFAULT_HARVEST_ROOT = path.join("runs", "plugin-component-inventory");

function parseArgs(argv) {
  const args = {
    provider: "islide",
    label: "active-powerpoint-component",
    saveRoot: DEFAULT_MANUAL_ROOT,
    out: "",
    attempts: 8,
    delayMs: 800,
    activeSlideOnly: true,
    harvest: true
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--provider" && next) {
      args.provider = next;
      i += 1;
    } else if (arg === "--label" && next) {
      args.label = next;
      i += 1;
    } else if (arg === "--save-root" && next) {
      args.saveRoot = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--attempts" && next) {
      args.attempts = Number(next);
      i += 1;
    } else if (arg === "--delay-ms" && next) {
      args.delayMs = Number(next);
      i += 1;
    } else if (arg === "--active-slide-only") {
      args.activeSlideOnly = true;
    } else if (arg === "--full-deck") {
      args.activeSlideOnly = false;
    } else if (arg === "--no-harvest") {
      args.harvest = false;
    } else {
      throw new Error(`Unknown harvest-active-powerpoint-component argument: ${arg}`);
    }
  }
  args.provider = sanitizeProvider(args.provider);
  args.label = sanitizeLabel(args.label);
  args.attempts = clampInt(args.attempts, 1, 60, 8);
  args.delayMs = clampInt(args.delayMs, 50, 10000, 800);
  return args;
}

function harvestActivePowerPointComponent(options = {}) {
  const provider = sanitizeProvider(options.provider || "islide");
  const label = sanitizeLabel(options.label || "active-powerpoint-component");
  const saveRoot = path.resolve(String(options.saveRoot || DEFAULT_MANUAL_ROOT));
  const out = path.resolve(String(options.out || path.join(DEFAULT_HARVEST_ROOT, `${provider}-applied-components`)));
  const attempts = clampInt(options.attempts, 1, 60, 8);
  const delayMs = clampInt(options.delayMs, 50, 10000, 800);
  const activeSlideOnly = options.activeSlideOnly !== false;
  const harvest = options.harvest !== false;
  const runner = typeof options.runner === "function" ? options.runner : runPowerShell;

  fs.mkdirSync(saveRoot, { recursive: true });
  const savePath = path.join(saveRoot, `${provider}-applied-${label}-${timestampForFile(new Date())}.pptx`);
  const saveResult = saveActivePowerPointCopy({
    savePath,
    attempts,
    delayMs,
    activeSlideOnly,
    runner
  });

  const result = {
    provider,
    savePath,
    saveScope: activeSlideOnly ? "active-slide-only" : "full-deck",
    saved: true,
    saveResult,
    harvest: null
  };
  if (harvest) {
    result.harvest = harvestAppliedPptComponents({
      sources: [savePath],
      out,
      provider,
      maxFiles: 1
    });
  }
  return result;
}

function saveActivePowerPointCopy(options = {}) {
  const savePath = path.resolve(String(options.savePath || ""));
  if (!savePath || path.extname(savePath).toLowerCase() !== ".pptx") {
    throw new Error("savePath must point to a .pptx file.");
  }
  const attempts = clampInt(options.attempts, 1, 60, 8);
  const delayMs = clampInt(options.delayMs, 50, 10000, 800);
  const activeSlideOnly = options.activeSlideOnly !== false;
  const runner = typeof options.runner === "function" ? options.runner : runPowerShell;
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  const script = buildPowerPointSaveCopyScript({ savePath, attempts, delayMs, activeSlideOnly });
  const completed = runner({ script, savePath, attempts, delayMs, activeSlideOnly });
  const stdout = String(completed.stdout || "").trim();
  const stderr = String(completed.stderr || "").trim();
  if (completed.status !== 0) {
    throw new Error(`PowerPoint SaveCopyAs failed (${completed.status}): ${redactLogText(stderr || stdout || "no output")}`);
  }
  let payload = null;
  try {
    payload = stdout ? JSON.parse(stdout) : null;
  } catch {
    throw new Error(`PowerPoint SaveCopyAs returned invalid JSON: ${redactLogText(stdout.slice(0, 300))}`);
  }
  if (!payload || payload.saved !== true || !fs.existsSync(savePath)) {
    const lastError = payload?.lastError ? `: ${redactLogText(payload.lastError)}` : "";
    throw new Error(`PowerPoint SaveCopyAs did not create the expected file${lastError}`);
  }
  return {
    attemptsUsed: payload.attemptsUsed || null,
    lastError: payload.lastError || "",
    saveScope: payload.saveScope || (activeSlideOnly ? "active-slide-only" : "full-deck"),
    slideIndex: payload.slideIndex || null,
    file: savePath
  };
}

function buildPowerPointSaveCopyScript({ savePath, attempts, delayMs, activeSlideOnly = true }) {
  const safeSavePath = quotePowerShellString(path.resolve(savePath));
  const safeAttempts = clampInt(attempts, 1, 60, 8);
  const safeDelayMs = clampInt(delayMs, 50, 10000, 800);
  const safeActiveSlideOnly = activeSlideOnly !== false ? "$true" : "$false";
  const script = `
$ErrorActionPreference = 'Stop'
$savePath = ${safeSavePath}
$attempts = ${safeAttempts}
$delayMs = ${safeDelayMs}
$activeSlideOnly = ${safeActiveSlideOnly}
$saved = $false
$lastError = ''
$attemptsUsed = 0
$saveScope = if ($activeSlideOnly) { 'active-slide-only' } else { 'full-deck' }
$slideIndex = $null
try {
  $ppt = Get-SlideclonePowerPointApplication -AllowCreate $true
  for ($i = 1; $i -le $attempts; $i++) {
    $attemptsUsed = $i
    try {
      if ($ppt.Presentations.Count -lt 1) {
        throw 'No active PowerPoint presentation is open.'
      }
      $presentation = $ppt.ActivePresentation
      if ($null -eq $presentation) {
        $presentation = $ppt.Presentations.Item(1)
      }
      if ($activeSlideOnly) {
        $activeSlide = $null
        if ($null -ne $ppt.ActiveWindow -and $null -ne $ppt.ActiveWindow.Selection) {
          try {
            if ($null -ne $ppt.ActiveWindow.Selection.SlideRange -and $ppt.ActiveWindow.Selection.SlideRange.Count -ge 1) {
              $activeSlide = $ppt.ActiveWindow.Selection.SlideRange.Item(1)
            }
          } catch {
            $activeSlide = $null
          }
        }
        if ($null -eq $activeSlide -and $null -ne $ppt.ActiveWindow -and $null -ne $ppt.ActiveWindow.View) {
          try {
            if ($null -ne $ppt.ActiveWindow.View.Slide) {
              $activeSlide = $ppt.ActiveWindow.View.Slide
            }
          } catch {
            $activeSlide = $null
          }
        }
        if ($null -eq $activeSlide -and $presentation.Slides.Count -ge 1) {
          $activeSlide = $presentation.Slides.Item(1)
        }
        if ($null -eq $activeSlide) {
          throw 'No PowerPoint slide is available to harvest.'
        }
        $slideIndex = $activeSlide.SlideIndex
        $componentPresentation = $ppt.Presentations.Add($true)
        try {
          $activeSlide.Copy()
          $componentPresentation.Slides.Paste(1) | Out-Null
          $componentPresentation.SaveAs($savePath, 24)
        } finally {
          $componentPresentation.Close()
        }
      } else {
        $presentation.SaveCopyAs($savePath)
      }
      $saved = Test-Path -LiteralPath $savePath
      if ($saved) { break }
      $lastError = 'SaveCopyAs returned without creating the file.'
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds $delayMs
    }
  }
} catch {
  $lastError = $_.Exception.Message
}
[pscustomobject]@{
  saved = $saved
  file = $savePath
  saveScope = $saveScope
  slideIndex = $slideIndex
  attemptsUsed = $attemptsUsed
  lastError = $lastError
} | ConvertTo-Json -Compress
`;
  return `${powerPointComBootstrapScript()}\n${script}`;
}

function runPowerShell({ script }) {
  return spawnSync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

function sanitizeLabel(value) {
  let label = String(value || "component").trim();
  label = label
    .replace(/^(?:islide|officeplus|plugin)-applied-/i, "")
    .replace(/^applied-/i, "")
    .replace(/-[0-9a-f]{12}$/i, "");
  return label
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "component";
}

function quotePowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function powerPointComBootstrapScript() {
  return `
function Get-SlideclonePowerPointApplication {
  param([bool]$AllowCreate = $false)
  try {
    $code = @"
using System;
using System.Runtime.InteropServices;
public static class SlidecloneComRot {
  [DllImport("oleaut32.dll", PreserveSig=false)]
  private static extern object GetActiveObject(ref Guid rclsid, IntPtr reserved);
  public static object GetActiveObjectByProgId(string progId) {
    var type = Type.GetTypeFromProgID(progId, true);
    var clsid = type.GUID;
    return GetActiveObject(ref clsid, IntPtr.Zero);
  }
}
"@
    if (-not ("SlidecloneComRot" -as [type])) {
      Add-Type -TypeDefinition $code -ErrorAction Stop
    }
    return [SlidecloneComRot]::GetActiveObjectByProgId('PowerPoint.Application')
  } catch {
    if ($AllowCreate) {
      return New-Object -ComObject PowerPoint.Application
    }
    throw
  }
}
`;
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function redactLogText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|api[-_ ]?key|secret|cookie)=([^\\s;&]+)/gi, "$1=[redacted]");
}

async function main() {
  const args = parseArgs(process.argv);
  const result = harvestActivePowerPointComponent(args);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildPowerPointSaveCopyScript,
  harvestActivePowerPointComponent,
  parseArgs,
  powerPointComBootstrapScript,
  quotePowerShellString,
  sanitizeLabel,
  saveActivePowerPointCopy
};
