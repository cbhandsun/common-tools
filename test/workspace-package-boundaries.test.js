"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const {
  loadWorkspacePackagePolicy,
  productionEntrypointBoundaryFailures,
  verifyWorkspaceBoundaries
} = require("../scripts/verify-workspace-boundaries");

function readPackageManifest(packageName) {
  return JSON.parse(fs.readFileSync(path.join(root, "packages", packageName, "package.json"), "utf8"));
}

test("CLI declares every workspace package used by its composition root", () => {
  const manifest = readPackageManifest("cli");
  const expected = loadWorkspacePackagePolicy().packages.cli;
  assert.deepEqual(Object.keys(manifest.dependencies || {}).sort(), expected);
  for (const dependency of expected) assert.equal(manifest.dependencies[dependency], loadWorkspacePackagePolicy().workspaceDependencyVersion);
});

test("slideclone core has no upward dependency on CLI or skill implementation paths", () => {
  const source = fs.readFileSync(path.join(root, "packages", "slideclone-core", "index.js"), "utf8");
  assert.doesNotMatch(source, /packages[\\/]cli|skills[\\/]pd-hifi-slideclone|node:child_process/);
  assert.match(source, /executeSlideclone/);
});

test("workspace packages match the declarative sibling dependency policy", () => {
  const result = verifyWorkspaceBoundaries(root);
  assert.equal(result.packageCount, Object.keys(loadWorkspacePackagePolicy().packages).length);
});

test("production worker entrypoints keep SlideClone native details behind package boundaries", () => {
  const relative = "packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker.js";
  assert.deepEqual(productionEntrypointBoundaryFailures(relative, "require('../../slideclone-native-engine')"), []);
  assert.match(productionEntrypointBoundaryFailures(relative, "skills/pd-hifi-slideclone").join("\n"), /runtime paths/);
  assert.match(productionEntrypointBoundaryFailures(relative, "require('../../slideclone-core/pptx-openxml-dotnet')").join("\n"), /slideclone-native-engine/);
  assert.deepEqual(productionEntrypointBoundaryFailures("packages/slideclone-native-engine/index.js", "require('../slideclone-core/pptx-openxml-dotnet')"), []);
});

test("workspace package policy rejects unapproved sibling dependencies", () => {
  const policy = loadWorkspacePackagePolicy();
  const packagePolicy = {
    ...policy,
    packages: {
      ...policy.packages,
      "slideclone-core": policy.packages["slideclone-core"].filter((dependency) => dependency !== "@common-tools/ooxml-core")
    }
  };
  assert.throws(
    () => verifyWorkspaceBoundaries({ workspaceRoot: root, packagePolicy }),
    /slideclone-core declares unapproved workspace dependency @common-tools\/ooxml-core/
  );
});

test("workspace package policy rejects package drift", () => {
  const policy = loadWorkspacePackagePolicy();
  const packagePolicy = {
    ...policy,
    packages: {
      ...policy.packages,
      "ghost-core": []
    }
  };
  assert.throws(
    () => verifyWorkspaceBoundaries({ workspaceRoot: root, packagePolicy }),
    /package policy references unknown workspace package ghost-core/
  );
});

test("workspace packages keep team runtime below server composition roots", () => {
  const teamManifest = readPackageManifest("team-runtime");
  assert.equal(teamManifest.dependencies?.["@common-tools/remote-mcp-server"], undefined);
  const slidecloneManifest = readPackageManifest("slideclone-core");
  assert.equal(slidecloneManifest.dependencies?.["@common-tools/project-audit-core"], undefined);
  assert.equal(slidecloneManifest.dependencies?.["@common-tools/slideclone-worker-adapter"], undefined);
  assert.equal(slidecloneManifest.dependencies?.["@common-tools/team-runtime"], undefined);
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
