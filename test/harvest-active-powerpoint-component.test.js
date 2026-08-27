"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPowerPointSaveCopyScript,
  harvestActivePowerPointComponent,
  parseArgs,
  quotePowerShellString,
  sanitizeLabel,
  saveActivePowerPointCopy
} = require("../skills/pd-hifi-slideclone/scripts/harvest-active-powerpoint-component");

test("harvest active PowerPoint component parses and clamps external arguments", () => {
  const args = parseArgs([
    "node",
    "harvest-active-powerpoint-component.js",
    "--provider",
    "officeplus",
    "--label",
    "圆弧 箭头 / 组件",
    "--save-root",
    "runs/manual",
    "--out",
    "runs/applied",
    "--attempts",
    "99",
    "--delay-ms",
    "1",
    "--full-deck",
    "--no-harvest"
  ]);

  assert.equal(args.provider, "officeplus");
  assert.equal(args.label, "圆弧-箭头-组件");
  assert.equal(args.saveRoot, "runs/manual");
  assert.equal(args.out, "runs/applied");
  assert.equal(args.attempts, 60);
  assert.equal(args.delayMs, 50);
  assert.equal(args.activeSlideOnly, false);
  assert.equal(args.harvest, false);
});

test("harvest active PowerPoint component rejects unknown arguments", () => {
  assert.throws(
    () => parseArgs(["node", "script", "--component-root", "wrong"]),
    /Unknown harvest-active-powerpoint-component argument/
  );
});

test("PowerPoint SaveCopyAs script quotes paths and models retry settings", () => {
  const script = buildPowerPointSaveCopyScript({
    savePath: "C:\\Temp\\O'Hare\\component.pptx",
    attempts: 3,
    delayMs: 250,
    activeSlideOnly: false
  });

  assert.match(script, /\$attempts = 3/);
  assert.match(script, /\$delayMs = 250/);
  assert.match(script, /\$activeSlideOnly = \$false/);
  assert.match(script, /SaveCopyAs\(\$savePath\)/);
  assert.match(script, /'C:\\Temp\\O''Hare\\component\.pptx'/);
  assert.equal(quotePowerShellString("a'b"), "'a''b'");
});

test("PowerPoint active component script defaults to active-slide-only harvest", () => {
  const script = buildPowerPointSaveCopyScript({
    savePath: "C:\\Temp\\component.pptx",
    attempts: 2,
    delayMs: 100
  });

  assert.match(script, /\$activeSlideOnly = \$true/);
  assert.match(script, /oleaut32\.dll/);
  assert.match(script, /Get-SlideclonePowerPointApplication -AllowCreate \$true/);
  assert.match(script, /Selection\.SlideRange\.Item\(1\)/);
  assert.match(script, /ActiveWindow\.View\.Slide/);
  assert.match(script, /Slides\.Item\(1\)/);
  assert.match(script, /Presentations\.Add\(\$true\)/);
  assert.match(script, /Slides\.Paste\(1\)/);
  assert.match(script, /SaveAs\(\$savePath, 24\)/);
});

test("save active PowerPoint copy uses runner output and verifies created file", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-active-ppt-save-"));
  const savePath = path.join(tmp, "active.pptx");
  const result = saveActivePowerPointCopy({
    savePath,
    attempts: 2,
    delayMs: 50,
    runner({ savePath: target, script, activeSlideOnly }) {
      assert.match(script, /PowerPoint\.Application/);
      assert.equal(activeSlideOnly, true);
      fs.writeFileSync(target, "PK mock active deck");
      return {
        status: 0,
        stdout: JSON.stringify({
          saved: true,
          file: target,
          saveScope: "active-slide-only",
          slideIndex: 3,
          attemptsUsed: 2,
          lastError: "RPC_E_CALL_REJECTED"
        }),
        stderr: ""
      };
    }
  });

  assert.equal(result.file, savePath);
  assert.equal(result.attemptsUsed, 2);
  assert.equal(result.lastError, "RPC_E_CALL_REJECTED");
  assert.equal(result.saveScope, "active-slide-only");
  assert.equal(result.slideIndex, 3);
});

test("harvest active PowerPoint component saves then reuses applied component harvest", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-active-ppt-harvest-"));
  const saveRoot = path.join(tmp, "manual");
  const out = path.join(tmp, "officeplus-applied-components");

  const result = harvestActivePowerPointComponent({
    provider: "officeplus",
    label: "current roadmap",
    saveRoot,
    out,
    attempts: 1,
    delayMs: 50,
    runner({ savePath: target }) {
      fs.writeFileSync(target, "PK mock active OfficePLUS component");
      return {
        status: 0,
        stdout: JSON.stringify({ saved: true, file: target, attemptsUsed: 1, lastError: "" }),
        stderr: ""
      };
    }
  });

  assert.equal(result.provider, "officeplus");
  assert.equal(result.saved, true);
  assert.equal(result.saveScope, "active-slide-only");
  assert.equal(result.harvest.copiedCount, 1);
  assert.equal(fs.existsSync(path.join(out, "manifest.json")), true);
  assert.match(path.basename(result.harvest.components[0].path), /^officeplus-applied-current-roadmap-\d{8}T\d{6}Z-[0-9a-f]{12}\.pptx$/);
});

test("sanitize label keeps filenames bounded and stable", () => {
  assert.equal(sanitizeLabel("iSlide applied cycle loop abcdef123456"), "iSlide-applied-cycle-loop-abcdef123456");
  assert.equal(sanitizeLabel("   "), "component");
  assert.ok(sanitizeLabel("x".repeat(200)).length <= 80);
});
