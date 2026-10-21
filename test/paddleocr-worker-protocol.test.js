"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { resolvePythonExecutable } = require("../packages/slideclone-native-engine/scripts/lib/python-env");
const { resolveNativeEngineRuntimeRoot } = require("../packages/slideclone-native-engine");
const { discoverTestFiles } = require("../scripts/test-sharded");

const root = path.resolve(__dirname, "..");
const worker = path.join(resolveNativeEngineRuntimeRoot(root), "scripts", "python", "paddleocr_worker.py");
const fixture = path.join(__dirname, "fixtures/paddleocr-noisy-pipeline.py");
const request = (count = 1) => JSON.stringify({ id: "request-1", imagePaths: Array(count).fill(fixture) }) + "\n";

function run(mode, input = request()) {
  const result = spawnSync(resolvePythonExecutable(), [fixture, mode, worker], {
    input, encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" }
  });
  assert.equal(result.error, undefined, "worker fixture must finish within its deadline");
  assert.equal(result.stderr, "", "library diagnostics must not escape through stderr");
  assert.doesNotMatch(result.stdout, /PRIVATE_FIXTURE/, "library output is not protocol output");
  const messages = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  return { status: result.status, messages };
}

test("PaddleOCR worker isolates Python, native, Win32, child and exit-time output", () => {
  const result = run("noisy", request(2));
  assert.equal(result.status, 0);
  assert.deepEqual(result.messages.map((message) => message.type), ["ready", "result"]);
  assert.equal(result.messages[0].protocolVersion, 2);
  assert.equal(result.messages[1].itemsByImage.length, 2);
  assert.equal(result.messages[1].itemsByImage[0][0].text, "中文 🌍");
  assert.deepEqual(result.messages[1].itemsByImage[0][0].wordPositionHints.map(hint => hint.text), ["中", "文", " 🌍"]);
});

test("PaddleOCR worker preserves empty results, clean EOF and bounded batch size", () => {
  assert.deepEqual(run("empty").messages[1].itemsByImage, [[]]);
  assert.deepEqual(run("noisy", "").messages.map((message) => message.type), ["ready"]);
  assert.equal(run("noisy", request(16)).messages[1].itemsByImage.length, 16);
  assert.equal(run("noisy", request(17)).messages[1].type, "error");
});

test("PaddleOCR worker discards invalid optional word hints while preserving the admitted line", () => {
  for (const mode of ["word-sequence-mismatch", "word-invalid-coordinate", "word-outside-line", "word-invalid-count"]) {
    const result = run(mode);
    assert.equal(result.status, 0);
    assert.equal(result.messages[1].itemsByImage[0][0].text, "中文 🌍");
    assert.equal(result.messages[1].itemsByImage[0][0].wordPositionHints, undefined);
  }
});

test("PaddleOCR worker projects validated horizontal CTC cells through a slanted source quadrilateral", () => {
  const result = run("word-quad-valid");
  assert.equal(result.status, 0);
  const line = result.messages[1].itemsByImage[0][0];
  assert.deepEqual(line.polygon, [[10, 10], [30, 12], [32, 22], [12, 20]]);
  assert.deepEqual(line.wordPositionHints, [
    { text: "中", box: { x: 10, y: 10, w: 8, h: 10.600000000000001 } },
    { text: "文", box: { x: 16, y: 10.6, w: 8, h: 10.6 } },
    { text: " 🌍", box: { x: 22, y: 11.2, w: 10, h: 10.8 } }
  ]);
});

test("PaddleOCR quadrilateral bridge refuses ambiguous mappings without dropping recognized text", () => {
  for (const suffix of ["partial", "crossed", "vertical", "rotated", "boolean", "overflow", "reversed", "empty", "invalid-region", "count-limit"]) {
    const result = run(`word-quad-${suffix}`);
    assert.equal(result.status, 0);
    const line = result.messages[1].itemsByImage[0][0];
    assert.equal(line.text, "中文 🌍");
    assert.equal(line.wordPositionHints, undefined);
  }
});

test("PaddleOCR protocol rejects nonfinite source coordinates before writing a partial JSON line", () => {
  const result = run("word-quad-nonfinite");
  assert.equal(result.status, 0);
  assert.deepEqual(result.messages.map(message => message.type), ["ready", "error"]);
  assert.deepEqual(result.messages[1], { type: "error", id: "request-1", code: "inference-failed", errorType: "ValueError" });
});

test("PaddleOCR quadrilateral projection retains descending source geometry", () => {
  const line = run("word-quad-descending").messages[1].itemsByImage[0][0];
  assert.deepEqual(line.wordPositionHints.map(hint => hint.text), ["中", "文", " 🌍"]);
  const expected = [[10, 11.4, 8, 10.6], [16, 10.8, 8, 10.6], [22, 10, 10, 10.8]];
  line.wordPositionHints.forEach((hint, index) => {
    ["x", "y", "w", "h"].forEach((key, field) => assert.ok(Math.abs(hint.box[key] - expected[index][field]) < 1e-12));
  });
});

test("PaddleOCR worker keeps malformed and oversized requests as structured failures", () => {
  for (const input of ["not-json\n", "null\n", "{}\n", "x".repeat(65537) + "\n"]) {
    const result = run("noisy", input);
    assert.equal(result.status, 0);
    assert.deepEqual(result.messages.map((message) => message.type), ["ready", "error"]);
  }
});

test("PaddleOCR worker reports initialization and inference errors without raw diagnostics", () => {
  const startup = run("initialization-failure");
  assert.equal(startup.status, 2);
  assert.deepEqual(startup.messages, [{ type: "fatal", code: "initialization-failed", errorType: "RuntimeError" }]);
  const inference = run("inference-failure");
  assert.equal(inference.status, 0);
  assert.deepEqual(inference.messages[1], { type: "error", id: "request-1", code: "inference-failed", errorType: "RuntimeError" });
});

test("PaddleOCR worker fails closed if protocol setup cannot isolate output", () => {
  for (const operation of ["dup", "set_inheritable", "fdopen", "dup2", "redirect"]) {
    const result = run(`setup-failure-${operation}`);
    assert.equal(result.status, 2);
    assert.deepEqual(result.messages, []);
  }
});

test("PaddleOCR private stream is non-inheritable and stays isolated after closing", () => {
  assert.deepEqual(run("lifecycle"), { status: 0, messages: [{ type: "lifecycle" }] });
});

test("PaddleOCR protocol regression is included in integration CI with external-process isolation", () => {
  const discovered = discoverTestFiles(root, "integration").find(({ file }) => path.basename(file) === path.basename(__filename));
  assert.equal(discovered.resource, "external-process");
  assert.match(require("../package.json").scripts["test:portable"], /&& node --test test\/paddleocr-worker-protocol\.test\.js$/);
  const dockerfile = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr"), "utf8");
  const ignore = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr.dockerignore"), "utf8");
  assert.match(dockerfile, /COPY packages\/slideclone-native-engine\/scripts\/python\/paddleocr_protocol\.py \/opt\/paddleocr\/paddleocr_protocol\.py/);
  assert.match(ignore, /^!packages\/slideclone-native-engine\/scripts\/python\/paddleocr_protocol\.py$/m);
});
