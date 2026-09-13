"use strict";

const path = require("node:path");
const { CAPABILITY_MANIFESTS, effectivePluginConfig } = require("../capability-runtime");
const { assertMirroredPackage, assertPluginPackage, verifyPluginPackaging } = require("./verification/verify-plugins");
const { verifyCapabilityToolContracts } = require("./verification/verify-capability-contracts");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");

function pluginCatalog(stateRoot, workspaceRoot = path.dirname(stateRoot)) {
  verifyCapabilityToolContracts(REPOSITORY_ROOT);
  const packaging = verifyPluginPackaging(REPOSITORY_ROOT);
  const enabled = new Set(effectivePluginConfig(stateRoot, workspaceRoot).effectiveCapabilities);
  return Object.freeze({
    distributionVerified: true,
    capabilities: Object.freeze(packaging.capabilities.map((capability) => {
      const manifest = CAPABILITY_MANIFESTS.get(capability);
      if (!manifest) throw new Error(`capability manifest is missing: ${capability}`);
      return Object.freeze({
        capability,
        version: manifest.version,
        toolNames: manifest.toolNames,
        requiredWorkerProfile: manifest.requiredWorkerProfile,
        dependencies: manifest.dependencies,
        lifecycle: Object.freeze(manifest.deprecation ? Object.freeze({ status: "deprecated", ...manifest.deprecation }) : Object.freeze({ status: "active" })),
        team: manifest.team,
        runtimeEnabled: enabled.has(capability),
        install: Object.freeze({
          codex: Object.freeze({ marketplace: "common-tools-codex", plugin: `${capability}@common-tools-codex` }),
          claude: Object.freeze({ marketplace: "common-tools", plugin: `${capability}@common-tools` })
        })
      });
    }))
  });
}

function validateScaffoldBundle(root, capability) {
  for (const host of ["codex", "claude"]) {
    const source = path.join(root, "plugins", host, capability);
    const mirror = path.join(root, "marketplaces", host, "plugins", capability);
    assertPluginPackage(source, capability, host);
    assertPluginPackage(mirror, capability, host);
    assertMirroredPackage(source, mirror);
  }
}

module.exports = {
  pluginCatalog,
  validateScaffoldBundle
};
