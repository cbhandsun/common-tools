"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { fingerprintOoxmlPackage } = require("../skills/pd-hifi-slideclone/scripts/lib/ooxml-package-fingerprint");

test("OOXML fingerprint ignores ZIP container timestamps but detects content changes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ooxml-fingerprint-"));
  try {
    const source = path.join(tmp, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "entry.txt"), "alpha");
    const first = path.join(tmp, "first.zip");
    const second = path.join(tmp, "second.zip");
    makeZip(source, first);
    fs.utimesSync(path.join(source, "entry.txt"), new Date(2020, 0, 1), new Date(2020, 0, 1));
    makeZip(source, second);
    assert.equal(fingerprintOoxmlPackage(first), fingerprintOoxmlPackage(second));

    fs.writeFileSync(path.join(source, "entry.txt"), "beta");
    makeZip(source, second);
    assert.notEqual(fingerprintOoxmlPackage(first), fingerprintOoxmlPackage(second));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("OOXML fingerprint rejects oversized expanded entries", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ooxml-fingerprint-limit-"));
  try {
    const source = path.join(tmp, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "entry.txt"), "0123456789");
    const zip = path.join(tmp, "input.zip");
    makeZip(source, zip);
    assert.throws(() => fingerprintOoxmlPackage(zip, { maxEntryBytes: 5 }), /entry is too large/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function makeZip(source, output) {
  if (fs.existsSync(output)) fs.rmSync(output);
  const entries = fs.readdirSync(source);
  const result = spawnSync("tar.exe", ["-a", "-c", "-f", output, "-C", source, ...entries], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "failed to create ZIP fixture");
}
