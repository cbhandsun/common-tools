"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value;
}
function readJson(file, message) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(message); }
}
function assertNonEmptyString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}
function assertCodexInterface(value) {
  const interfaceMetadata = assertObject(value, "Codex plugin interface is invalid");
  for (const key of ["displayName", "shortDescription", "longDescription", "developerName", "category"]) assertNonEmptyString(interfaceMetadata[key], "Codex plugin interface is invalid");
  if (!Array.isArray(interfaceMetadata.capabilities) || !interfaceMetadata.capabilities.length || interfaceMetadata.capabilities.some((item) => typeof item !== "string" || !item.trim())) throw new Error("Codex plugin interface is invalid");
  if (!Array.isArray(interfaceMetadata.defaultPrompt) || !interfaceMetadata.defaultPrompt.length || interfaceMetadata.defaultPrompt.length > 3 || interfaceMetadata.defaultPrompt.some((item) => typeof item !== "string" || !item.trim() || item.length > 128)) throw new Error("Codex plugin interface is invalid");
}
function sha256(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function listFiles(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("plugin directory is missing");
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("plugin package must not contain symbolic links");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
      else throw new Error("plugin package contains an unsupported file type");
    }
  }
  walk(root);
  return files.sort();
}
function relativeFiles(root) { return listFiles(root).map((file) => path.relative(root, file).replace(/\\/g, "/")); }
function assertSafeSkill(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(text)) throw new Error("plugin skill front matter is invalid");
  if (/\.\.[\\/]|file:\/\/|(?:^|\s)[A-Za-z]:[\\/]/m.test(text)) throw new Error("plugin skill must not reference files outside its package");
}
function assertPluginMetadata(file, capability, host) {
  const metadata = assertObject(readJson(file, "plugin metadata is invalid"), "plugin metadata is invalid");
  if (metadata.name !== capability || !SEMVER_PATTERN.test(metadata.version || "") || !assertNonEmptyString(metadata.description, "plugin metadata is invalid")) throw new Error("plugin metadata is invalid");
  if (host === "codex") {
    if (metadata.skills !== "./skills/") throw new Error("Codex plugin skills path is invalid");
    if (!metadata.author || typeof metadata.author !== "object" || Array.isArray(metadata.author) || !assertNonEmptyString(metadata.author.name, "Codex plugin metadata is invalid")) throw new Error("Codex plugin metadata is invalid");
    assertCodexInterface(metadata.interface);
  } else if (!metadata.author || typeof metadata.author !== "object" || Array.isArray(metadata.author) || !assertNonEmptyString(metadata.author.name, "plugin metadata is invalid")) {
    throw new Error("Claude plugin author is invalid");
  }
  return metadata;
}
function pluginRuntimeVersion(value) {
  const match = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value || "");
  return match ? match[1] : null;
}
function versionAtLeast(value, minimum) {
  const left = String(value || "").split(".").map(Number);
  const right = String(minimum || "").split(".").map(Number);
  if (left.length !== 3 || right.length !== 3 || [...left, ...right].some((item) => !Number.isSafeInteger(item) || item < 0)) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}
