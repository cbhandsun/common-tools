"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { auditProject, renderMarkdown } = require(".");
const { assertQualityReport } = require("../capability-contracts");

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 10000;
const TAR_BLOCK_SIZE = 512;
const MAX_PAX_HEADER_BYTES = 64 * 1024;
const MAX_ARCHIVE_PATH_BYTES = 4096;
const PROJECT_AUDIT_IGNORED_ARCHIVE_DIRECTORIES = Object.freeze(new Set([".claude", ".codex", ".git", ".common-tools", "node_modules", "bin", "obj", "dist", "build", "coverage"]));

function archiveMessage(label, message) { return `${label} archive ${message}`; }
function tarNumber(header, offset, length, label) {
  const raw = header.subarray(offset, offset + length).toString("utf8").replace(/\0.*$/, "").trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) throw new Error(archiveMessage(label, "has an invalid tar size"));
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(archiveMessage(label, "has an invalid tar size"));
  return value;
}
function tarText(header, offset, length) { return header.subarray(offset, offset + length).toString("utf8").replace(/\0.*$/, ""); }
function assertTarChecksum(header, label) {
  const expected = tarNumber(header, 148, 8, label); let actual = 0;
  for (let index = 0; index < header.length; index += 1) actual += index >= 148 && index < 156 ? 0x20 : header[index];
  if (expected !== actual) throw new Error(archiveMessage(label, "has an invalid tar checksum"));
}
function safeTarPath(name, label) {
  if (!name || Buffer.byteLength(name, "utf8") > MAX_ARCHIVE_PATH_BYTES || name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.startsWith("../")) throw new Error(archiveMessage(label, "contains an unsafe path"));
  const normalized = path.posix.normalize(name);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) throw new Error(archiveMessage(label, "contains an unsafe path"));
  return normalized;
}
function isZeroBlock(block) { return block.every((value) => value === 0); }
function parsePaxHeader(body, label) {
  if (!Buffer.isBuffer(body) || body.length > MAX_PAX_HEADER_BYTES) throw new Error(archiveMessage(label, "has an invalid extended header"));
  let offset = 0;
  let pathName;
  while (offset < body.length) {
    const separator = body.indexOf(0x20, offset);
    if (separator <= offset) throw new Error(archiveMessage(label, "has an invalid extended header"));
    const lengthText = body.subarray(offset, separator).toString("ascii");
    if (!/^[1-9][0-9]*$/.test(lengthText)) throw new Error(archiveMessage(label, "has an invalid extended header"));
    const recordLength = Number(lengthText);
    const recordEnd = offset + recordLength;
    if (!Number.isSafeInteger(recordLength) || recordEnd > body.length || body[recordEnd - 1] !== 0x0a) throw new Error(archiveMessage(label, "has an invalid extended header"));
    const record = body.subarray(separator + 1, recordEnd - 1);
    const equals = record.indexOf(0x3d);
    if (equals <= 0) throw new Error(archiveMessage(label, "has an invalid extended header"));
    const key = record.subarray(0, equals).toString("ascii");
    if (key === "path") {
      let value;
      try { value = new TextDecoder("utf-8", { fatal: true }).decode(record.subarray(equals + 1)); }
      catch { throw new Error(archiveMessage(label, "has an invalid extended header")); }
      if (!value || value.includes("\0")) throw new Error(archiveMessage(label, "has an invalid extended header"));
      pathName = value;
    }
    offset = recordEnd;
  }
  return pathName;
}
function normalizeIgnoredDirectories(value) {
  if (value === undefined) return new Set();
  if (!(value instanceof Set) || [...value].some((directory) => typeof directory !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(directory))) throw new TypeError("ignored archive directories are invalid");
  return value;
}
function isIgnoredArchivePath(candidate, ignoredDirectories) {
  if (!ignoredDirectories.size || typeof candidate !== "string") return false;
  const segments = candidate.split("/");
  // Ignore only known metadata/build directories. Repeated separators and a
  // leading `./` are harmless after POSIX normalization; rejecting them here
  // would make an ignored `.claude` worktree reach the filesystem instead.
  if (candidate.includes("\0") || candidate.includes("\\") || candidate.startsWith("/") || segments.includes("..")) return false;
  return segments.some((segment) => ignoredDirectories.has(segment));
}
function extractProjectArchive(archive, destination, { label = "project", ignoredDirectories, verifyChecksum = false } = {}) {
  if (typeof label !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(label)) throw new TypeError("archive label is invalid");
  if (typeof verifyChecksum !== "boolean") throw new TypeError("archive checksum policy is invalid");
  const ignored = normalizeIgnoredDirectories(ignoredDirectories);
  if (!Buffer.isBuffer(archive) || archive.length < 2 || archive.length > MAX_ARCHIVE_BYTES || archive[0] !== 0x1f || archive[1] !== 0x8b) throw new Error(`${label} input must be a gzip-compressed tar archive`);
  let tar;
  try { tar = zlib.gunzipSync(archive, { maxOutputLength: MAX_EXTRACTED_BYTES + MAX_ARCHIVE_FILES * TAR_BLOCK_SIZE }); }
  catch { throw new Error(archiveMessage(label, "cannot be decompressed safely")); }
  let offset = 0;
  let total = 0;
  let files = 0;
  let pendingPaxPath;
  let hasPendingPaxHeader = false;
  const written = new Set();
  while (offset + TAR_BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    offset += TAR_BLOCK_SIZE;
    if (isZeroBlock(header)) break;
    if (verifyChecksum) assertTarChecksum(header, label);
    const prefix = tarText(header, 345, 155);
    const baseName = tarText(header, 0, 100);
    const name = prefix ? `${prefix}/${baseName}` : baseName;
    const size = tarNumber(header, 124, 12, label);
    const type = tarText(header, 156, 1) || "0";
    const rounded = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    if (offset + rounded > tar.length) throw new Error(archiveMessage(label, "is truncated"));
    if (type === "x") {
      if (hasPendingPaxHeader) throw new Error(archiveMessage(label, "has an invalid extended header"));
      pendingPaxPath = parsePaxHeader(tar.subarray(offset, offset + size), label);
      hasPendingPaxHeader = true;
      offset += rounded;
      continue;
    }
    const candidatePath = pendingPaxPath || name;
    pendingPaxPath = undefined;
    hasPendingPaxHeader = false;
    if (isIgnoredArchivePath(candidatePath, ignored)) { offset += rounded; continue; }
    const entryPath = safeTarPath(candidatePath, label);
    if (isIgnoredArchivePath(entryPath, ignored)) { offset += rounded; continue; }
    const target = path.resolve(destination, ...entryPath.split("/"));
    if (!target.startsWith(`${destination}${path.sep}`)) throw new Error(archiveMessage(label, "contains an unsafe path"));
    if (type === "5") {
      if (size !== 0) throw new Error(archiveMessage(label, "directory is invalid"));
      fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    } else if (type === "0" || type === "\0") {
      files += 1;
      total += size;
      if (files > MAX_ARCHIVE_FILES || total > MAX_EXTRACTED_BYTES || written.has(entryPath)) throw new Error(archiveMessage(label, "exceeds safe extraction limits"));
      written.add(entryPath);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, tar.subarray(offset, offset + size), { encoding: undefined, flag: "wx", mode: 0o600 });
    } else throw new Error(archiveMessage(label, "contains an unsupported entry type"));
    offset += rounded;
  }
  if (hasPendingPaxHeader) throw new Error(archiveMessage(label, "has an invalid extended header"));
  if (!files) throw new Error(archiveMessage(label, "contains no files"));
  return { files, extractedBytes: total };
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}
function createProjectAuditArchiveHandler({ objectStore, temporaryRoot = os.tmpdir() }) {
  const store = assertObjectStore(objectStore);
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "project-audit" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("project audit worker job is invalid");
    if (await isCancellationRequested()) throw new Error("project audit was cancelled");
    const archive = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES });
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-project-audit-"));
    try {
      extractProjectArchive(archive, root, { ignoredDirectories: PROJECT_AUDIT_IGNORED_ARCHIVE_DIRECTORIES });
      if (await isCancellationRequested()) throw new Error("project audit was cancelled");
      const report = { ...auditProject(root), root: "uploaded-project" };
      const artifacts = [
        { name: "project-audit-report.json", objectKey: `${job.outputPrefix}project-audit-report.json`, mediaType: "application/json", body: Buffer.from(`${JSON.stringify(report, null, 2)}\n`) },
        { name: "project-audit-report.md", objectKey: `${job.outputPrefix}project-audit-report.md`, mediaType: "text/markdown", body: Buffer.from(renderMarkdown(report)) }
      ];
      for (const artifact of artifacts) {
        if (await isCancellationRequested()) throw new Error("project audit was cancelled");
        await store.putObject({ objectKey: artifact.objectKey, body: artifact.body, contentType: artifact.mediaType });
      }
      return { artifacts: artifacts.map((artifact) => ({ name: artifact.name, objectKey: artifact.objectKey, mediaType: artifact.mediaType, sha256: sha256(artifact.body) })), quality: assertQualityReport({ passed: true, checks: [{ name: "archive-extracted", passed: true }, { name: "reports-generated", passed: true }], metrics: { "scanned-files": report.summary.scannedFiles, warnings: report.summary.warnings, artifacts: artifacts.length } }) };
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_FILES, MAX_EXTRACTED_BYTES, createProjectAuditArchiveHandler, extractProjectArchive };
