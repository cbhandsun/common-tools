#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", "render-engine-report"));
  fs.mkdirSync(path.join(outputDir, "reports"), { recursive: true });
  const report = {
    provider: "render-engine-report",
    generatedAt: new Date().toISOString(),
    engines: {
      openXml: detectOpenXml(),
      libreOffice: detectLibreOffice(),
      powerPointCom: detectPowerPointCom({ probe: isFlagEnabled(args["probe-powerpoint-com"]) })
    }
  };
  report.recommendation = recommend(report.engines);
  const reportFile = path.join(outputDir, "reports", "render-engine-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    reportFile,
    recommendation: report.recommendation.summary,
    libreOfficeAvailable: report.engines.libreOffice.available,
    openXmlAvailable: report.engines.openXml.available,
    powerPointComProbed: report.engines.powerPointCom.probed
  }, null, 2)}\n`);
}

function detectOpenXml() {
  const project = path.resolve("skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "OpenXmlDeckBuilder.csproj");
  const localDotnet = path.resolve(".tools", "dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
  return {
    available: fs.existsSync(project) && (fs.existsSync(localDotnet) || commandExists("dotnet")),
    role: "primary editable PPTX generator",
    project,
    dotnet: fs.existsSync(localDotnet) ? localDotnet : firstCommandPath("dotnet"),
    strengths: ["deterministic editable output", "no Office UI automation", "CI-friendly validation"],
    gaps: ["does not render arbitrary source PPTX by itself", "requires vision/OCR/layout reconstruction for image-only decks"]
  };
}

function detectLibreOffice() {
  const candidates = [
    firstCommandPath("soffice.com"),
    firstCommandPath("soffice.exe"),
    firstCommandPath("soffice"),
    firstCommandPath("libreoffice"),
    "C:\\Program Files\\LibreOffice\\program\\soffice.com",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate) || !path.isAbsolute(candidate));
  const version = found ? probeExecutableVersion(found, ["--version"], 15000) : null;
  return {
    available: Boolean(found && version?.ok),
    executable: found || null,
    version: version?.stdout || null,
    probeError: version?.ok === false ? version.error : null,
    role: "headless PPTX/PDF/image normalization candidate",
    strengths: ["free", "scriptable headless mode", "avoids PowerPoint COM"],
    risks: ["PowerPoint layout/font fidelity can differ", "needs isolated user profile and timeout guards", "must benchmark Chinese PPTX samples before batch use"]
  };
}

function probeExecutableVersion(command, args, timeout) {
  const run = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout
  });
  if (run.status === 0) {
    return { ok: true, stdout: String(run.stdout || "").trim() };
  }
  return {
    ok: false,
    error: run.error?.message || String(run.stderr || run.stdout || `exit ${run.status}`).trim()
  };
}

function detectPowerPointCom({ probe }) {
  const result = {
    available: null,
    probed: Boolean(probe),
    role: "fidelity fallback and final verification only",
    strengths: ["closest to PowerPoint rendering on this machine"],
    risks: ["slow", "can hang or show UI dialogs", "not recommended for unattended batch automation"]
  };
  if (!probe || process.platform !== "win32") return result;
  const run = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$app=$null; try { $app=New-Object -ComObject PowerPoint.Application; 'available' } catch { 'unavailable' } finally { if ($app -ne $null) { try { $app.Quit() | Out-Null } catch {} } }"
  ], { encoding: "utf8", windowsHide: true, timeout: 20000 });
  result.available = String(run.stdout || "").includes("available");
  result.error = run.error?.message || (run.status ? run.stderr : null) || null;
  return result;
}

function recommend(engines) {
  if (engines.libreOffice.available) {
    return {
      summary: "Benchmark LibreOffice headless as the batch normalizer, then keep OpenXML as the editable generator.",
      batchPath: "LibreOffice headless normalize -> OCR/layout -> OpenXML editable PPTX -> optional PowerPoint COM spot-check"
    };
  }
  return {
    summary: "Install or provide LibreOffice before broad real-PPTX batch runs; current safe path is OpenXML generation plus limited PowerPoint COM spot checks.",
    batchPath: "dry-run inventory -> limited PowerPoint COM normalize -> OCR/layout -> OpenXML editable PPTX"
  };
}

function firstCommandPath(command) {
  const where = process.platform === "win32" ? "where.exe" : "which";
  const run = spawnSync(where, [command], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  if (run.status !== 0) return null;
  return String(run.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function commandExists(command) {
  return Boolean(firstCommandPath(command));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function isFlagEnabled(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

if (require.main === module) {
  main();
}

module.exports = {
  detectLibreOffice,
  detectOpenXml,
  recommend
};
