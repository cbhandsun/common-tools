"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { extractProjectArchive, MAX_ARCHIVE_BYTES, MAX_EXTRACTED_BYTES } = require("../project-audit-core/team-worker");
const { resolveAssetPack } = require("./assets");
const { MAX_SPEC_BYTES, parsePresentationSpec } = require("./spec");
const { resolveTemplate } = require("./template");

const ARCHIVE_VERSION = "1.0";
const ARCHIVE_MANIFEST = "ppt-create-archive.json";
const ARCHIVE_SPEC = "presentation.json";
const MAX_ARCHIVE_ENTRIES = 102;
const TAR_BLOCK_SIZE = 512;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safeArchivePath(value, label) {
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > 4096 || value.includes("\0") || value.includes("\\") || value.startsWith("/") || value.startsWith("../") || path.posix.normalize(value) !== value) throw new Error(`${label} is invalid`);
  return value;
}
function tarText(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > length) throw new Error("ppt-create archive tar field is too long");
  bytes.copy(buffer, offset);
}
function tarHeader(name, bodyLength, type = "0") {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  tarText(header, 0, 100, name);
  tarText(header, 100, 8, "0000600\0");
  tarText(header, 108, 8, "0000000\0");
  tarText(header, 116, 8, "0000000\0");
  tarText(header, 124, 12, `${bodyLength.toString(8).padStart(11, "0")}\0`);
  tarText(header, 136, 12, "00000000000\0");
  tarText(header, 148, 8, "        ");
  tarText(header, 156, 1, type);
  tarText(header, 257, 6, "ustar\0");
  tarText(header, 263, 2, "00");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  tarText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}
