"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createReleaseEvidence, normalizeImageReference, parseArguments, verifyReleaseEvidence, verifyReleaseEvidenceFile, writeReleaseEvidence } = require("../scripts/release-evidence");
const { createSbom } = require("../scripts/generate-sbom");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-release-evidence-"));
  const packagePath = path.join(root, "package.json");
  const lockPath = path.join(root, "package-lock.json");
  const sbomPath = path.join(root, "artifacts", "common-tools.spdx.json");
  fs.writeFileSync(packagePath, JSON.stringify({ name: "common-tools", version: "1.2.3" }), "utf8");
  const lock = { lockfileVersion: 3, packages: { "": { name: "common-tools", version: "1.2.3" } } };
  fs.writeFileSync(lockPath, JSON.stringify(lock), "utf8");
  fs.mkdirSync(path.dirname(sbomPath), { recursive: true });
  fs.writeFileSync(sbomPath, JSON.stringify(createSbom(lock)), "utf8");
  return { root, packagePath, lockPath, sbomPath };
}

test("release evidence is deterministic and retains only immutable deployment references", () => {
  const values = fixture();
  try {
    const options = { ...values, revision: "a".repeat(40), images: ["registry.example/common-tools/api@sha256:" + "b".repeat(64), "registry.example:5000/common-tools/worker@sha256:" + "c".repeat(64)] };
    const first = createReleaseEvidence(options);
    const second = createReleaseEvidence({ ...options, images: [...options.images].reverse() });
    assert.deepEqual(first, second);
    assert.equal(first.artifacts.sbom.file, "common-tools.spdx.json");
    assert.equal(first.images[0], "registry.example/common-tools/api@sha256:" + "b".repeat(64));
  } finally { fs.rmSync(values.root, { recursive: true, force: true }); }
});

test("release evidence writer is atomic and verifier detects source or artifact drift", () => {
  const values = fixture();
  try {
    const outputPath = path.join(values.root, "artifacts", "release.json");
    const result = writeReleaseEvidence({ ...values, outputPath, revision: "d".repeat(40), images: [] });
    assert.equal(result.deployable, false);
    assert.equal(verifyReleaseEvidence({ ...values, manifestPath: outputPath }).evidence.runtime.version, "1.2.3");
    assert.throws(() => writeReleaseEvidence({ ...values, outputPath, revision: "d".repeat(40) }), /already exists/);
    fs.writeFileSync(values.sbomPath, JSON.stringify({ SPDXID: "changed" }), "utf8");
    assert.throws(() => verifyReleaseEvidence({ ...values, manifestPath: outputPath }), /SBOM does not match/);
  } finally { fs.rmSync(values.root, { recursive: true, force: true }); }
});

test("release evidence file verifier resolves only its sibling bounded SBOM", () => {
  const values = fixture();
  try {
    const outputPath = path.join(values.root, "artifacts", "release.json");
    writeReleaseEvidence({ ...values, outputPath, revision: "f".repeat(40), images: ["registry.example/tool@sha256:" + "e".repeat(64)] });
    assert.equal(verifyReleaseEvidenceFile({ manifestPath: outputPath, packagePath: values.packagePath, lockPath: values.lockPath }).deployable, true);
    fs.writeFileSync(outputPath, JSON.stringify({ schemaVersion: "1.1", runtime: {}, source: {}, artifacts: { sbom: { file: "../outside.json", sha256: "a".repeat(64) } }, images: [], rawImageOcrProfiles: [] }), "utf8");
    assert.throws(() => verifyReleaseEvidenceFile({ manifestPath: outputPath, packagePath: values.packagePath, lockPath: values.lockPath }), /release runtime is invalid/);
  } finally { fs.rmSync(values.root, { recursive: true, force: true }); }
});

test("release evidence binds a raw image OCR profile to its immutable Worker image", () => {
  const values = fixture();
  try {
    const image = "registry.example/common-tools/image-worker@sha256:" + "d".repeat(64);
    const rawImageOcrProfiles = [{ name: "tesseract-tsv-v1", image, executable: "/usr/bin/tesseract", executableSha256: "e".repeat(64), languages: ["eng", "chi_sim"], license: "Apache-2.0" }];
    const evidence = createReleaseEvidence({ ...values, revision: "a".repeat(40), images: [image], rawImageOcrProfiles });
    assert.deepEqual(evidence.rawImageOcrProfiles, rawImageOcrProfiles);
    assert.throws(() => createReleaseEvidence({ ...values, revision: "a".repeat(40), images: [], rawImageOcrProfiles }), /not a release image/);
    const profilePath = path.join(values.root, "raw-image-ocr-profile.json");
    fs.writeFileSync(profilePath, JSON.stringify(rawImageOcrProfiles[0]), "utf8");
    const parsed = parseArguments(["--revision", "a".repeat(40), "--image", image, "--raw-image-ocr-profile", profilePath]);
    assert.deepEqual(parsed.rawImageOcrProfiles, rawImageOcrProfiles);
  } finally { fs.rmSync(values.root, { recursive: true, force: true }); }
});

test("release evidence rejects mutable images, unsafe schema fields, and malformed arguments", () => {
  assert.equal(normalizeImageReference("registry.example/tool@sha256:" + "e".repeat(64)), "registry.example/tool@sha256:" + "e".repeat(64));
  assert.throws(() => normalizeImageReference("registry.example/tool:latest"), /immutable/);
  assert.throws(() => normalizeImageReference("registry.example/tool:latest@sha256:" + "e".repeat(64)), /name is invalid/);
  assert.throws(() => createReleaseEvidence({ packagePath: "missing", lockPath: "missing", sbomPath: "missing", revision: "z".repeat(40) }));
  assert.deepEqual(parseArguments(["--revision", "a".repeat(40), "--image", "registry.example/tool@sha256:" + "e".repeat(64)]).images.length, 1);
  assert.throws(() => parseArguments([]), /revision is required/);
  assert.throws(() => parseArguments(["--verify", "--image"]), /requires a value/);
});
