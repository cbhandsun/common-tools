"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const packageManifest = require("../package.json");
const { MAX_PACKAGE_BYTES, REQUIRED_FILES, npmInvocation, parsePackMetadata } = require("../scripts/verify-runtime-package");

function metadata(files = REQUIRED_FILES) {
  return JSON.stringify([{
    filename: "common-tools-0.1.0.tgz",
    size: 1024,
    files: files.map((file) => ({ path: file, size: 1 }))
  }]);
}

test("runtime package verifier accepts a bounded release-only file manifest", () => {
  const result = parsePackMetadata(metadata([...REQUIRED_FILES, "README.md"]));
  assert.equal(result.filename, "common-tools-0.1.0.tgz");
  assert.equal(result.size, 1024);
  assert.deepEqual(result.files, [...REQUIRED_FILES, "README.md"]);
});

test("runtime package verifier rejects missing, unsafe, duplicate, and oversized package metadata", () => {
  assert.throws(() => parsePackMetadata(metadata(REQUIRED_FILES.slice(1))), /missing a required file/);
  assert.throws(() => parsePackMetadata(metadata([...REQUIRED_FILES, "skills/pd-hifi-slideclone/examples/sample.json"])), /forbidden file/);
  assert.throws(() => parsePackMetadata(metadata([...REQUIRED_FILES, REQUIRED_FILES[0]])), /file list is invalid/);
  assert.throws(() => parsePackMetadata(JSON.stringify([{ filename: "../unsafe.tgz", size: 1, files: REQUIRED_FILES.map((file) => ({ path: file, size: 1 })) }])), /filename is invalid/);
  assert.throws(() => parsePackMetadata(JSON.stringify([{ filename: "common-tools.tgz", size: MAX_PACKAGE_BYTES + 1, files: REQUIRED_FILES.map((file) => ({ path: file, size: 1 })) }])), /size is invalid/);
});

test("runtime package verification is an explicit release and CI gate", () => {
  assert.equal(packageManifest.scripts["common-tools:verify-runtime-package"], "node scripts/verify-runtime-package.js");
  assert.match(packageManifest.scripts["verify:ci"], /common-tools:verify-runtime-package/);
});

test("runtime package retains the Git marketplace required by installed plugin commands", () => {
  assert.ok(packageManifest.files.includes(".agents/"));
  assert.ok(REQUIRED_FILES.includes(".agents/plugins/marketplace.json"));
});

test("runtime package retains the release OCR evidence, doctor, and Keycloak remediation entrypoints", () => {
  for (const file of ["scripts/generate-image-ocr-release-input.js", "scripts/team-runtime-doctor.js", "scripts/team-keycloak-mcp-client-sync.ps1", "scripts/team-keycloak-recovery-admin.ps1"]) {
    assert.ok(packageManifest.files.includes(file));
    assert.ok(REQUIRED_FILES.includes(file));
  }
  assert.equal(packageManifest.scripts["common-tools:team-doctor"], "node scripts/team-runtime-doctor.js");
});

test("runtime package verifier invokes npm through the current Node installation without a shell", () => {
  const invocation = npmInvocation(["pack", "--json"]);
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.arguments.slice(1).join(" "), "pack --json");
  assert.match(invocation.arguments[0], /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
});
