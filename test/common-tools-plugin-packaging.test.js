"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertUnifiedGitMarketplace, capabilityNames, verifyPluginPackaging } = require("../scripts/verify-plugins");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const capabilities = capabilityNames(repositoryRoot);
const packageManifest = require(path.join(repositoryRoot, "package.json"));

test("Runtime package declares an installable CLI and a release-only file allowlist", () => {
  assert.equal(packageManifest.private, true);
  assert.deepEqual(packageManifest.bin, { "common-tools": "packages/cli/bin/common-tools.js" });
  assert.equal(Array.isArray(packageManifest.files), true);
  for (const required of ["packages/", "plugins/", "marketplaces/", "skills/pd-hifi-slideclone/scripts/", "skills/pd-hifi-slideclone/schemas/", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/OpenXmlDeckBuilder.csproj", "scripts/verify-capability-contracts.js", "scripts/verify-plugins.js", "scripts/generate-sbom.js", "scripts/team-keycloak-volume-restore-drill.ps1", "deploy/"]) assert.equal(packageManifest.files.includes(required), true);
  for (const forbidden of ["test/", ".codex-tmp/", "runs/", "node_modules/", "skills/pd-hifi-slideclone/", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/bin/", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/obj/"]) assert.equal(packageManifest.files.includes(forbidden), false);
});

function copiedPluginRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-packaging-"));
  fs.cpSync(path.join(repositoryRoot, "plugins"), path.join(root, "plugins"), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, "marketplaces"), path.join(root, "marketplaces"), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, ".agents"), path.join(root, ".agents"), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, "packages", "capability-manifests"), path.join(root, "packages", "capability-manifests"), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, "package.json"), path.join(root, "package.json"));
  return root;
}

test("every declared capability has self-contained Codex and Claude plugin packages", () => {
  assert.deepEqual(capabilityNames(repositoryRoot), capabilities);
  assert.deepEqual(verifyPluginPackaging(repositoryRoot), { capabilities, hosts: ["codex", "claude"], marketplaces: ["claude", "codex"] });
});

