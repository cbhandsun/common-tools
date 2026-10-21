"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const adapterFile = path.resolve(__dirname, "../packages/slideclone-native-engine/scripts/adapters/render-powerpoint-com.js");
const renderPowerPointCom = require(adapterFile);

function writePngHeader(file, widthPx, heightPx) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(widthPx, 16);
  buffer.writeUInt32BE(heightPx, 20);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

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

test("PowerPoint renderer resolves source dimensions from quality request assets", (t) => {
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "render-powerpoint-com-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "quality-render");
  const portrait = path.join(root, "assets", "page-001", "source.png");
  const wide = path.join(root, "wide.png");
  writePngHeader(portrait, 1080, 1440);
  writePngHeader(wide, 1600, 900);

  assert.deepEqual(renderPowerPointCom._private.resolveSourceSize({ sourceImages: [wide] }, { outputDir }), { widthPx: 1600, heightPx: 900 });
  assert.deepEqual(renderPowerPointCom._private.resolveSourceSize({ ir: { pages: [{ sourceImage: "assets/page-001/source.png" }] } }, { outputDir }), { widthPx: 1080, heightPx: 1440 });
  assert.deepEqual(renderPowerPointCom._private.resolveSourceSize({}, { outputDir }), { widthPx: 1920, heightPx: 1080 });
});

test("PowerPoint renderer retries only bounded COM and empty-diagnostic export failures", () => {
  const { isRetryableComError } = renderPowerPointCom;
  assert.equal(isRetryableComError({ message: "RPC_E_CALL_REJECTED" }), true);
  assert.equal(isRetryableComError({ message: "Command failed: powershell.exe -File C:\\safe\\export-pptx.ps1", stderr: "", stdout: "" }), true);
  assert.equal(isRetryableComError({ message: "Command failed: powershell.exe -File C:\\safe\\different.ps1", stderr: "", stdout: "" }), false);
  assert.equal(isRetryableComError({ message: "Command failed: powershell.exe -File C:\\safe\\export-pptx.ps1", stderr: "invalid presentation", stdout: "" }), false);
  assert.equal(isRetryableComError({ message: "unrelated failure" }), false);
});

test("PowerPoint readiness requires a present collection and a valid COM count", () => {
  const script = renderPowerPointCom.powerPointExportScript();
  const start = script.indexOf("function Wait-PowerPointReady {");
  const end = script.indexOf("function Export-SlideWithRetry {");
  assert.ok(start >= 0 && end > start);
  const probe = `$ErrorActionPreference='Stop'
${script.slice(start, end)}
function Check($Value) { if (-not $Value) { throw 'Readiness regression assertion failed.' } }
Check (-not (Wait-PowerPointReady ([pscustomobject]@{Presentations=$null})))
Check (-not (Wait-PowerPointReady ([pscustomobject]@{})))
foreach ($invalid in @($null, -1, '0', 0.5, [long]2147483648)) {
  Check (-not (Wait-PowerPointReady ([pscustomobject]@{Presentations=[pscustomobject]@{Count=$invalid}})))
}
foreach ($valid in @(0,1,[int]::MaxValue)) {
  Check (Wait-PowerPointReady ([pscustomobject]@{Presentations=[pscustomobject]@{Count=$valid}}))
}
$broken=[pscustomobject]@{}
$broken | Add-Member ScriptProperty Presentations { throw 'private readiness sentinel' }
Check (-not (Wait-PowerPointReady $broken))
$recovering=[pscustomobject]@{Presentations=$null}
Check (-not (Wait-PowerPointReady $recovering))
$recovering.Presentations=[pscustomobject]@{Count=0}
Check (Wait-PowerPointReady $recovering)
'passed'
`;
  const result = require("node:child_process").spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh",
    ["-NoProfile", "-NonInteractive", "-Command", probe], { encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/u);
  assert.doesNotMatch(result.stdout + result.stderr, /private readiness sentinel/u);
});

test("PowerPoint export cleanup preserves other documents and refuses unknown session state", () => {
  const script = renderPowerPointCom.powerPointExportScript();
  const start = script.lastIndexOf("finally {");
  assert.ok(start > 0);
  const cleanup = script.slice(start + "finally {".length).trim().slice(0, -1);
  const probe = `$ErrorActionPreference='Stop'
$VerbosePreference='Continue'
$cleanup = {
${cleanup}
}
function Check($Value, $Label) { if (-not $Value) { throw "Cleanup regression assertion failed: $Label" } }
foreach ($count in @(0,1,12,$null,-1,'0',0.5,[long]2147483648)) {
  $app = [pscustomobject]@{Presentations=[pscustomobject]@{Count=$count}; QuitCalls=0}
  $app | Add-Member ScriptMethod Quit { $this.QuitCalls++ }
  $presentation = [pscustomobject]@{CloseCalls=0}
  $presentation | Add-Member ScriptMethod Close { $this.CloseCalls++ }
  & $cleanup
  Check ($presentation.CloseCalls -eq 1) 'close'
  $expected = if ($count -is [int] -and $count -eq 0) { 1 } else { 0 }
  Check ($app.QuitCalls -eq $expected) "quit count=$count expected=$expected actual=$($app.QuitCalls)"
}
$app = [pscustomobject]@{QuitCalls=0}
$app | Add-Member ScriptMethod Quit { $this.QuitCalls++ }
$app | Add-Member ScriptProperty Presentations { throw 'private cleanup sentinel' }
$presentation=$null
& $cleanup
Check ($app.QuitCalls -eq 0) 'unreadable collection'
$app.PSObject.Properties.Remove('Presentations')
$app | Add-Member NoteProperty Presentations $null
& $cleanup
Check ($app.QuitCalls -eq 0) 'null collection'
$app.PSObject.Properties.Remove('Presentations')
& $cleanup
Check ($app.QuitCalls -eq 0) 'missing collection'
$app=$null
& $cleanup
'passed'
`;
  const result = require("node:child_process").spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh",
    ["-NoProfile", "-NonInteractive", "-Command", probe], { encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/u);
  assert.doesNotMatch(result.stdout + result.stderr, /private cleanup sentinel/u);
});
