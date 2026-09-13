"use strict";

const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");

function sorted(values) {
  return [...values].sort();
}

function sameStringSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function assertPackageDependency(packageMetadata, packageName, label) {
  if (!packageMetadata || typeof packageMetadata !== "object" || !packageMetadata.dependencies || typeof packageMetadata.dependencies !== "object") throw new TypeError(`${label} package metadata is invalid`);
  if (packageMetadata.dependencies[packageName] !== "0.1.0") throw new Error(`${label} capability package is not a direct dependency: ${packageName}`);
}

function assertModuleSourceMatchesManifest({ capability, moduleSource, packageName, label }) {
  if (!moduleSource || typeof moduleSource !== "object" || moduleSource.packageName !== packageName) throw new Error(`${label} capability module source does not match manifest: ${capability}`);
}

function assertDirectToolCatalog(module) {
  if (!module || typeof module !== "object" || Array.isArray(module)) throw new Error("direct capability module is invalid");
  if (module.teamMode !== "direct" || typeof module.serviceName !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(module.serviceName)) throw new Error("direct capability module service ownership is invalid");
  const registration = module.registration;
  if (!registration || typeof registration.capability !== "string" || !Array.isArray(registration.toolNames)) throw new Error("direct capability module registration is invalid");
  const toolNames = registration.toolNames;
  if (new Set(toolNames).size !== toolNames.length) throw new Error(`direct capability module declares duplicate tools: ${registration.capability}`);
  for (const [label, value] of [["arguments", module.directToolArguments], ["methods", module.directToolMethods]]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`direct capability tool ${label} are invalid`);
    if (!sameStringSet(Object.keys(value), toolNames)) throw new Error(`direct capability tool ${label} do not match registration: ${registration.capability}`);
  }
  if (!Array.isArray(module.directToolContracts) || !sameStringSet(module.directToolContracts.map((tool) => tool.name), toolNames)) throw new Error(`direct capability tool contracts do not match registration: ${registration.capability}`);
  for (const tool of module.directToolContracts) {
    if (!tool || typeof tool !== "object" || tool.capability !== registration.capability || !toolNames.includes(tool.name)) throw new Error(`direct capability tool contract is invalid: ${registration.capability}`);
  }
}

function assertDirectCapabilitySourceCatalog({ manifests, catalog, sourceCatalog, remotePackage }) {
  if (!Array.isArray(sourceCatalog)) throw new TypeError("direct capability source catalog is invalid");
  const modules = new Set(catalog);
  const capabilities = new Set();
  for (const entry of sourceCatalog) {
    if (!entry || typeof entry !== "object" || typeof entry.packageName !== "string" || !entry.module) throw new Error("direct capability source catalog entry is invalid");
    if (!modules.has(entry.module)) throw new Error("direct capability source catalog module is not in the direct catalog");
    const capability = entry.module.registration?.capability;
    if (typeof capability !== "string") throw new Error("direct capability source catalog module registration is invalid");
    if (capabilities.has(capability)) throw new Error(`duplicate direct capability source: ${capability}`);
    capabilities.add(capability);
    const manifest = manifests.get(capability);
    if (!manifest || manifest.requiredWorkerProfile !== "direct") throw new Error(`direct capability source does not match a direct manifest: ${capability}`);
    assertModuleSourceMatchesManifest({ capability, moduleSource: manifest.moduleSource, packageName: entry.packageName, label: "direct" });
    assertPackageDependency(remotePackage, entry.packageName, "direct");
  }
  if (!sameStringSet([...capabilities], catalog.map((module) => module.registration.capability))) throw new Error("direct capability source catalog does not cover all direct modules");
}

