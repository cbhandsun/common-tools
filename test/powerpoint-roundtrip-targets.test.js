"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { editableRoundTripScript } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip");
const { discoverTestFiles } = require("../scripts/test-sharded");

test("PowerPoint target regression runs in the unified unit suite as an external-process test", () => {
  const entry = discoverTestFiles(path.resolve(__dirname, ".."), "unit").find(({ file }) => path.basename(file) === "powerpoint-roundtrip-targets.test.js");
  assert.equal(entry?.resource, "external-process");
});

test("generated PowerPoint target functions reject invalid indices and preserve edits without trusting SlideIndex", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-roundtrip-target-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const generated = path.join(root, "generated.ps1");
  fs.writeFileSync(generated, editableRoundTripScript());
  const result = spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
    "-NoProfile", "-NonInteractive", "-File", path.join(__dirname, "fixtures", "powerpoint-roundtrip-targets.ps1"), "-GeneratedScript", generated
  ], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { passed: true, checks: 30 });
});
