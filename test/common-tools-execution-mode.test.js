"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { normalizeExecutionMode, readRuntimeConfig, resolveExecutionRoute, runtimeConfigPath } = require("../packages/capability-runtime");

test("execution routing keeps project audit local by default and sends image conversion remote", () => {
  assert.deepEqual(resolveExecutionRoute({ capability: "project-audit" }), { execution: "local", reason: "local-capability-default", locallySupported: true });
  assert.deepEqual(resolveExecutionRoute({ capability: "image-to-editable" }), { execution: "remote", reason: "capability-requires-remote-runtime", locallySupported: false });
  assert.deepEqual(resolveExecutionRoute({ capability: "project-audit", executionMode: "remote-only" }), { execution: "remote", reason: "configured-remote-only", locallySupported: true });
  assert.deepEqual(resolveExecutionRoute({ capability: "project-audit", requestedExecution: "remote" }), { execution: "remote", reason: "explicit-remote-request", locallySupported: true });
  assert.throws(() => resolveExecutionRoute({ capability: "image-to-editable", executionMode: "local-only" }), /unavailable in local-only/);
  assert.throws(() => resolveExecutionRoute({ capability: "image-to-editable", requestedExecution: "local" }), /requires remote/);
});

test("runtime configuration is strict, bounded and defaults safely when absent", () => {
  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-runtime-config-"));
  try {
    const environment = { LOCALAPPDATA: localAppData };
    assert.equal(readRuntimeConfig(environment, "win32").executionMode, "local-preferred");
    const file = runtimeConfigPath(environment, "win32");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, executionMode: "local-only", installedRuntimeVersion: "0.1.0" }));
    assert.deepEqual(readRuntimeConfig(environment, "win32"), { source: "user", schemaVersion: 1, executionMode: "local-only", installedRuntimeVersion: "0.1.0", file });
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, executionMode: "unsafe", installedRuntimeVersion: "0.1.0" }));
    assert.throws(() => readRuntimeConfig(environment, "win32"), /configuration is invalid|execution mode/);
  } finally { fs.rmSync(localAppData, { recursive: true, force: true }); }
  assert.equal(normalizeExecutionMode(undefined), "local-preferred");
  assert.throws(() => normalizeExecutionMode("local"), /execution mode/);
});
