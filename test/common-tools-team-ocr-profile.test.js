"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { PROFILE_NAME, createPinnedRawImageOcr, parseTesseractTsv, readPinnedRawImageOcrProfile, runProcess, sha256File, verifyPinnedRawImageOcrProfile } = require("../packages/slideclone-core/team-ocr-profile");

function profileEnvironment(overrides = {}) {
  return {
    COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: PROFILE_NAME,
    COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: process.execPath,
    COMMON_TOOLS_IMAGE_RAW_OCR_SHA256: sha256File(process.execPath),
    COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES: "eng,chi_sim",
    ...overrides
  };
}

const TSV = [
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
  "5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t95.2\tHello",
  "5\t1\t1\t1\t1\t2\t45\t20\t25\t10\t91\tworld",
  "5\t1\t1\t1\t2\t1\t10\t45\t20\t10\t88\t你好"
].join("\n");

test("pinned raw OCR profile is disabled by default and refuses partial settings", () => {
  assert.deepEqual(readPinnedRawImageOcrProfile({}), { enabled: false });
  assert.throws(() => readPinnedRawImageOcrProfile({ COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: process.execPath }), /require COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
  assert.throws(() => readPinnedRawImageOcrProfile(profileEnvironment({ COMMON_TOOLS_IMAGE_RAW_OCR_SHA256: "b".repeat(64) })), /checksum/);
  assert.throws(() => readPinnedRawImageOcrProfile(profileEnvironment({ COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES: "eng,arbitrary" })), /LANGUAGES/);
});

test("pinned raw OCR profile accepts only a checksum-locked executable and language whitelist", () => {
  const profile = readPinnedRawImageOcrProfile(profileEnvironment());
  assert.deepEqual(profile, { enabled: true, name: PROFILE_NAME, executable: process.execPath, languages: ["eng", "chi_sim"], sha256: sha256File(process.execPath) });
  assert.throws(() => readPinnedRawImageOcrProfile(profileEnvironment({ COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: path.join(path.dirname(process.execPath), "missing-ocr") })), /unavailable/);
  assert.throws(() => readPinnedRawImageOcrProfile(profileEnvironment({ COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: "tesseract-shell-v1" })), /unsupported/);
});

test("Tesseract TSV parser combines words into bounded editable line boxes", () => {
  assert.deepEqual(parseTesseractTsv(TSV, { widthPx: 100, heightPx: 100 }), {
    lines: [
      { text: "Hello world", box: { x: 10, y: 20, w: 60, h: 10 } },
      { text: "你好", box: { x: 10, y: 45, w: 20, h: 10 } }
    ]
  });
  assert.throws(() => parseTesseractTsv(TSV.replace("10\t20\t30\t10", "99\t20\t30\t10"), { widthPx: 100, heightPx: 100 }), /geometry/);
  assert.throws(() => parseTesseractTsv("untrusted\toutput", { widthPx: 100, heightPx: 100 }), /invalid/);
});

test("pinned OCR startup verification checks every configured language without leaking process output", async () => {
  const profile = readPinnedRawImageOcrProfile(profileEnvironment());
  let command = null;
  assert.equal(await verifyPinnedRawImageOcrProfile(profile, { run: async (input) => { command = input; return "List of available languages in /safe:\neng\nchi_sim\n"; } }), true);
  assert.deepEqual(command, { executable: process.execPath, args: ["--list-langs"], timeoutMs: 10000 });
  await assert.rejects(() => verifyPinnedRawImageOcrProfile(profile, { run: async () => "eng\n" }), /language pack/);
});

test("pinned OCR invokes a fixed TSV command and respects cancellation before parsing", async () => {
  const profile = readPinnedRawImageOcrProfile(profileEnvironment());
  const image = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png");
  let invocation = null;
  const ocr = createPinnedRawImageOcr(profile, { run: async (input) => { invocation = input; return TSV; } });
  const result = await ocr({ inputFile: image, dimensions: { widthPx: 100, heightPx: 100 }, isCancellationRequested: async () => false });
  assert.equal(result.lines.length, 2);
  assert.deepEqual(invocation.args, [image, "stdout", "--psm", "3", "-l", "eng+chi_sim", "tsv"]);
  await assert.rejects(() => ocr({ inputFile: image, dimensions: { widthPx: 100, heightPx: 100 }, isCancellationRequested: async () => true }), /cancelled/);
});

test("OCR process runner bounds timeout and observes a cancellation request after process start", async () => {
  assert.equal(await runProcess({ executable: process.execPath, args: ["-e", "process.stdout.write('ok')"], timeoutMs: 3000 }), "ok");
  await assert.rejects(() => runProcess({ executable: process.execPath, args: ["-e", "setTimeout(() => {}, 5000)"], timeoutMs: 250 }), /timed out/);
  let checks = 0;
  await assert.rejects(() => runProcess({ executable: process.execPath, args: ["-e", "setTimeout(() => {}, 5000)"], timeoutMs: 1000, isCancellationRequested: async () => ++checks >= 1 }), /cancelled/);
  assert.ok(checks >= 1);
});

test("OCR process runner preserves the first termination reason while process shutdown is delayed", async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.kill = () => {
    setTimeout(() => child.emit("close", null), 30);
    return true;
  };
  await assert.rejects(() => runProcess({
    executable: process.execPath,
    args: [],
    timeoutMs: 10,
    isCancellationRequested: async () => true,
    spawn: () => child
  }), /cancelled/);
});

