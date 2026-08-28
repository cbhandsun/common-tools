"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { createPptCreateHandler } = require("../packages/ppt-create-core/team-worker");
const { admitPptCreateArchive, createPptCreateArchive, tarEntry } = require("../packages/ppt-create-core/team-archive");
const { crc32 } = require("../packages/ppt-quality-core");
const { setCapabilityEnabled } = require("../packages/capability-runtime");

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function storedZip(entries) {
  const local = []; const central = []; let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name); const content = Buffer.from(value); const checksum = crc32(content); const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([header, nameBytes, content]); local.push(localEntry); const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(content.length, 20); record.writeUInt32LE(content.length, 24); record.writeUInt16LE(nameBytes.length, 28); record.writeUInt32LE(offset, 42); central.push(Buffer.concat([record, nameBytes])); offset += localEntry.length;
  }
  const directory = Buffer.concat(central); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(offset, 16); return Buffer.concat([...local, directory, eocd]);
}
function templateFixture() {
  const rels = (items) => `<Relationships>${items.map(([id, target]) => `<Relationship Id="${id}" Target="${target}"/>`).join("")}</Relationships>`;
  return storedZip([
    ["[Content_Types].xml", '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'], ["_rels/.rels", rels([["rId1", "ppt/presentation.xml"]])],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="urn:r"/></p:sldIdLst></p:presentation>'], ["ppt/_rels/presentation.xml.rels", rels([["rId1", "slides/slide1.xml"], ["rId2", "slideMasters/slideMaster1.xml"]])],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p"><p:cSld><p:spTree><p:sp/></p:spTree></p:cSld></p:sld>'], ["ppt/slides/_rels/slide1.xml.rels", rels([["rId1", "../slideLayouts/slideLayout1.xml"]])],
    ["ppt/slideMasters/slideMaster1.xml", '<p:sldMaster xmlns:p="urn:p"/>'], ["ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([["rId1", "../slideLayouts/slideLayout1.xml"]])],
    ["ppt/slideLayouts/slideLayout1.xml", '<p:sldLayout xmlns:p="urn:p"/>'], ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "../slideMasters/slideMaster1.xml"]])]
  ]);
}
function fakePdf({ outFile, sourceFingerprint, pageCount }) {
  const pages = Array.from({ length: pageCount }, (_, index) => `${index + 1} 0 obj << /Type /Page /Parent 99 0 R >> endobj`).join("\n");
  fs.writeFileSync(outFile, `%PDF-1.4\n${pages}\n99 0 obj << /Type /Pages /Count ${pageCount} >> endobj\n%%EOF`, { flag: "wx" }); return { sourceFingerprint };
}

