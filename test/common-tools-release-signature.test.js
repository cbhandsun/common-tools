"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { safeFile, verifyReleaseSignature } = require("../scripts/verify-release-signature");

const DIGEST = "a".repeat(64);

test("Cosign verifier checks the signed evidence and each immutable image without exposing command output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-release-signature-"));
  try {
    const evidencePath = path.join(root, "release.json");
    const signaturePath = path.join(root, "release.sig");
    const publicKeyPath = path.join(root, "release.pub");
    for (const file of [evidencePath, signaturePath, publicKeyPath]) fs.writeFileSync(file, "fixture", "utf8");
    const calls = [];
    const image = `registry.example.test/common-tools/remote@sha256:${DIGEST}`;
    const result = verifyReleaseSignature({
      evidencePath,
      signaturePath,
      publicKeyPath,
      images: [image],
      commandRunner(command, args, options) { calls.push({ command, args, options }); return { status: 0, stdout: "sensitive output" }; }
    });
    assert.deepEqual(result, { verified: true, images: [image] });
    assert.deepEqual(calls.map((call) => call.args[0]), ["verify-blob", "verify"]);
    assert.ok(calls.every((call) => call.command === "cosign" && call.options.shell === false && call.options.windowsHide === true));
    assert.throws(() => verifyReleaseSignature({ evidencePath, signaturePath, publicKeyPath, images: [image, image], commandRunner() { return { status: 0 }; } }), /images are invalid/);
    assert.throws(() => verifyReleaseSignature({ evidencePath, signaturePath, publicKeyPath, images: [image], commandRunner() { return { status: 1, stderr: "sensitive failure" }; } }), /Cosign release signature verification failed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Cosign verifier rejects missing, linked, and oversized verification inputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-release-signature-input-"));
  try {
    const regular = path.join(root, "regular");
    fs.writeFileSync(regular, "fixture", "utf8");
    assert.equal(safeFile(regular, "fixture"), regular);
    assert.throws(() => safeFile(path.join(root, "missing"), "fixture"), /unavailable/);
    const link = path.join(root, "linked");
    fs.symlinkSync(regular, link, "file");
    assert.throws(() => safeFile(link, "fixture"), /invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
