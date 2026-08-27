"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readPng, writePng, withPngReadCache } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

test("PNG reader accepts a valid bounded image", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-png-valid-"));
  try {
    const file = path.join(root, "valid.png");
    writePng(file, {
      width: 2,
      height: 2,
      rgba: Buffer.alloc(2 * 2 * 4, 255)
    });
    const image = readPng(file);
    assert.equal(image.width, 2);
    assert.equal(image.height, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("page-scoped PNG cache reuses decompression without sharing mutable pixels", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-png-cache-"));
  try {
    const file = path.join(root, "cached.png");
    writePng(file, { width: 2, height: 2, rgba: Buffer.alloc(16, 100) });
    const stats = withPngReadCache((cache) => {
      const first = readPng(file);
      first.rgba[0] = 255;
      const second = readPng(file);
      assert.equal(second.rgba[0], 100);
      return cache.stats();
    });
    assert.deepEqual({ hits: stats.hits, misses: stats.misses, entries: stats.entries }, { hits: 1, misses: 1, entries: 1 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PNG reader rejects dimensions that exceed the pixel boundary before allocation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-png-dimensions-"));
  try {
    const file = path.join(root, "oversized.png");
    writePng(file, {
      width: 1,
      height: 1,
      rgba: Buffer.from([255, 255, 255, 255])
    });
    const payload = fs.readFileSync(file);
    payload.writeUInt32BE(32_768, 16);
    payload.writeUInt32BE(32_768, 20);
    fs.writeFileSync(file, payload);
    assert.throws(
      () => readPng(file),
      /PNG dimensions exceed the processing boundary/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PNG reader rejects inflated payloads that do not match declared dimensions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-png-inflate-"));
  try {
    const file = path.join(root, "mismatch.png");
    writePng(file, {
      width: 4,
      height: 4,
      rgba: Buffer.alloc(4 * 4 * 4, 128)
    });
    assert.throws(
      () => readPng(file, { maxPixels: 4 }),
      /PNG dimensions exceed the processing boundary/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PNG reader rejects truncated chunks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-png-truncated-"));
  try {
    const file = path.join(root, "truncated.png");
    writePng(file, {
      width: 2,
      height: 2,
      rgba: Buffer.alloc(2 * 2 * 4, 0)
    });
    const payload = fs.readFileSync(file);
    fs.writeFileSync(file, payload.subarray(0, payload.length - 6));
    assert.throws(() => readPng(file), /Truncated PNG chunk|PNG structure is incomplete/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
