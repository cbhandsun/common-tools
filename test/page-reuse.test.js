"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { resolvePageReuse } = require("../packages/slideclone-core/page-reuse");

function fixture(overrides = {}) {
  const calls = [], stats = {};
  const input = { preserveNative: false, cacheEnabled: true, reuseCache: true, stats, services: {
    preserve() { calls.push("preserve"); return { native: true }; },
    cacheKey() { calls.push("key"); return "fixture-key"; },
    read(key) { calls.push(["read", key]); return null; },
    normalize(page) { calls.push("normalize"); return page; },
    write(key, page) { calls.push(["write", key, page]); return true; },
    ...overrides
  } };
  return { input, calls, stats };
}

test("native reuse bypasses cache; cached pages normalize before recording hits", () => {
  const native = fixture();
  assert.deepEqual(resolvePageReuse({ ...native.input, preserveNative: true }), { kind: "reused", page: { native: true }, metadata: { nativePassthrough: true } });
  assert.deepEqual(native.calls, ["preserve"]);
  assert.deepEqual(native.stats, {});
  const page = { images: [] };
  const cached = fixture({ read: () => page });
  assert.equal(resolvePageReuse(cached.input).page, page);
  assert.deepEqual(cached.calls, ["key", "normalize"]);
  assert.deepEqual(cached.stats, { hits: 1 });
  const failed = fixture({ read: () => page, normalize() { throw new Error("normalize failed"); } });
  assert.throws(() => resolvePageReuse(failed.input), /normalize failed/);
  assert.deepEqual(failed.stats, {});
});

test("rebuild publishes only after normalization and rejects duplicate publication", () => {
  const value = fixture();
  const reuse = resolvePageReuse(value.input);
  assert.equal(reuse.kind, "rebuild");
  assert.deepEqual(value.stats, { misses: 1 });
  const page = { images: [] };
  assert.equal(reuse.persist(page), page);
  assert.deepEqual(value.calls, ["key", ["read", "fixture-key"], "normalize", ["write", "fixture-key", page]]);
  assert.deepEqual(value.stats, { misses: 1, writes: 1 });
  assert.throws(() => reuse.persist(page), /already attempted/);
});

test("disabled cache and empty keys perform no storage work", () => {
  for (const mode of ["disabled", "empty"]) {
    const value = fixture({ cacheKey() { return ""; } });
    const reuse = resolvePageReuse({ ...value.input, cacheEnabled: mode !== "disabled" });
    reuse.persist({});
    assert.deepEqual(value.calls, ["normalize"]);
    assert.deepEqual(value.stats, {});
  }
  const value = fixture();
  resolvePageReuse({ ...value.input, reuseCache: false }).persist({});
  assert.equal(value.calls.some((call) => Array.isArray(call) && call[0] === "read"), false);
  assert.equal(value.stats.writes, 1);
});

test("cache read, normalization and publication failures propagate without false writes", () => {
  const read = fixture({ read() { throw new Error("read failed"); } });
  assert.throws(() => resolvePageReuse(read.input), /read failed/);
  assert.deepEqual(read.stats, {});
  for (const stage of ["normalize", "write"]) {
    const value = fixture({ [stage]() { throw new Error("stage failed"); } });
    const reuse = resolvePageReuse(value.input);
    assert.throws(() => reuse.persist({}), /stage failed/);
    assert.throws(() => reuse.persist({}), /already attempted/);
    assert.deepEqual(value.stats, { misses: 1 });
  }
  const skipped = fixture({ write: () => false });
  resolvePageReuse(skipped.input).persist({});
  assert.deepEqual(skipped.stats, { misses: 1 });
});

test("reuse rejects malformed flags/services/keys and keeps counters finite without conversion hooks", () => {
  const { input } = fixture();
  for (const preserveNative of [undefined, null, 1, "true", {}]) assert.throws(() => resolvePageReuse({ ...input, preserveNative }), /flags/);
  assert.throws(() => resolvePageReuse({ ...input, services: {} }), /services/);
  for (const key of [null, 1, {}, "x".repeat(4097)]) assert.throws(() => resolvePageReuse(fixture({ cacheKey: () => key }).input), /key is invalid/);
  let invoked = false;
  const stats = { misses: { valueOf() { invoked = true; return 7; } } };
  resolvePageReuse({ ...input, stats });
  assert.equal(stats.misses, 1);
  assert.equal(invoked, false);
  const saturated = { misses: Number.MAX_SAFE_INTEGER };
  resolvePageReuse({ ...input, stats: saturated });
  assert.equal(saturated.misses, Number.MAX_SAFE_INTEGER);
  const accessor = Object.defineProperty({}, "misses", { get() { invoked = true; return 1; } });
  assert.throws(() => resolvePageReuse({ ...input, stats: accessor }), /counter is invalid/);
  assert.equal(invoked, false);
});
