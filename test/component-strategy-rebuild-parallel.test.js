"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("component strategy parallel help is side-effect free", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "component-strategy-help-"));
  const script = path.join(
    __dirname,
    "..",
    "skills",
    "pd-hifi-slideclone",
    "scripts",
    "component-strategy-rebuild-parallel.js"
  );
  const result = spawnSync(process.execPath, [script, "--help"], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node component-strategy-rebuild-parallel\.js/);
  assert.equal(fs.existsSync(path.join(cwd, "ppt文档")), false);
});
