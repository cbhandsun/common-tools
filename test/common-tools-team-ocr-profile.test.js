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
