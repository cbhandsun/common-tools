"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { COMPONENT_FAMILY_IDS } = require("./lib/component-coverage-family");

const DEFAULT_MANIFEST = path.join("skills", "pd-hifi-slideclone", "examples", "image-to-editable-component-recall-corpus.manifest.json");
const DEFAULT_OUT = path.join("runs", "image-to-editable-component-recall", "corpus-plan.json");
const MAX_CASES = 128;
const MAX_FAMILIES = 32;
const MAX_TEXT = 500;
const MAX_ZIP_ENTRIES = 4096;
const MAX_XML_BYTES = 4 * 1024 * 1024;
const ACCEPTANCE_REPORT_PROFILE = "image-to-editable-component-recall-report";
const ACCEPTANCE_GATE_PROFILE = "image-to-editable-component-recall-gate";
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function parseArgs(argv = process.argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    out: DEFAULT_OUT,
    requireArtifacts: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      args.manifest = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--require-artifacts") {
      args.requireArtifacts = true;
    } else {
      throw new Error(`Unknown image-to-editable-component-recall-corpus argument: ${arg}`);
    }
  }
  return args;
}

function buildImageToEditableComponentRecallCorpusPlan(options = {}) {
  const manifestFile = path.resolve(options.manifest || DEFAULT_MANIFEST);
  const manifest = readJson(manifestFile);
  const normalized = validateCorpusManifest(manifest);
  const cases = normalized.cases.map((entry) => normalizeCaseArtifacts(entry, options));
  const familyCounts = {};
  for (const entry of cases) {
    for (const family of entry.expectedComponentFamilies) familyCounts[family] = (familyCounts[family] || 0) + 1;
  }
  const missingRequiredComponentFamilies = normalized.requiredComponentFamilies.filter((family) => !familyCounts[family]);
  if (missingRequiredComponentFamilies.length > 0) {
    throw new Error(`image-to-editable recall corpus is missing required component families: ${missingRequiredComponentFamilies.join(", ")}`);
  }
  return {
    provider: "image-to-editable-component-recall-corpus-v1",
    generatedAt: new Date().toISOString(),
    manifest: path.relative(process.cwd(), manifestFile).replace(/\\/gu, "/"),
    id: normalized.id,
    description: normalized.description,
    summary: {
      caseCount: cases.length,
      requiredComponentFamilyTypes: normalized.requiredComponentFamilies.length,
      coveredComponentFamilyTypes: Object.keys(familyCounts).length,
      requiredComponentFamilies: normalized.requiredComponentFamilies,
      coveredComponentFamilyCounts: sortObject(familyCounts),
      missingRequiredComponentFamilies,
      acceptanceProfiles: normalized.acceptanceProfiles
    },
    cases
  };
}

function validateCorpusManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new TypeError("image-to-editable recall corpus manifest must be an object");
  const id = safeId(manifest.id, "manifest id");
  const description = safeText(manifest.description || "", "manifest description", MAX_TEXT);
  const requiredComponentFamilies = componentFamilies(manifest.requiredComponentFamilies || [], "requiredComponentFamilies");
  const acceptanceProfiles = validateAcceptanceProfiles(manifest.acceptanceProfiles || {});
  if (!Array.isArray(manifest.cases) || manifest.cases.length < 1 || manifest.cases.length > MAX_CASES) {
    throw new TypeError(`image-to-editable recall corpus cases must contain between 1 and ${MAX_CASES} entries`);
  }
  const seen = new Set();
  const cases = manifest.cases.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`corpus case ${index} must be an object`);
    const caseId = safeId(entry.id, `corpus case ${index} id`);
    if (seen.has(caseId)) throw new Error(`Duplicate image-to-editable recall corpus case id: ${caseId}`);
    seen.add(caseId);
    const expectedComponentFamilies = componentFamilies(entry.expectedComponentFamilies || [], `corpus case ${caseId} expectedComponentFamilies`);
    if (expectedComponentFamilies.length < 1) throw new Error(`corpus case ${caseId} must declare expected component families`);
    const artifacts = normalizeArtifacts(entry.artifacts, caseId);
    return Object.freeze({
      id: caseId,
      title: safeText(entry.title || caseId, `corpus case ${caseId} title`, 160),
      source: normalizeSource(entry.source, caseId),
      expectedComponentFamilies,
      artifacts,
      acceptance: normalizeAcceptance(entry.acceptance || {}, caseId, acceptanceProfiles)
    });
  });
  return Object.freeze({ id, description, requiredComponentFamilies, acceptanceProfiles, cases });
}

function validateAcceptanceProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("acceptanceProfiles must be an object");
  const recallReport = safeId(value.recallReport || ACCEPTANCE_REPORT_PROFILE, "acceptance recallReport profile");
  const coverageGate = safeId(value.coverageGate || ACCEPTANCE_GATE_PROFILE, "acceptance coverageGate profile");
  if (recallReport !== ACCEPTANCE_REPORT_PROFILE) throw new Error("acceptance recallReport profile must use image-to-editable-component-recall-report");
  if (coverageGate !== ACCEPTANCE_GATE_PROFILE) throw new Error("acceptance coverageGate profile must use image-to-editable-component-recall-gate");
  return Object.freeze({ recallReport, coverageGate });
}

function normalizeCaseArtifacts(entry, options = {}) {
  const sourcePath = resolveArtifactPath(entry.source.path, "source path", { file: true, required: options.requireArtifacts });
  const outputIr = resolveArtifactPath(entry.artifacts.outputIr, "outputIr", { file: true, required: options.requireArtifacts });
  const outputPptx = resolveArtifactPath(entry.artifacts.outputPptx, "outputPptx", { file: true, required: options.requireArtifacts });
  if (options.requireArtifacts) validatePptxOpenXml(outputPptx, entry.id);
  const artifacts = {
    source: sourcePath,
    inputWorkDir: resolveArtifactPath(entry.artifacts.inputWorkDir, "inputWorkDir", { directory: true, required: options.requireArtifacts }),
    outputIr,
    outputPptx,
    componentCandidateReport: entry.artifacts.componentCandidateReport
      ? resolveArtifactPath(entry.artifacts.componentCandidateReport, "componentCandidateReport", { file: true, required: options.requireArtifacts })
      : ""
  };
  const observedComponentFamilies = options.requireArtifacts ? observedComponentFamiliesFromIr(outputIr, entry.id) : [];
  const missingExpectedComponentFamilies = entry.expectedComponentFamilies.filter((family) => !observedComponentFamilies.includes(family));
  if (options.requireArtifacts && missingExpectedComponentFamilies.length > 0) {
    throw new Error(`corpus case ${entry.id} outputIr is missing expected component families: ${missingExpectedComponentFamilies.join(", ")}`);
  }
  return Object.freeze({
    ...entry,
    artifacts,
    observedComponentFamilies,
    missingExpectedComponentFamilies
  });
}

function normalizeArtifacts(value, caseId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`corpus case ${caseId} artifacts must be an object`);
  return Object.freeze({
    inputWorkDir: safeRelativePath(value.inputWorkDir, `corpus case ${caseId} inputWorkDir`),
    outputIr: safeRelativePath(value.outputIr, `corpus case ${caseId} outputIr`),
    outputPptx: safeRelativePath(value.outputPptx, `corpus case ${caseId} outputPptx`),
    componentCandidateReport: value.componentCandidateReport == null ? "" : safeRelativePath(value.componentCandidateReport, `corpus case ${caseId} componentCandidateReport`)
  });
}

function normalizeSource(value, caseId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`corpus case ${caseId} source must be an object`);
  const kind = safeId(value.kind || "image", `corpus case ${caseId} source kind`);
  if (!["image", "pdf", "image-pptx"].includes(kind)) throw new Error(`corpus case ${caseId} source kind is unsupported`);
  return Object.freeze({
    kind,
    path: safeRelativePath(value.path, `corpus case ${caseId} source path`),
    page: value.page == null ? null : boundedInteger(value.page, `corpus case ${caseId} source page`, 1, 10000),
    provenance: safeText(value.provenance || "", `corpus case ${caseId} source provenance`, MAX_TEXT)
  });
}

