#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fingerprintOoxmlPackage } = require("../skills/pd-hifi-slideclone/scripts/lib/ooxml-package-fingerprint");
const { listZipEntries } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");
const { validatePowerPointEditableRoundTrip } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip");

const REQUIRED_FAMILIES = Object.freeze(["list", "process", "hierarchy", "relationship", "matrix", "pyramid", "picture"]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(`${usage()}\n`);
  if (!args.manifest) throw new Error("--manifest is required.");
  const manifestFile = path.resolve(args.manifest);
  const outputDir = path.resolve(args.out || "artifacts/smartart-portability-holdout");
  const manifest = normalizeManifest(readJsonBounded(manifestFile), path.dirname(manifestFile));
  fs.mkdirSync(outputDir, { recursive: true });
  const results = manifest.cases.map(evaluateCase);
  const powerPointCases = [];
  for (const [index, item] of manifest.cases.entries()) {
    if (!item.requirePowerPointEdit) continue;
    powerPointCases.push({ file: item.hostPptx, mode: "smartart-text", resultIndex: index, environment: "host" });
    if (item.dockerPptx) powerPointCases.push({ file: item.dockerPptx, mode: "smartart-text", resultIndex: index, environment: "docker" });
  }
  if (powerPointCases.length > 0) {
    if (process.platform !== "win32") throw new Error("SmartArt PowerPoint editability holdouts require Windows unless requirePowerPointEdit is false.");
    const editReport = await validatePowerPointEditableRoundTrip(powerPointCases, { outputDir: path.join(outputDir, "powerpoint-editability"), timeoutMs: manifest.timeoutMs });
    for (let index = 0; index < editReport.results.length; index++) {
      const target = powerPointCases[index];
      results[target.resultIndex].powerPoint[target.environment] = editReport.results[index]?.verified === true;
    }
  }
  for (const result of results) result.passed = result.structurePassed && result.parityPassed && Object.values(result.powerPoint).every(Boolean);
  const families = [...new Set(manifest.cases.map((item) => item.family))].sort();
  const coveragePassed = manifest.cases.length >= manifest.minimumCases && manifest.requiredFamilies.every((family) => families.includes(family));
  const report = {
    provider: "smartart-portability-holdout-v1",
    generatedAt: new Date().toISOString(),
    passed: coveragePassed && results.every((item) => item.passed),
    coverage: { passed: coveragePassed, cases: manifest.cases.length, minimumCases: manifest.minimumCases, families, requiredFamilies: manifest.requiredFamilies },
    totals: { passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length },
    results
  };
  writeJsonAtomic(path.join(outputDir, "smartart-portability-holdout.report.json"), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function evaluateCase(item) {
  const host = inspectSmartArtPackage(item.hostPptx, item.requireImages);
  const docker = item.dockerPptx ? inspectSmartArtPackage(item.dockerPptx, item.requireImages) : null;
  const hostFingerprint = fingerprintOoxmlPackage(item.hostPptx);
  const dockerFingerprint = item.dockerPptx ? fingerprintOoxmlPackage(item.dockerPptx) : null;
  return {
    id: item.id,
    family: item.family,
    structurePassed: host.passed && (!docker || docker.passed),
    parityPassed: !item.requireDockerParity || Boolean(dockerFingerprint && dockerFingerprint === hostFingerprint),
    host: { fingerprint: hostFingerprint, ...host },
    docker: docker ? { fingerprint: dockerFingerprint, ...docker } : null,
    powerPoint: item.requirePowerPointEdit ? { host: false, ...(item.dockerPptx ? { docker: false } : {}) } : {},
    passed: false
  };
}

function inspectSmartArtPackage(file, requireImages) {
  const names = listZipEntries(file).map((entry) => entry.name.replace(/\\/gu, "/"));
  const counts = {
    data: names.filter((name) => /\/graphics\/data\d+\.xml$|\/diagrams\/data\d+\.xml$/iu.test(name)).length,
    layout: names.filter((name) => /\/graphics\/layout\d+\.xml$|\/diagrams\/layout\d+\.xml$/iu.test(name)).length,
    style: names.filter((name) => /\/graphics\/quickStyle\d+\.xml$|\/diagrams\/quickStyle\d+\.xml$/iu.test(name)).length,
    colors: names.filter((name) => /\/graphics\/colors\d+\.xml$|\/diagrams\/colors\d+\.xml$/iu.test(name)).length,
    drawing: names.filter((name) => /\/diagrams\/drawing\d*\.xml$/iu.test(name)).length,
    media: names.filter((name) => /\/media\/[^/]+\.(?:png|jpe?g)$/iu.test(name)).length
  };
  const passed = counts.data > 0 && counts.layout > 0 && counts.style > 0 && counts.colors > 0 && counts.drawing > 0 && (!requireImages || counts.media > 0);
  return { passed, counts };
}

function normalizeManifest(value, directory) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > 64) throw new Error("SmartArt holdout manifest must contain 1 to 64 schema-v1 cases.");
  const minimumCases = boundedInteger(value.minimumCases, 1, 64, 10);
  const requiredFamilies = Array.isArray(value.requiredFamilies) ? [...new Set(value.requiredFamilies.map(normalizeFamily))] : [...REQUIRED_FAMILIES];
  const seen = new Set();
  const cases = value.cases.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`SmartArt holdout case ${index + 1} is invalid.`);
    const id = String(item.id || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id) || seen.has(id)) throw new Error(`SmartArt holdout case ${index + 1} has an invalid or duplicate id.`);
    seen.add(id);
    const hostPptx = resolvePptx(directory, item.hostPptx, `${id} hostPptx`);
    const dockerPptx = item.dockerPptx ? resolvePptx(directory, item.dockerPptx, `${id} dockerPptx`) : null;
    const requireDockerParity = item.requireDockerParity !== false;
    if (requireDockerParity && !dockerPptx) throw new Error(`${id} requires a dockerPptx for parity.`);
    return { id, family: normalizeFamily(item.family), hostPptx, dockerPptx, requireDockerParity, requirePowerPointEdit: item.requirePowerPointEdit !== false, requireImages: item.requireImages === true };
  });
  return { cases, minimumCases, requiredFamilies, timeoutMs: boundedInteger(value.timeoutMs, 30000, 1800000, 300000) };
}

