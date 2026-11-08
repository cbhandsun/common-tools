"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOwnedTextRuntimeProfile } = require("../packages/slideclone-core/owned-text-runtime-profile");

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = ["builder", "renderer", "pdf", "font.ttf"].map(name => {
    const file = path.join(root, name); fs.writeFileSync(file, name); return file;
  });
  return { files, options: { builderExecutable: files[0], renderExecutable: files[1], pdfExecutable: files[2],
    getFontFiles: async () => [files[3]], runVersion: async () => "LibreOffice test" } };
}
test("actual file and font fingerprints are deterministic and invalidated by content changes", async t => {
  const f = setup(t), describe = createOwnedTextRuntimeProfile(f.options);
  const first = await describe(), again = await describe();
  assert.deepEqual(first, again); assert.equal(first.rendererId, "render-libreoffice"); assert.equal(first.dpi, 144);
  assert.match(first.runtimeHash, /^[a-f0-9]{64}$/u);
  fs.writeFileSync(f.files[3], "changed font"); assert.notEqual((await describe()).runtimeHash, first.runtimeHash);
  fs.writeFileSync(f.files[0], "changed builder"); assert.notEqual((await describe()).runtimeHash, again.runtimeHash);
});
test("identity covers builder companion DLL and renderer binary", async t => {
  const f = setup(t), describe = createOwnedTextRuntimeProfile(f.options), before = await describe();
  fs.writeFileSync(path.join(path.dirname(f.files[0]), "OpenXmlDeckBuilder.dll"), "dll");
  const after = await describe(); assert.notEqual(after.runtimeHash, before.runtimeHash);
  fs.writeFileSync(path.join(path.dirname(f.files[1]), "soffice.bin"), "renderer binary");
  assert.notEqual((await describe()).runtimeHash, after.runtimeHash);
});
test("font order and duplicate references cannot change the identity", async t => {
  const f = setup(t), file = path.join(path.dirname(f.files[0]), "font-two.ttf"); fs.writeFileSync(file, "font-two");
  f.options.getFontFiles = async () => [file, f.files[3], file];
  const describe = createOwnedTextRuntimeProfile(f.options), before = await describe();
  f.options.getFontFiles = async () => [f.files[3], file];
  assert.equal((await createOwnedTextRuntimeProfile(f.options)()).runtimeHash, before.runtimeHash);
});
test("missing executables, empty or malformed version and font inventories fail closed", async t => {
  const f = setup(t); assert.throws(() => createOwnedTextRuntimeProfile({ ...f.options, builderExecutable: path.join(path.dirname(f.files[0]), "missing") }));
  for (const version of ["", "invalid\nversion", 123]) {
    await assert.rejects(createOwnedTextRuntimeProfile({ ...f.options, runVersion: async () => version })(), /identity/u);
  }
  for (const fonts of [[], ["relative.ttf"], [123], Array(4097).fill(f.files[3])]) {
    await assert.rejects(createOwnedTextRuntimeProfile({ ...f.options, getFontFiles: async () => fonts })(), /identity/u);
  }
});
test("oversized font files are rejected without unbounded allocation", async t => {
  const f = setup(t), original = fs.fstatSync;
  t.mock.method(fs, "fstatSync", descriptor => {
    const info = original(descriptor);
    return Object.assign(Object.create(Object.getPrototypeOf(info)), info, { size: 4 * 1024 * 1024 * 1024 + 1 });
  });
  await assert.rejects(createOwnedTextRuntimeProfile(f.options)(), /boundary/u);
});
test("cancellation and inventory errors propagate", async t => {
  const f = setup(t); await assert.rejects(createOwnedTextRuntimeProfile(f.options)(async () => true), /cancelled/u);
  const failure = new Error("inventory failed");
  await assert.rejects(createOwnedTextRuntimeProfile({ ...f.options, getFontFiles: async () => { throw failure; } })(), error => error === failure);
});
