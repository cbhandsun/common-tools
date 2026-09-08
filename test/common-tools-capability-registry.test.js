"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CAPABILITY_MANIFESTS } = require("../packages/capability-manifests");
const {
  CAPABILITY_MODULES,
  LOCAL_REGISTRATIONS,
  assertCapabilityModulesMatchManifests,
  defineCapabilityModule
} = require("../packages/capability-registry");

test("capability registry modules are verified against the signed manifest catalog", () => {
  assert.equal(assertCapabilityModulesMatchManifests(CAPABILITY_MODULES), true);
  assert.deepEqual(LOCAL_REGISTRATIONS.map((registration) => registration.capability).sort(), CAPABILITY_MODULES.map((module) => module.registration.capability).sort());
  for (const module of CAPABILITY_MODULES) {
    const manifest = CAPABILITY_MANIFESTS.get(module.registration.capability);
    assert.ok(manifest);
    assert.deepEqual([...module.registration.toolNames].sort(), [...manifest.toolNames].sort());
    assert.equal(module.registration.minimumRuntimeVersion, manifest.minimumRuntimeVersion);
    assert.equal(module.registration.requiredWorkerProfile, manifest.requiredWorkerProfile);
  }
});

test("capability registry rejects orphan, duplicate, and stale module metadata", () => {
  const image = CAPABILITY_MODULES.find((module) => module.registration.capability === "image-to-editable");
  assert.ok(image);
  assert.throws(() => assertCapabilityModulesMatchManifests([
    defineCapabilityModule({ registration: { ...image.registration, capability: "missing-capability" } })
  ]), /manifest is missing/);
  assert.throws(() => assertCapabilityModulesMatchManifests([image, image]), /duplicate/);
  assert.throws(() => assertCapabilityModulesMatchManifests([
    defineCapabilityModule({ registration: { ...image.registration, toolNames: ["create_editable_job"] } })
  ]), /manifest mismatch/);
  assert.throws(() => assertCapabilityModulesMatchManifests([
    defineCapabilityModule({ registration: { ...image.registration, requiredWorkerProfile: "stale-profile" } })
  ]), /manifest mismatch/);
});
