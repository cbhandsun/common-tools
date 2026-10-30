"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { assertProcessSucceeded } = require("./helpers/child-process-status.cjs");

test("child result assertions preserve success and report bounded failure identity", () => {
  assertProcessSucceeded({ status: 0, signal: null });
  assertProcessSucceeded({ status: 0 });
  assert.throws(() => assertProcessSucceeded({ status: 5, signal: null }), /"status":5/u);
  assert.throws(() => assertProcessSucceeded({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT" } }), /"signal":"SIGTERM","errorCode":"ETIMEDOUT"/u);
});

test("empty, invalid and extreme child results fail closed", () => {
  for (const value of [null, undefined, {}, [], { status: -1 }, { status: NaN }, { status: Infinity }, { status: "0" }, { status: 0x100000000 }, { status: .5 }]) {
    assert.throws(() => assertProcessSucceeded(value), /child-process-status/u);
  }
  assert.throws(() => assertProcessSucceeded({ status: 0, error: null }), /"errorPresent":true/u);
  assert.throws(() => assertProcessSucceeded({ status: 0, signal: "unknown" }), /child-process-status/u);
  assert.throws(() => assertProcessSucceeded({ status: 0xffffffff }), /"status":4294967295/u);
});

test("child assertions cannot reveal arbitrary output or execute accessors and proxies", () => {
  let invoked = 0;
  const accessor = Object.defineProperty({}, "status", { get() { invoked++; throw Error("private-token"); } });
  const proxy = new Proxy({}, { get() { invoked++; throw Error("private-token"); }, getOwnPropertyDescriptor() { invoked++; throw Error("private-token"); } });
  const nested = { status: null, error: Object.defineProperty({}, "code", { get() { invoked++; throw Error("private-token"); } }) };
  const signalAccessor = Object.defineProperty({ status: 0 }, "signal", { get() { invoked++; throw Error("private-token"); } });
  const errorAccessor = Object.defineProperty({ status: 0 }, "error", { get() { invoked++; throw Error("private-token"); } });
  for (const result of [accessor, proxy, nested, signalAccessor, errorAccessor, { status: null, stdout: "private-token", stderr: "private-token", signal: "private-token\n", error: { code: "private-token", message: "private-token", stack: "private-token" } }, Object.create({ status: 0 })]) {
    assert.throws(() => assertProcessSucceeded(result), error => {
      assert.equal(error instanceof assert.AssertionError, true);
      assert.equal(error.message.includes("private-token"), false);
      return true;
    });
  }
  assert.equal(invoked, 0);
});

test("real timed-out child retains timeout identity without its private stdio", () => {
  const result = spawnSync(process.execPath, ["-e", "process.stdout.write('private-child-output');setInterval(()=>{},1000)"], { encoding: "utf8", timeout: 250, windowsHide: true });
  assert.equal(result.error?.code, "ETIMEDOUT");
  assert.throws(() => assertProcessSucceeded(result), error => {
    assert.equal(error instanceof assert.AssertionError, true);
    assert.match(error.message, /"errorCode":"ETIMEDOUT"/u);
    assert.equal(error.message.includes("private-child-output"), false);
    return true;
  });
});

test("child process diagnostic regressions enter unified CI", () => {
  for (const suite of ["unit", "all"]) assert.ok(require("../scripts/test-sharded").discoverTestFiles(process.cwd(), suite)
    .some(row => row.file.replaceAll("\\", "/") === "test/child-process-status.test.js"));
});

test('real failed test stderr is reduced to metadata without leaking its content', t => {
  const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
  const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
  const root=createTemporaryTestDirectory('process-stderr-reporter-');t.after(()=>removeTemporaryTestDirectory(root));
  const file=path.join(root,'crash.test.js');
  fs.writeFileSync(file,"process.stderr.write('private-token FATAL ERROR: private-user-content\\n');process.exit(5);\n");
  const reporter=pathToFileURL(path.resolve(__dirname,'../scripts/test-process-reporter.js')).href;
  // This is a new runner, not a child enrolled in the outer runner's IPC.
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--test','--test-reporter='+reporter,file],
    {encoding:'utf8',timeout:15000,windowsHide:true,env});
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  assert.match(result.stdout,/"exitCode":5/u);assert.match(result.stdout,/"stderrTextSignatures":\["fatal-error-text"\]/u);
  assert.equal((result.stdout+result.stderr).includes('private-token'),false);
  assert.equal((result.stdout+result.stderr).includes('private-user-content'),false);
});
