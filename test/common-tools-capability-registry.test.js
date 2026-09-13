"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CAPABILITY_MANIFESTS } = require("../packages/capability-manifests");
const registryPackage = require("../packages/capability-registry/package.json");
const { assertLocalCapabilityCatalog } = require("../packages/cli/verification/verify-capability-catalogs");
const {
  CAPABILITY_MODULES,
  LOCAL_CAPABILITY_CATALOG,
  LOCAL_REGISTRATIONS,
  assertCapabilityModulesMatchManifests,
  defineCapabilityModule
} = require("../packages/capability-registry");
const { CAPABILITY_MODULE: EDITABLE_CAPABILITY_MODULE } = require("../packages/slideclone-core");
const { CAPABILITY_MODULE: PROJECT_AUDIT_CAPABILITY_MODULE } = require("../packages/project-audit-core");
const { CAPABILITY_MODULE: PPT_QUALITY_CAPABILITY_MODULE } = require("../packages/ppt-quality-core");
const { CAPABILITY_MODULE: PPT_IMPROVE_CAPABILITY_MODULE } = require("../packages/ppt-improve-core");
const { CAPABILITY_MODULE: PPT_CREATE_CAPABILITY_MODULE } = require("../packages/ppt-create-core");

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

test("capability registry consumes package-owned capability modules", () => {
  const packageModules = LOCAL_CAPABILITY_CATALOG.map((entry) => entry.module);
  assert.deepEqual(CAPABILITY_MODULES.map((module) => module.registration.capability), packageModules.map((module) => module.registration.capability));
  assert.deepEqual(packageModules, [
    EDITABLE_CAPABILITY_MODULE,
    PPT_CREATE_CAPABILITY_MODULE,
    PPT_IMPROVE_CAPABILITY_MODULE,
    PPT_QUALITY_CAPABILITY_MODULE,
    PROJECT_AUDIT_CAPABILITY_MODULE
  ]);
  for (const entry of LOCAL_CAPABILITY_CATALOG) assert.equal(registryPackage.dependencies[entry.packageName], "0.1.0");
  for (const packageModule of packageModules) {
    const registryModule = CAPABILITY_MODULES.find((module) => module.registration.capability === packageModule.registration.capability);
    assert.ok(registryModule);
    assert.equal(registryModule.registration, packageModule.registration);
    assert.deepEqual(Object.keys(registryModule.createHandlers).sort(), Object.keys(packageModule.createHandlers).sort());
    for (const [name, handler] of Object.entries(packageModule.createHandlers)) assert.equal(registryModule.createHandlers[name], handler);
    assert.deepEqual(Object.keys(registryModule.reportHandlers).sort(), Object.keys(packageModule.reportHandlers).sort());
    for (const [name, handler] of Object.entries(packageModule.reportHandlers)) assert.equal(registryModule.reportHandlers[name].summary, handler.summary);
    assert.deepEqual(registryModule.uiContributions, packageModule.uiContributions);
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
  assert.throws(() => assertCapabilityModulesMatchManifests(CAPABILITY_MODULES.filter((module) => module.registration.capability !== image.registration.capability)), /missing a local capability module/);
});

test("local capability catalog package ownership matches manifest moduleSource", () => {
  assert.equal(assertLocalCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: LOCAL_CAPABILITY_CATALOG, registryPackage }), true);
  assert.throws(
    () => assertLocalCapabilityCatalog({
      manifests: CAPABILITY_MANIFESTS,
      catalog: [{ ...LOCAL_CAPABILITY_CATALOG[0], packageName: "@common-tools/project-audit-core" }, ...LOCAL_CAPABILITY_CATALOG.slice(1)],
      registryPackage
    }),
    /module source does not match manifest/
  );
});
