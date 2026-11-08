"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { injectSnapshotReplayWriteFault } = require("./helpers/snapshot-replay-write-fault.cjs");

function fixture(t, { closeError } = {}) {
  const root = path.resolve("snapshot-fault-fixture");
  const replay = path.join(root, "quality-snapshot-replay-owned", "page.png");
  const calls = [];
  const fileSystem = {
    openSync: () => 7,
    closeSync: descriptor => { calls.push(["close", descriptor]); if (closeError) throw closeError; },
    writeFileSync: (descriptor, data) => calls.push(["write", descriptor, data.toString()]),
    writeSync: (descriptor, data) => calls.push(["partial", descriptor, data.toString()])
  };
  const originals = { ...fileSystem };
  const injection = injectSnapshotReplayWriteFault(t.mock, fileSystem, root);
  t.after(() => injection.restore());
  return { root, replay, calls, fileSystem, originals, injection };
}

test("snapshot write fault never targets a descriptor opened only for reading", t => {
  const f = fixture(t), descriptor = f.fileSystem.openSync(f.replay, "r");
  f.fileSystem.writeFileSync(descriptor, Buffer.from("runner-transport"));
  assert.deepEqual(f.calls, [["write", 7, "runner-transport"]]);
});

test("closing an unwritten replay descriptor ends its fault-injection lifetime before reuse", t => {
  const f = fixture(t), descriptor = f.fileSystem.openSync(f.replay, "wx");
  f.fileSystem.closeSync(descriptor);
  const reused = f.fileSystem.openSync(path.join(f.root, "unrelated.bin"), "wx");
  assert.equal(reused, descriptor);
  f.fileSystem.writeFileSync(reused, Buffer.from("retained"));
  assert.deepEqual(f.calls, [["close", 7], ["write", 7, "retained"]]);
});

test("only an exclusive replay write receives a partial failure and the target is consumed once", t => {
  const f = fixture(t), descriptor = f.fileSystem.openSync(f.replay, "wx");
  assert.throws(() => f.fileSystem.writeFileSync(descriptor, Buffer.from("first")), /write interrupted/);
  f.fileSystem.writeFileSync(descriptor, Buffer.from("second"));
  assert.deepEqual(f.calls, [["partial", 7, "partial"], ["write", 7, "second"]]);
  f.injection.restore();
  for (const name of Object.keys(f.originals)) assert.equal(f.fileSystem[name], f.originals[name]);
});

test("unrelated paths and ordinary writes never become replay failure targets", t => {
  const f = fixture(t);
  for (const file of [path.join(f.root, "unrelated.bin"), path.join(f.root, "nested", "quality-snapshot-replay-owned", "page.png")]) {
    const descriptor = f.fileSystem.openSync(file, "wx");
    f.fileSystem.writeFileSync(descriptor, Buffer.from("retained"));
  }
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call[0] === "write"));
});

test("read modes, nonexclusive modes and nonstring paths do not acquire write authority", t => {
  const f = fixture(t);
  for (const flags of [undefined, "r", "r+", "w", "a", 0]) {
    const descriptor = f.fileSystem.openSync(f.replay, flags);
    f.fileSystem.writeFileSync(descriptor, Buffer.from("retained"));
  }
  for (const file of [null, Buffer.from(f.replay), 7]) {
    const descriptor = f.fileSystem.openSync(file, "wx");
    f.fileSystem.writeFileSync(descriptor, Buffer.from("retained"));
  }
  assert.equal(f.calls.length, 9);
  assert.ok(f.calls.every(call => call[0] === "write"));
});

test("close failure retains its error and cannot leave a reusable fault target", t => {
  const closeError = new Error("controlled close failure"), f = fixture(t, { closeError });
  const descriptor = f.fileSystem.openSync(f.replay, "wx");
  assert.throws(() => f.fileSystem.closeSync(descriptor), error => error === closeError);
  f.fileSystem.writeFileSync(descriptor, Buffer.from("retained"));
  assert.deepEqual(f.calls, [["close", 7], ["write", 7, "retained"]]);
});

test("restoring a pending injection releases all hooks and is idempotent", t => {
  const f = fixture(t), descriptor = f.fileSystem.openSync(f.replay, "wx");
  f.injection.restore(); f.injection.restore();
  f.fileSystem.writeFileSync(descriptor, Buffer.from("retained"));
  for (const name of Object.keys(f.originals)) assert.equal(f.fileSystem[name], f.originals[name]);
  assert.deepEqual(f.calls, [["write", 7, "retained"]]);
});

test("fault-lifetime regressions and their actual cache consumer remain in unified CI", () => {
  const { discoverTestFiles } = require("../scripts/test-sharded");
  for (const suite of ["unit", "all"]) assert.ok(discoverTestFiles(process.cwd(), suite)
    .some(row => row.file.replaceAll("\\", "/") === "test/snapshot-replay-write-fault.test.js"));
  for (const suite of ["integration", "all"]) assert.ok(discoverTestFiles(process.cwd(), suite)
    .some(row => row.file.replaceAll("\\", "/") === "test/rendered-page-snapshot-cache.test.js"));
});
