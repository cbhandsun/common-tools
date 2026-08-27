"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");

const CAPABILITY = "ppt-quality";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_ppt_quality_job", "get_ppt_quality_report"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "base" });
const MAX_PPTX_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 4096;
const MAX_SLIDES = 500;
const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 32 * 1024 * 1024;
const MAX_RELATIONSHIPS = 100000;
const MAX_REPORT_BYTES = 1024 * 1024;
const REPORT_JSON_NAME = "ppt-quality-report.json";
const REPORT_MARKDOWN_NAME = "ppt-quality-report.md";
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function assertSafeExistingPptx(workspaceRoot, input) {
  const approved = insideRoot(workspaceRoot, input);
  if (path.extname(approved).toLowerCase() !== ".pptx") throw new Error("PPT quality input must be a .pptx file");
  const stat = fs.lstatSync(approved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 22 || stat.size > MAX_PPTX_BYTES) throw new Error("PPT quality input is invalid");
  const realWorkspace = fs.realpathSync.native(workspaceRoot);
  const realInput = fs.realpathSync.native(approved);
  const relative = path.relative(realWorkspace, realInput);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT quality input is outside the approved workspace");
  return Object.freeze({ path: approved, bytes: stat.size, sha256: sha256File(approved) });
}

function ensureSafeOutputDirectory(workspaceRoot, output) {
  const realWorkspace = fs.realpathSync.native(workspaceRoot);
  const approved = insideRoot(realWorkspace, output);
  const relative = path.relative(realWorkspace, approved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT quality output must be a child directory of the workspace");
  let current = realWorkspace;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("PPT quality output path is invalid");
    } else fs.mkdirSync(current, { mode: 0o700 });
  }
  return approved;
}

function createPptQualityJob({ workspaceRoot, stateRoot, ownerId, input, output, idempotencyKey }) {
  const source = assertSafeExistingPptx(workspaceRoot, input);
  const approvedOutput = ensureSafeOutputDirectory(workspaceRoot, output);
  const key = idempotencyKey || crypto.createHash("sha256").update(`${source.sha256}\u0000${approvedOutput}`).digest("hex");
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!job.source) store.write({ ...job, source, output: { path: approvedOutput } });
  return store.get(job.id);
}

function findEocd(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_EOCD_SIGNATURE) continue;
    if (offset + 22 + buffer.readUInt16LE(offset + 20) !== buffer.length) continue;
    const disk = buffer.readUInt16LE(offset + 4);
    const centralDisk = buffer.readUInt16LE(offset + 6);
    const entriesOnDisk = buffer.readUInt16LE(offset + 8);
    const entries = buffer.readUInt16LE(offset + 10);
    const centralBytes = buffer.readUInt32LE(offset + 12);
    const centralOffset = buffer.readUInt32LE(offset + 16);
    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entries || entries > MAX_ZIP_ENTRIES || centralBytes === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralBytes > offset) throw new Error("PPTX ZIP directory is unsupported");
    return Object.freeze({ entries, centralOffset, centralBytes });
  }
  throw new Error("PPTX ZIP directory is missing");
}

function safeZipName(value) {
  if (!value || value.length > 512 || value.includes("\\") || value.startsWith("/") || value.includes("\u0000")) throw new Error("PPTX ZIP entry is invalid");
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.includes("//")) throw new Error("PPTX ZIP entry is invalid");
  return value;
}

function readCentralDirectory(buffer) {
  const eocd = findEocd(buffer);
  let offset = eocd.centralOffset;
  const end = offset + eocd.centralBytes;
  const entries = new Map();
  for (let index = 0; index < eocd.entries; index += 1) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) throw new Error("PPTX ZIP central entry is invalid");
    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const nameBytes = buffer.readUInt16LE(offset + 28);
    const extraBytes = buffer.readUInt16LE(offset + 30);
    const commentBytes = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > end || diskStart !== 0 || (flags & 0x0001) !== 0 || ![0, 8].includes(compression) || compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localOffset === 0xffffffff) throw new Error("PPTX ZIP entry is unsupported");
    const name = safeZipName(buffer.subarray(offset + 46, offset + 46 + nameBytes).toString("utf8"));
    if (entries.has(name)) throw new Error("PPTX ZIP contains duplicate entries");
    entries.set(name, Object.freeze({ name, flags, compression, crc32, compressedBytes, uncompressedBytes, localOffset }));
    offset = next;
  }
  if (offset !== end) throw new Error("PPTX ZIP directory has trailing data");
  return entries;
}

