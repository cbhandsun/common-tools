"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { normalizeBuildJobs, buildOpenXmlDecks, buildOpenXmlDecksSync } = require("../packages/slideclone-core/pptx-openxml-dotnet");

test("OpenXML admission rejects sparse batches and accessor fields without invoking user code", () => {
  let reads = 0;
  const job = { outFile: "out.pptx", get irFile() { reads += 1; return "input.json"; } };
  assert.throws(() => normalizeBuildJobs(new Array(2)), TypeError);
  assert.throws(() => normalizeBuildJobs([job]), TypeError);
  const batch = [];
  Object.defineProperty(batch, 0, { get() { reads += 1; return {}; } });
  assert.throws(() => normalizeBuildJobs(batch), TypeError);
  assert.throws(() => normalizeBuildJobs([{ irFile: { toString() { reads += 1; return "input.json"; } }, outFile: "out.pptx" }]), TypeError);
  assert.equal(reads, 0);
});

test("OpenXML admission bounds paths and batch size and rejects conflicting destinations", () => {
  const normal = { irFile: "input.json", outFile: "output.pptx" };
  for (const value of [null, false, {}, [], [null], [{ ...normal, irFile: "bad\0path" }], [{ ...normal, outFile: "x".repeat(32769) }], Array.from({ length: 1001 }, () => normal)]) {
    assert.throws(() => normalizeBuildJobs(value), TypeError);
  }
  assert.throws(() => normalizeBuildJobs([normal, { irFile: "second.json", outFile: "./output.pptx" }]), /conflict/);
  assert.throws(() => normalizeBuildJobs([{ irFile: "input.json", outFile: "input.json" }]), /conflict/);
  assert.throws(() => normalizeBuildJobs([normal, { irFile: "output.pptx", outFile: "other.pptx" }]), /conflict/);
  assert.equal(normalizeBuildJobs(Array.from({ length: 1000 }, (_, index) => ({ irFile: "input.json", outFile: `deck-${index}.pptx` }))).length, 1000);
  if (process.platform === "win32") assert.throws(() => normalizeBuildJobs([normal, { irFile: "second.json", outFile: "OUTPUT.PPTX" }]), /conflict/);
});

test("OpenXML admission preserves normalized paths and validates templates without exposing their value", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-jobs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const templatePptx = path.join(root, "template.pptx");
  fs.writeFileSync(templatePptx, "controlled fixture");
  const result = normalizeBuildJobs([{ irFile: " input.json ", outFile: " output.pptx ", templatePptx }]);
  assert.deepEqual(result, [{ irFile: path.resolve("input.json"), outFile: path.resolve("output.pptx"), templatePptx }]);
  for (const template of [path.join(root, "private-missing-template.pptx"), root, "\0", {}, false]) {
    assert.throws(() => normalizeBuildJobs([{ irFile: "i.json", outFile: "o.pptx", templatePptx: template }]), (error) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message.includes(root), false);
      assert.equal(error.message.includes("private-missing"), false);
      return true;
    });
  }
});

test("invalid OpenXML batches fail before temporary files or build processes are started", async (t) => {
  let allocations = 0;
  t.mock.method(fs, "mkdtempSync", () => { allocations += 1; throw new Error("must not allocate"); });
  await assert.rejects(buildOpenXmlDecks(new Array(1), { skillRoot: "unused", config: {} }), TypeError);
  assert.throws(() => buildOpenXmlDecksSync(new Array(1), { skillRoot: "unused", config: {} }), TypeError);
  assert.equal(allocations, 0);
});

test("template filesystem failures become bounded admission errors", (t) => {
  t.mock.method(fs, "statSync", () => { throw new Error("private filesystem diagnostics"); });
  assert.throws(() => normalizeBuildJobs([{ irFile: "in.json", outFile: "out.pptx", templatePptx: "private-template.pptx" }]), (error) => {
    assert.equal(error.message, "buildOpenXmlDecks job 1 template PPTX was not found");
    return true;
  });
});
