"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { resolvePythonExecutable } = require("../skills/pd-hifi-slideclone/scripts/lib/python-env");
const { discoverTestFiles } = require("../scripts/test-sharded");

const root = path.resolve(__dirname, "..");
const worker = path.join(root, "skills/pd-hifi-slideclone/scripts/python/paddleocr_worker.py");
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
});

test("PaddleOCR worker preserves empty results, clean EOF and bounded batch size", () => {
  assert.deepEqual(run("empty").messages[1].itemsByImage, [[]]);
  assert.deepEqual(run("noisy", "").messages.map((message) => message.type), ["ready"]);
  assert.equal(run("noisy", request(16)).messages[1].itemsByImage.length, 16);
  assert.equal(run("noisy", request(17)).messages[1].type, "error");
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

test("PaddleOCR protocol regression is included in unified CI with external-process isolation", () => {
  const discovered = discoverTestFiles(root, "unit").find(({ file }) => path.basename(file) === path.basename(__filename));
  assert.equal(discovered.resource, "external-process");
  assert.match(require("../package.json").scripts["test:portable"], /&& node --test test\/paddleocr-worker-protocol\.test\.js$/);
  const dockerfile = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr"), "utf8");
  const ignore = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr.dockerignore"), "utf8");
  assert.match(dockerfile, /COPY skills\/pd-hifi-slideclone\/scripts\/python\/paddleocr_protocol\.py \/opt\/paddleocr\/paddleocr_protocol\.py/);
  assert.match(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/python\/paddleocr_protocol\.py$/m);
});
