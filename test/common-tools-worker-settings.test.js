"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readWorkerSettings } = require("../packages/remote-mcp-server/worker-settings");
const { workerSettings: auditWorkerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-worker");
const { workerSettings: imageWorkerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { workerSettings: pptCreateWorkerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker");
const { workerSettings: pptQualityWorkerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-quality-worker");
const { workerSettings: pptImproveWorkerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-improve-worker");

test("image startup refuses executable getters without evaluating user code", () => {
  let calls = 0;
  const environment = { get OPENXML_BUILDER_EXE() { calls += 1; return process.execPath; } };
  assert.throws(() => imageWorkerSettings(environment), /worker environment is invalid/);
  assert.equal(calls, 0);
});

test("image startup snapshots only known string data and rejects hostile or extreme inputs", () => {
  const { readImageWorkerEnvironment, pathIsFile } = require("../packages/remote-mcp-server/image-worker-settings");
  let calls = 0;
  const secret = "private-input-must-not-appear";
  const proxy = new Proxy({}, { get() { calls += 1; throw new Error(secret); }, getOwnPropertyDescriptor() { calls += 1; throw new Error(secret); } });
  for (const value of [null, undefined, [], 1, "bad", proxy]) {
    assert.throws(() => readImageWorkerEnvironment(value), /worker environment is invalid/);
  }
  for (const value of [1, false, {}, "x".repeat(4097), secret + "\0"]) {
    assert.throws(() => imageWorkerSettings({ OPENXML_BUILDER_EXE: value }), error => !error.message.includes(secret));
  }
  const inherited = Object.create({ get OPENXML_BUILDER_EXE() { calls += 1; return secret; } });
  assert.deepEqual(Object.keys(readImageWorkerEnvironment(inherited)), []);
  const source = { OPENXML_BUILDER_EXE: process.execPath, get UNRELATED_SECRET() { calls += 1; throw new Error(secret); } };
  const result = readImageWorkerEnvironment(source);
  assert.equal(result.OPENXML_BUILDER_EXE, process.execPath);
  assert.equal(Object.isFrozen(result), true);
  source.OPENXML_BUILDER_EXE = "changed";
  assert.equal(result.OPENXML_BUILDER_EXE, process.execPath);
  assert.equal(calls, 0);
  for (const value of [null, {}, "relative.exe", __dirname, "x".repeat(4097)]) assert.equal(pathIsFile(value), false);
  assert.equal(pathIsFile(process.execPath), true);
});

test("image startup preserves OCR dispatch, checkpoint requirements and profile failures", () => {
  const { createImageWorkerSettings } = require("../packages/remote-mcp-server/image-worker-settings");
  const calls = [];
  const read = createImageWorkerSettings({
    paddleProfileName: "paddle-test",
    readPaddleProfile: environment => { calls.push(environment); return Object.freeze({ enabled: true, kind: "paddleocr" }); },
    readRawProfile: environment => { calls.push(environment); return Object.freeze({ enabled: false }); }
  });
  const base = { OPENXML_BUILDER_EXE: process.execPath };
  const disabled = read(base);
  assert.equal(disabled.rawImageOcrProfile.enabled, false);
  assert.equal(Object.isFrozen(disabled), true);
  const digest = "a".repeat(64);
  const enabled = read({ ...base, COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: "paddle-test", COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION: digest });
  assert.equal(enabled.rawImageOcrProfile.kind, "paddleocr");
  assert.equal(enabled.ocrCheckpointFingerprint, digest);
  assert.ok(calls.every(Object.isFrozen));
  assert.throws(() => read({ ...base, COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION: digest }), /enabled OCR profile/);
  const failure = new Error("profile validation failed");
  const fail = createImageWorkerSettings({ paddleProfileName: "paddle", readPaddleProfile: () => { throw failure; }, readRawProfile: () => { throw failure; } });
  assert.throws(() => fail(base), error => error === failure);
});

test("OCR checkpoint revisions require an explicit bounded release digest", () => {
  const { readOcrCheckpointRevision } = require("../packages/remote-mcp-server/worker-settings");
  const key = "COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION";
  assert.equal(readOcrCheckpointRevision({}), undefined);
  assert.equal(readOcrCheckpointRevision({ [key]: "" }), undefined);
  assert.equal(readOcrCheckpointRevision({ [key]: "a".repeat(64) }), "a".repeat(64));
  for (const value of ["secret-do-not-echo", "A".repeat(64), "a".repeat(65), "../unsafe", 1, {}, null]) {
    assert.throws(() => readOcrCheckpointRevision({ [key]: value }), error => !error.message.includes("secret-do-not-echo") && /CHECKPOINT_REVISION/.test(error.message));
  }
  assert.throws(() => imageWorkerSettings({ [key]: "a".repeat(64), OPENXML_BUILDER_EXE: process.execPath }), /enabled OCR profile/);
});

test("shared worker settings parse bounded string values and preserve worker-specific capability rules", () => {
  const settings = readWorkerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "project-audit, project-audit", COMMON_TOOLS_WORKER_POLL_SECONDS: "60", COMMON_TOOLS_WORKER_ID: "audit-worker-1" }, { capability: "project-audit", capabilityError: "invalid capability", workerIdPrefix: "audit-", allowDelimitedCapabilities: true });
  assert.deepEqual([...settings.capabilities], ["project-audit"]);
  assert.equal(settings.pollSeconds, 60);
  assert.equal(settings.workerId, "audit-worker-1");
  assert.equal(readWorkerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "", COMMON_TOOLS_WORKER_POLL_SECONDS: "", COMMON_TOOLS_WORKER_ID: "" }, { capability: "ppt-quality", capabilityError: "invalid capability", workerIdPrefix: "quality-" }).pollSeconds, 5);
  assert.throws(() => readWorkerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-create,ppt-create" }, { capability: "ppt-create", capabilityError: "invalid capability", workerIdPrefix: "create-" }), /invalid capability/);
});

test("shared worker settings reject malformed, extreme, and non-string environment input without echoing it", () => {
  const options = { capability: "ppt-quality", capabilityError: "invalid capability", workerIdPrefix: "quality-" };
  for (const pollSeconds of ["0", "61", "1.5", "9007199254740992", " "]) assert.throws(() => readWorkerSettings({ COMMON_TOOLS_WORKER_POLL_SECONDS: pollSeconds }, options), /POLL_SECONDS/);
  assert.throws(() => readWorkerSettings({ COMMON_TOOLS_WORKER_ID: "x".repeat(129) }, options), /WORKER_ID/);
  assert.throws(() => readWorkerSettings({ COMMON_TOOLS_WORKER_POLL_SECONDS: 5 }, options), /must be a string/);
  assert.throws(() => readWorkerSettings([], options), /worker environment is invalid/);
  const secret = "do-not-echo-this-value!";
  assert.throws(() => readWorkerSettings({ COMMON_TOOLS_WORKER_ID: secret }, options), (error) => error instanceof Error && !error.message.includes(secret));
  const throwingEnvironment = Object.create(null, { COMMON_TOOLS_WORKER_ID: { get() { throw new Error(secret); } } });
  assert.throws(() => readWorkerSettings(throwingEnvironment, options), (error) => error instanceof Error && error.message === "worker environment is invalid");
  let coercions = 0;
  const coercible = { toString() { coercions += 1; return secret; }, valueOf() { coercions += 1; return 5; } };
  for (const name of ["COMMON_TOOLS_WORKER_CAPABILITIES", "COMMON_TOOLS_WORKER_POLL_SECONDS", "COMMON_TOOLS_WORKER_ID"]) {
    for (const value of [null, false, 5, [], coercible]) {
      assert.throws(() => readWorkerSettings({ [name]: value }, options), (error) => error instanceof Error && error.message === `${name} must be a string`);
    }
  }
  assert.equal(coercions, 0);
  for (const environment of [null, undefined, false, "environment"]) assert.throws(() => readWorkerSettings(environment, options), /worker environment is invalid/);
});

test("all production worker entries use the common settings boundary with their established prefixes", () => {
  const workerCases = [
    [auditWorkerSettings, "project-audit", "team-worker-", {}],
    [imageWorkerSettings, "image-to-editable", "team-image-worker-", { OPENXML_BUILDER_EXE: process.execPath }],
    [pptCreateWorkerSettings, "ppt-create", "team-ppt-create-worker-", {}],
    [pptQualityWorkerSettings, "ppt-quality", "team-ppt-quality-worker-", {}],
    [pptImproveWorkerSettings, "ppt-improve", "team-ppt-improve-worker-", {}]
  ];
  for (const [settingsForWorker, capability, prefix, extraEnvironment] of workerCases) {
    const settings = settingsForWorker({ ...extraEnvironment, COMMON_TOOLS_WORKER_CAPABILITIES: capability, COMMON_TOOLS_WORKER_POLL_SECONDS: "1", COMMON_TOOLS_WORKER_ID: "worker-id-1" });
    assert.equal(settings.pollSeconds, 1);
    assert.equal(settings.workerId, "worker-id-1");
    const generated = settingsForWorker({ ...extraEnvironment });
    assert.match(generated.workerId, new RegExp(`^${prefix}`));
  }
});