test("OCR escalates an ignored graceful stop and bounds an unconfirmed termination", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  const signals = [];
  child.kill = (signal) => { signals.push(signal); return true; };
  let failure;
  const result = runProcess({ executable: process.execPath, args: [], timeoutMs: 10, spawn: () => child }).catch((error) => { failure = error; });
  t.mock.timers.tick(10);
  assert.deepEqual(signals, ["SIGTERM"]);
  t.mock.timers.tick(1000);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  t.mock.timers.tick(1000);
  await result;
  assert.match(failure.message, /timed out.*termination was not confirmed/);
});

test("OCR startup exceptions and invalid timeouts produce safe fixed diagnostics", async () => {
  await assert.rejects(() => runProcess({ executable: process.execPath, args: [], timeoutMs: 1000, spawn: () => { throw new Error("private-source-content"); } }), (error) => error.message === "raw image OCR process could not start");
  for (const timeoutMs of [undefined, 0, -1, Infinity, NaN, "1000", 600001]) {
    let spawned = false;
    await assert.rejects(() => runProcess({ executable: process.execPath, args: [], timeoutMs, spawn: () => { spawned = true; throw new Error("unexpected spawn"); } }), /configuration is invalid/);
    assert.equal(spawned, false);
  }
});

test("OCR cancellation survives signal errors and confirms forced closure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    if (signal === "SIGTERM") throw new Error("private-process-detail");
    child.emit("close", null);
    return true;
  };
  const result = assert.rejects(() => runProcess({ executable: process.execPath, args: [], timeoutMs: 10, isCancellationRequested: () => true, spawn: () => child }), (error) => error.message === "raw image OCR was cancelled");
  await new Promise((resolve) => setImmediate(resolve));
  child.emit("error", new Error("private-kill-error"));
  t.mock.timers.tick(1000);
  await result;
  t.mock.timers.tick(10000);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("OCR output overflow releases buffered content and stops before a successful exit", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  const signals = [];
  child.kill = (signal) => { signals.push(signal); if (signal === "SIGKILL") child.emit("close", 0); return true; };
  const result = assert.rejects(() => runProcess({ executable: process.execPath, args: [], timeoutMs: 60000, spawn: () => child }), (error) => error.message === "raw image OCR output exceeds limits");
  child.stdout.emit("data", Buffer.alloc(1024 * 1024));
  assert.deepEqual(signals, []);
  child.stdout.emit("data", Buffer.from("x"));
  child.stdout.emit("data", Buffer.from("private-output-after-stop"));
  t.mock.timers.tick(1000);
  await result;
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("OCR permits only one pending cancellation query and clears timers on normal close", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  let queries = 0;
  let resolveQuery;
  const signals = [];
  child.kill = (signal) => { signals.push(signal); return true; };
  const result = runProcess({ executable: process.execPath, args: [], timeoutMs: 60000, spawn: () => child, isCancellationRequested: () => { queries += 1; return new Promise((resolve) => { resolveQuery = resolve; }); } });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(10000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queries, 1);
  child.stdout.emit("data", Buffer.from("ok"));
  child.emit("close", 0);
  assert.equal(await result, "ok");
  resolveQuery(true);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(100000);
  assert.deepEqual(signals, []);
});
