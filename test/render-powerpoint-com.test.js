"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const adapterFile = path.resolve(__dirname, "../skills/pd-hifi-slideclone/scripts/adapters/render-powerpoint-com.js");
const renderPowerPointCom = require(adapterFile);

test("PowerPoint renderer only closes the COM instance it creates", () => {
  const source = fs.readFileSync(adapterFile, "utf8");
  const script = renderPowerPointCom.powerPointExportScript();

  assert.doesNotMatch(source, /Stop-Process|Get-Process\s+POWERPNT/i);
  assert.match(script, /New-Object -ComObject PowerPoint\.Application/);
  assert.match(script, /\[int\]\$MaxPages/);
  assert.match(script, /function Get-SlideCountWithRetry/);
  assert.match(script, /for \(\$countAttempt = 1; \$countAttempt -le 8; \$countAttempt\+\+\)/);
  assert.match(script, /if \(\$count -gt 0\) \{ return \$count \}/);
  assert.match(script, /\[Math\]::Min\(\(Get-SlideCountWithRetry -Presentation \$presentation\), \$MaxPages\)/);
  assert.match(script, /function Export-SlideWithRetry/);
  assert.match(script, /for \(\$exportAttempt = 1; \$exportAttempt -le 6; \$exportAttempt\+\+\)/);
  assert.match(script, /\$Slide = \$Presentation\.Slides\.Item\(\$SlideIndex\)/);
  assert.match(script, /Export-SlideWithRetry -Presentation \$presentation -SlideIndex \$i/);
  assert.match(script, /\$presentation\.Close/);
  assert.match(script, /\$app\.Quit/);
});

test("PowerPoint renderer retries only bounded COM and empty-diagnostic export failures", () => {
  const { isRetryableComError } = renderPowerPointCom;
  assert.equal(isRetryableComError({ message: "RPC_E_CALL_REJECTED" }), true);
  assert.equal(isRetryableComError({ message: "Command failed: powershell.exe -File C:\\safe\\export-pptx.ps1", stderr: "", stdout: "" }), true);
  assert.equal(isRetryableComError({ message: "Command failed: powershell.exe -File C:\\safe\\different.ps1", stderr: "", stdout: "" }), false);
  assert.equal(isRetryableComError({ message: "Command failed: powershell.exe -File C:\\safe\\export-pptx.ps1", stderr: "invalid presentation", stdout: "" }), false);
  assert.equal(isRetryableComError({ message: "unrelated failure" }), false);
});
