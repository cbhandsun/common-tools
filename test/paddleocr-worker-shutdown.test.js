"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { waitForWorkersToClose } = require("../skills/pd-hifi-slideclone/scripts/lib/paddleocr-worker-shutdown");

function worker(close) {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  return { child, close: () => close(child) };
}

test("worker shutdown waits for actual close and removes only its own listener", async () => {
  let closed = false;
  const engine = worker((child) => setTimeout(() => { closed = true; child.emit("close"); }, 10));
  const existing = () => {};
  engine.child.on("close", existing);
  await waitForWorkersToClose([engine], 1000);
  assert.equal(closed, true);
  assert.deepEqual(engine.child.listeners("close"), [existing]);
  await waitForWorkersToClose([], 1);
});

test("shutdown handles already exited or signalled workers without waiting again", async () => {
  for (const state of [{ exitCode: 0 }, { exitCode: 1 }, { signalCode: "SIGTERM" }]) {
    const engine = worker(() => {});
    Object.assign(engine.child, state);
    await waitForWorkersToClose([engine], 1);
    assert.equal(engine.child.listenerCount("close"), 0);
  }
});

test("shutdown timeout and synchronous errors fail safely without retries", async () => {
  let calls = 0;
  const engine = worker(() => { calls += 1; });
  await assert.rejects(waitForWorkersToClose([engine], 10), /shutdown timed out/);
  assert.equal(calls, 1);
  assert.equal(engine.child.listenerCount("close"), 0);
  const broken = worker(() => { throw new Error("PRIVATE_USER_CONTENT"); });
  await assert.rejects(waitForWorkersToClose([broken], 100), (error) => {
    assert.equal(error.message, "PaddleOCR worker shutdown failed");
    return true;
  });
  assert.equal(broken.child.listenerCount("close"), 0);
});

test("shutdown waits for every started cleanup even when one worker fails", async () => {
  let closed = false;
  const first = worker(() => { throw new Error("private"); });
  const second = worker((child) => setTimeout(() => { closed = true; child.emit("close"); }, 10));
  await assert.rejects(waitForWorkersToClose([first, second], 1000), /shutdown failed/);
  assert.equal(closed, true);
  const failures = [worker(() => {}), worker(() => {})];
  await assert.rejects(waitForWorkersToClose(failures, 10), (error) => error instanceof AggregateError && error.errors.length === 2);
});

test("shutdown rejects invalid bounds", () => {
  assert.throws(() => waitForWorkersToClose(null), /bounds/);
  for (const value of [0, -1, 10001, NaN, Infinity, "5000"]) {
    assert.throws(() => waitForWorkersToClose([], value), /bounds/);
  }
});
