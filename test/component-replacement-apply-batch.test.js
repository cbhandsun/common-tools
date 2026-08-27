"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBatchJobs,
  discoverPptxFiles,
  parseArgs,
  readManifestPptxFiles,
  runComponentReplacementApplyBatch,
  summarizeBatchResults
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-apply-batch");

test("component replacement apply batch parses boundary options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-apply-batch.js",
    "--input",
    "pptx",
    "--inventory",
    "inventory.json",
    "--out",
    "out",
    "--concurrency",
    "2",
    "--allow-missing",
    "--dry-run"
  ]);

  assert.equal(args.input, "pptx");
  assert.equal(args.inventory, "inventory.json");
  assert.equal(args.out, "out");
  assert.equal(args.concurrency, 2);
  assert.equal(args.allowMissing, true);
  assert.equal(args.dryRun, true);
  assert.throws(() => parseArgs(["node", "script"]), /Either --input or --manifest is required/);
  assert.throws(() => parseArgs(["node", "script", "--input", "pptx"]), /--inventory is required/);
});

test("component replacement apply batch discovers pptx files and manifest jobs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-component-batch-discover-"));
  const input = path.join(tmp, "input");
  fs.mkdirSync(input, { recursive: true });
  const one = path.join(input, "a.pptx");
  const two = path.join(input, "b.pptx");
  writeEmptyZip(one);
  writeEmptyZip(two);
  fs.writeFileSync(path.join(input, "ignore.txt"), "no");
  const manifest = path.join(tmp, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({ files: [one, two] }, null, 2));

  assert.deepEqual(discoverPptxFiles(input), [one, two]);
  assert.deepEqual(readManifestPptxFiles(manifest), [one, two]);
  const jobs = buildBatchJobs({
    input,
    inventory: path.join(tmp, "inventory.json"),
    out: path.join(tmp, "out")
  });
  assert.equal(jobs.length, 2);
  assert.ok(jobs[0].planOut.endsWith("a.component-replacement-apply-plan.json"));
});

test("component replacement apply batch aggregates applied and skipped results", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-component-batch-"));
  const input = path.join(tmp, "input");
  const out = path.join(tmp, "out");
  const inventory = path.join(tmp, "inventory.json");
  fs.mkdirSync(input, { recursive: true });
  const one = path.join(input, "a.pptx");
  const two = path.join(input, "b.pptx");
  writeEmptyZip(one);
  writeEmptyZip(two);
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));

  let callCount = 0;
  const report = await runComponentReplacementApplyBatch({
    input,
    inventory,
    engine: "powerpoint",
    out,
    allowMissing: true,
    runner() {
      callCount += 1;
      return Promise.resolve({
        stdout: JSON.stringify({
          summary: callCount === 1
            ? { appliedCount: 1, skippedCount: 0, removedShapeCount: 2, clonedShapeCount: 1 }
            : { appliedCount: 0, skippedCount: 1, removedShapeCount: 0, clonedShapeCount: 0 },
          operations: callCount === 1 ? [] : [{ Status: "missing_sample", Reason: "operation_not_ready" }]
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.totals.files, 2);
  assert.equal(report.totals.appliedFiles, 1, JSON.stringify(report, null, 2));
  assert.equal(report.totals.skippedFiles, 1);
  assert.equal(report.totals.missingSampleFiles, 1);
  assert.equal(report.totals.canApplyAll, false);
  assert.equal(report.totals.removedShapeCount, 2);
  assert.equal(report.totals.clonedShapeCount, 1);
  assert.equal(fs.existsSync(report.reportFile), true);
});

test("component replacement apply batch summarizes failures", () => {
  assert.deepEqual(summarizeBatchResults([
    { status: "applied", appliedCount: 1, removedShapeCount: 2, clonedShapeCount: 1 },
    { status: "skipped", skippedCount: 1 },
    { status: "failed" }
  ]), {
    files: 3,
    appliedFiles: 1,
    skippedFiles: 1,
    missingSampleFiles: 0,
    noReplacementFiles: 0,
    failed: 1,
    appliedCount: 1,
    skippedCount: 1,
    removedShapeCount: 2,
    clonedShapeCount: 1,
    canApplyAll: false
  });
});

function writeEmptyZip(file) {
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  fs.writeFileSync(file, endOfCentralDirectory);
}
