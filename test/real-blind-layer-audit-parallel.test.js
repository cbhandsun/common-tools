"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { discoverIrFiles, parseArgs, runLimited, safeStem } = require("../skills/pd-hifi-slideclone/scripts/real-blind-layer-audit-parallel");

test("parallel blind audit parses bounded inputs", () => {
  const args = parseArgs(["--ir-dir", "ir", "--concurrency", "6", "--max-files", "80", "--canvas-scale", "auto"]);
  assert.equal(args.concurrency, 6);
  assert.equal(args.maxFiles, 80);
  assert.throws(() => parseArgs(["--concurrency", "17"]), /concurrency/);
  assert.throws(() => parseArgs(["--canvas-scale", "0"]), /canvas-scale/);
  assert.equal(safeStem("bad:name.ir.json"), "bad_name.ir.json");
});

test("parallel blind audit discovers only direct native IR files and deduplicates", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blind-parallel-"));
  fs.writeFileSync(path.join(root, "a.native.ir.json"), "{}");
  fs.writeFileSync(path.join(root, "a.page-1.debug.ir.json"), "{}");
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "b.native.ir.json"), "{}");
  const files = discoverIrFiles({ irDir: [root, root], ir: [], maxFiles: 4 });
  assert.deepEqual(files, [path.join(root, "a.native.ir.json")]);
  assert.throws(() => discoverIrFiles({ irDir: [root], ir: [], maxFiles: 0 }), /max-files/);
});

test("parallel blind audit preserves result order under bounded concurrency", async () => {
  let active = 0;
  let peak = 0;
  const result = await runLimited([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8]);
  assert.equal(peak, 2);
});
