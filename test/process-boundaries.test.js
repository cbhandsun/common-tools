"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  normalizeTimeoutMs,
  readBoundedUtf8
} = require("../skills/pd-hifi-slideclone/scripts/lib/process-boundaries");

test("process timeout accepts normal values and applies a safe default", () => {
  assert.equal(normalizeTimeoutMs(undefined, 120000), 120000);
  assert.equal(normalizeTimeoutMs("2500", 120000), 2500);
});

test("process timeout rejects empty, invalid, and extreme boundaries", () => {
  assert.throws(() => normalizeTimeoutMs(999, 120000), /integer/);
  assert.throws(() => normalizeTimeoutMs("invalid", 120000), /integer/);
  assert.throws(() => normalizeTimeoutMs(600001, 120000, 600000), /integer/);
});

test("bounded process output rejects oversized files before reading", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "process-boundaries-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "output.txt");
  fs.writeFileSync(file, "bounded");
  assert.equal(readBoundedUtf8(file, 7), "bounded");
  assert.throws(() => readBoundedUtf8(file, 6), /exceeds/);
});
