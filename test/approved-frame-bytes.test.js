"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm");
const { readApprovedFrameBytes } = require("../packages/slideclone-core/scene-plan/approved-frame-bytes");

test("normal, empty and offset Buffer views retain exactly their native byte range", () => {
  const storage = Buffer.from([5, 10, 15, 20, 25]);
  for (const bytes of [storage.subarray(1, 4), new Uint8Array([10, 15, 20]), vm.runInNewContext("new Uint8Array([10, 15, 20])")]) {
    const view = readApprovedFrameBytes(bytes, 3);
    assert.equal(Object.getPrototypeOf(view), Uint8Array.prototype);
    assert.deepEqual(Array.from(view), [10, 15, 20]);
    assert.notEqual(view, bytes);
  }
  assert.equal(readApprovedFrameBytes(new Uint8Array(0), 0).length, 0);
  assert.deepEqual(storage, Buffer.from([5, 10, 15, 20, 25]));
});

test("unknown, illegal and extreme lengths reject with fixed sanitized diagnostics", () => {
  for (const value of [undefined, null, [], {}, "sensitive-content", new Uint16Array(2), new DataView(new ArrayBuffer(4))]) {
    assert.throws(() => readApprovedFrameBytes(value, 0), { name: "TypeError", message: "invalid-bytes" });
  }
  for (const size of [-1, .1, NaN, Infinity, 160_000_001, "4"]) {
    assert.throws(() => readApprovedFrameBytes(new Uint8Array(4), size), { message: "invalid-byte-length" });
  }
  assert.throws(() => readApprovedFrameBytes(new Uint8Array(4), 3), { message: "invalid-byte-length" });
});

test("getters, species and iterators on byte views are never evaluated", () => {
  let calls = 0;
  const bytes = new Uint8Array([4, 5, 6]);
  for (const key of ["buffer", "byteOffset", "byteLength", "constructor", "subarray", "slice", Symbol.iterator]) {
    Object.defineProperty(bytes, key, { get() { calls++; throw new Error("sensitive-content"); } });
  }
  assert.deepEqual(Array.from(readApprovedFrameBytes(bytes, 3)), [4, 5, 6]);
  const ownLength = new Uint8Array(3);
  Object.defineProperty(ownLength, "length", { get() { calls++; throw new Error("sensitive-content"); } });
  assert.throws(() => readApprovedFrameBytes(ownLength, 3), { message: "invalid-bytes" });
  assert.equal(calls, 0);
});

test("live and revoked Proxies reject before every trap", () => {
  let calls = 0;
  const handler = Object.fromEntries(["get", "getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"].map(key => [key, () => { calls++; throw new Error("sensitive-content"); }]));
  const live = new Proxy(new Uint8Array(3), handler), revoked = Proxy.revocable(new Uint8Array(3), handler);
  revoked.revoke();
  for (const bytes of [live, revoked.proxy]) assert.throws(() => readApprovedFrameBytes(bytes, 3), { message: "invalid-bytes" });
  assert.equal(calls, 0);
});

test("shared, resizable and detached storage cannot become a stable source witness", () => {
  assert.throws(() => readApprovedFrameBytes(new Uint8Array(new SharedArrayBuffer(4)), 4), { message: "invalid-bytes" });
  if (Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")) {
    assert.throws(() => readApprovedFrameBytes(new Uint8Array(new ArrayBuffer(4, { maxByteLength: 8 })), 4), { message: "invalid-bytes" });
  }
  const buffer = new ArrayBuffer(4), view = new Uint8Array(buffer);
  structuredClone(buffer, { transfer: [buffer] });
  assert.throws(() => readApprovedFrameBytes(view), { message: "invalid-bytes" });
});
