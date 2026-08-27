"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const { auditSourceMediaExclusion } = require("../skills/pd-hifi-slideclone/scripts/lib/source-media-exclusion");
const { enrichReconstructionContracts } = require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-contract");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-source-media-"));
  const source = path.join(root, "source.png");
  const rgba = Buffer.alloc(64 * 36 * 4, 255);
  for (let y = 0; y < 36; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = (y * 64 + x) * 4;
      rgba[offset] = x * 4;
      rgba[offset + 1] = y * 7;
      rgba[offset + 2] = (x + y) * 2;
    }
  }
  writePng(source, { width: 64, height: 36, rgba });
  const rawIr = {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, sourceImage: source, textBoxes: [], shapes: [], images: [], tables: [], charts: [], icons: [] }]
  };
  const ir = enrichReconstructionContracts(rawIr, { baseDir: root });
  return { root, source, ir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("source-media exclusion rejects exact canonical page media", () => {
  const fixture = setup();
  try {
    const pptx = path.join(fixture.root, "exact.pptx");
    writeStoredZip(pptx, [{ name: "ppt/media/image1.png", data: fs.readFileSync(fixture.source) }]);
    const report = auditSourceMediaExclusion({ ir: fixture.ir, pptxFile: pptx, baseDir: fixture.root });
    assert.equal(report.passed, false);
    assert.equal(report.status, "failed");
    assert.equal(report.exactMatches, 1);
    assert.equal(report.disallowedMatches, 1);
  } finally {
    fixture.cleanup();
  }
});

test("source-media exclusion detects a perceptually identical re-encoded PNG", () => {
  const fixture = setup();
  try {
    const changed = Buffer.from(fs.readFileSync(fixture.source));
    const decoded = require("../skills/pd-hifi-slideclone/scripts/lib/png").readPngBuffer(changed);
    decoded.rgba[0] = decoded.rgba[0] ^ 1;
    const variant = path.join(fixture.root, "variant.png");
    writePng(variant, decoded);
    const pptx = path.join(fixture.root, "perceptual.pptx");
    writeStoredZip(pptx, [{ name: "ppt/media/image1.png", data: fs.readFileSync(variant) }]);
    const report = auditSourceMediaExclusion({ ir: fixture.ir, pptxFile: pptx, baseDir: fixture.root });
    assert.equal(report.passed, false);
    assert.equal(report.perceptualMatches, 1);
    assert.equal(report.matches[0].matchType, "perceptual");
  } finally {
    fixture.cleanup();
  }
});

test("canonical page media requires an explicit reasoned whitelist", () => {
  const fixture = setup();
  try {
    fixture.ir.pages[0].reconstruction.allowCanonicalMedia = true;
    fixture.ir.pages[0].reconstruction.allowCanonicalMediaReason = "approved decorative background";
    const pptx = path.join(fixture.root, "allowed.pptx");
    writeStoredZip(pptx, [{ name: "ppt/media/image1.png", data: fs.readFileSync(fixture.source) }]);
    const report = auditSourceMediaExclusion({ ir: fixture.ir, pptxFile: pptx, baseDir: fixture.root });
    assert.equal(report.passed, true);
    assert.equal(report.disallowedMatches, 0);
    assert.equal(report.matches[0].allowed, true);
  } finally {
    fixture.cleanup();
  }
});

test("source-media exclusion fails closed for stale source hashes and missing packages", () => {
  const fixture = setup();
  try {
    const missing = auditSourceMediaExclusion({ ir: fixture.ir, pptxFile: path.join(fixture.root, "missing.pptx"), baseDir: fixture.root });
    assert.equal(missing.status, "error");
    fixture.ir.pages[0].reconstruction.canonicalPageSha256 = "0".repeat(64);
    const pptx = path.join(fixture.root, "stale.pptx");
    writeStoredZip(pptx, [{ name: "ppt/media/image1.png", data: fs.readFileSync(fixture.source) }]);
    const stale = auditSourceMediaExclusion({ ir: fixture.ir, pptxFile: pptx, baseDir: fixture.root });
    assert.equal(stale.status, "error");
    assert.match(stale.errors[0], /hash mismatch/i);
  } finally {
    fixture.cleanup();
  }
});

function writeStoredZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, eocd]));
}
