"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const normalizePowerPointCom = require("../skills/pd-hifi-slideclone/scripts/adapters/normalize-powerpoint-com");

test("PowerPoint normalization stages Unicode source names in an ASCII COM workspace", () => {
  const staging = normalizePowerPointCom._private.createPowerPointStaging(
    path.join(process.cwd(), "ppt文档", "数智向光·效率先锋路演-PPT模板1.pptx")
  );
  try {
    assert.match(staging.root, /^[\x00-\x7F]+$/);
    assert.match(staging.inputFile, /input\.pptx$/);
    assert.match(staging.exportDir, /export$/);
  } finally {
    require("node:fs").rmSync(staging.root, { recursive: true, force: true });
  }
});

test("PowerPoint normalization creates an isolated staging directory for every run", () => {
  const source = path.join(process.cwd(), "ppt文档", "same-source.pptx");
  const first = normalizePowerPointCom._private.createPowerPointStaging(source);
  const second = normalizePowerPointCom._private.createPowerPointStaging(source);
  try {
    assert.notEqual(first.root, second.root);
    assert.notEqual(first.id, second.id);
    assert.equal(path.dirname(first.root), path.dirname(second.root));
  } finally {
    const fs = require("node:fs");
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
  }
});

test("PowerPoint export script retries transient COM export rejections", () => {
  const script = normalizePowerPointCom._private.powerPointExportScript();
  assert.match(script, /\$exportAttempt = 1; \$exportAttempt -le 6/);
  assert.match(script, /catch \[System\.Runtime\.InteropServices\.COMException\]/);
  assert.match(script, /Start-Sleep -Milliseconds \(400 \* \$exportAttempt\)/);
  assert.match(script, /Get-Item -LiteralPath \$out\)\.Length -gt 0/);
  assert.match(script, /\$slidesAttempt = 1; \$slidesAttempt -le 12/);
  assert.match(script, /did not load any slides/);
});

test("PowerPoint normalizer never contains a global POWERPNT termination command", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(
    path.join(process.cwd(), "skills/pd-hifi-slideclone/scripts/adapters/normalize-powerpoint-com.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /Get-Process\s+POWERPNT/i);
  assert.doesNotMatch(source, /Stop-Process\s+-Force/i);
});