test("Git Marketplace installs one hosted plugin and routes image conversion to remote MCP", () => {
  assert.equal(assertUnifiedGitMarketplace(repositoryRoot, capabilities), true);
  const marketplace = JSON.parse(fs.readFileSync(path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"), "utf8"));
  assert.equal(marketplace.interface.displayName, "Common Tools");
  assert.equal(marketplace.plugins[0].policy.installation, "INSTALLED_BY_DEFAULT");
  assert.equal(marketplace.plugins[0].source.path, "./plugins/common-tools");
  const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "plugins", "common-tools", ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.match(manifest.version, /^0\.1\.19\+codex\./);
  assert.equal(manifest.version.split("+")[0], packageManifest.version);
  const mcp = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "plugins", "common-tools", ".mcp.json"), "utf8"));
  assert.deepEqual(mcp.mcpServers["common-tools"], { type: "http", url: "https://plugins.iepose.cn/mcp", oauth: { clientId: "common-tools-mcp" } });
  const imageSkill = fs.readFileSync(path.join(repositoryRoot, "plugins", "common-tools", "skills", "image-to-editable", "SKILL.md"), "utf8");
  assert.match(imageSkill, /heavy document normalization, OCR, reconstruction, rendering, and quality work runs on the server/);
  assert.match(imageSkill, /create_team_upload_target/);
  assert.match(imageSkill, /residual-native-duplicates-removed/);
  assert.match(imageSkill, /raw-image-batch-validated/);
  assert.match(imageSkill, /document-pages-normalized/);
  assert.match(imageSkill, /quality-rendered/);
  assert.match(imageSkill, /visual-fidelity/);
  assert.doesNotMatch(imageSkill, /common-tools doctor --capability image-to-editable/);
  assert.doesNotMatch(imageSkill, /common-tools editable run --input/);
  const installedSkills = fs.readdirSync(path.join(repositoryRoot, "plugins", "common-tools", "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(installedSkills, capabilities);
  const auditSkill = fs.readFileSync(path.join(repositoryRoot, "plugins", "common-tools", "skills", "project-audit", "SKILL.md"), "utf8");
  assert.match(auditSkill, /Source-code privacy is the default boundary/);
  assert.match(auditSkill, /<plugin-root>\/runtime\/project-audit/);
  assert.match(auditSkill, /contains no SlideClone, OCR, \.NET, Docker/);
  assert.match(auditSkill, /obtain separate explicit user approval/);
  assert.match(auditSkill, /Do not silently reduce the selected level/);
  assert.match(auditSkill, /Completion gate/);
});

test("Git Marketplace rejects removal of the image residual deduplication release contract", () => {
  const root = copiedPluginRoot();
  try {
    const skill = path.join(root, "plugins", "common-tools", "skills", "image-to-editable", "SKILL.md");
    fs.writeFileSync(skill, fs.readFileSync(skill, "utf8").replaceAll("residual-native-duplicates-removed", "legacy-residual-check"), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /does not protect residual deduplication/);
    fs.copyFileSync(path.join(repositoryRoot, "plugins", "common-tools", "skills", "image-to-editable", "SKILL.md"), skill);
    const manifestFile = path.join(root, "plugins", "common-tools", ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.version = "0.1.0+codex.legacy";
    fs.writeFileSync(manifestFile, JSON.stringify(manifest), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /does not include the current ppt-create release/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Git Marketplace rejects a plugin version that drifts from the repository release", () => {
  const root = copiedPluginRoot();
  try {
    const manifestFile = path.join(root, "plugins", "common-tools", ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.version = "0.1.17+codex.stale";
    fs.writeFileSync(manifestFile, JSON.stringify(manifest), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /does not match the repository release version/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Git Marketplace rejects removal of the ppt-create layout candidate contract", () => {
  const root = copiedPluginRoot();
  try {
    const skill = path.join(root, "plugins", "common-tools", "skills", "ppt-create", "SKILL.md");
    fs.writeFileSync(skill, fs.readFileSync(skill, "utf8").replaceAll("layout-candidates-available", "legacy-layout-check"), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /clean-room creation contract/);
    fs.copyFileSync(path.join(repositoryRoot, "plugins", "common-tools", "skills", "ppt-create", "SKILL.md"), skill);
    const manifestFile = path.join(root, "plugins", "common-tools", ".codex-plugin", "plugin.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.version = "0.1.1+codex.legacy";
    fs.writeFileSync(manifestFile, JSON.stringify(manifest), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /does not include the current ppt-create release/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Git Marketplace rejects removal of the ppt-create planning contract", () => {
  const root = copiedPluginRoot();
  try {
    const skill = path.join(root, "plugins", "common-tools", "skills", "ppt-create", "SKILL.md");
    fs.writeFileSync(skill, fs.readFileSync(skill, "utf8").replaceAll("planning-source-covered", "legacy-planning-check"), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /clean-room creation contract/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Git Marketplace rejects removal of the ppt-create enhancement release contract", () => {
  const root = copiedPluginRoot();
  try {
    const skill = path.join(root, "plugins", "common-tools", "skills", "ppt-create", "SKILL.md");
    for (const marker of ["asset-provenance-verified", "asset-license-policy-compliant", "template-package-safe", "template-layout-capacity-respected", "template-placeholder-bindings-recorded", "deckVariantCount", "citations-editable", "speaker-notes-native", "ppt ingest", "ppt archive", "application/gzip", "ppt edit-session", "loopback-editor-session-bound", "semantic-table-data-editable", "semantic-chart-data-editable", "ppt apply-ir-edit", "ppt finalize-ir-edit", "ppt export-ir", "edit-finalization-report.json", "CONTENT_PROVIDER_*", "real paths", "streamed responses", "ppt draft", "ppt compose", "--provider-config", "--provider-id", "document-visual-structure-preserved", "template-semantic-layout-mapped", "complex-graphic-native-gate", "semantic-component-plan-resolved", "ir-batch-style-validated", "ir-object-lifecycle-validated", "ir-page-lifecycle-validated", "deck.variants.json", "asset-manifest.json", "generation-manifest.json", "presentation.generated.json"]) {
      const original = fs.readFileSync(skill, "utf8");
      fs.writeFileSync(skill, original.replaceAll(marker, "legacy-enhancement-check"), "utf8");
      assert.throws(() => verifyPluginPackaging(root, capabilities), /clean-room creation contract/);
      fs.writeFileSync(skill, original, "utf8");
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project audit Skill keeps one evidence-review contract across packaged hosts", () => {
  const roots = [
    path.join(repositoryRoot, "plugins", "codex", "project-audit"),
    path.join(repositoryRoot, "plugins", "claude", "project-audit"),
    path.join(repositoryRoot, "marketplaces", "codex", "plugins", "project-audit"),
    path.join(repositoryRoot, "marketplaces", "claude", "plugins", "project-audit")
  ];
  const skills = roots.map((root) => fs.readFileSync(path.join(root, "skills", "project-audit", "SKILL.md"), "utf8"));
  const contracts = roots.map((root) => fs.readFileSync(path.join(root, "skills", "project-audit", "references", "audit-contract.md"), "utf8"));
  assert.equal(new Set(skills).size, 1);
  assert.equal(new Set(contracts).size, 1);
  assert.match(skills[0], /Ordinary .*audit this project.*enhanced/);
  assert.match(skills[0], /candidate-evidence inventory/);
  assert.match(skills[0], /confirmed-issue/);
  assert.match(skills[0], /请选择项目审计范围/);
  assert.match(skills[0], /--scope <selected-scope-ids>/);
  assert.match(contracts[0], /Do not use .pass. for candidate presence/);
});

test("plugin packaging rejects external Skill references and marketplace drift", () => {
  const root = copiedPluginRoot();
  try {
    const skill = path.join(root, "plugins", "codex", "project-audit", "skills", "project-audit", "SKILL.md");
    fs.appendFileSync(skill, "\nRead ../untrusted/SKILL.md\n", "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /outside its package/);
    fs.copyFileSync(path.join(repositoryRoot, "plugins", "codex", "project-audit", "skills", "project-audit", "SKILL.md"), skill);
    fs.appendFileSync(path.join(root, "marketplaces", "codex", "plugins", "project-audit", "skills", "project-audit", "SKILL.md"), "\nmarketplace drift\n", "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /do not match/);
    fs.copyFileSync(path.join(repositoryRoot, "plugins", "codex", "project-audit", "skills", "project-audit", "SKILL.md"), path.join(root, "marketplaces", "codex", "plugins", "project-audit", "skills", "project-audit", "SKILL.md"));
    fs.appendFileSync(path.join(root, "marketplaces", "claude", "plugins", "project-audit", "skills", "project-audit", "SKILL.md"), "\nmarketplace drift\n", "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /do not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plugin packaging rejects unresolved patch artifacts in Skill prose", () => {
  const root = copiedPluginRoot();
  try {
    const skill = path.join(root, "plugins", "codex", "ppt-create", "skills", "ppt-create", "SKILL.md");
    fs.appendFileSync(skill, "\n+Unresolved patch line\n");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /unresolved patch artifact/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Codex plugin manifests require install-page metadata and accept cachebuster semver", () => {
  const root = copiedPluginRoot();
  try {
    const manifest = path.join(root, "plugins", "codex", "image-to-editable", ".codex-plugin", "plugin.json");
    const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
    assert.match(parsed.version, /^0\.1\.7\+codex\./);
    delete parsed.interface;
    fs.writeFileSync(manifest, JSON.stringify(parsed), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /Codex plugin interface/);
    const restored = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "plugins", "codex", "image-to-editable", ".codex-plugin", "plugin.json"), "utf8"));
    restored.version = "9.9.9+codex.test";
    fs.writeFileSync(manifest, JSON.stringify(restored), "utf8");
    assert.throws(() => verifyPluginPackaging(root, capabilities), /version does not match/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI lists separately installable capabilities only after package verification", () => {
  const state = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-list-")), "state");
  try {
    const cli = path.join(repositoryRoot, "packages", "cli", "bin", "common-tools.js");
    const listed = spawnSync(process.execPath, [cli, "plugin", "list", "--state", state], { encoding: "utf8", windowsHide: true });
    assert.equal(listed.status, 0, listed.stderr);
    const catalog = JSON.parse(listed.stdout);
    assert.equal(catalog.distributionVerified, true);
    assert.deepEqual(catalog.capabilities.map((item) => item.capability), capabilities);
    assert.deepEqual(catalog.capabilities.map((item) => item.runtimeEnabled), [true, false, false, false, false, false]);
    assert.deepEqual(catalog.capabilities.map((item) => item.lifecycle), Array.from({ length: capabilities.length }, () => ({ status: "active" })));
    assert.equal(catalog.capabilities[0].team.oauthScope, "common-tools:capability:image-to-editable");
    const improvement = catalog.capabilities.find((item) => item.capability === "ppt-improve");
    assert.deepEqual(improvement.team.acceptedUploadMediaTypes, ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]);
    assert.deepEqual(improvement.dependencies, ["ppt-quality"]);
    assert.deepEqual(improvement.install.codex, { marketplace: "common-tools-codex", plugin: "ppt-improve@common-tools-codex" });
    assert.deepEqual(improvement.install.claude, { marketplace: "common-tools", plugin: "ppt-improve@common-tools" });
    assert.equal(fs.existsSync(state), false);

    const verified = spawnSync(process.execPath, [cli, "plugin", "verify"], { encoding: "utf8", windowsHide: true });
    assert.equal(verified.status, 0, verified.stderr);
    const verification = JSON.parse(verified.stdout);
    assert.deepEqual(verification.capabilities, capabilities);
    assert.deepEqual(verification.capabilityContracts, { capabilities, toolCount: 18 });

    const enabledAudit = spawnSync(process.execPath, [cli, "plugin", "enable", "--workspace", path.dirname(state), "--state", state, "--capability", "project-audit"], { encoding: "utf8", windowsHide: true });
    assert.equal(enabledAudit.status, 0, enabledAudit.stderr);
    fs.mkdirSync(path.join(path.dirname(state), ".common-tools"));
    fs.writeFileSync(path.join(path.dirname(state), ".common-tools", "runtime.json"), JSON.stringify({ allowedCapabilities: ["project-audit"] }), "utf8");
    const scoped = spawnSync(process.execPath, [cli, "plugin", "list", "--workspace", path.dirname(state), "--state", state], { encoding: "utf8", windowsHide: true });
    assert.equal(scoped.status, 0, scoped.stderr);
    assert.deepEqual(JSON.parse(scoped.stdout).capabilities.map((item) => item.runtimeEnabled), [false, false, false, false, true, false]);
    const status = spawnSync(process.execPath, [cli, "plugin", "status", "--workspace", path.dirname(state), "--state", state], { encoding: "utf8", windowsHide: true });
    assert.equal(status.status, 0, status.stderr);
    assert.deepEqual(JSON.parse(status.stdout).effectiveCapabilities, ["project-audit"]);

    const auditOnly = spawnSync(process.execPath, [cli, "plugin", "enable", "--state", state, "--capability", "project-audit", "--only"], { encoding: "utf8", windowsHide: true });
    assert.equal(auditOnly.status, 0, auditOnly.stderr);
    assert.deepEqual(JSON.parse(auditOnly.stdout).enabledCapabilities, ["project-audit"]);
    const qualityAndImproveOnly = spawnSync(process.execPath, [cli, "plugin", "enable", "--state", state, "--capability", "ppt-improve", "--only"], { encoding: "utf8", windowsHide: true });
    assert.equal(qualityAndImproveOnly.status, 0, qualityAndImproveOnly.stderr);
    assert.deepEqual(JSON.parse(qualityAndImproveOnly.stdout).enabledCapabilities, ["ppt-improve", "ppt-quality"]);
    const invalidOnly = spawnSync(process.execPath, [cli, "plugin", "disable", "--state", state, "--capability", "ppt-improve", "--only"], { encoding: "utf8", windowsHide: true });
    assert.equal(invalidOnly.status, 1);
    assert.match(invalidOnly.stderr, /--only is valid only/);

    const configured = spawnSync(process.execPath, [cli, "plugin", "set", "--state", state, "--capabilities", "project-audit,ppt-improve"], { encoding: "utf8", windowsHide: true });
    assert.equal(configured.status, 0, configured.stderr);
    assert.deepEqual(JSON.parse(configured.stdout).enabledCapabilities, ["ppt-improve", "ppt-quality", "project-audit"]);
    const invalidConfigured = spawnSync(process.execPath, [cli, "plugin", "set", "--state", state, "--capabilities", "project-audit,project-audit"], { encoding: "utf8", windowsHide: true });
    assert.equal(invalidConfigured.status, 1);
    assert.match(invalidConfigured.stderr, /duplicate capability IDs/);
    assert.deepEqual(JSON.parse(spawnSync(process.execPath, [cli, "plugin", "status", "--state", state], { encoding: "utf8", windowsHide: true }).stdout).enabledCapabilities, ["ppt-improve", "ppt-quality", "project-audit"]);
  } finally {
    fs.rmSync(path.dirname(state), { recursive: true, force: true });
  }
});

test("CLI help exposes the current multi-plugin and Docker runtime command surface", () => {
  const cli = path.join(repositoryRoot, "packages", "cli", "bin", "common-tools.js");
  for (const invocation of [["help"], ["--help"]]) {
    const result = spawnSync(process.execPath, [cli, ...invocation], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /plugin set --capabilities/);
    assert.match(result.stdout, /team runtime/);
    assert.match(result.stdout, /ppt-improve create\|run/);
  }
  const invalid = spawnSync(process.execPath, [cli, "unknown-command"], { encoding: "utf8", windowsHide: true });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /plugin set --capabilities/);
  assert.match(invalid.stderr, /team runtime/);
});

test("CLI upgrades only an explicitly version-increasing capability manifest", () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-upgrade-cli-"));
  try {
    fs.writeFileSync(path.join(state, "plugins.json"), JSON.stringify({ configVersion: 1, generation: 2, enabledCapabilities: ["image-to-editable"], manifests: { "image-to-editable": { version: "0.1.0", contentSha256: "0".repeat(64), requiredWorkerProfile: "image-to-editable" } } }), "utf8");
    const cli = path.join(repositoryRoot, "packages", "cli", "bin", "common-tools.js");
    const upgraded = spawnSync(process.execPath, [cli, "plugin", "upgrade", "--state", state, "--capability", "image-to-editable"], { encoding: "utf8", windowsHide: true });
    assert.equal(upgraded.status, 0, upgraded.stderr);
    const config = JSON.parse(upgraded.stdout);
    assert.equal(config.generation, 3);
    assert.equal(config.manifests["image-to-editable"].version, "0.1.7");
    assert.equal(fs.existsSync(path.join(state, "plugins.history", "2.json")), true);
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});
