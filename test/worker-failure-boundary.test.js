"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { WorkerFailure, storedWorkerFailure, runWorkerStage, withWorkerStageObserver } = require("../packages/team-runtime/worker-failure");

test("stage timing observes success and failure without exposing operation data", async () => {
  const events = [];
  await withWorkerStageObserver((event) => { events.push(event); }, async () => {
    assert.equal(await runWorkerStage("IMAGE_OCR_FAILED", () => "private-result"), "private-result");
    await assert.rejects(runWorkerStage("IMAGE_BUILD_FAILED", () => { throw new Error("private-error"); }));
  });
  await runWorkerStage("IMAGE_OCR_FAILED", () => null);
  assert.equal(events.length, 2, "observer scope ends with its job");
  assert.deepEqual(events.map((event) => event.status), ["succeeded", "failed"]);
  for (const event of events) {
    assert.ok(Object.isFrozen(event));
    assert.ok(Number.isFinite(event.durationMs) && event.durationMs >= 0 && event.durationMs <= 86400000);
    assert.ok(event.endedAt >= event.startedAt);
  }
  assert.doesNotMatch(JSON.stringify(events), /private-/);
  assert.throws(() => withWorkerStageObserver(null, () => {}), /observer is invalid/);
});

test("worker stages preserve results and known retries but sanitize arbitrary failures", async () => {
  const result = Object.freeze({ value: 42 });
  assert.equal(await runWorkerStage("IMAGE_OCR_FAILED", () => result), result);
  assert.equal(await runWorkerStage("IMAGE_OCR_FAILED", async () => result), result);
  const retry = new WorkerFailure("INPUT_NOT_READY");
  await assert.rejects(runWorkerStage("IMAGE_OCR_FAILED", () => { throw retry; }), (error) => error === retry);
  const codes = ["IMAGE_INPUT_READ_FAILED", "IMAGE_NORMALIZATION_FAILED", "IMAGE_OCR_FAILED", "IMAGE_REBUILD_FAILED", "IMAGE_BUILD_FAILED", "IMAGE_QUALITY_FAILED", "IMAGE_UPLOAD_FAILED"];
  for (const code of codes) {
    for (const cause of [null, undefined, "private-token", new Error("private-token"), { headers: "private-token", code: "INPUT_NOT_READY" }]) {
      await assert.rejects(runWorkerStage(code, () => Promise.reject(cause)), (error) => {
        const stored = storedWorkerFailure(error);
        assert.equal(stored.code, code);
        assert.equal(stored.retryable, false);
        assert.equal(JSON.stringify(stored).includes("private-token"), false);
        return true;
      });
    }
  }
  let invoked = false;
  await assert.rejects(runWorkerStage("UNKNOWN", () => { invoked = true; }), /stage is invalid/);
  assert.equal(invoked, false);
  await assert.rejects(runWorkerStage("IMAGE_BUILD_FAILED", null), /stage is invalid/);
});

test("worker failures accept only own registered codes, including prototype-name rejection", () => {
  for (const code of [undefined, null, "", "UNKNOWN", "toString", "constructor", "__proto__", 0, {}, [], "x".repeat(100000)]) {
    assert.throws(() => new WorkerFailure(code), /code is invalid/);
  }
});

test("worker failures validate options before retaining an internal cause", () => {
  for (const options of [null, false, "", [], { token: "fixture-secret" }, { cause: null, extra: 1 }]) {
    assert.throws(() => new WorkerFailure("INPUT_NOT_READY", options), /options are invalid/);
  }
  const cause = new Error("fixture-private-provider-content");
  const failure = new WorkerFailure("INPUT_NOT_READY", { cause });
  assert.equal(failure.cause, cause);
  assert.deepEqual(storedWorkerFailure(failure), { code: "INPUT_NOT_READY", message: "uploaded input is not ready", retryable: true });
  assert.equal(JSON.stringify(storedWorkerFailure(failure)).includes(cause.message), false);
});

test("failure projection safely handles unknown and forged failures without exposing content", () => {
  const generic = { code: "WORKER_FAILED", message: "capability worker failed", retryable: false };
  const forged = Object.create(WorkerFailure.prototype);
  forged.code = "toString";
  for (const error of [null, undefined, "fixture-private-content", new Error("fixture-private-content"), { code: "INPUT_NOT_READY" }, forged]) {
    assert.deepEqual(storedWorkerFailure(error), generic);
  }
});

test("registered worker failures have immutable codes and preserve their retry classification", () => {
  for (const code of ["INPUT_NOT_READY", "IMAGE_ASSET_NAMESPACE_FAILED", "IMAGE_DELIVERY_FAILED"]) {
    const failure = new WorkerFailure(code);
    assert.throws(() => { failure.code = "INPUT_NOT_READY"; }, TypeError);
    const result = storedWorkerFailure(failure);
    assert.equal(result.code, code);
    assert.equal(result.retryable, code === "INPUT_NOT_READY");
    assert.equal(Object.isFrozen(result), true);
  }
});


test("historic stored errors are projected from known codes without exposing payloads", () => {
  const { readStoredWorkerFailure } = require("../packages/team-runtime/worker-failure");
  const generic = storedWorkerFailure(new Error("private"));
  for (const input of [null, undefined, "null"]) assert.equal(readStoredWorkerFailure(input), null);
  for (const input of ["{private", "x".repeat(8193), [], 5, true, { code: "toString" }, Object.create({code:"IMAGE_OCR_FAILED"}), { get code() { throw new Error("private"); } }]) assert.deepEqual(readStoredWorkerFailure(input), generic);
  for (const code of ["IMAGE_OCR_FAILED", "INPUT_NOT_READY", "QUALITY_GATE_FAILED", "NO_CAPABILITY_HANDLER", "WORKER_LEASE_EXPIRED"]) {
    const input = {code, message:"private content", retryable:"unsafe", cause:"private headers", get headers() { throw new Error("must not read"); }};
    const result = readStoredWorkerFailure(input);
    assert.equal(result.code, code);
    assert.equal(result.retryable, code === "INPUT_NOT_READY");
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(Object.keys(result).sort(), ["code", "message", "retryable"]);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.deepEqual(readStoredWorkerFailure(JSON.stringify({code,message:"secret"})), result);
  }
});