function extractEntry(buffer, entry, limit = MAX_XML_BYTES) {
  if (!entry || entry.uncompressedBytes > limit || entry.localOffset + 30 > buffer.length || buffer.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_SIGNATURE) throw new Error("PPTX ZIP data entry is invalid");
  const flags = buffer.readUInt16LE(entry.localOffset + 6);
  const compression = buffer.readUInt16LE(entry.localOffset + 8);
  const localCrc32 = buffer.readUInt32LE(entry.localOffset + 14);
  const compressedBytes = buffer.readUInt32LE(entry.localOffset + 18);
  const uncompressedBytes = buffer.readUInt32LE(entry.localOffset + 22);
  const nameBytes = buffer.readUInt16LE(entry.localOffset + 26);
  const extraBytes = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameBytes + extraBytes;
  const end = start + entry.compressedBytes;
  if (flags !== entry.flags || compression !== entry.compression || localCrc32 !== entry.crc32 || compressedBytes !== entry.compressedBytes || uncompressedBytes !== entry.uncompressedBytes || end > buffer.length || safeZipName(buffer.subarray(entry.localOffset + 30, entry.localOffset + 30 + nameBytes).toString("utf8")) !== entry.name) throw new Error("PPTX ZIP local entry does not match its directory");
  const compressed = buffer.subarray(start, end);
  let content;
  try { content = entry.compression === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: limit }); }
  catch { throw new Error("PPTX ZIP data entry cannot be decompressed"); }
  if (content.length !== entry.uncompressedBytes || content.length > limit || crc32(content) !== entry.crc32) throw new Error("PPTX ZIP data entry checksum is invalid");
  return content;
}

function relationshipOwnerDirectory(name) {
  if (name === "_rels/.rels") return "";
  const match = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(name);
  if (!match) return null;
  return path.posix.dirname(`${match[1]}/${match[2]}`);
}

