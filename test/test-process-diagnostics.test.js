"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { formatProcessFailure, processDiagnostics } = require("../scripts/test-process-diagnostics");

test("process diagnostics retain exit and signal identity without arbitrary error content", () => {
  const event = { type: "test:fail", data: { file: "/private/test/cache.test.js", details: { error: {
    code: "ERR_TEST_FAILURE", failureType: "subtestsFailed", exitCode: 23, signal: null,
    message: "private-content", stack: "private-stack", cause: { token: "private-token" }
  } } } };
  const line = formatProcessFailure(event);
  assert.match(line, /"file":"cache.test.js"/u);
  assert.match(line, /"exitCode":23/u);
  assert.equal(line.includes("private"), false);
  event.data.details.error.signal = "SIGTERM";
  assert.match(formatProcessFailure(event), /"signal":"SIGTERM"/u);
});

test("ordinary assertions, empty events and hostile diagnostics do not emit process summaries", () => {
  for (const event of [null, {}, { type: "test:pass" }, { type: "test:fail", data: { details: {
    error: { failureType: "testCodeFailure", message: "private" }
  } } }]) assert.equal(formatProcessFailure(event), null);
  let invoked = 0;
  const hostile = { type: "test:fail", get data() { invoked++; throw Error("secret"); } };
  assert.equal(formatProcessFailure(hostile), null);
  assert.equal(formatProcessFailure(new Proxy({}, { get() { invoked++; throw Error("secret"); } })), null);
  assert.equal(invoked, 0);
});

test("process diagnostic fields reject invalid values and sanitize file identity", () => {
  for (const exitCode of [NaN, Infinity, 1.5, -1, "23", {}, 4294967296]) {
    const event = { type: "test:fail", data: { file: "bad\ncontent.js", details: { error: { exitCode, signal: "SECRET" } } } };
    assert.equal(formatProcessFailure(event), null);
  }
  const event = { type: "test:fail", data: { file: "C:\\private\\test\\cache.test.js", details: {
    error: { exitCode: 1, signal: "secret\nvalue" }
  } } };
  const line = formatProcessFailure(event);
  assert.match(line, /"file":"cache.test.js"/u);
  assert.match(line, /"signal":null/u);
  assert.equal(line.includes("private"), false);
  event.data.details.error.exitCode = 3221225477;
  assert.match(formatProcessFailure(event), /"exitCode":3221225477/u);
});

test("diagnostic regressions are discovered by unified CI", () => {
  for (const suite of ["unit", "all"]) assert.ok(require("../scripts/test-sharded").discoverTestFiles(process.cwd(), suite)
    .some(row => row.file.replaceAll("\\", "/") === "test/test-process-diagnostics.test.js"));
});

test("diagnostic stream emits only bounded failure metadata and propagates upstream errors", async () => {
  async function* input() {
    yield { type: "test:pass", data: { name: "private-content" } };
    yield { type: "test:fail", data: { file: "safe.test.js", details: { error: { signal: "SIGTERM" } } } };
  }
  const lines = [];
  for await (const line of processDiagnostics(input())) lines.push(line);
  assert.deepEqual(lines, ['# test-process-failure {"file":"safe.test.js","exitCode":null,"signal":"SIGTERM"}\n']);
  const failure = new Error("upstream-private-content");
  async function* rejected() { throw failure; }
  await assert.rejects(async () => { for await (const _ of processDiagnostics(rejected())) assert.fail(); }, error => error === failure);
  const empty = [];
  for await (const line of processDiagnostics((async function* () {})())) empty.push(line);
  assert.deepEqual(empty, []);
});

test("nested accessors, inherited fields and control characters cannot be serialized", () => {
  let invoked = 0;
  const error = Object.defineProperty({}, "exitCode", { get() { invoked++; throw Error("private"); } });
  assert.equal(formatProcessFailure({ type: "test:fail", data: { details: { error } } }), null);
  assert.equal(formatProcessFailure(Object.create({ type: "test:fail", data: { details: { error: { exitCode: 1 } } } })), null);
  const line = formatProcessFailure({ type: "test:fail", data: { file: "bad\ncontent.js", details: { error: { exitCode: 1 } } } });
  assert.match(line, /"file":"unknown-test-file"/u);
  assert.equal(line.split('\n').length, 2);
  assert.equal(invoked, 0);
});
