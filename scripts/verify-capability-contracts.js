"use strict";

const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");

function assertCapabilityToolContracts({ manifests, tools }) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  if (!Array.isArray(tools)) throw new TypeError("MCP tool definitions are invalid");
  const toolNamesByCapability = new Map();
  const seenTools = new Set();
  for (const definition of tools) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition) || typeof definition.name !== "string" || !definition.name) throw new Error("MCP tool definition is invalid");
    for (const schemaName of ["inputSchema", "outputSchema"]) {
      const schema = definition[schemaName];
      if (!schema || typeof schema !== "object" || Array.isArray(schema) || schema.type !== "object") throw new Error(`MCP tool ${schemaName} is invalid: ${definition.name}`);
    }
    const annotations = definition.annotations;
    if (!annotations || typeof annotations !== "object" || Array.isArray(annotations) || ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"].some((name) => typeof annotations[name] !== "boolean")) throw new Error(`MCP tool annotations are incomplete: ${definition.name}`);
    if (seenTools.has(definition.name)) throw new Error(`duplicate MCP tool name: ${definition.name}`);
    seenTools.add(definition.name);
    if (definition.capability === null) continue;
    if (typeof definition.capability !== "string" || !manifests.has(definition.capability)) throw new Error(`MCP tool capability is not declared: ${definition.name}`);
    const names = toolNamesByCapability.get(definition.capability) || [];
    names.push(definition.name);
    toolNamesByCapability.set(definition.capability, names);
  }
  for (const [capability, manifest] of manifests) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || !Array.isArray(manifest.toolNames)) throw new Error(`capability manifest is invalid: ${capability}`);
    const expected = [...manifest.toolNames].sort();
    const actual = [...(toolNamesByCapability.get(capability) || [])].sort();
    if (new Set(expected).size !== expected.length) throw new Error(`capability manifest declares duplicate tools: ${capability}`);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`capability tool contract does not match MCP registration: ${capability}`);
  }
  return Object.freeze({ capabilities: Object.freeze([...manifests.keys()].sort()), toolCount: seenTools.size });
}

function composeServiceBlock(source, name) {
  if (typeof source !== "string") throw new TypeError("team Compose source is invalid");
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start < 0) throw new Error(`team Worker service is missing: ${name}`);
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^ {2}[a-z][a-z0-9-]*:$/.test(lines[index])) break;
    block.push(lines[index]);
  }
  return block.join("\n");
}

function assertTeamDeploymentManifestContracts({ manifests, deploymentCapabilities }) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  if (!deploymentCapabilities || typeof deploymentCapabilities !== "object" || Array.isArray(deploymentCapabilities)) throw new TypeError("team deployment capabilities are invalid");
  const expected = Object.fromEntries([...manifests.entries()].filter(([, manifest]) => manifest?.team?.deployment).map(([capability, manifest]) => [capability, manifest.team.deployment]));
  if (JSON.stringify(Object.keys(deploymentCapabilities).sort()) !== JSON.stringify(Object.keys(expected).sort())) throw new Error("team deployment capabilities do not match capability manifests");
  const profiles = new Set();
  const services = new Set();
  const commands = new Set();
  for (const [capability, definition] of Object.entries(expected)) {
    const actual = deploymentCapabilities[capability];
    if (!actual || JSON.stringify(actual) !== JSON.stringify(definition)) throw new Error(`team deployment capability does not match manifest: ${capability}`);
    for (const [name, value, seen] of [["Worker profile", definition.workerProfile, profiles], ["Worker service", definition.workerService, services], ["Worker command", definition.workerCommand, commands]]) {
      if (seen.has(value)) throw new Error(`duplicate team ${name.toLowerCase()}: ${value}`);
      seen.add(value);
    }
  }
  return true;
}

function assertTeamDeploymentComposeContracts({ deploymentCapabilities, composeSource }) {
  if (!deploymentCapabilities || typeof deploymentCapabilities !== "object" || Array.isArray(deploymentCapabilities)) throw new TypeError("team deployment capabilities are invalid");
  const expectedProfiles = new Set();
  for (const [capability, definition] of Object.entries(deploymentCapabilities)) {
    if (!definition || typeof definition !== "object" || typeof definition.workerService !== "string" || typeof definition.workerProfile !== "string" || typeof definition.workerCommand !== "string" || !["remote-mcp", "image-worker"].includes(definition.imageKind)) throw new Error(`team deployment definition is invalid: ${capability}`);
    expectedProfiles.add(definition.workerProfile);
    const service = composeServiceBlock(composeSource, definition.workerService);
    if (!service.includes(`profiles: ["${definition.workerProfile}"]`)) throw new Error(`team Worker profile does not match deployment plan: ${capability}`);
    if (!service.includes(`COMMON_TOOLS_WORKER_CAPABILITIES: ${capability}`)) throw new Error(`team Worker capability does not match deployment plan: ${capability}`);
    if (!service.includes(`command: ["node", "${definition.workerCommand}"]`)) throw new Error(`team Worker command does not match deployment plan: ${capability}`);
    const expectedDockerfile = definition.imageKind === "image-worker" ? "deploy/docker/Dockerfile.image-to-editable" : "deploy/docker/Dockerfile.remote-mcp";
    if (!service.includes(`dockerfile: ${expectedDockerfile}`)) throw new Error(`team Worker image does not match deployment plan: ${capability}`);
  }
  const actualProfiles = new Set([...composeSource.matchAll(/profiles: \["(team-worker-[a-z0-9-]+)"\]/g)].map((match) => match[1]));
  if (JSON.stringify([...actualProfiles].sort()) !== JSON.stringify([...expectedProfiles].sort())) throw new Error("team Compose Worker profiles do not match deployment plan");
  const migration = composeServiceBlock(composeSource, "team-migrate");
  for (const profile of expectedProfiles) if (!migration.includes(`"${profile}"`)) throw new Error(`team migration gate is missing Worker profile: ${profile}`);
  return true;
}

function verifyCapabilityToolContracts(root = REPOSITORY_ROOT) {
  const { loadCapabilityManifests } = require(path.join(root, "packages", "capability-runtime"));
  const { TOOLS } = require(path.join(root, "packages", "mcp-server", "core"));
  const { TEAM_DEPLOYMENT_CAPABILITIES } = require(path.join(root, "packages", "team-runtime"));
  const manifests = loadCapabilityManifests(path.join(root, "packages", "capability-manifests"));
  const composeSource = require("node:fs").readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8");
  assertTeamDeploymentManifestContracts({ manifests, deploymentCapabilities: TEAM_DEPLOYMENT_CAPABILITIES });
  assertTeamDeploymentComposeContracts({ deploymentCapabilities: TEAM_DEPLOYMENT_CAPABILITIES, composeSource });
  return assertCapabilityToolContracts({ manifests, tools: TOOLS });
}

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyCapabilityToolContracts(), null, 2)}\n`);

module.exports = { assertCapabilityToolContracts, assertTeamDeploymentComposeContracts, assertTeamDeploymentManifestContracts, composeServiceBlock, verifyCapabilityToolContracts };
