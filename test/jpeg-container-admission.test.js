"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { admitJpegContainer } = require("../packages/slideclone-core/jpeg-container-admission");
const { readRawImageDimensions } = require("../packages/slideclone-core/archive-admission");

function segment(marker, bytes) {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(bytes.length + 2, 2);
  return Buffer.concat([header, bytes]);
}

function jpeg({ progressive = false, width = 128, height = 96, metadata = Buffer.alloc(0), entropy = Buffer.from([0x24, 0xff, 0, 0x18, 0xff, 0xd0, 0x42]) } = {}) {
  const frame = Buffer.from([8, 0, 0, 0, 0, 1, 1, 0x11, 0]);
  frame.writeUInt16BE(height, 1); frame.writeUInt16BE(width, 3);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xe1, metadata), segment(progressive ? 0xc2 : 0xc0, frame),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), entropy, Buffer.from([0xff, 0xd9])]);
}

test("JPEG dimensions require a structurally complete container and admit bounded opaque trailers", () => {
  for (const progressive of [false, true]) for (const trailer of [Buffer.alloc(0), Buffer.from("metadata"), Buffer.alloc(65536, 0xa5)]) {
    const encoded = jpeg({ progressive });
    assert.deepEqual(admitJpegContainer(Buffer.concat([encoded, trailer])), {
      widthPx: 128, heightPx: 96, encodedBytes: encoded.length, trailingBytes: trailer.length
    });
  }
});

test("EOI inside metadata or stuffed entropy cannot authorize a truncated JPEG", () => {
  const encoded = jpeg({ metadata: Buffer.from([1, 0xff, 0xd9, 2]), entropy: Buffer.from([0xff, 0, 0xd9, 0x42]) });
  assert.throws(() => admitJpegContainer(encoded.subarray(0, -2)), /JPEG/);
  assert.equal(admitJpegContainer(encoded).trailingBytes, 0);
  for (const input of [Buffer.from([0xff, 0xd8, 0xff, 0xd9]), Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 20, 0xff, 0xd9]),
    Buffer.concat([encoded.subarray(0, 2), Buffer.from([0xff, 0xd8]), encoded.subarray(2)]),
    Buffer.concat([encoded, Buffer.alloc(65537)])]) assert.throws(() => admitJpegContainer(input), /JPEG/);
});

test("JPEG boundary rejects empty, malformed, oversized and zero-dimension inputs without echoing content", () => {
  for (const input of [null, {}, "private-content", Buffer.alloc(0), Buffer.from("private-content"), Buffer.alloc(20 * 1024 * 1024 + 1),
    jpeg({ width: 0 }), jpeg({ height: 0 }), Buffer.from([0xff, 0xd8, 0x20, 0xff, 0xd9])]) {
    assert.throws(() => admitJpegContainer(input), (error) => /JPEG/.test(error.message) && !error.message.includes("private-content"));
  }
});

test("archive image admission uses the same structural JPEG boundary for either extension", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jpeg-container-admission-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  for (const extension of [".jpg", ".jpeg"]) {
    const file = path.join(root, `source${extension}`);
    fs.writeFileSync(file, Buffer.concat([jpeg({ width: 321, height: 123 }), Buffer.from("bounded trailer")]));
    assert.deepEqual(readRawImageDimensions(file, extension), { widthPx: 321, heightPx: 123 });
    fs.writeFileSync(file, jpeg().subarray(0, -2));
    assert.throws(() => readRawImageDimensions(file, extension), /JPEG/);
  }
});

test("JPEG admission rejects proxies and overridden length accessors without invoking them", () => {
  let called = 0;
  const proxy = new Proxy(jpeg(), { get() { called += 1; throw new Error("must not execute"); } });
  const accessor = jpeg();
  Object.defineProperty(accessor, "length", { get() { called += 1; return 1; } });
  for (const value of [proxy, accessor]) assert.throws(() => admitJpegContainer(value), /JPEG/);
  assert.equal(called, 0);
});