function normalizeAcceptance(value, caseId, profiles) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`corpus case ${caseId} acceptance must be an object`);
  const reportProfile = safeId(value.recallReportProfile || profiles.recallReport, `corpus case ${caseId} recallReportProfile`);
  const gateProfile = safeId(value.coverageGateProfile || profiles.coverageGate, `corpus case ${caseId} coverageGateProfile`);
  if (reportProfile !== profiles.recallReport || gateProfile !== profiles.coverageGate) {
    throw new Error(`corpus case ${caseId} acceptance profiles must match manifest acceptanceProfiles`);
  }
  return Object.freeze({
    recallReportProfile: reportProfile,
    coverageGateProfile: gateProfile,
    requiredEvidence: Object.freeze([
      "source.componentAnalysis",
      "image-to-editable-component-recall-report",
      "component-coverage-matrix",
      "outputPptx"
    ])
  });
}

function resolveArtifactPath(value, label, options = {}) {
  const relative = safeRelativePath(value, label);
  const resolved = path.resolve(relative);
  if (options.required) {
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (options.directory && !stat?.isDirectory()) throw new Error(`${label} is missing`);
    if (options.file && !stat?.isFile()) throw new Error(`${label} is missing`);
    if (options.file && stat?.size <= 0) throw new Error(`${label} is empty`);
    if (stat?.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  }
  return path.relative(process.cwd(), resolved).replace(/\\/gu, "/");
}

function validatePptxOpenXml(file, caseId) {
  const buffer = safeReadFile(path.resolve(file));
  const entries = buffer ? readZipEntries(buffer) : null;
  const requiredEntries = ["[Content_Types].xml", "ppt/presentation.xml"];
  const missingEntries = entries === null ? requiredEntries : requiredEntries.filter((entry) => !entries.has(entry));
  if (missingEntries.length > 0) {
    throw new Error(`corpus case ${caseId} outputPptx is missing OpenXML entries: ${missingEntries.join(", ")}`);
  }
  const contentTypes = extractZipEntry(buffer, entries.get("[Content_Types].xml")).toString("utf8");
  const presentation = extractZipEntry(buffer, entries.get("ppt/presentation.xml")).toString("utf8");
  if (!/<Types(?:[\s>/])/u.test(contentTypes) || !/<p:presentation(?:[\s>/])/u.test(presentation)) {
    throw new Error(`corpus case ${caseId} outputPptx is missing required presentation XML`);
  }
}

function listZipEntries(file) {
  const buffer = safeReadFile(file);
  const entries = buffer ? readZipEntries(buffer) : null;
  return entries ? new Set(entries.keys()) : null;
}

function safeReadFile(file) {
  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    return null;
  }
  return buffer;
}

function readZipEntries(buffer) {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) return null;
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) return null;
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES || centralDirectorySize <= 0 || centralDirectoryOffset < 0 || centralDirectoryOffset + centralDirectorySize > buffer.length) return null;
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset + 46 <= end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length || ![0, 8].includes(compression) || (flags & 0x0001) !== 0) return null;
    const name = buffer.toString("utf8", nameStart, nameEnd).replace(/\\/gu, "/");
    if (!isSafeZipEntryName(name) || entries.has(name)) return null;
    entries.set(name, { name, flags, compression, crc32, compressedBytes, uncompressedBytes, localOffset });
    offset = nameEnd + extraLength + commentLength;
  }
  return offset === end ? entries : null;
}

