"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  applyComponentReplacementsWithOpenXml,
  parseOpenXmlComponentReport
} = require("../skills/pd-hifi-slideclone/scripts/lib/openxml-component-replacement");

test("portable component wrapper validates paths and emits bounded OpenXML arguments", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-wrapper-"));
  const planFile = path.join(tmp, "plan.json");
  const out = path.join(tmp, "out.pptx");
  fs.writeFileSync(planFile, "{}", "utf8");
  const calls = [];
  const report = await applyComponentReplacementsWithOpenXml({
    planFile,
    out,
    allowMissing: true,
    runner(command, args, options) {
      calls.push({ command, args, options });
      return Promise.resolve({
        stdout: `build message\n${JSON.stringify({
          provider: "openxml-component-replacement-apply-v1",
          engine: "openxml",
          operations: [],
          summary: { applied: 0, skipped: 0 }
        })}`,
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.engine, "openxml");
  assert.ok(calls[0].args.includes("--apply-component-replacements-openxml"));
  assert.ok(calls[0].args.includes(planFile));
  assert.ok(calls[0].args.includes(out));
  assert.ok(calls[0].args.includes("--allow-missing"));
});

test("portable component wrapper rejects empty, malformed, and wrong-provider reports", () => {
  assert.throws(() => parseOpenXmlComponentReport(""), /empty report/);
  assert.throws(() => parseOpenXmlComponentReport("not json"), /invalid report/);
  assert.throws(
    () => parseOpenXmlComponentReport(JSON.stringify({ provider: "other", operations: [] })),
    /invalid report/
  );
});

test("portable component wrapper rejects invalid boundary paths before execution", async () => {
  await assert.rejects(
    applyComponentReplacementsWithOpenXml({ planFile: "missing.json", dryRun: true }),
    /was not found/
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-component-path-"));
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(planFile, "{}", "utf8");
  await assert.rejects(
    applyComponentReplacementsWithOpenXml({ planFile, out: path.join(tmp, "out.txt") }),
    /must be a \.pptx/
  );
});