test("ppt-create archive carries hash-bound assets and an authorized template through the team worker", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-team-archive-"));
  try {
    const media = path.join(root, "media"); fs.mkdirSync(media); const longName = `${"设计".repeat(30)}.png`; const imageFile = path.join(media, longName);
    fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), imageFile);
    const templateBytes = templateFixture(); const templateFile = path.join(root, "brand.pptx"); fs.writeFileSync(templateFile, templateBytes);
    const spec = { version: "1.0", title: "远程安全归档", assets: [{ id: "hero", path: `media/${longName}`, sha256: sha256(fs.readFileSync(imageFile)), source: { kind: "original", locator: "internal design", license: "company-owned" } }], template: { path: "brand.pptx", sha256: sha256(templateBytes), source: { kind: "customer-provided", locator: "customer upload", license: "owned-or-authorized" }, mode: "master-and-theme" }, slides: [{ id: "cover", role: "cover", title: "远程安全归档" }, { id: "media", role: "content", title: "带素材页面", layout: "media-frame-v1", visual: { kind: "media", mediaType: "image", alt: "蓝色来源图片", assetId: "hero" }, items: [{ id: "fact", label: "来源已验证" }] }] };
    const specFile = path.join(root, "spec.json"); fs.writeFileSync(specFile, JSON.stringify(spec)); const archiveFile = path.join(root, "delivery.tar.gz");
    const created = createPptCreateArchive({ specFile, outputFile: archiveFile }); assert.equal(created.assets, 1); assert.equal(created.template, true); assert.equal(created.contentType, "application/gzip");
    const archive = fs.readFileSync(archiveFile); const stored = new Map(); let templateReceived = false;
    const handler = createPptCreateHandler({ objectStore: { readObject: async () => archive, putObject: async ({ objectKey, body, contentType }) => stored.set(objectKey, { body, contentType }) }, buildPptx: ({ irFile, outFile, templatePptx }) => { const ir = JSON.parse(fs.readFileSync(irFile)); assert.equal(ir.pages[1].images[0].assetPath, "assets/hero.png"); assert.equal(fs.existsSync(path.join(path.dirname(irFile), "assets", "hero.png")), true); templateReceived = Boolean(templatePptx && fs.existsSync(templatePptx)); fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64)]), { flag: "wx" }); }, buildPdf: fakePdf, temporaryRoot: os.tmpdir() });
    const result = await handler({ job: { capability: "ppt-create", inputObjectKey: "owners/hash/inputs/archive", outputPrefix: "owners/hash/jobs/1/" }, isCancellationRequested: async () => false });
    assert.equal(result.quality.passed, true); assert.equal(templateReceived, true); assert.equal(result.quality.metrics["declared-assets"], 1); assert.equal(stored.has("owners/hash/jobs/1/template-manifest.json"), true);
    const assets = JSON.parse(stored.get("owners/hash/jobs/1/asset-manifest.json").body); assert.equal(assets.assets[0].source.license, "company-owned"); assert.equal(assets.assets[0].file, undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("ppt-create archive admission rejects undeclared files, tampering, overwrite, and malformed inputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-team-archive-invalid-"));
  try {
    const specFile = path.join(root, "spec.json"); fs.writeFileSync(specFile, JSON.stringify({ version: "1.0", title: "安全归档", slides: [{ id: "cover", role: "cover", title: "安全归档" }] })); const archiveFile = path.join(root, "delivery.tar.gz"); createPptCreateArchive({ specFile, outputFile: archiveFile });
    assert.throws(() => createPptCreateArchive({ specFile, outputFile: archiveFile }), /already exists/);
    const tar = zlib.gunzipSync(fs.readFileSync(archiveFile)); const injected = zlib.gzipSync(Buffer.concat([tar.subarray(0, -1024), tarEntry("undeclared.txt", Buffer.from("unsafe")), Buffer.alloc(1024)]));
    const destination = path.join(root, "injected"); fs.mkdirSync(destination); assert.throws(() => admitPptCreateArchive(injected, destination), /undeclared or missing/);
    const corruptedTar = Buffer.from(tar); corruptedTar[0] ^= 0x01; const corrupted = zlib.gzipSync(corruptedTar); const checksumDestination = path.join(root, "checksum"); fs.mkdirSync(checksumDestination); assert.throws(() => admitPptCreateArchive(corrupted, checksumDestination), /tar checksum/);
    const malformed = path.join(root, "malformed"); fs.mkdirSync(malformed); assert.throws(() => admitPptCreateArchive(Buffer.from("not-gzip"), malformed), /gzip-compressed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("CLI creates a new workspace-contained ppt-create archive without exposing source content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-team-archive-cli-"));
  try {
    const state = path.join(root, "state"); setCapabilityEnabled(state, "ppt-create", true); const specFile = path.join(root, "spec.json"); fs.writeFileSync(specFile, JSON.stringify({ version: "1.0", title: "CLI 安全归档", slides: [{ id: "cover", role: "cover", title: "CLI 安全归档" }] }));
    const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js"); const result = childProcess.spawnSync(process.execPath, [cli, "ppt", "archive", "--workspace", root, "--state", state, "--input", "spec.json", "--out", "delivery.tar.gz"], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout); assert.equal(report.contentType, "application/gzip"); assert.equal(report.assets, 0); assert.equal(fs.existsSync(path.join(root, "delivery.tar.gz")), true); assert.doesNotMatch(result.stdout, /CLI 安全归档/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
