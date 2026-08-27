"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { extractProjectArchive } = require("../packages/project-audit-core/team-worker");
const { createRawImageArchive } = require("../packages/slideclone-core/team-raw-image-archive");
const { validatePackage } = require("../packages/slideclone-core/team-worker");

function workspaceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-raw-archive-"));
  const image = path.join(root, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), image);
  return { root, image, archive: path.join(root, "source.tar.gz") };
}

test("raw image archive writer creates the exact bounded team input profile", () => {
  const fixture = workspaceFixture();
  const extracted = path.join(fixture.root, "extracted");
  try {
    const result = createRawImageArchive({ inputFile: fixture.image, outputFile: fixture.archive });
    assert.equal(result.contentType, "application/gzip");
    assert.ok(result.contentLength > 100 && /^[a-f0-9]{64}$/.test(result.sha256));
    assert.equal(result.source.widthPx > 0, true);
    fs.mkdirSync(extracted);
    extractProjectArchive(fs.readFileSync(fixture.archive), extracted, { label: "editable" });
    const packageInfo = validatePackage(extracted);
    assert.equal(packageInfo.kind, "raw-image");
    assert.equal(packageInfo.assetPath, "assets/source.png");
    assert.throws(() => createRawImageArchive({ inputFile: fixture.image, outputFile: fixture.archive }), /already exists/);
    assert.equal(zlib.gunzipSync(fs.readFileSync(fixture.archive)).length > 512, true);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("raw image archive CLI confines inputs and outputs to its workspace", () => {
  const fixture = workspaceFixture();
  const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
  try {
    const result = childProcess.spawnSync(process.execPath, [cli, "team", "raw-image-archive", "--workspace", fixture.root, "--input", "source.png", "--out", "upload.tar.gz"], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.contentType, "application/gzip");
    assert.equal(path.basename(output.archive), "upload.tar.gz");
    assert.equal(fs.existsSync(path.join(fixture.root, "upload.tar.gz")), true);
    const outside = path.join(os.tmpdir(), `common-tools-outside-${process.pid}.png`);
    const rejected = childProcess.spawnSync(process.execPath, [cli, "team", "raw-image-archive", "--workspace", fixture.root, "--input", outside, "--out", "second.tar.gz"], { encoding: "utf8", windowsHide: true });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /workspace root/);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});
