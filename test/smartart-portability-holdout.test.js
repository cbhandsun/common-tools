"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { normalizeManifest, parseArgs } = require("../scripts/smartart-portability-holdout");

test("SmartArt holdout manifest requires bounded unique cases and Docker parity inputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartart-holdout-"));
  const host = path.join(root, "host.pptx"); const docker = path.join(root, "docker.pptx");
  fs.writeFileSync(host, "host"); fs.writeFileSync(docker, "docker");
  const manifest = normalizeManifest({ schemaVersion: 1, minimumCases: 1, requiredFamilies: ["picture"], cases: [{ id: "picture-grid", family: "picture", hostPptx: host, dockerPptx: docker }] }, root);
  assert.equal(manifest.cases[0].requireDockerParity, true);
  assert.equal(manifest.cases[0].requirePowerPointEdit, true);
  assert.throws(() => normalizeManifest({ schemaVersion: 1, cases: [{ id: "one", family: "list", hostPptx: host }] }, root), /requires a dockerPptx/);
  assert.throws(() => normalizeManifest({ schemaVersion: 1, cases: [{ id: "same", family: "list", hostPptx: host, dockerPptx: docker }, { id: "same", family: "list", hostPptx: host, dockerPptx: docker }] }, root), /duplicate id/);
});

test("SmartArt holdout CLI rejects unknown and duplicate options", () => {
  assert.deepEqual(parseArgs(["--manifest", "cases.json", "--out", "artifacts/out"]), { manifest: "cases.json", out: "artifacts/out" });
  assert.throws(() => parseArgs(["--token", "secret"]), /Unknown option/);
  assert.throws(() => parseArgs(["--out", "one", "--out", "two"]), /Duplicate option/);
});
