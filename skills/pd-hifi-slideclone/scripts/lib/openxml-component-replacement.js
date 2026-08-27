"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { resolveOpenXmlBuilderCommand } = require("../adapters/pptx-openxml-dotnet");

const MAX_BUFFER_BYTES = 20 * 1024 * 1024;

async function applyComponentReplacementsWithOpenXml(options = {}) {
  const planFile = normalizeInputFile(options.planFile, ".json", "component replacement plan");
  const dryRun = options.dryRun === true;
  const out = dryRun && !options.out ? "" : normalizeOutputFile(options.out, ".pptx");
  const skillRoot = path.resolve(String(options.skillRoot || path.join(__dirname, "..", "..")));
  const projectDir = path.join(skillRoot, "dotnet", "OpenXmlDeckBuilder");
  const context = {
    skillRoot,
    config: options.openXmlBuilder ? { openXmlBuilder: options.openXmlBuilder } : {}
  };
  const builder = resolveOpenXmlBuilderCommand(context, projectDir);
  const args = [
    ...builder.args,
    "--apply-component-replacements-openxml",
    planFile
  ];
  if (out) args.push("--out", out);
  if (options.allowMissing === true) args.push("--allow-missing");
  if (dryRun) args.push("--dry-run");
  const runner = typeof options.runner === "function" ? options.runner : run;
  const result = await runner(builder.command, args, {
    cwd: projectDir,
    timeoutMs: normalizeTimeout(options.timeoutMs)
  });
  return parseOpenXmlComponentReport(result?.stdout);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_BUFFER_BYTES
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseOpenXmlComponentReport(stdout) {
  const text = String(stdout || "").trim();
  if (!text) throw new Error("OpenXML component importer returned an empty report.");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const report = JSON.parse(lines[index]);
      if (report?.provider !== "openxml-component-replacement-apply-v1" || !Array.isArray(report.operations)) continue;
      return report;
    } catch {
      // dotnet run may emit build messages before the final single-line JSON report.
    }
  }
  throw new Error("OpenXML component importer returned an invalid report.");
}

function normalizeInputFile(value, extension, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`${label} is required.`);
  const file = path.resolve(value.trim());
  if (path.extname(file).toLowerCase() !== extension || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`${label} was not found or has an invalid extension: ${file}`);
  }
  return file;
}

function normalizeOutputFile(value, extension) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error("A component replacement output file is required.");
  const file = path.resolve(value.trim());
  if (path.extname(file).toLowerCase() !== extension) throw new Error(`Component replacement output must be a ${extension} file.`);
  return file;
}

function normalizeTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1000 && number <= 30 * 60 * 1000 ? Math.floor(number) : 5 * 60 * 1000;
}

module.exports = {
  applyComponentReplacementsWithOpenXml,
  parseOpenXmlComponentReport
};