function extractZipEntry(buffer, entry) {
  if (!entry || entry.uncompressedBytes > MAX_XML_BYTES || entry.localOffset + 30 > buffer.length) throw new Error("PPTX ZIP entry is invalid");
  if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) throw new Error("PPTX ZIP local entry is invalid");
  const flags = buffer.readUInt16LE(entry.localOffset + 6);
  const compression = buffer.readUInt16LE(entry.localOffset + 8);
  const crc32Value = buffer.readUInt32LE(entry.localOffset + 14);
  const compressedBytes = buffer.readUInt32LE(entry.localOffset + 18);
  const uncompressedBytes = buffer.readUInt32LE(entry.localOffset + 22);
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const nameStart = entry.localOffset + 30;
  const nameEnd = nameStart + nameLength;
  const dataStart = nameEnd + extraLength;
  const dataEnd = dataStart + entry.compressedBytes;
  if (flags !== entry.flags || compression !== entry.compression || crc32Value !== entry.crc32 || compressedBytes !== entry.compressedBytes || uncompressedBytes !== entry.uncompressedBytes || dataEnd > buffer.length) throw new Error("PPTX ZIP local entry does not match its directory");
  if (buffer.toString("utf8", nameStart, nameEnd).replace(/\\/gu, "/") !== entry.name) throw new Error("PPTX ZIP local entry name is invalid");
  let content;
  try {
    content = entry.compression === 0
      ? Buffer.from(buffer.subarray(dataStart, dataEnd))
      : zlib.inflateRawSync(buffer.subarray(dataStart, dataEnd), { maxOutputLength: MAX_XML_BYTES });
  } catch {
    throw new Error("PPTX ZIP entry cannot be decompressed");
  }
  if (content.length !== entry.uncompressedBytes || crc32(content) !== entry.crc32) throw new Error("PPTX ZIP entry checksum is invalid");
  return content;
}

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function isSafeZipEntryName(name) {
  return Boolean(name)
    && name.length <= 512
    && !name.includes("\\")
    && !name.startsWith("/")
    && !name.includes("\u0000")
    && !name.split("/").includes("..")
    && !name.includes("//");
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function observedComponentFamiliesFromIr(file, caseId) {
  const deck = readJson(path.resolve(file));
  if (!deck || typeof deck !== "object" || Array.isArray(deck) || !Array.isArray(deck.pages)) {
    throw new Error(`corpus case ${caseId} outputIr must contain pages`);
  }
  const families = new Set();
  for (const page of deck.pages) {
    const evidence = page?.source?.componentAnalysis;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || evidence.provider !== "team-component-analysis-v1") continue;
    addFamiliesFromCounts(families, evidence.detectedComponentFamilyCounts);
    addFamiliesFromCounts(families, evidence.matchedComponentFamilyCounts);
    addFamiliesFromCounts(families, evidence.strategyComponentFamilyCounts);
    if (Array.isArray(evidence.componentFamilies)) {
      for (const row of evidence.componentFamilies) {
        const family = String(row?.family || "");
        const evidenceCount = Number(row?.detectedLayers || 0) + Number(row?.matchedLayers || 0) + Number(row?.strategyLayers || 0);
        if (COMPONENT_FAMILY_IDS.includes(family) && evidenceCount > 0) families.add(family);
      }
    }
  }
  return Object.freeze([...families].sort((a, b) => a.localeCompare(b)));
}

function addFamiliesFromCounts(target, counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return;
  for (const [family, count] of Object.entries(counts)) {
    if (COMPONENT_FAMILY_IDS.includes(family) && Number(count) > 0) target.add(family);
  }
}

function componentFamilies(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FAMILIES) throw new TypeError(`${label} must be a non-empty bounded array`);
  const out = value.map((item) => safeId(item, label));
  const unknown = out.filter((family) => !COMPONENT_FAMILY_IDS.includes(family));
  if (unknown.length > 0) throw new Error(`${label} contains unknown component families: ${unknown.join(", ")}`);
  if (new Set(out).size !== out.length) throw new Error(`${label} must not contain duplicates`);
  return Object.freeze([...out].sort((a, b) => a.localeCompare(b)));
}

function safeRelativePath(value, label) {
  const text = safeText(value, label, 1024).replace(/\\/gu, "/");
  if (!text || path.isAbsolute(text) || text.split("/").includes("..")) throw new TypeError(`${label} must be a safe relative path`);
  return text;
}

function safeId(value, label) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 128 || !/^[a-z0-9][a-z0-9_.-]*$/u.test(text)) throw new TypeError(`${label} must be a non-empty safe identifier`);
  return text;
}

function safeText(value, label, maximum) {
  const text = String(value ?? "").trim();
  if (text.length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new TypeError(`${label} is invalid`);
  return text;
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  return number;
}

function sortObject(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function main() {
  const args = parseArgs(process.argv);
  const plan = buildImageToEditableComponentRecallCorpusPlan(args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  process.stdout.write(`caseCount: ${plan.summary.caseCount}\n`);
  process.stdout.write(`coveredComponentFamilyTypes: ${plan.summary.coveredComponentFamilyTypes}\n`);
  process.stdout.write(`plan: ${path.resolve(args.out)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_MANIFEST,
  DEFAULT_OUT,
  buildImageToEditableComponentRecallCorpusPlan,
  main,
  parseArgs,
  validateCorpusManifest,
  _private: {
    componentFamilies,
    crc32,
    listZipEntries,
    normalizeSource,
    observedComponentFamiliesFromIr,
    safeRelativePath
  }
};