function tarBody(body) { return Buffer.concat([body, Buffer.alloc((TAR_BLOCK_SIZE - (body.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE)]); }
function paxRecord(name) {
  const payload = `path=${name}\n`;
  let length = Buffer.byteLength(payload, "utf8") + 3;
  while (true) {
    const record = `${length} ${payload}`;
    const actual = Buffer.byteLength(record, "utf8");
    if (actual === length) return Buffer.from(record, "utf8");
    length = actual;
  }
}
function tarEntry(name, body) {
  const safeName = safeArchivePath(name, "ppt-create archive entry path");
  if (!Buffer.isBuffer(body)) throw new TypeError("ppt-create archive entry body is invalid");
  if (Buffer.byteLength(safeName, "utf8") <= 100) return Buffer.concat([tarHeader(safeName, body.length), tarBody(body)]);
  const identifier = sha256(Buffer.from(safeName, "utf8")).slice(0, 24);
  const pax = paxRecord(safeName);
  return Buffer.concat([tarHeader(`PaxHeaders/${identifier}`, pax.length, "x"), tarBody(pax), tarHeader(`PaxEntry/${identifier}`, body.length), tarBody(body)]);
}
function assertNewArchiveOutput(outputFile) {
  if (typeof outputFile !== "string" || !path.isAbsolute(outputFile) || !/(?:[.]tar[.]gz|[.]tgz)$/iu.test(outputFile)) throw new TypeError("ppt-create archive output must be an absolute .tar.gz or .tgz path");
  if (fs.existsSync(outputFile)) throw new Error("ppt-create archive output already exists");
  const parent = path.dirname(outputFile); const info = fs.lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("ppt-create archive output directory is invalid");
}
function archiveManifest(specBytes, assets, template) {
  const files = [
    ...assets.map((asset) => Object.freeze({ path: asset.path, role: "asset", sha256: asset.sha256, bytes: asset.bytes })),
    ...(template ? [Object.freeze({ path: template.path, role: "template", sha256: template.sha256, bytes: template.bytes })] : [])
  ];
  return Object.freeze({ version: ARCHIVE_VERSION, capability: "ppt-create", spec: Object.freeze({ path: ARCHIVE_SPEC, sha256: sha256(specBytes), bytes: specBytes.length }), files: Object.freeze(files) });
}
function createPptCreateArchive({ specFile, outputFile }) {
  if (typeof specFile !== "string" || !path.isAbsolute(specFile)) throw new TypeError("ppt-create archive spec file must be absolute");
  const info = fs.lstatSync(specFile);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_SPEC_BYTES) throw new Error("ppt-create archive spec file is invalid");
  assertNewArchiveOutput(outputFile);
  const specBytes = fs.readFileSync(specFile); const spec = parsePresentationSpec(specBytes);
  const assets = resolveAssetPack(specFile, spec.assets || []); const template = resolveTemplate(specFile, spec.template);
  const manifest = archiveManifest(specBytes, assets, template);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const entries = [Object.freeze({ path: ARCHIVE_MANIFEST, body: manifestBytes }), Object.freeze({ path: ARCHIVE_SPEC, body: specBytes }), ...assets.map((asset) => Object.freeze({ path: asset.path, body: fs.readFileSync(asset.file) })), ...(template ? [Object.freeze({ path: template.path, body: fs.readFileSync(template.file) })] : [])];
  if (entries.length > MAX_ARCHIVE_ENTRIES || entries.reduce((total, entry) => total + entry.body.length, 0) > MAX_EXTRACTED_BYTES) throw new Error("ppt-create archive exceeds safe extraction limits");
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("ppt-create archive paths must be unique");
  const archive = zlib.gzipSync(Buffer.concat([...entries.map((entry) => tarEntry(entry.path, entry.body)), Buffer.alloc(TAR_BLOCK_SIZE * 2)]), { level: 9, mtime: 0 });
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error("ppt-create archive exceeds the upload limit");
  const temporary = `${outputFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, archive, { flag: "wx", mode: 0o600 }); fs.renameSync(temporary, outputFile); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch { /* preserve the primary failure */ } throw error; }
  return Object.freeze({ archive: outputFile, contentType: "application/gzip", contentLength: archive.length, sha256: sha256(archive), specSha256: manifest.spec.sha256, assets: assets.length, template: Boolean(template) });
}
function parseArchiveManifest(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2 || buffer.length > 256 * 1024) throw new Error("ppt-create archive manifest size is invalid");
  let value; try { value = JSON.parse(buffer.toString("utf8")); } catch { throw new Error("ppt-create archive manifest is invalid JSON"); }
  if (!plainObject(value) || Object.keys(value).sort().join(",") !== "capability,files,spec,version" || value.version !== ARCHIVE_VERSION || value.capability !== "ppt-create" || !plainObject(value.spec) || Object.keys(value.spec).sort().join(",") !== "bytes,path,sha256" || value.spec.path !== ARCHIVE_SPEC || !Number.isSafeInteger(value.spec.bytes) || value.spec.bytes < 1 || value.spec.bytes > MAX_SPEC_BYTES || !/^[a-f0-9]{64}$/u.test(value.spec.sha256 || "") || !Array.isArray(value.files) || value.files.length > MAX_ARCHIVE_ENTRIES - 2) throw new Error("ppt-create archive manifest is invalid");
  const seen = new Set([ARCHIVE_MANIFEST, ARCHIVE_SPEC]);
  const files = value.files.map((entry) => {
    if (!plainObject(entry) || Object.keys(entry).sort().join(",") !== "bytes,path,role,sha256" || !["asset", "template"].includes(entry.role) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > MAX_EXTRACTED_BYTES || !/^[a-f0-9]{64}$/u.test(entry.sha256 || "")) throw new Error("ppt-create archive file record is invalid");
    const entryPath = safeArchivePath(entry.path, "ppt-create archive file path"); if (seen.has(entryPath)) throw new Error("ppt-create archive paths must be unique"); seen.add(entryPath);
    return Object.freeze({ path: entryPath, role: entry.role, sha256: entry.sha256, bytes: entry.bytes });
  });
  if (files.filter((entry) => entry.role === "template").length > 1) throw new Error("ppt-create archive contains too many templates");
  return Object.freeze({ version: ARCHIVE_VERSION, capability: "ppt-create", spec: Object.freeze({ ...value.spec }), files: Object.freeze(files) });
}
function listExtractedFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("ppt-create archive extraction contains a symbolic link");
      if (entry.isDirectory()) walk(file); else if (entry.isFile()) files.push(path.relative(root, file).replaceAll("\\", "/")); else throw new Error("ppt-create archive extraction contains an unsupported entry");
    }
  }
  walk(root); return files.sort();
}
function admitPptCreateArchive(archive, destination) {
  if (!Buffer.isBuffer(archive)) throw new TypeError("ppt-create archive input is invalid");
  extractProjectArchive(archive, destination, { label: "ppt-create", verifyChecksum: true });
  const manifestFile = path.join(destination, ARCHIVE_MANIFEST); const specFile = path.join(destination, ARCHIVE_SPEC);
  if (!fs.existsSync(manifestFile) || !fs.existsSync(specFile)) throw new Error("ppt-create archive is missing its manifest or spec");
  const manifest = parseArchiveManifest(fs.readFileSync(manifestFile)); const specBytes = fs.readFileSync(specFile);
  if (specBytes.length !== manifest.spec.bytes || sha256(specBytes) !== manifest.spec.sha256) throw new Error("ppt-create archive spec does not match its manifest");
  const spec = parsePresentationSpec(specBytes);
  const expected = [ARCHIVE_MANIFEST, ARCHIVE_SPEC, ...manifest.files.map((entry) => entry.path)].sort(); const actual = listExtractedFiles(destination);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("ppt-create archive contains undeclared or missing files");
  const expectedAssets = (spec.assets || []).map((asset) => Object.freeze({ path: asset.path, role: "asset", sha256: asset.sha256 }));
  const expectedTemplate = spec.template ? [Object.freeze({ path: spec.template.path, role: "template", sha256: spec.template.sha256 })] : [];
  const declared = manifest.files.map((entry) => ({ path: entry.path, role: entry.role, sha256: entry.sha256 }));
  if (JSON.stringify(declared) !== JSON.stringify([...expectedAssets, ...expectedTemplate])) throw new Error("ppt-create archive files do not match PresentationSpec");
  for (const entry of manifest.files) {
    const file = path.resolve(destination, ...entry.path.split("/")); const fileInfo = fs.lstatSync(file); const body = fs.readFileSync(file);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size !== entry.bytes || sha256(body) !== entry.sha256) throw new Error("ppt-create archive file does not match its manifest");
  }
  const assets = resolveAssetPack(specFile, spec.assets || []); const template = resolveTemplate(specFile, spec.template);
  return Object.freeze({ spec, specBytes, specFile, assets, template, manifest });
}

module.exports = { ARCHIVE_MANIFEST, ARCHIVE_SPEC, ARCHIVE_VERSION, MAX_ARCHIVE_ENTRIES, admitPptCreateArchive, createPptCreateArchive, parseArchiveManifest, tarEntry };
