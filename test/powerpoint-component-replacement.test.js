"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  parsePowerPointComponentReport,
  powerPointComponentReplacementScript,
  requiredFile,
  safeOutputFile
} = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-component-replacement");

test("PowerPoint component replacement script uses native editable shape copy and paste", () => {
  const script = powerPointComponentReplacementScript();
  assert.match(script, /PowerPoint\.Application/);
  assert.match(script, /\.Shapes\.Paste\(\)/);
  assert.match(script, /\.Copy\(\)/);
  assert.match(script, /AlternativeText/);
  assert.doesNotMatch(script, /Aspose/i);
});

test("PowerPoint component replacement parses a bounded report object", () => {
  const report = parsePowerPointComponentReport("\uFEFF{\"provider\":\"powerpoint-component-replacement-apply-v1\"}");
  assert.equal(report.provider, "powerpoint-component-replacement-apply-v1");
  assert.throws(() => parsePowerPointComponentReport("[]"), /invalid JSON/);
  assert.throws(() => parsePowerPointComponentReport(""), /empty output/);
});

test("PowerPoint component replacement validates input and output boundaries", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "powerpoint-component-boundary-"));
  const plan = path.join(directory, "plan.json");
  fs.writeFileSync(plan, "{}");
  assert.equal(requiredFile(plan, ".json", "plan"), plan);
  assert.equal(safeOutputFile(path.join(directory, "out.pptx")), path.join(directory, "out.pptx"));
  assert.throws(() => requiredFile(path.join(directory, "missing.json"), ".json", "plan"), /not found/);
  assert.throws(() => safeOutputFile(path.join(directory, "out.exe")), /must be a \.pptx/);
  assert.throws(() => safeOutputFile("bad\0path.pptx"), /invalid/);
});
