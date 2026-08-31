"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { editableRoundTripScript, normalizeCases } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip");

test("editable round-trip gate validates bounded PPTX cases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-edit-roundtrip-"));
  const file = path.join(root, "deck.pptx");
  fs.writeFileSync(file, "pptx");
  assert.deepEqual(normalizeCases([{ file, mode: "smartart-text" }]), [{ file: path.resolve(file), mode: "smartart-text" }]);
  assert.throws(() => normalizeCases([]), /requires 1 to 64 cases/);
  assert.throws(() => normalizeCases([{ file, mode: "macro" }]), /invalid mode/);
  assert.throws(() => normalizeCases([{ file: path.join(root, "missing.pptx") }]), /file is invalid/);
});

test("editable round-trip PowerPoint script edits a staging copy and verifies after reopen", () => {
  const script = editableRoundTripScript();
  assert.match(script, /Copy-Item -LiteralPath \$source -Destination \$staging/);
  assert.match(script, /HasSmartArt/);
  assert.match(script, /\$node\.Shapes/);
  assert.match(script, /TextFrame2\.TextRange\.Text/);
  assert.match(script, /SaveCopyAs\(\$edited/);
  assert.match(script, /Find-TargetWithRetry/);
  assert.match(script, /Start-Sleep -Milliseconds 1200/);
  assert.match(script, /Verify-Edit \$reopened \$target/);
  assert.match(script, /ExpectedLeft=\$expectedLeft/);
  assert.match(script, /\$shape\.Left - \[double\]\$Target\.ExpectedLeft/);
  assert.match(script, /SlideclonePowerPointOpenGate/);
  assert.match(script, /invocationId=\$InvocationId/);
  assert.match(script, /stage=\$stage; hresult=\(Get-ErrorCode \$_[.]Exception\)/);
  for (const stage of ["lock", "manifest", "application", "copy", "open", "find-target", "edit", "save", "close", "reopen", "verify"]) assert.ok(script.includes(`$stage = "${stage}"`));
  assert.doesNotMatch(script, /Remove-Item|SaveAs\(\$source/);
});