function assertImageToEditableSkill(file) {
  const skill = fs.readFileSync(file, "utf8");
  for (const marker of ["residual-native-duplicates-removed", "quality-rendered", "visual-fidelity"]) {
    if (!skill.includes(marker)) throw new Error("image-to-editable Skill does not protect residual deduplication quality");
  }
}
function assertPptCreateSkill(file) {
  const skill = fs.readFileSync(file, "utf8");
  for (const marker of ["layout-candidates-available", "layout-selection-resolved", "semantic-visuals-resolved", "native-data-editable", "deck.preview.html", "ppt apply-edit", "deck.html", "deck.pdf", "multi-format-page-count-matches", "multi-format-source-fingerprint-matches", "ppt plan", "planning-source-covered", "planning-required-points-covered", "Never silently truncate", "Do not copy third-party slide templates"]) {
    if (!skill.includes(marker)) throw new Error("ppt-create Skill does not protect the clean-room creation contract");
  }
}
function assertPluginPackage(root, capability, host, capabilityVersion) {
  if (!CAPABILITY_PATTERN.test(capability)) throw new Error("capability name is invalid");
  const metadataFile = path.join(root, host === "codex" ? ".codex-plugin" : ".claude-plugin", "plugin.json");
  const skill = path.join(root, "skills", capability, "SKILL.md");
  const metadata = assertPluginMetadata(metadataFile, capability, host);
  if (capabilityVersion !== undefined && (typeof capabilityVersion !== "string" || pluginRuntimeVersion(metadata.version) !== capabilityVersion)) throw new Error("plugin metadata version does not match the capability manifest");
  assertSafeSkill(skill);
  return relativeFiles(root);
}
function assertMirroredPackage(source, mirror) {
  const sourceFiles = relativeFiles(source);
  const mirrorFiles = relativeFiles(mirror);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(mirrorFiles)) throw new Error("marketplace plugin files do not match the source plugin");
  for (const relative of sourceFiles) {
    if (sha256(path.join(source, relative)) !== sha256(path.join(mirror, relative))) throw new Error("marketplace plugin files do not match the source plugin");
  }
}
function capabilityNames(root) {
  const manifestRoot = path.join(root, "packages", "capability-manifests");
  if (!fs.existsSync(manifestRoot)) throw new Error("capability manifests are missing");
  return fs.readdirSync(manifestRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(manifestRoot, entry.name, "capability.manifest.json"))).map((entry) => entry.name).sort();
}
function capabilityVersions(root, capabilities) {
  if (!Array.isArray(capabilities) || capabilities.some((capability) => typeof capability !== "string" || !CAPABILITY_PATTERN.test(capability))) throw new Error("capability list is invalid");
  const versions = new Map();
  for (const capability of capabilities) {
    const manifest = assertObject(readJson(path.join(root, "packages", "capability-manifests", capability, "capability.manifest.json"), "capability manifest is invalid"), "capability manifest is invalid");
    if (manifest.capability !== capability || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(manifest.version || "")) throw new Error("capability manifest is invalid");
    versions.set(capability, manifest.version);
  }
  return versions;
}
function assertMarketplace(root, capabilities) {
  const marketplace = assertObject(readJson(path.join(root, "marketplaces", "claude", ".claude-plugin", "marketplace.json"), "Claude marketplace metadata is invalid"), "Claude marketplace metadata is invalid");
  if (marketplace.name !== "common-tools" || !Array.isArray(marketplace.plugins) || marketplace.plugins.length !== capabilities.length) throw new Error("Claude marketplace metadata is invalid");
  const seen = new Set();
  for (const plugin of marketplace.plugins) {
    if (!plugin || typeof plugin !== "object" || Array.isArray(plugin) || !capabilities.includes(plugin.name) || seen.has(plugin.name) || plugin.source !== `./plugins/${plugin.name}` || typeof plugin.description !== "string" || !plugin.description.trim()) throw new Error("Claude marketplace metadata is invalid");
    seen.add(plugin.name);
  }
  if (seen.size !== capabilities.length) throw new Error("Claude marketplace metadata is invalid");
}
function assertCodexMarketplace(root, capabilities) {
  const marketplace = assertObject(readJson(path.join(root, "marketplaces", "codex", ".agents", "plugins", "marketplace.json"), "Codex marketplace metadata is invalid"), "Codex marketplace metadata is invalid");
  if (marketplace.name !== "common-tools-codex" || !marketplace.interface || typeof marketplace.interface !== "object" || Array.isArray(marketplace.interface) || !assertNonEmptyString(marketplace.interface.displayName, "Codex marketplace metadata is invalid") || !Array.isArray(marketplace.plugins) || marketplace.plugins.length !== capabilities.length) throw new Error("Codex marketplace metadata is invalid");
  const seen = new Set();
  for (const plugin of marketplace.plugins) {
    if (!plugin || typeof plugin !== "object" || Array.isArray(plugin) || !capabilities.includes(plugin.name) || seen.has(plugin.name) || !plugin.source || typeof plugin.source !== "object" || Array.isArray(plugin.source) || plugin.source.source !== "local" || plugin.source.path !== `./plugins/${plugin.name}` || !plugin.policy || typeof plugin.policy !== "object" || Array.isArray(plugin.policy) || plugin.policy.installation !== "AVAILABLE" || plugin.policy.authentication !== "ON_INSTALL" || !assertNonEmptyString(plugin.category, "Codex marketplace metadata is invalid")) throw new Error("Codex marketplace metadata is invalid");
    seen.add(plugin.name);
  }
  if (seen.size !== capabilities.length) throw new Error("Codex marketplace metadata is invalid");
}
function assertUnifiedGitMarketplace(root, _capabilities) {
  const marketplace = assertObject(readJson(path.join(root, ".agents", "plugins", "marketplace.json"), "Git marketplace metadata is invalid"), "Git marketplace metadata is invalid");
  if (marketplace.name !== "common-tools" || marketplace.interface?.displayName !== "Common Tools" || !Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) throw new Error("Git marketplace metadata is invalid");
  const entry = marketplace.plugins[0];
  if (!entry || entry.name !== "common-tools" || entry.source?.source !== "local" || entry.source?.path !== "./plugins/common-tools" || entry.policy?.installation !== "INSTALLED_BY_DEFAULT" || entry.policy?.authentication !== "ON_USE" || !assertNonEmptyString(entry.category, "Git marketplace metadata is invalid")) throw new Error("Git marketplace metadata is invalid");
  const pluginRoot = path.join(root, "plugins", "common-tools");
  const metadata = assertPluginMetadata(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "common-tools", "codex");
  if (metadata.mcpServers !== "./.mcp.json") throw new Error("unified Codex plugin MCP configuration is invalid");
  if (!versionAtLeast(pluginRuntimeVersion(metadata.version), "0.1.6")) throw new Error("unified Codex plugin version does not include the ppt-create planning release");
  const mcp = assertObject(readJson(path.join(pluginRoot, ".mcp.json"), "unified Codex plugin MCP configuration is invalid"), "unified Codex plugin MCP configuration is invalid");
  const server = mcp.mcpServers?.["common-tools"];
  if (!server || server.type !== "http" || server.url !== "https://plugins.iepose.cn/mcp" || server.oauth?.clientId !== "common-tools-mcp" || Object.keys(server).some((key) => !["type", "url", "oauth"].includes(key))) throw new Error("unified Codex plugin MCP configuration is invalid");
  const hostedCapabilities = [..._capabilities].sort();
  const installedSkills = fs.readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (JSON.stringify(installedSkills) !== JSON.stringify(hostedCapabilities)) throw new Error("unified Codex plugin capability surface does not match the hosted service");
  const imageSkillFile = path.join(pluginRoot, "skills", "image-to-editable", "SKILL.md");
  const imageSkill = fs.readFileSync(imageSkillFile, "utf8");
  if (!imageSkill.includes("hosted Common Tools Runtime") || !imageSkill.includes("create_team_upload_target") || imageSkill.includes("common-tools editable run --input")) throw new Error("unified image-to-editable Skill is not remote-only");
  assertImageToEditableSkill(imageSkillFile);
  assertPptCreateSkill(path.join(pluginRoot, "skills", "ppt-create", "SKILL.md"));
  const auditSkill = fs.readFileSync(path.join(pluginRoot, "skills", "project-audit", "SKILL.md"), "utf8");
  if (!auditSkill.includes("Source-code privacy is the default boundary") || !auditSkill.includes("<plugin-root>/runtime/project-audit/") || !auditSkill.includes("contains no SlideClone, OCR, .NET, Docker") || !auditSkill.includes("obtain separate explicit user approval") || !auditSkill.includes("create_team_upload_target")) throw new Error("unified project-audit Skill is not embedded local-first with an explicit remote boundary");
  // This source-only verifier is intentionally loaded lazily. Remote runtime
  // bundles reuse this file but do not ship the Git Marketplace sync tooling.
  const syncVerifier = path.join(root, "scripts", "sync-project-audit-plugin-runtime.js");
  if (fs.existsSync(syncVerifier)) {
    const { verifyProjectAuditPluginRuntime } = require(syncVerifier);
    verifyProjectAuditPluginRuntime({ repositoryRoot: root, targetRoot: path.join(pluginRoot, "runtime", "project-audit") });
  }
  for (const capability of ["ppt-create", "ppt-improve", "ppt-quality"]) assertMirroredPackage(path.join(root, "plugins", "codex", capability, "skills", capability), path.join(pluginRoot, "skills", capability));
  return true;
}
function verifyPluginPackaging(root = REPOSITORY_ROOT, capabilities = capabilityNames(root)) {
  if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.some((capability) => typeof capability !== "string" || !CAPABILITY_PATTERN.test(capability))) throw new Error("capability list is invalid");
  const uniqueCapabilities = [...new Set(capabilities)].sort();
  if (uniqueCapabilities.length !== capabilities.length) throw new Error("capability list is invalid");
  const versions = capabilityVersions(root, uniqueCapabilities);
  assertMarketplace(root, uniqueCapabilities);
  assertCodexMarketplace(root, uniqueCapabilities);
  for (const capability of uniqueCapabilities) {
    const codex = path.join(root, "plugins", "codex", capability);
    const claude = path.join(root, "plugins", "claude", capability);
    const marketplacePlugin = path.join(root, "marketplaces", "claude", "plugins", capability);
    const codexMarketplacePlugin = path.join(root, "marketplaces", "codex", "plugins", capability);
    assertPluginPackage(codex, capability, "codex", versions.get(capability));
    assertPluginPackage(claude, capability, "claude", versions.get(capability));
    assertPluginPackage(marketplacePlugin, capability, "claude", versions.get(capability));
    assertMirroredPackage(claude, marketplacePlugin);
    assertPluginPackage(codexMarketplacePlugin, capability, "codex", versions.get(capability));
    assertMirroredPackage(codex, codexMarketplacePlugin);
    if (capability === "image-to-editable") {
      for (const skill of [codex, claude, marketplacePlugin, codexMarketplacePlugin].map((pluginRoot) => path.join(pluginRoot, "skills", capability, "SKILL.md"))) assertImageToEditableSkill(skill);
    }
    if (capability === "ppt-create") {
      for (const skill of [codex, claude, marketplacePlugin, codexMarketplacePlugin].map((pluginRoot) => path.join(pluginRoot, "skills", capability, "SKILL.md"))) assertPptCreateSkill(skill);
    }
  }
  assertUnifiedGitMarketplace(root, uniqueCapabilities);
  return Object.freeze({ capabilities: Object.freeze(uniqueCapabilities), hosts: Object.freeze(["codex", "claude"]), marketplaces: Object.freeze(["claude", "codex"]) });
}

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyPluginPackaging(), null, 2)}\n`);

module.exports = { assertCodexMarketplace, assertImageToEditableSkill, assertMirroredPackage, assertPluginPackage, assertPptCreateSkill, assertSafeSkill, assertUnifiedGitMarketplace, capabilityNames, capabilityVersions, pluginRuntimeVersion, verifyPluginPackaging, versionAtLeast };