function inspectRelationships(buffer, entries) {
  const targets = new Set();
  let scannedBytes = 0;
  let relationshipCount = 0;
  let unresolvedRelationshipCount = 0;
  let invalidRelationshipCount = 0;
  for (const entry of entries.values()) {
    if (!entry.name.endsWith(".rels")) continue;
    const base = relationshipOwnerDirectory(entry.name);
    if (base === null || entry.uncompressedBytes > MAX_XML_BYTES || scannedBytes + entry.uncompressedBytes > MAX_TOTAL_XML_BYTES) throw new Error("PPTX relationship XML is too large");
    const xml = extractEntry(buffer, entry).toString("utf8");
    scannedBytes += entry.uncompressedBytes;
    for (const match of xml.matchAll(/<Relationship\b[^>]*\bTarget=(['"])([^'"]+)\1[^>]*>/g)) {
      relationshipCount += 1;
      if (relationshipCount > MAX_RELATIONSHIPS) throw new Error("PPTX relationship count is too large");
      if (/\bTargetMode=(['"])External\1/.test(match[0])) continue;
      const target = match[2].split("#", 1)[0];
      if (!target || target.includes("\\") || target.includes("\u0000") || /^[a-z][a-z0-9+.-]*:/i.test(target)) { invalidRelationshipCount += 1; continue; }
      const normalized = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(base, target));
      if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) { invalidRelationshipCount += 1; continue; }
      targets.add(normalized);
      if (!entries.has(normalized)) unresolvedRelationshipCount += 1;
    }
  }
  return Object.freeze({ targets, relationshipCount, unresolvedRelationshipCount, invalidRelationshipCount });
}

function unusedMediaEntries(buffer, entries) {
  const { targets } = inspectRelationships(buffer, entries);
  return [...entries.values()].filter((entry) => /^ppt\/media\/[^/]+$/.test(entry.name) && !targets.has(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
}

function countMatches(content, expression) {
  return [...content.matchAll(expression)].length;
}

function inspectPptx(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 22 || buffer.length > MAX_PPTX_BYTES || buffer.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) throw new Error("PPT quality input is not a supported PPTX ZIP");
  const entries = readCentralDirectory(buffer);
  const contentTypes = extractEntry(buffer, entries.get("[Content_Types].xml"));
  const presentation = extractEntry(buffer, entries.get("ppt/presentation.xml"));
  const contentTypesText = contentTypes.toString("utf8");
  const presentationText = presentation.toString("utf8");
  if (!/<Types(?:\s|>)/.test(contentTypesText) || !/presentationml\.presentation\.main\+xml/.test(contentTypesText) || !/<p:presentation(?:\s|>)/.test(presentationText)) throw new Error("PPTX required presentation structure is missing");
  const slideEntries = [...entries.values()].filter((entry) => /^ppt\/slides\/slide([1-9]\d*)\.xml$/.test(entry.name)).sort((left, right) => Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(left.name)[1]) - Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(right.name)[1]));
  if (!slideEntries.length || slideEntries.length > MAX_SLIDES) throw new Error("PPTX slide count is invalid");
  let xmlBytes = contentTypes.length + presentation.length;
  let textShapes = 0;
  let pictures = 0;
  let tables = 0;
  let emptySlides = 0;
  for (const entry of slideEntries) {
    if (xmlBytes + entry.uncompressedBytes > MAX_TOTAL_XML_BYTES) throw new Error("PPTX XML content is too large");
    const slide = extractEntry(buffer, entry);
    xmlBytes += slide.length;
    const text = slide.toString("utf8");
    if (!/<p:sld(?:\s|>)/.test(text)) throw new Error("PPTX slide XML is invalid");
    const slideTextShapes = countMatches(text, /<p:sp(?:\s|\/?>)/g);
    const slidePictures = countMatches(text, /<p:pic(?:\s|\/?>)/g);
    const slideTables = countMatches(text, /<a:tbl(?:\s|\/?>)/g);
    textShapes += slideTextShapes;
    pictures += slidePictures;
    tables += slideTables;
    if (slideTextShapes + slidePictures + slideTables === 0) emptySlides += 1;
  }
  const media = [...entries.keys()].filter((name) => /^ppt\/media\/[^/]+$/.test(name)).length;
  const relationships = inspectRelationships(buffer, entries);
  const unusedMedia = [...entries.values()].filter((entry) => /^ppt\/media\/[^/]+$/.test(entry.name) && !relationships.targets.has(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
  const notes = [...entries.keys()].filter((name) => /^ppt\/notesSlides\/notesSlide[1-9]\d*\.xml$/.test(name)).length;
  return Object.freeze({ archiveBytes: buffer.length, slideCount: slideEntries.length, mediaCount: media, unusedMediaCount: unusedMedia.length, notesCount: notes, textShapeCount: textShapes, pictureCount: pictures, tableCount: tables, emptySlideCount: emptySlides, xmlBytes, relationshipCount: relationships.relationshipCount, unresolvedRelationshipCount: relationships.unresolvedRelationshipCount, invalidRelationshipCount: relationships.invalidRelationshipCount, unusedMediaEntries: Object.freeze(unusedMedia) });
}

function qualityFromReport(report, artifactCount) {
  const metrics = { "archive-bytes": report.summary.archiveBytes, "slide-count": report.summary.slideCount, "media-count": report.summary.mediaCount, "unused-media-count": report.summary.unusedMediaCount, "notes-count": report.summary.notesCount, "text-shape-count": report.summary.textShapeCount, "picture-count": report.summary.pictureCount, "table-count": report.summary.tableCount, "empty-slide-count": report.summary.emptySlideCount, "relationship-count": report.summary.relationshipCount, "unresolved-relationship-count": report.summary.unresolvedRelationshipCount, "invalid-relationship-count": report.summary.invalidRelationshipCount, "artifact-count": artifactCount };
  const checks = [{ name: "pptx-structure", passed: true }, { name: "slides-present", passed: report.summary.slideCount > 0 }, { name: "slide-content", passed: report.summary.slideCount === 0 || report.summary.emptySlideCount < report.summary.slideCount }, { name: "internal-relationships", passed: report.summary.unresolvedRelationshipCount === 0 && report.summary.invalidRelationshipCount === 0 }, { name: "reports-generated", passed: artifactCount === 2 }];
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics });
}

function auditPptx(source) {
  const inspected = inspectPptx(source.path);
  const summary = Object.fromEntries(Object.entries(inspected).filter(([key]) => key !== "unusedMediaEntries"));
  const findings = [];
  if (summary.emptySlideCount > 0) findings.push({ id: "empty-slides", severity: "warn", count: summary.emptySlideCount, message: "One or more slides contain no text shape, picture, or table." });
  if (summary.notesCount === 0) findings.push({ id: "speaker-notes", severity: "info", count: 0, message: "No speaker notes were detected." });
  if (summary.textShapeCount === 0) findings.push({ id: "editable-text", severity: "warn", count: 0, message: "No editable text shapes were detected." });
  if (summary.unusedMediaCount > 0) findings.push({ id: "orphaned-media", severity: "warn", count: summary.unusedMediaCount, message: "Unused media can be removed by the separate ppt-improve capability." });
  const brokenRelationships = summary.unresolvedRelationshipCount + summary.invalidRelationshipCount;
  if (brokenRelationships > 0) findings.push({ id: "broken-relationships", severity: "error", count: brokenRelationships, message: "One or more internal OOXML relationships do not resolve safely inside the package." });
  return Object.freeze({ version: "0.1.0", capability: CAPABILITY, generatedAt: new Date().toISOString(), source: { sha256: source.sha256, bytes: source.bytes }, summary, findings });
}

function writeAtomically(file, contents) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, file);
}
function artifact(file, name, mediaType) { return { name, mediaType, uri: file, sha256: sha256File(file) }; }
function renderMarkdown(report, quality) {
  const rows = [["Slides", report.summary.slideCount], ["Empty slides", report.summary.emptySlideCount], ["Text shapes", report.summary.textShapeCount], ["Pictures", report.summary.pictureCount], ["Tables", report.summary.tableCount], ["Media files", report.summary.mediaCount], ["Unused media", report.summary.unusedMediaCount], ["Speaker notes", report.summary.notesCount], ["Internal relationships", report.summary.relationshipCount], ["Unresolved relationships", report.summary.unresolvedRelationshipCount], ["Invalid relationships", report.summary.invalidRelationshipCount]];
  const findings = report.findings.length ? report.findings.map((finding) => `| ${finding.id} | ${finding.severity} | ${finding.count} | ${finding.message} |`).join("\n") : "| none | info | 0 | No advisory findings. |";
  return `# PPT quality report\n\n- Source SHA-256: \`${report.source.sha256}\`\n- Quality gate: ${quality.passed ? "pass" : "review"}\n\n| Metric | Value |\n| --- | ---: |\n${rows.map(([name, value]) => `| ${name} | ${value} |`).join("\n")}\n\n| Finding | Severity | Count | Message |\n| --- | --- | ---: | --- |\n${findings}\n\nThis report is read-only. Use a separate improvement capability to create a new PPTX, then audit that new file again.\n`;
}
function writeReport(outputRoot, report) {
  const jsonFile = path.join(outputRoot, REPORT_JSON_NAME);
  const markdownFile = path.join(outputRoot, REPORT_MARKDOWN_NAME);
  const provisionalQuality = qualityFromReport(report, 2);
  writeAtomically(jsonFile, `${JSON.stringify({ ...report, quality: provisionalQuality }, null, 2)}\n`);
  writeAtomically(markdownFile, renderMarkdown(report, provisionalQuality));
  return [artifact(jsonFile, REPORT_JSON_NAME, "application/json"), artifact(markdownFile, REPORT_MARKDOWN_NAME, "text/markdown")];
}

function runPptQualityJob({ workspaceRoot, stateRoot, ownerId, id }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.capability !== CAPABILITY || job.status !== "queued" || !job.source || !job.output?.path) throw new Error("PPT quality job is incomplete");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  try {
    const source = assertSafeExistingPptx(workspaceRoot, job.source.path);
    if (source.sha256 !== job.source.sha256 || source.bytes !== job.source.bytes) throw new Error("PPT quality input changed after the job was created");
    const output = ensureSafeOutputDirectory(workspaceRoot, job.output.path);
    const report = auditPptx(source);
    const artifacts = writeReport(output, report);
    return store.transition(id, "succeeded", { artifacts, quality: qualityFromReport(report, artifacts.length), lease: undefined });
  } catch (error) {
    return store.transition(id, "failed", { error: { code: "PPT_QUALITY_FAILED", message: error instanceof Error ? error.message.slice(0, 4096) : "PPT quality audit failed", retryable: false }, lease: undefined });
  }
}

