"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");
const root = path.resolve(__dirname, "..");
const modules = ["verify-plugins", "verify-capability-contracts", "release-evidence", "verify-release-signature", "generate-sbom", "project-audit-runtime"];

test("CLI verification modules run without repository scripts and preserve compatibility exports", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cli-verification-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const installed = path.join(directory, "node_modules/@common-tools/cli");
  fs.mkdirSync(path.join(installed, "verification"), { recursive: true });
  fs.copyFileSync(path.join(root, "packages/cli/package.json"), path.join(installed, "package.json"));
  for (const name of modules) {
    fs.copyFileSync(path.join(root, "packages/cli/verification", `${name}.js`), path.join(installed, "verification", `${name}.js`));
    assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/cli/verification/${name}.js`));
  }
  const load = createRequire(path.join(directory, "consumer.cjs"));
  const api = Object.fromEntries(modules.map((name) => [name, load(`@common-tools/cli/verification/${name}`)]));
  assert.equal(api["verify-plugins"].versionAtLeast("1.2.3", "1.2.0"), true);
  assert.deepEqual(api["verify-capability-contracts"].assertCapabilityToolContracts({ manifests: new Map(), tools: [] }), { capabilities: [], toolCount: 0 });
  assert.equal(api["release-evidence"].assertRevision("a".repeat(40)), "a".repeat(40));
  assert.throws(() => api["verify-release-signature"].safeFile(null, "fixture"));
  assert.equal(api["generate-sbom"].createSbom({ lockfileVersion: 3, packages: { "": { name: "fixture", version: "1.0.0" } } }).spdxVersion, "SPDX-2.3");
  const mirror = api["project-audit-runtime"];
  const source = path.join(directory, "source");
  const target = path.join(directory, "mirror");
  for (const included of mirror.INCLUDED_DIRECTORIES) {
    for (const base of [source, target]) {
      fs.mkdirSync(path.join(base, included), { recursive: true });
      fs.writeFileSync(path.join(base, included, "fixture.js"), "module.exports = {};\n");
    }
  }
  mirror.verifyProjectAuditPluginRuntime({ repositoryRoot: source, targetRoot: target });
  fs.appendFileSync(path.join(target, mirror.INCLUDED_DIRECTORIES[0], "fixture.js"), "// mismatch\n");
  assert.throws(() => mirror.verifyProjectAuditPluginRuntime({ repositoryRoot: source, targetRoot: target }));
  assert.equal(fs.existsSync(path.join(directory, "scripts")), false);
  for (const name of modules.slice(0, 5)) assert.equal(require(`../scripts/${name}`), require(`../packages/cli/verification/${name}`));
});

test("contract verification does not execute code from the inspected directory", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "verification-untrusted-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const foreign = path.join(directory, "packages/capability-runtime");
  fs.mkdirSync(foreign, { recursive: true });
  fs.writeFileSync(path.join(foreign, "index.js"), "require('node:fs').writeFileSync(require('node:path').join(__dirname,'executed'), 'unsafe'); throw new Error('foreign code');");
  const { verifyCapabilityToolContracts } = require("../packages/cli/verification/verify-capability-contracts");
  assert.throws(() => verifyCapabilityToolContracts(directory));
  assert.equal(fs.existsSync(path.join(foreign, "executed")), false);
});
