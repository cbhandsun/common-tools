"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

test("ownership arbitration runs from two core modules without the generator implementation graph", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-ownership-core-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  const modules = ["native-rebuilder-policy", "native-object-conflict-arbitrator"];
  for (const file of ["package.json", ...modules.map((name) => `${name}.js`)]) fs.copyFileSync(path.join(__dirname, "../packages/slideclone-core", file), path.join(installed, file));
  const load = createRequire(path.join(root, "consumer.cjs"));
  const { arbitrateNativeObjectOwnership } = load("@common-tools/slideclone-core/native-object-conflict-arbitrator");
  const owner = { id: "owner", source: { detector: "cover-engine-core-native-axis", layerSourceId: "layer" } };
  const generic = { id: "generic", source: { detector: "visual-atom-native-box", layerSourceId: "layer" } };
  const outside = { id: "outside", source: { detector: "visual-atom-native-box", layerSourceId: "other" } };
  const result = arbitrateNativeObjectOwnership([owner, generic, outside]);
  assert.deepEqual(result.items, [owner, outside]);
  assert.equal(result.items[0], owner);
  assert.equal(result.dropped[0].id, "generic");
  assert.equal(result.claims.length, 1);
  assert.equal(fs.existsSync(path.join(root, "skills")), false);
  for (const name of modules) assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}.js`));
});

test("implementation registration retains all policy order, metadata and default ownership rules", () => {
  const policy = require("../packages/slideclone-core/native-rebuilder-policy");
  const registry = require("../skills/pd-hifi-slideclone/scripts/lib/native-rebuilder-registry");
  assert.deepEqual(registry.NATIVE_REBUILDER_REGISTRY.map(({ implementation, ...entry }) => entry), policy.NATIVE_REBUILDER_POLICIES);
  assert.equal(registry.classifyNativeRebuilderFamily, policy.classifyNativeRebuilderFamily);
  assert.equal(registry.nativeOwnershipRules, policy.nativeOwnershipRules);
  assert.equal(registry.NATIVE_REBUILDER_REGISTRY.filter((entry) => entry.implementation).length, 6);
  assert.deepEqual(registry.validateNativeRebuilderRegistry(), []);
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/native-object-conflict-arbitrator"), require("../packages/slideclone-core/native-object-conflict-arbitrator"));
  for (const entry of policy.NATIVE_REBUILDER_POLICIES) {
    assert.equal(Object.hasOwn(entry, "implementation"), false);
    assert.equal(Object.isFrozen(entry), true);
  }
});
