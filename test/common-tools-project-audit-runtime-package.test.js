"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  FORBIDDEN_MARKERS,
  MAX_PACKAGE_BYTES,
  buildProjectAuditRuntimePackage,
  packageManifest,
  parseArguments,
  parsePackResult
} = require("../scripts/build-project-audit-runtime-package");
const { verifyProjectAuditPluginRuntime } = require("../scripts/sync-project-audit-plugin-runtime");

const repositoryRoot = path.resolve(__dirname, "..");
const cli = path.join(repositoryRoot, "packages", "project-audit-runtime", "bin", "common-tools-audit.js");
const embeddedCli = path.join(repositoryRoot, "plugins", "common-tools", "runtime", "project-audit", "packages", "project-audit-runtime", "bin", "common-tools-audit.js");

function temporaryRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-audit-runtime-test-")); }
function runCli(argumentsList, cwd) { return childProcess.spawnSync(process.execPath, [cli, ...argumentsList], { cwd, encoding: "utf8", windowsHide: true }); }

test("lightweight project audit runtime package excludes every heavy capability component", () => {
  const root = temporaryRoot();
  try {
    const output = path.join(root, "output");
    fs.mkdirSync(output);
    const result = buildProjectAuditRuntimePackage({ repositoryRoot, outputDirectory: output });
    assert.equal(result.heavyComponentsExcluded, true);
    assert.ok(result.packedBytes > 0 && result.packedBytes < MAX_PACKAGE_BYTES);
    assert.ok(fs.statSync(result.archive).isFile());
    const listed = childProcess.spawnSync("tar", ["-tf", result.archive], { encoding: "utf8", windowsHide: true });
    assert.equal(listed.status, 0, listed.stderr);
    const names = listed.stdout.toLowerCase();
    for (const marker of FORBIDDEN_MARKERS) assert.doesNotMatch(names, new RegExp(marker));
    assert.match(names, /project-audit-core\/index\.js/);
    assert.match(names, /common-tools-audit\.js/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("project audit package boundary rejects malformed metadata and arguments", () => {
  assert.equal(packageManifest().bin["common-tools-audit"], "packages/project-audit-runtime/bin/common-tools-audit.js");
  assert.deepEqual(parseArguments([]), {});
  assert.throws(() => parseArguments(["--out"]), /usage/);
  assert.throws(() => parseArguments(["--bad", "x"]), /usage/);
  assert.throws(() => parsePackResult("not-json"), /invalid/);
  assert.throws(() => parsePackResult(JSON.stringify([{ filename: "audit.tgz", size: MAX_PACKAGE_BYTES + 1, files: [] }])), /invalid/);
  assert.throws(() => parsePackResult(JSON.stringify([{ filename: "audit.tgz", size: 10, files: [{ path: "packages/slideclone-core/index.js" }] }])), /forbidden/);
});

test("standalone audit CLI validates input and runs locally without the unified Runtime", () => {
  const root = temporaryRoot();
  try {
    fs.writeFileSync(path.join(root, "package.json"), "{\"name\":\"fixture\",\"scripts\":{}}\n");
    fs.writeFileSync(path.join(root, "index.js"), "module.exports = { ready: true };\n");
    const doctor = runCli(["doctor", "--workspace", root], root);
    assert.equal(doctor.status, 0, doctor.stderr);
    const diagnosis = JSON.parse(doctor.stdout);
    assert.equal(diagnosis.healthy, true);
    assert.deepEqual(diagnosis.excludedHeavyComponents, ["slideclone", "ocr", "dotnet", "docker"]);
    const duplicate = runCli(["doctor", "--workspace", root, "--workspace", root], root);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /duplicated/);
    const completed = runCli(["run", "--workspace", root, "--out", ".common-tools/reports/project-audit", "--mode", "code", "--scope", "engineering-delivery"], root);
    assert.equal(completed.status, 0, completed.stderr);
    const job = JSON.parse(completed.stdout);
    assert.equal(job.status, "succeeded");
    assert.equal(fs.existsSync(path.join(root, ".common-tools", "reports", "project-audit", "project-audit-report.json")), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Git Marketplace embeds a byte-synchronized runnable audit Runtime", () => {
  assert.deepEqual(verifyProjectAuditPluginRuntime({ repositoryRoot }), { fileCount: 20, synchronized: true });
  const root = temporaryRoot();
  try {
    const result = childProcess.spawnSync(process.execPath, [embeddedCli, "doctor", "--workspace", root], { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const diagnosis = JSON.parse(result.stdout);
    assert.equal(diagnosis.healthy, true);
    assert.equal(diagnosis.runtime, "project-audit-local");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
