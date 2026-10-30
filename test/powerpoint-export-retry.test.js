"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const adapterFile = path.resolve(__dirname, "../packages/slideclone-native-engine/scripts/adapters/render-powerpoint-com.js");
const adapter = require(adapterFile);

function fixture(t, action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "powerpoint-export-retry-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "input.pptx");
  fs.writeFileSync(input, "deterministic test input");
  const moduleObject = { exports: {} }, calls = [], delays = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    return action({ args, attempt: calls.length, renderDir: path.join(root, "render/iteration-0") });
  };
  vm.runInNewContext(fs.readFileSync(adapterFile, "utf8"), {
    module: moduleObject,
    require: name => name === "../lib/exec" ? { run } : require(require.resolve(name, { paths: [path.dirname(adapterFile)] })),
    setTimeout: (callback, ms) => { delays.push(ms); callback(); }
  }, { filename: adapterFile });
  return { calls, delays, render: config => moduleObject.exports({ pptx: { pptxFile: input }, maxPages: 1 }, { outputDir: root, config }) };
}

function silentFailure(code = 1) {
  return Object.assign(new Error("renderer process failed"), { code, signal: null, stdout: "", stderr: "" });
}

function writePage(renderDir) {
  // The adapter reads this synthetic header; no actual Office render is claimed.
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(buffer);
  buffer.writeUInt32BE(13, 8); buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(1920, 16); buffer.writeUInt32BE(1080, 20);
  fs.writeFileSync(path.join(renderDir, "page-1.png"), buffer);
}

test("PowerPoint export retries the structured silent process error and discards a partial page", async t => {
  const f = fixture(t, ({ attempt, renderDir }) => {
    assert.equal(fs.existsSync(path.join(renderDir, "page-1.png")), false);
    writePage(renderDir);
    if (attempt === 1) throw silentFailure();
  });
  const result = await f.render();
  assert.equal(result.ok, true); assert.equal(f.calls.length, 2);
  assert.equal(result.data.renderedPages.length, 1);
  assert.deepEqual(f.delays, [500]);
  for (const call of f.calls) {
    assert.equal(call.command, "powershell.exe"); assert.equal(call.options.timeout, 120_000);
    assert.equal(call.args[call.args.indexOf("-MaxPages") + 1], "1");
  }
});

test("structured silent process failures retain the last error after exactly four attempts", async t => {
  const errors = [];
  const f = fixture(t, () => { const error = silentFailure(); errors.push(error); throw error; });
  await assert.rejects(f.render(), error => error === errors[3]);
  assert.equal(f.calls.length, 4); assert.deepEqual(f.delays, [500, 1000, 1500]);
  assert.ok(f.calls.every(call => call.options.timeout === 120_000));
});

test("PowerPoint export uses a two minute default for absent or empty timeout configuration", async t => {
  for (const config of [undefined, null, {}, { powerPoint: null }, { powerPoint: {} },
    { powerPoint: { exportTimeoutMs: undefined } }, { powerPoint: { exportTimeoutMs: null } },
    { powerPoint: { exportTimeoutMs: "" } }, { powerPoint: { exportTimeoutMs: " \t\n" } }]) {
    const f = fixture(t, ({ renderDir }) => writePage(renderDir));
    assert.equal((await f.render(config)).ok, true);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.timeout, 120_000);
    assert.equal(f.delays.length, 0);
  }
});

test("PowerPoint export preserves valid explicit timeout values including renderer boundaries", async t => {
  for (const [value, expected] of [[60_000, 60_000], [180_000, 180_000], [1, 1], [2_147_483_647, 2_147_483_647],
    ["90000", 90_000], [" 240000 ", 240_000], ["00060000", 60_000], ["2147483647", 2_147_483_647]]) {
    const f = fixture(t, ({ renderDir }) => writePage(renderDir));
    assert.equal((await f.render({ powerPoint: { exportTimeoutMs: value } })).ok, true);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.timeout, expected);
  }
});