function pptQualitySummary(job, workspaceRoot) {
  try {
    if (!job || job.capability !== CAPABILITY || job.status !== "succeeded" || !job.output?.path) throw new Error("unavailable");
    const reportFile = insideRoot(workspaceRoot, path.join(job.output.path, REPORT_JSON_NAME));
    const artifactValue = Array.isArray(job.artifacts) ? job.artifacts.find((item) => item?.name === REPORT_JSON_NAME && item.mediaType === "application/json" && item.uri === reportFile && typeof item.sha256 === "string") : null;
    const stat = fs.lstatSync(reportFile);
    const realWorkspace = fs.realpathSync.native(workspaceRoot);
    const realReport = fs.realpathSync.native(reportFile);
    const relative = path.relative(realWorkspace, realReport);
    if (!artifactValue || !stat.isFile() || stat.isSymbolicLink() || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || stat.size < 2 || stat.size > MAX_REPORT_BYTES || sha256File(reportFile) !== artifactValue.sha256) throw new Error("unavailable");
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    const summary = report?.summary;
    if (!report || report.capability !== CAPABILITY || typeof report.generatedAt !== "string" || !report.source || !/^[a-f0-9]{64}$/.test(report.source.sha256 || "") || !Number.isSafeInteger(report.source.bytes) || report.source.bytes < 22 || report.source.bytes > MAX_PPTX_BYTES || !summary || typeof summary !== "object") throw new Error("unavailable");
    const fields = ["archiveBytes", "slideCount", "mediaCount", "unusedMediaCount", "notesCount", "textShapeCount", "pictureCount", "tableCount", "emptySlideCount", "xmlBytes", "relationshipCount", "unresolvedRelationshipCount", "invalidRelationshipCount"];
    const countFields = ["mediaCount", "unusedMediaCount", "notesCount", "textShapeCount", "pictureCount", "tableCount", "emptySlideCount", "relationshipCount", "unresolvedRelationshipCount", "invalidRelationshipCount"];
    if (!Number.isSafeInteger(summary.archiveBytes) || summary.archiveBytes < 22 || summary.archiveBytes > MAX_PPTX_BYTES || !Number.isSafeInteger(summary.slideCount) || summary.slideCount < 1 || summary.slideCount > MAX_SLIDES || countFields.some((field) => !Number.isSafeInteger(summary[field]) || summary[field] < 0 || summary[field] > MAX_RELATIONSHIPS) || !Number.isSafeInteger(summary.xmlBytes) || summary.xmlBytes < 0 || summary.xmlBytes > MAX_TOTAL_XML_BYTES || summary.unusedMediaCount > summary.mediaCount || summary.emptySlideCount > summary.slideCount || summary.unresolvedRelationshipCount + summary.invalidRelationshipCount > summary.relationshipCount || !Array.isArray(report.findings) || report.findings.length > 5 || !report.quality) throw new Error("unavailable");
    const quality = assertQualityReport(report.quality);
    return Object.freeze({ source: Object.freeze({ sha256: report.source.sha256, bytes: report.source.bytes }), summary: Object.freeze(Object.fromEntries(fields.map((field) => [field, summary[field]]))), quality, findings: Object.freeze(report.findings.map((finding) => {
      if (!finding || typeof finding !== "object" || !["empty-slides", "speaker-notes", "editable-text", "orphaned-media", "broken-relationships"].includes(finding.id) || !["info", "warn", "error"].includes(finding.severity) || !Number.isSafeInteger(finding.count) || finding.count < 0 || typeof finding.message !== "string" || finding.message.length > 160) throw new Error("unavailable");
      return Object.freeze({ id: finding.id, severity: finding.severity, count: finding.count, message: finding.message });
    })) });
  } catch { return null; }
}

module.exports = { CAPABILITY, REGISTRATION, REPORT_JSON_NAME, REPORT_MARKDOWN_NAME, assertSafeExistingPptx, auditPptx, createPptQualityJob, crc32, ensureSafeOutputDirectory, inspectPptx, inspectRelationships, pptQualitySummary, qualityFromReport, readCentralDirectory, renderMarkdown, runPptQualityJob, unusedMediaEntries, writeReport };
