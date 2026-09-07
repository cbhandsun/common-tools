"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { resolveStructuredSourceImages } = require("../packages/slideclone-core/structured-source-images");

test("structured source admission enforces image and aggregate limits and ignores nested crop provenance", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "structured-source-bounds-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const image = path.join(root, "assets/source.png");
  const png = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  fs.writeFileSync(image, png);
  const page = { source: { pageImage: "assets/source.png" }, images: [{ source: { pageImage: "assets/icon.png" } }] };
  const deck = { pages: [page] };
  assert.deepEqual(resolveStructuredSourceImages(deck, root), [image]);
  assert.throws(() => resolveStructuredSourceImages({ pages: Array(21).fill(page) }, root), /page count/);
  for (const [width, height] of [[16385, 1], [1, 16385], [10000, 4001], [0, 100]]) {
    const oversized = Buffer.from(png); oversized.writeUInt32BE(width, 16); oversized.writeUInt32BE(height, 20); fs.writeFileSync(image, oversized);
    assert.throws(() => resolveStructuredSourceImages(deck, root), /dimensions/);
  }
  const boundary = Buffer.from(png); boundary.writeUInt32BE(8000, 16); boundary.writeUInt32BE(5000, 20); fs.writeFileSync(image, boundary);
  assert.equal(resolveStructuredSourceImages({ pages: Array(5).fill(page) }, root).length, 5);
  assert.throws(() => resolveStructuredSourceImages({ pages: Array(6).fill(page) }, root), /batch limit/);
  fs.writeFileSync(image, Buffer.alloc(20 * 1024 * 1024 + 1));
  assert.throws(() => resolveStructuredSourceImages(deck, root), /invalid/);
  fs.writeFileSync(image, Buffer.alloc(0)); assert.throws(() => resolveStructuredSourceImages(deck, root), /invalid/);
  fs.writeFileSync(image, "invalid PNG"); assert.throws(() => resolveStructuredSourceImages(deck, root), /incomplete/);
});
