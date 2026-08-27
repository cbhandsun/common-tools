"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const inventory = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");
const pptxZip = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-zip");

test("PPTX readers accept a valid bounded deflated entry", () => {
  const fixture = createFixture({
    name: "ppt/slides/slide1.xml",
    data: Buffer.from("<p:sld/>")
  });
  try {
    assert.equal(
      inventory.readZipEntry(fixture.file, "ppt/slides/slide1.xml").toString("utf8"),
      "<p:sld/>"
    );
    assert.equal(
      pptxZip.readZipEntryText(fixture.file, "ppt/slides/slide1.xml"),
      "<p:sld/>"
    );
  } finally {
    fixture.cleanup();
  }
});

test("PPTX readers cap actual inflate output when metadata understates the size", () => {
  const fixture = createFixture({
    name: "ppt/slides/slide1.xml",
    data: Buffer.alloc(2 * 1024 * 1024, 65),
    declaredUncompressedSize: 16
  });
  try {
    assert.throws(
      () => inventory.readZipEntry(fixture.file, "ppt/slides/slide1.xml", { maxBytes: 1024 }),
      /zip entry too large/
    );
    assert.throws(
      () => pptxZip.readZipEntryText(fixture.file, "ppt/slides/slide1.xml", { maxEntryBytes: 1024 }),
      /exceeds the processing boundary/
    );
  } finally {
    fixture.cleanup();
  }
});

test("PPTX readers reject a central directory that points outside the archive", () => {
  const fixture = createFixture({
    name: "ppt/slides/slide1.xml",
    data: Buffer.from("<p:sld/>")
  });
  try {
    const payload = fs.readFileSync(fixture.file);
    payload.writeUInt32LE(payload.length + 100, payload.length - 6);
    fs.writeFileSync(fixture.file, payload);
    assert.throws(() => inventory.listZipEntries(fixture.file), /central directory boundary/);
    assert.throws(() => pptxZip.readZipEntries(payload), /central directory boundary/);
  } finally {
    fixture.cleanup();
  }
});

function createFixture({ name, data, declaredUncompressedSize = data.length }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-zip-boundary-"));
  const file = path.join(root, "fixture.pptx");
  const nameBuffer = Buffer.from(name, "utf8");
  const compressed = zlib.deflateRawSync(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declaredUncompressedSize, 22);
  local.writeUInt16LE(nameBuffer.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredUncompressedSize, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + nameBuffer.length + compressed.length;
  const centralSize = central.length + nameBuffer.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  fs.writeFileSync(file, Buffer.concat([local, nameBuffer, compressed, central, nameBuffer, eocd]));
  return {
    file,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}