test("PowerPoint export rejects malformed and out of range timeout values without partial parsing", async t => {
  for (const value of [0, -1, 1.5, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
    true, false, [], {}, "0", "-1", "1.5", "60000ms", "6e4", "0xEA60", "+60000", "60_000", "NaN", "Infinity",
    "2147483648", "9".repeat(100_000)]) {
    const f = fixture(t, ({ renderDir }) => writePage(renderDir));
    assert.equal((await f.render({ powerPoint: { exportTimeoutMs: value } })).ok, true);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.timeout, 120_000);
    assert.equal(f.delays.length, 0);
  }
});

test("PowerPoint timeout configuration never coerces unknown or hostile values", async t => {
  let touched = 0;
  const hostile = new Proxy({}, { get() { touched += 1; throw new Error("private sentinel"); } });
  const accessor = { get toString() { touched += 1; throw new Error("private sentinel"); } };
  const primitive = { [Symbol.toPrimitive]() { touched += 1; throw new Error("private sentinel"); } };
  for (const value of [hostile, accessor, primitive, Symbol("private sentinel"), 60_000n, () => { touched += 1; }]) {
    const f = fixture(t, ({ renderDir }) => writePage(renderDir));
    assert.equal((await f.render({ powerPoint: { exportTimeoutMs: value } })).ok, true);
    assert.equal(f.calls[0].options.timeout, 120_000);
  }
  assert.equal(touched, 0);
});

test("explicit PowerPoint timeout applies to all four bounded export attempts", async t => {
  const f = fixture(t, ({ attempt, renderDir }) => {
    if (attempt < 4) throw new Error("renderer process timed out");
    writePage(renderDir);
  });
  assert.equal((await f.render({ powerPoint: { exportTimeoutMs: 60_000 } })).ok, true);
  assert.equal(f.calls.length, 4); assert.deepEqual(f.delays, [500, 1000, 1500]);
  assert.ok(f.calls.every(call => call.options.timeout === 60_000));
});

test("empty successful exports still stop with the last failure after four attempts", async t => {
  const f = fixture(t, () => {});
  await assert.rejects(f.render(), error => error.code === "POWERPOINT_EMPTY_EXPORT");
  assert.equal(f.calls.length, 4); assert.deepEqual(f.delays, [500, 1000, 1500]);
});

test("structured retry classification requires a nonzero process exit and empty diagnostics", () => {
  for (const code of [1, -1, 2147483647]) assert.equal(adapter.isRetryableComError(silentFailure(code)), true);
  for (const code of [0, null, undefined, "1", 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(adapter.isRetryableComError(Object.assign(silentFailure(), { code })), false);
  }
  for (const error of [null, undefined, {}, { message: "renderer process failed" }, { message: "unrelated failure", code: 1 },
    { message: "editable job was cancelled", code: 1 }, { message: "renderer process termination was not confirmed", code: 1 },
    Object.assign(silentFailure(), { stderr: "private error sentinel" }), Object.assign(silentFailure(), { stdout: "private output sentinel" })]) {
    assert.equal(adapter.isRetryableComError(error), false);
  }
});

test("the real renderer process wrapper produces the structured silent error accepted by PowerPoint", async () => {
  const { run } = require("../packages/slideclone-core/renderer-process");
  let captured;
  try {
    await run(process.execPath, ["-e", "process.exit(7)"], { timeout: 5000 });
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof Error);
  assert.equal(captured.code, 7); assert.equal(captured.stdout, ""); assert.equal(captured.stderr, "");
  assert.equal(adapter.isRetryableComError(captured), true);
});

test("diagnostic, cancellation and termination failures are propagated without another export", async t => {
  for (const error of [Object.assign(silentFailure(), { stderr: "private error sentinel" }),
    Object.assign(silentFailure(), { stdout: "private output sentinel" }), new Error("editable job was cancelled"),
    new Error("renderer process termination was not confirmed")]) {
    const f = fixture(t, () => { throw error; });
    await assert.rejects(f.render(), actual => actual === error);
    assert.equal(f.calls.length, 1); assert.equal(f.delays.length, 0);
  }
  assert.equal(require("../scripts/test-suites").includesSuite(__filename, "unit"), true);
});
