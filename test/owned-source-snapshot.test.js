"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOwnedSourceSnapshot } = require("../packages/slideclone-core/owned-source-snapshot");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-source-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceImages = [0, 1].map(index => { const file = path.join(root, `${index}.png`); fs.writeFileSync(file, `source-${index}`); return file; });
  return { root, sourceImages };
}
test("snapshots all pages and detects equal-size source drift without trusting mtime", t => {
  const input = fixture(t), guard = createOwnedSourceSnapshot(input);
  guard(); guard();
  const file = input.sourceImages[1], before = fs.statSync(file);
  fs.writeFileSync(file, "changed!"); fs.utimesSync(file, before.atime, before.mtime);
  assert.throws(guard, /changed/u);
});
test("rejects missing, empty, oversized, outside-root and symlinked sources", t => {
  const input = fixture(t);
  for (const request of [null, {}, { ...input, sourceImages: [] }, { ...input, root: "relative" },
    { ...input, sourceImages: Array(21).fill(input.sourceImages[0]) }, { ...input, sourceImages: [__filename] },
    { ...input, root: "x".repeat(32769) }, { ...input, sourceImages: ["x".repeat(32769)] },
    { ...input, sourceImages: [input.sourceImages[0] + "\0"] }]) assert.throws(() => createOwnedSourceSnapshot(request));
  const alias = path.join(input.root, "alias.png"); fs.symlinkSync(input.sourceImages[0], alias);
  assert.throws(() => createOwnedSourceSnapshot({ ...input, sourceImages: [alias] }));
  fs.writeFileSync(input.sourceImages[0], ""); assert.throws(() => createOwnedSourceSnapshot(input), /size/u);
  const fd = fs.openSync(input.sourceImages[0], "w"); fs.ftruncateSync(fd, 60 * 1024 * 1024 + 1); fs.closeSync(fd);
  assert.throws(() => createOwnedSourceSnapshot(input), /size/u);
  fs.unlinkSync(input.sourceImages[0]); assert.throws(() => createOwnedSourceSnapshot(input));
});
test("does not execute accessors or proxies at the source boundary", t => {
  const input = fixture(t); let executed = false;
  const accessor = { ...input, get root() { executed = true; return input.root; } };
  const files = [];
  Object.defineProperty(files, "0", { get() { executed = true; return input.sourceImages[0]; } });
  for (const request of [accessor, { ...input, sourceImages: files },
    new Proxy(input, { get() { executed = true; throw new Error("unexpected"); } }),
    { ...input, sourceImages: new Proxy(input.sourceImages, { get() { executed = true; throw new Error("unexpected"); } }) }]) assert.throws(() => createOwnedSourceSnapshot(request));
  assert.equal(executed, false);
});
