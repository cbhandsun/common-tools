"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createWorkerExecutionBudget, WorkerExecutionTimeout } = require("../packages/slideclone-worker-adapter/worker-execution-budget");

test("worker budget counts all stages against one deadline, including the exact deadline", async () => {
  let now = 10;
  const budget = createWorkerExecutionBudget({ timeoutMs: 100, isCancellationRequested: () => false, now: () => now });
  assert.equal(budget.processTimeout(200), 100);
  for (let index = 0; index < 3; index++) assert.equal(await budget.run(() => { now += 30; return index; }), index);
  assert.equal(budget.processTimeout(200), 10);
  assert.equal(budget.processTimeout(2), 2);
  await assert.rejects(budget.run(() => { now += 10; }), WorkerExecutionTimeout);
  let invoked = false;
  await assert.rejects(budget.run(() => { invoked = true; }), WorkerExecutionTimeout);
  assert.equal(invoked, false);
  assert.equal(await budget.isCancellationRequested(), true);
  assert.deepEqual(budget.snapshot(), { timeoutMs: 100, elapsedMs: 100, remainingMs: 0, timedOut: true });
});

test("empty operations and ordinary failures keep their result and failure identity", async () => {
  const budget = createWorkerExecutionBudget({ timeoutMs: 540000, isCancellationRequested: () => false });
  assert.equal(await budget.run(() => null), null);
  assert.equal(await budget.run(() => undefined), undefined);
  const original = new Error("stage failure");
  await assert.rejects(budget.run(() => { throw original; }), error => error === original);
  assert.equal(budget.snapshot().timedOut, false);
});

test("cancellation checks fail closed without retaining provider text and stay stopped", async () => {
  for (const provider of [() => true, () => { throw new Error("private-provider-token"); }, async () => { throw new Error("private-provider-token"); }, () => "false", () => null, () => undefined]) {
    const budget = createWorkerExecutionBudget({ timeoutMs: 1000, isCancellationRequested: provider });
    assert.equal(await budget.isCancellationRequested(), true);
    await assert.rejects(budget.run(() => assert.fail("must not run")), error => error.message === "editable job was cancelled" && error.cause === undefined);
    assert.throws(() => budget.processTimeout(100), /cancelled/);
  }
});

test("hung checks consume the budget and concurrent checks share a single provider request", async () => {
  let calls = 0;
  const budget = createWorkerExecutionBudget({ timeoutMs: 35, isCancellationRequested: () => { calls++; return new Promise(() => {}); } });
  assert.deepEqual(await Promise.all([budget.isCancellationRequested(), budget.isCancellationRequested()]), [true, true]);
  assert.equal(calls, 1);
  assert.equal(budget.snapshot().timedOut, true);
});

test("invalid and unsafe budget inputs never invoke getters or proxy traps", async () => {
  const input = { timeoutMs: 100, isCancellationRequested: () => false };
  for (const timeoutMs of [undefined, null, "100", 0, -1, 540001, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER])
    assert.throws(() => createWorkerExecutionBudget({ ...input, timeoutMs }), /invalid/);
  for (const value of [null, [], {}, { ...input, now: true }, { ...input, isCancellationRequested: null }])
    assert.throws(() => createWorkerExecutionBudget(value), /invalid/);
  let invoked = false;
  assert.throws(() => createWorkerExecutionBudget({ ...input, get now() { invoked = true; return () => 1; } }));
  assert.throws(() => createWorkerExecutionBudget(new Proxy(input, { get() { invoked = true; return null; } })));
  assert.equal(invoked, false);
  const budget = createWorkerExecutionBudget(input);
  for (const value of [0, NaN, "1", 540001]) assert.throws(() => budget.processTimeout(value), /invalid/);
  await assert.rejects(budget.run(null), /invalid/);
  for (const now of [() => -1, () => "1", () => NaN, () => Infinity]) assert.throws(() => createWorkerExecutionBudget({ ...input, now }), /clock/);
  let clock = 100;
  const backwards = createWorkerExecutionBudget({ ...input, now: () => clock });
  clock = 99;
  assert.throws(() => backwards.remainingMs(), /clock/);
});

test("deadline exhaustion wins over late adapter success or failure without making it green", async () => {
  for (const fails of [false, true]) {
    let clock = 0;
    const budget = createWorkerExecutionBudget({ timeoutMs: 100, isCancellationRequested: () => false, now: () => clock });
    await assert.rejects(budget.run(() => { clock = 101; if (fails) throw new Error("private-adapter-content"); return { passed: true }; }), WorkerExecutionTimeout);
  }
});

test("successful stage completion keeps cancellation for the caller's established next boundary", async () => {
  let cancelled = false;
  const budget = createWorkerExecutionBudget({ timeoutMs: 1000, isCancellationRequested: () => cancelled });
  assert.equal(await budget.run(() => { cancelled = true; return "completed-stage"; }), "completed-stage");
  await assert.rejects(budget.assertActive(), /editable job was cancelled/);
});
