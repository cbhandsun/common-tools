"use strict";

const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");

function sorted(values) {
  return [...values].sort();
}

function sameStringSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function assertDirectToolCatalog(module) {
  if (!module || typeof module !== "object" || Array.isArray(module)) throw new Error("direct capability module is invalid");
  if (module.teamMode !== "direct" || typeof module.serviceName !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(module.serviceName)) throw new Error("direct capability module service ownership is invalid");
  const registration = module.registration;
  if (!registration || typeof registration.capability !== "string" || !Array.isArray(registration.toolNames)) throw new Error("direct capability module registration is invalid");
  const toolNames = registration.toolNames;
  for (const [label, value] of [["arguments", module.directToolArguments], ["methods", module.directToolMethods]]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`direct capability tool ${label} are invalid`);
    if (!sameStringSet(Object.keys(value), toolNames)) throw new Error(`direct capability tool ${label} do not match registration: ${registration.capability}`);
  }
  if (!Array.isArray(module.directToolContracts) || !sameStringSet(module.directToolContracts.map((tool) => tool.name), toolNames)) throw new Error(`direct capability tool contracts do not match registration: ${registration.capability}`);
  for (const tool of module.directToolContracts) {
    if (!tool || typeof tool !== "object" || tool.capability !== registration.capability || !toolNames.includes(tool.name)) throw new Error(`direct capability tool contract is invalid: ${registration.capability}`);
  }
}

function assertLocalCapabilityCatalog({ manifests, catalog, registryPackage }) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  if (!Array.isArray(catalog)) throw new TypeError("local capability catalog is invalid");
  if (!registryPackage || typeof registryPackage !== "object" || !registryPackage.dependencies || typeof registryPackage.dependencies !== "object") throw new TypeError("capability registry package metadata is invalid");
  const expected = [...manifests.values()].filter((manifest) => manifest.requiredWorkerProfile !== "direct").map((manifest) => manifest.capability);
  const actual = [];
  const packages = new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.packageName !== "string" || !entry.module) throw new Error("local capability catalog entry is invalid");
    if (packages.has(entry.packageName)) throw new Error(`duplicate local capability package: ${entry.packageName}`);
    packages.add(entry.packageName);
    if (registryPackage.dependencies[entry.packageName] !== "0.1.0") throw new Error(`local capability package is not a direct registry dependency: ${entry.packageName}`);
    const registration = entry.module.registration;
    if (!registration || typeof registration.capability !== "string") throw new Error("local capability catalog module registration is invalid");
    actual.push(registration.capability);
    const manifest = manifests.get(registration.capability);
    if (!manifest || manifest.requiredWorkerProfile === "direct") throw new Error(`local capability catalog entry does not match a local manifest: ${registration.capability}`);
  }
  if (!sameStringSet(actual, expected)) throw new Error("local capability catalog does not cover all local manifests");
  return true;
}

function assertDirectCapabilityCatalog({ manifests, catalog }) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  if (!Array.isArray(catalog)) throw new TypeError("direct capability catalog is invalid");
  const expected = [...manifests.values()].filter((manifest) => manifest.requiredWorkerProfile === "direct").map((manifest) => manifest.capability);
  const actual = [];
  for (const module of catalog) {
    assertDirectToolCatalog(module);
    const capability = module.registration.capability;
    actual.push(capability);
    const manifest = manifests.get(capability);
    if (!manifest || manifest.requiredWorkerProfile !== "direct") throw new Error(`direct capability catalog entry does not match a direct manifest: ${capability}`);
  }
  if (!sameStringSet(actual, expected)) throw new Error("direct capability catalog does not cover all direct manifests");
  return true;
}

function verifyCapabilityCatalogs(root = REPOSITORY_ROOT) {
  const { CAPABILITY_MANIFESTS } = require("../../capability-manifests");
  const { LOCAL_CAPABILITY_CATALOG } = require("../../capability-registry");
  const registryPackage = require("../../capability-registry/package.json");
  const { DIRECT_CAPABILITY_CATALOG } = require("../../remote-mcp-server/direct-capability-catalog");
  assertLocalCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: LOCAL_CAPABILITY_CATALOG, registryPackage });
  assertDirectCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: DIRECT_CAPABILITY_CATALOG });
  return Object.freeze({
    directCapabilities: Object.freeze(sorted(DIRECT_CAPABILITY_CATALOG.map((module) => module.registration.capability))),
    localCapabilities: Object.freeze(sorted(LOCAL_CAPABILITY_CATALOG.map((entry) => entry.module.registration.capability))),
    root: path.resolve(root)
  });
}

module.exports = {
  assertDirectCapabilityCatalog,
  assertDirectToolCatalog,
  assertLocalCapabilityCatalog,
  verifyCapabilityCatalogs
};
