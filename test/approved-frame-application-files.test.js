"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helpers/approved-frame-application.cjs");
const { readFile, assetFile, workspace, createStaging, removeStaging } = require("../packages/slideclone-core/scene-plan/approved-frame-application-files");
const { createApprovedFrameAssetApplication } = require("../packages/slideclone-core/scene-plan/approved-frame-reconstruction");

test("file boundaries reject escapes, controls, directories and oversized files with fixed errors", t => {
  const f = fixture(t);
  for (const value of [null, "", "../escape.png", f.original, "assets/\0secret", "assets/\nsecret"]) assert.throws(() => assetFile(f.root, value), /^TypeError: invalid-approved-frame-asset$/u);
  assert.equal(assetFile(f.root, "assets/original.png"), f.original);
  assert.throws(() => readFile(f.root), /^TypeError: approved-frame-file-unavailable$/u);
  assert.throws(() => readFile(f.original, 1), /^TypeError: approved-frame-file-unavailable$/u);
  assert.throws(() => readFile(f.original + "\0private"), /^TypeError: invalid-approved-frame-path$/u);
  assert.deepEqual(readFile(f.original), fs.readFileSync(f.original));
});

test("a junction or symlink cannot redirect either workspace or asset access", async t => {
  const f = fixture(t), link = path.join(f.root, "redirect"), kind = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(path.join(f.root, "assets"), link, kind);
  assert.throws(() => readFile(path.join(link, "original.png")), /^TypeError: approved-frame-file-unavailable$/u);
  assert.throws(() => workspace(link), /^TypeError: invalid-approved-frame-workspace$/u);
  f.deck.pages[0].images[0].assetPath = "redirect/original.png";
  await assert.rejects(createApprovedFrameAssetApplication(f.review)(f.context), /^TypeError: approved-frame-file-unavailable$/u);
  assert.deepEqual(f.directories(), []);
});

test("cleanup is limited to freshly allocated immediate asset subdirectories", t => {
  const f = fixture(t), assets = path.join(f.root, "assets"), staged = createStaging(assets);
  fs.writeFileSync(path.join(staged, "created.txt"), "created");
  const other = path.join(f.root, "unrelated"); fs.mkdirSync(other); fs.writeFileSync(path.join(other, "keep.txt"), "keep");
  for (const target of [assets, f.root, other]) assert.throws(() => removeStaging(assets, target), /^Error: approved-frame-cleanup-failed$/u);
  assert.equal(fs.readFileSync(path.join(other, "keep.txt"), "utf8"), "keep");
  removeStaging(assets, staged); assert.equal(fs.existsSync(staged), false); assert.equal(fs.existsSync(f.original), true);
});

test("short reads and file growth cannot bypass the bounded read", t => {
  const f = fixture(t), original = fs.readSync; let calls = 0;
  t.mock.method(fs, "readSync", (...args) => { if (++calls === 1) return 0; return original(...args); });
  assert.throws(() => readFile(f.original), /^TypeError: approved-frame-file-unavailable$/u);
  t.mock.restoreAll(); calls = 0;
  t.mock.method(fs, "readSync", (...args) => { const count = original(...args); if (++calls === 1) fs.appendFileSync(f.original, "extra"); return count; });
  assert.throws(() => readFile(f.original), /^TypeError: approved-frame-file-unavailable$/u);
});
