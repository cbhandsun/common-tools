"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createValidationStagingRoot,
  isRetryableColdStartReport,
  normalizePptxFiles,
  powerPointOpenValidationScript,
  resolveAsciiTempRoot
} = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-com");

test("PowerPoint open gate validates PPTX files at its boundary", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "powerpoint-open-gate-"));
  const pptx = path.join(tmp, "sample.pptx");
  fs.writeFileSync(pptx, "sample");

  assert.deepEqual(normalizePptxFiles([pptx]), [pptx]);
  assert.throws(() => normalizePptxFiles([]), /at least one/);
  assert.throws(() => normalizePptxFiles([path.join(tmp, "missing.pptx")]), /was not found/);
});

test("PowerPoint open gate restarts only an unambiguous cold-start RPC rejection", () => {
  assert.equal(isRetryableColdStartReport({
    passed: false,
    results: [{ error: "被呼叫方拒绝接收呼叫。 (RPC_E_CALL_REJECTED)" }]
  }), true);
  assert.equal(isRetryableColdStartReport({
    passed: false,
    results: [{ error: "PowerPoint modified the presentation while opening it; the package requires repair." }]
  }), false);
  assert.equal(isRetryableColdStartReport({ passed: false, results: [] }), false);
});

test("PowerPoint open gate rejects files that PowerPoint dirties while opening", () => {
  const script = powerPointOpenValidationScript();
  assert.match(script, /foreach \(\$file in @\(\$manifest\.files\)\)/);
  assert.match(script, /System\.Threading\.Mutex/);
  assert.match(script, /Local\\SlideclonePowerPointOpenGate/);
  assert.match(script, /\$comMutex\.WaitOne\(150000\)/);
  assert.match(script, /\$comMutex\.ReleaseMutex\(\)/);
  assert.match(script, /Get-Content -LiteralPath \$ManifestFile -Raw -Encoding UTF8/);
  assert.match(script, /Presentations\.Open/);
  assert.match(script, /function Open-PresentationWithRetry/);
  assert.match(script, /\$openAttempt = 1; \$openAttempt -le 12/);
  assert.match(script, /catch \[System\.Runtime\.InteropServices\.COMException\]/);
  assert.match(script, /\$app\.DisplayAlerts = 1/);
  assert.match(script, /Copy-Item -LiteralPath \(\[string\]\$file\) -Destination \$stagingFile -Force/);
  assert.match(script, /Presentations\.Open\(\$FilePath, \$msoFalse, \$msoFalse, \$msoFalse\)/);
  assert.match(script, /Read-only opens hide the dirty state/);
  assert.match(script, /function Get-SlideCountWithRetry/);
  assert.match(script, /first-run add-ins and repair services are initializing/);
  assert.match(script, /PowerPoint process can expose a null Presentations collection/);
  assert.match(script, /\$openAttempt -le 12/);
  assert.match(script, /\$maxSlideLoadAttempts = 60/);
  assert.match(script, /\$slideCount = \[int\]\$Presentation\.Slides\.Count/);
  assert.match(script, /function Get-PresentationModifiedWithRetry/);
  assert.match(script, /PowerPoint can reject a property call while it finalizes/);
  assert.match(script, /PowerPoint can expose a null Slides collection/);
  assert.match(script, /did not load any slides/);
  assert.match(script, /return \(\$Presentation\.Saved -ne \$msoTrue\)/);
  assert.match(script, /\$modifiedAfterOpen = Get-PresentationModifiedWithRetry \$presentation/);
  assert.match(script, /Always canonicalize generated deliveries through a/);
  assert.match(script, /\$finalizedByPowerPoint = \$true/);
  assert.match(script, /function Save-PresentationCopyWithRetry/);
  assert.match(script, /\$saveAttempt = 1; \$saveAttempt -le 12/);
  assert.match(script, /Save-PresentationCopyWithRetry \$presentation \$repairedFile/);
  assert.match(script, /repairAttempted/);
  assert.match(script, /repairedInPlace/);
  assert.match(script, /modifiedAfterOpen/);
  assert.match(script, /requires repair/);
  assert.match(script, /\$presentation\.Close/);
  assert.match(script, /\$app\.Quit/);
  assert.match(script, /exit 1/);
});

test("PowerPoint open gate uses an ASCII-safe isolated staging root", () => {
  const root = createValidationStagingRoot(path.join(os.tmpdir(), "output"));
  assert.match(root, /slideclone-powerpoint-open-gate/);
  assert.ok(root.startsWith(resolveAsciiTempRoot()));
  fs.rmSync(root, { recursive: true, force: true });
});