function assertLocalCapabilityCatalog({ manifests, catalog, registryPackage }) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  if (!Array.isArray(catalog)) throw new TypeError("local capability catalog is invalid");
  const expected = [...manifests.values()].filter((manifest) => manifest.requiredWorkerProfile !== "direct").map((manifest) => manifest.capability);
  const actual = [];
  const packages = new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.packageName !== "string" || !entry.module) throw new Error("local capability catalog entry is invalid");
    if (packages.has(entry.packageName)) throw new Error(`duplicate local capability package: ${entry.packageName}`);
    packages.add(entry.packageName);
    assertPackageDependency(registryPackage, entry.packageName, "local");
    const registration = entry.module.registration;
    if (!registration || typeof registration.capability !== "string") throw new Error("local capability catalog module registration is invalid");
    actual.push(registration.capability);
    const manifest = manifests.get(registration.capability);
    if (!manifest || manifest.requiredWorkerProfile === "direct") throw new Error(`local capability catalog entry does not match a local manifest: ${registration.capability}`);
    assertModuleSourceMatchesManifest({ capability: registration.capability, moduleSource: manifest.moduleSource, packageName: entry.packageName, label: "local" });
  }
  if (!sameStringSet(actual, expected)) throw new Error("local capability catalog does not cover all local manifests");
  return true;
}

function assertDirectCapabilityCatalog({ manifests, catalog, teamDefinitions = {}, remotePackage, sourceCatalog } = {}) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  if (!Array.isArray(catalog)) throw new TypeError("direct capability catalog is invalid");
  if (!teamDefinitions || typeof teamDefinitions !== "object" || Array.isArray(teamDefinitions)) throw new TypeError("team capability definitions are invalid");
  const expected = [...manifests.values()].filter((manifest) => manifest.requiredWorkerProfile === "direct").map((manifest) => manifest.capability);
  const actual = [];
  const capabilities = new Set();
  const serviceNames = new Set();
  const toolNames = new Set();
  for (const module of catalog) {
    assertDirectToolCatalog(module);
    const capability = module.registration.capability;
    if (capabilities.has(capability)) throw new Error(`duplicate direct capability: ${capability}`);
    capabilities.add(capability);
    if (serviceNames.has(module.serviceName)) throw new Error(`duplicate direct capability service owner: ${module.serviceName}`);
    serviceNames.add(module.serviceName);
    actual.push(capability);
    const manifest = manifests.get(capability);
    if (!manifest || manifest.requiredWorkerProfile !== "direct") throw new Error(`direct capability catalog entry does not match a direct manifest: ${capability}`);
    if (teamDefinitions[capability]?.mode !== "direct") throw new Error(`direct capability team definition is not direct: ${capability}`);
    for (const name of module.registration.toolNames) {
      if (toolNames.has(name)) throw new Error(`duplicate direct capability tool: ${name}`);
      toolNames.add(name);
    }
  }
  if (!sameStringSet(actual, expected)) throw new Error("direct capability catalog does not cover all direct manifests");
  if (sourceCatalog || remotePackage) assertDirectCapabilitySourceCatalog({ manifests, catalog, sourceCatalog, remotePackage });
  return true;
}

function verifyCapabilityCatalogs(root = REPOSITORY_ROOT) {
  const { CAPABILITY_MANIFESTS } = require("../../capability-manifests");
  const { TEAM_CAPABILITY_DEFINITIONS } = require("../../capability-runtime");
  const { LOCAL_CAPABILITY_CATALOG } = require("../../capability-registry");
  const registryPackage = require("../../capability-registry/package.json");
  const { DIRECT_CAPABILITY_CATALOG, DIRECT_CAPABILITY_SOURCE_CATALOG } = require("../../remote-mcp-server/direct-capability-catalog");
  const remotePackage = require("../../remote-mcp-server/package.json");
  assertLocalCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: LOCAL_CAPABILITY_CATALOG, registryPackage });
  assertDirectCapabilityCatalog({ manifests: CAPABILITY_MANIFESTS, catalog: DIRECT_CAPABILITY_CATALOG, teamDefinitions: TEAM_CAPABILITY_DEFINITIONS, remotePackage, sourceCatalog: DIRECT_CAPABILITY_SOURCE_CATALOG });
  return Object.freeze({
    directCapabilities: Object.freeze(sorted(DIRECT_CAPABILITY_CATALOG.map((module) => module.registration.capability))),
    localCapabilities: Object.freeze(sorted(LOCAL_CAPABILITY_CATALOG.map((entry) => entry.module.registration.capability))),
    root: path.resolve(root)
  });
}

module.exports = {
  assertDirectCapabilityCatalog,
  assertDirectCapabilitySourceCatalog,
  assertDirectToolCatalog,
  assertLocalCapabilityCatalog,
  verifyCapabilityCatalogs
};
