"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("CLI declares every workspace package used by its composition root", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "packages", "cli", "package.json"), "utf8"));
  const expected = [
    "@common-tools/capability-runtime",
    "@common-tools/mcp-server",
    "@common-tools/ppt-improve-core",
    "@common-tools/ppt-quality-core",
    "@common-tools/project-audit-core",
    "@common-tools/remote-mcp-server",
    "@common-tools/slideclone-core",
    "@common-tools/team-runtime"
  ];
  assert.deepEqual(Object.keys(manifest.dependencies || {}).sort(), expected);
  for (const dependency of expected) assert.equal(manifest.dependencies[dependency], "0.1.0");
});

test("slideclone core has no upward dependency on CLI or skill implementation paths", () => {
  const source = fs.readFileSync(path.join(root, "packages", "slideclone-core", "index.js"), "utf8");
  assert.doesNotMatch(source, /packages[\\/]cli|skills[\\/]pd-hifi-slideclone|node:child_process/);
  assert.match(source, /executeSlideclone/);
});

test("workspace packages declare direct sibling dependencies without a team-runtime cycle", () => {
  const required = {
    "capability-runtime": ["@common-tools/capability-contracts"],
    "project-audit-core": ["@common-tools/capability-contracts", "@common-tools/capability-runtime"],
    "mcp-server": ["@common-tools/capability-runtime", "@common-tools/ppt-improve-core", "@common-tools/ppt-quality-core", "@common-tools/project-audit-core", "@common-tools/slideclone-core"],
    "team-runtime": ["@common-tools/capability-contracts", "@common-tools/capability-runtime"],
    "remote-mcp-server": ["@common-tools/capability-runtime", "@common-tools/mcp-server", "@common-tools/ppt-improve-core", "@common-tools/ppt-quality-core", "@common-tools/project-audit-core", "@common-tools/slideclone-core", "@common-tools/team-runtime"]
  };
  for (const [packageName, dependencies] of Object.entries(required)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "packages", packageName, "package.json"), "utf8"));
    for (const dependency of dependencies) assert.equal(manifest.dependencies?.[dependency], "0.1.0", `${packageName} must declare ${dependency}`);
  }
  const teamManifest = JSON.parse(fs.readFileSync(path.join(root, "packages", "team-runtime", "package.json"), "utf8"));
  assert.equal(teamManifest.dependencies?.["@common-tools/remote-mcp-server"], undefined);
  for (const legacyName of [
    "common-tools-team-migrate.js",
    "common-tools-team-object-store-restore-drill.js",
    "common-tools-team-retention.js",
    "common-tools-team-retention-scheduler.js"
  ]) {
    assert.equal(fs.existsSync(path.join(root, "packages", "team-runtime", "bin", legacyName)), false);
    assert.equal(fs.existsSync(path.join(root, "packages", "remote-mcp-server", "bin", legacyName)), true);
  }
});