function normalizeFamily(value) { const family = String(value || "").trim().toLowerCase(); if (!/^[a-z][a-z0-9-]{0,47}$/u.test(family)) throw new Error("SmartArt holdout family is invalid."); return family; }
function resolvePptx(directory, value, label) { const file = path.resolve(directory, String(value || "")); const stat = fs.statSync(file, { throwIfNoEntry: false }); if (!stat?.isFile() || stat.size <= 0 || stat.size > 512 * 1024 * 1024 || path.extname(file).toLowerCase() !== ".pptx") throw new Error(`${label} is not a bounded PPTX file.`); return file; }
function readJsonBounded(file) { const stat = fs.statSync(file, { throwIfNoEntry: false }); if (!stat?.isFile() || stat.size <= 0 || stat.size > 1024 * 1024) throw new Error("SmartArt holdout manifest is missing or too large."); return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "")); }
function boundedInteger(value, minimum, maximum, fallback) { if (value == null) return fallback; const number = Number(value); if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error("SmartArt holdout numeric setting is outside the supported range."); return number; }
function writeJsonAtomic(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${Date.now()}.tmp`; try { fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fs.renameSync(temporary, file); } finally { fs.rmSync(temporary, { force: true }); } }
function parseArgs(argv) { const result = {}; const allowed = new Set(["manifest", "out", "help"]); for (let index = 0; index < argv.length; index++) { const item = argv[index]; if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`); const key = item.slice(2); if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`); if (key === "help") { result.help = true; continue; } const next = argv[++index]; if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`); if (result[key] !== undefined) throw new Error(`Duplicate option: --${key}`); result[key] = next; } return result; }
function usage() { return "Usage: node scripts/smartart-portability-holdout.js --manifest <holdout.json> [--out <directory>]"; }

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { REQUIRED_FAMILIES, evaluateCase, inspectSmartArtPackage, normalizeManifest, parseArgs };
