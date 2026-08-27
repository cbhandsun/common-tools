"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { inspectOcrRuntimeImage, parseArguments, writeRawImageOcrReleaseInput } = require("../scripts/generate-image-ocr-release-input");

const DIGEST = "a".repeat(64);
function runner(command, args) {
  assert.equal(command, "docker");
  if (args[0] === "image") return { status: 0, stdout: `sha256:${"b".repeat(64)}\n` };
  if (args[0] === "run") return { status: 0, stdout: `${"c".repeat(64)}\nchi_sim\neng\n` };
  return { status: 1, stdout: "" };
}

test("OCR release input generator binds an immutable deployment image to inspected local runtime details", () => {
  const image = `registry.example.test/common-tools/image-worker@sha256:${DIGEST}`;
  assert.deepEqual(inspectOcrRuntimeImage("common-tools-image-to-editable-ocr:local", { commandRunner: runner }), { executable: "/usr/bin/tesseract", executableSha256: "c".repeat(64), languages: ["eng", "chi_sim"] });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ocr-release-input-"));
  try {
    const output = path.join(root, "tesseract.json");
    const result = writeRawImageOcrReleaseInput({ image, output }, { commandRunner: runner });
    assert.equal(result.profile.image, image);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), result.profile);
    assert.throws(() => writeRawImageOcrReleaseInput({ image, output }, { commandRunner: runner }), /already exists/);
    assert.throws(() => writeRawImageOcrReleaseInput({ image, output: path.join(root, "invalid-license.json"), license: "not/a-license" }, { commandRunner: runner }), /license is invalid/);
    assert.equal(fs.existsSync(path.join(root, "invalid-license.json")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  assert.throws(() => parseArguments(["--image", "registry.example.test/common-tools:latest", "--output", "out.json"]), /immutable/);
  assert.throws(() => inspectOcrRuntimeImage("not valid", { commandRunner: runner }), /runtime image/);
});
