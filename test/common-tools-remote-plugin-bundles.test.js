"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { REMOTE_CAPABILITY_CODES, REMOTE_CAPABILITY_SCOPES, REMOTE_PLUGIN_VERSION, connectionVerificationScript, generateRemotePluginBundles, installGuide, installationScript, marketplaceMetadata, mcpConfiguration, parseArguments, parseCapabilities, parseLayout, parseOrigin, pluginName, remoteRouterSkill, remoteSkill } = require("../scripts/generate-remote-plugin-bundles");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");

test("remote plugin bundles use one HTTPS MCP origin for both client hosts", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-bundles-"));
  const output = path.join(parent, "bundle");
  try {
    const result = generateRemotePluginBundles({ origin: "https://tunnel.example.test", output, hosts: ["codex", "claude"] });
    assert.equal(result.origin, "https://tunnel.example.test");
    for (const host of result.hosts) {
      const root = path.join(output, host, "plugins", "common-tools-remote");
      const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
      assert.deepEqual(mcp, mcpConfiguration(host, "https://tunnel.example.test"));
      assert.equal(mcp.mcpServers["common-tools"].url, "https://tunnel.example.test/mcp");
      assert.equal(mcp.mcpServers["common-tools"].oauth.clientId, "common-tools-mcp");
      if (host === "codex") {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
        assert.equal(manifest.mcpServers, "./.mcp.json");
      }
      const marketplacePath = host === "codex" ? path.join(output, host, ".agents", "plugins", "marketplace.json") : path.join(output, host, ".claude-plugin", "marketplace.json");
      const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
      assert.deepEqual(marketplace, marketplaceMetadata(host));
      if (host === "codex") assert.equal(marketplace.plugins[0].policy.installation, "INSTALLED_BY_DEFAULT");
      assert.equal(fs.readFileSync(path.join(output, host, "INSTALL.md"), "utf8"), installGuide(host, "https://tunnel.example.test", result.capabilities));
      assert.equal(fs.readFileSync(path.join(output, host, "install.ps1"), "utf8"), installationScript(host, "https://tunnel.example.test", result.capabilities, "bundle"));
      assert.equal(fs.readFileSync(path.join(output, host, "verify-connection.ps1"), "utf8"), connectionVerificationScript("https://tunnel.example.test", result.capabilities));
      const localRuntimeRoot = path.join(output, host, "local-runtime");
      const payloadManifest = JSON.parse(fs.readFileSync(path.join(localRuntimeRoot, "payload-manifest.json"), "utf8"));
      assert.equal(payloadManifest.schemaVersion, 1);
      assert.equal(payloadManifest.runtimeVersion, REMOTE_PLUGIN_VERSION, "a plugin release must install a fresh local runtime revision");
      assert.ok(payloadManifest.files.some((entry) => entry.path === "packages/cli/bin/common-tools.js"));
      assert.equal(payloadManifest.files.some((entry) => /OpenXmlDeckBuilder\/(?:bin|obj)\//u.test(entry.path)), false);
      const localRuntimeInstaller = fs.readFileSync(path.join(localRuntimeRoot, "install-local-runtime.ps1"), "utf8");
      assert.match(localRuntimeInstaller, /Get-FileHash/);
      assert.match(localRuntimeInstaller, /Refusing to replace an unmanaged common-tools command shim/);
      assert.match(localRuntimeInstaller, /Node.js 18 or newer/);
       assert.deepEqual(fs.readdirSync(path.join(root, "skills")).sort(), ["common-tools", "common-tools-help", "image-to-editable", "ppt-create", "ppt-improve", "ppt-quality", "project-audit"]);
       const skill = fs.readFileSync(path.join(root, "skills", "common-tools", "SKILL.md"), "utf8");
      assert.match(skill, /MCP tools visible in the current session are authoritative/);
      assert.match(skill, /create_team_upload_target/);
      assert.match(skill, /create_team_job/);
      assert.match(skill, /image-to-editable/);
       assert.match(skill, /project-audit/);
       for (const capability of ["image-to-editable", "ppt-create", "project-audit"]) {
         const capabilitySkill = fs.readFileSync(path.join(root, "skills", capability, "SKILL.md"), "utf8");
         assert.match(capabilitySkill, new RegExp(`name: ${capability}`));
         const chineseGuide = fs.readFileSync(path.join(root, "docs", "zh-CN", `${capability}.md`), "utf8");
         assert.match(chineseGuide, /输入边界/);
       }
       const helpSkill = fs.readFileSync(path.join(root, "skills", "common-tools-help", "SKILL.md"), "utf8");
       assert.match(helpSkill, /用中文说明/);
       assert.match(fs.readFileSync(path.join(root, "docs", "zh-CN", "README.md"), "utf8"), /中文使用说明/);
    }
    const payloadCli = path.join(output, "codex", "local-runtime", "packages", "cli", "bin", "common-tools.js");
    const localRoute = spawnSync(process.execPath, [payloadCli, "runtime", "resolve", "--capability", "project-audit"], { encoding: "utf8" });
    assert.equal(localRoute.status, 0, `${localRoute.stdout}${localRoute.stderr}`);
    assert.match(localRoute.stdout, /"execution": "local"/);
    const localAuditPlan = spawnSync(process.execPath, [payloadCli, "audit", "plan", "--instruction", "审计当前项目"], { encoding: "utf8" });
    assert.equal(localAuditPlan.status, 0, `${localAuditPlan.stdout}${localAuditPlan.stderr}`);
    assert.match(localAuditPlan.stdout, /"mode": "enhanced"/);
    const packagedWorkspace = path.join(parent, "packaged-runtime-workspace");
    const packagedState = path.join(packagedWorkspace, ".common-tools");
    const packagedInput = path.join(packagedWorkspace, "presentation.json");
    const packagedOutput = path.join(packagedWorkspace, "created-presentation");
    fs.mkdirSync(packagedWorkspace, { recursive: true });
    fs.copyFileSync(path.join(__dirname, "fixtures", "ppt-create", "basic.presentation.json"), packagedInput);
    const enablePptCreate = spawnSync(process.execPath, [payloadCli, "plugin", "enable", "--capability", "ppt-create", "--workspace", packagedWorkspace, "--state", packagedState], { encoding: "utf8" });
    assert.equal(enablePptCreate.status, 0, `${enablePptCreate.stdout}${enablePptCreate.stderr}`);
    const createPpt = spawnSync(process.execPath, [payloadCli, "ppt", "create", "--input", packagedInput, "--out", packagedOutput, "--workspace", packagedWorkspace, "--state", packagedState], { encoding: "utf8", timeout: 120_000 });
    assert.equal(createPpt.status, 0, `${createPpt.stdout}${createPpt.stderr}`);
    assert.match(createPpt.stdout, /"status": "succeeded"/);
    const packagedDeck = path.join(packagedOutput, "deck.pptx");
    const entries = listZipEntries(packagedDeck).map((entry) => entry.name);
    assert.deepEqual(entries.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(), ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide3.xml"]);
    assert.equal(entries.some((name) => /^ppt\/media\//.test(name)), false);
    const packagedSlide = readZipEntry(packagedDeck, "ppt/slides/slide2.xml").toString("utf8");
    assert.match(packagedSlide, /<p:sp>/);
    assert.doesNotMatch(packagedSlide, /<p:pic>/);
    assert.throws(() => generateRemotePluginBundles({ origin: "https://tunnel.example.test", output, hosts: ["codex"] }), /must not already exist/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("remote plugin bundles can include only deployed capabilities", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-bundles-"));
  const output = path.join(parent, "bundle");
  try {
    const result = generateRemotePluginBundles({ origin: "https://tunnel.example.test", output, hosts: ["codex"], capabilities: ["ppt-quality", "project-audit"] });
    assert.deepEqual(result.capabilities, ["ppt-quality", "project-audit"]);
    const skills = fs.readdirSync(path.join(output, "codex", "plugins", "common-tools-remote", "skills")).sort();
     assert.deepEqual(skills, ["common-tools", "common-tools-help", "ppt-quality", "project-audit"]);
    const router = fs.readFileSync(path.join(output, "codex", "plugins", "common-tools-remote", "skills", "common-tools", "SKILL.md"), "utf8");
    assert.match(router, /ppt-quality/);
    assert.match(router, /project-audit/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("split remote plugin bundles expose one independently installable plugin per capability", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-plugin-bundles-"));
  const output = path.join(parent, "split");
  const capabilities = ["image-to-editable", "project-audit"];
  try {
    const result = generateRemotePluginBundles({ origin: "https://tunnel.example.test", output, hosts: ["codex", "claude"], capabilities, layout: "split" });
    assert.equal(result.layout, "split");
    for (const host of result.hosts) {
      const marketplacePath = host === "codex" ? path.join(output, host, ".agents", "plugins", "marketplace.json") : path.join(output, host, ".claude-plugin", "marketplace.json");
      const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
      assert.deepEqual(marketplace.plugins.map((entry) => entry.name).sort(), capabilities.map(pluginName).sort());
      if (host === "codex") assert.equal(marketplace.plugins.every((entry) => entry.policy.installation === "AVAILABLE"), true);
      for (const capability of capabilities) {
        const name = pluginName(capability);
        const root = path.join(output, host, "plugins", name);
        assert.deepEqual(fs.readdirSync(path.join(root, "skills")).sort(), [capability]);
        const serverName = `common-tools-${capability}`;
        const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
        assert.deepEqual(mcp, mcpConfiguration(host, "https://tunnel.example.test", serverName));
        assert.equal(mcp.mcpServers[serverName].url, "https://tunnel.example.test/mcp");
        const manifest = JSON.parse(fs.readFileSync(path.join(root, host === "codex" ? ".codex-plugin/plugin.json" : ".claude-plugin/plugin.json"), "utf8"));
        assert.equal(manifest.name, name);
        assert.match(manifest.description, new RegExp(capability));
        if (host === "codex") assert.equal(manifest.mcpServers, "./.mcp.json");
      }
      const guide = fs.readFileSync(path.join(output, host, "INSTALL.md"), "utf8");
      assert.match(guide, /Install only the plugin or plugins you intend to use/);
      for (const capability of capabilities) assert.match(guide, new RegExp(pluginName(capability)));
      const installer = fs.readFileSync(path.join(output, host, "install.ps1"), "utf8");
      assert.equal(installer, installationScript(host, "https://tunnel.example.test", capabilities, "split"));
      assert.match(installer, new RegExp(`\\"${REMOTE_CAPABILITY_CODES[capabilities[0]]}\\" = \\"${capabilities[0]}\\"`));
      assert.match(installer, new RegExp(`\\"${capabilities[1]}\\" = \\"${pluginName(capabilities[1])}\\"`));
      if (host === "codex") {
        assert.match(installer, /historical Common Tools root\/MCP paths/);
        assert.match(installer, /\$existing\.transport\.type -eq "streamable_http"/);
        assert.match(installer, /\$existing\.transport\.url/);
        assert.match(installer, /\$hasAbsoluteExistingUri = \$null -ne \$existingUri -and \$existingUri\.IsAbsoluteUri/);
        assert.match(installer, /\$legacyPath -in @\("", "\/mcp"\)/);
        assert.match(installer, /\$existing\.oauth_client_id = \$null/);
      }
      assert.match(installer, new RegExp(`${host === "codex" ? "codex plugin add" : "claude plugin install"}`));
      assert.doesNotMatch(installer, /password|token|docker/i);
    }
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("generated Windows installer accepts capability codes, safely migrates legacy endpoints, and does not embed credentials", () => {
  const split = installationScript("codex", "https://tunnel.example.test", ["image-to-editable", "project-audit"], "split");
  assert.match(split, /Capabilities must not contain duplicates/);
  assert.match(split, /codex plugin marketplace add/);
  assert.match(split, /codex plugin marketplace list --json/);
  assert.match(split, /codex plugin marketplace remove \$marketplaceName/);
  assert.match(split, /codex plugin list --json/);
  assert.match(split, /codex plugin remove "\$\(\$legacyPlugin\.name\)@\$marketplaceName"/);
  assert.match(split, /\.agents\/plugins\/marketplace\.json/);
  assert.match(split, /codex mcp remove \$serverName/);
  assert.match(split, /codex mcp add \$serverName --url \$serverUrl --oauth-client-id "common-tools-mcp"/);
  assert.doesNotMatch(split, /--oauth-resource/);
  assert.match(split, /codex mcp login \$serverName --scopes \$oauthScopes/);
  assert.match(split, /verify-connection\.ps1"\) -Capabilities \$remoteSelected/);
  assert.match(split, /\[ValidateSet\("local-preferred", "remote-only", "local-only"\)\]/);
  assert.match(split, /local-runtime\\install-local-runtime\.ps1/);
  assert.match(split, /Local-only mode cannot install capabilities that require remote execution/);
  assert.match(split, /"1" = "image-to-editable"/);
  assert.match(split, /"4" = "project-audit"/);
  assert.match(split, /Select capability codes \(comma-separated; 0 enables all\)/);
  assert.match(split, /Capability code 0 must be used by itself/);
  assert.equal(REMOTE_CAPABILITY_SCOPES["project-audit"], "common-tools:capability:project-audit");
  assert.match(split, /"project-audit" = "common-tools:capability:project-audit"/);
  assert.match(split, /\$pluginName@common-tools-remote/);
  assert.doesNotMatch(split, /COMMON_TOOLS|password|secret|token|docker/i);
  const bundle = installationScript("claude", "https://tunnel.example.test", ["project-audit"], "bundle");
  assert.match(bundle, /\[string\[\]\]\$Capabilities/);
  assert.match(bundle, /\[switch\]\$AllCapabilities/);
  assert.match(bundle, /Read-Host "Select capability codes/);
  assert.match(bundle, /At least one capability must be selected/);
  assert.match(bundle, /claude plugin install/);
  assert.match(bundle, /Capabilities must not contain duplicates/);
});

test("generated Windows installer enters capability selection when no parameter is supplied", { skip: process.platform !== "win32" }, () => {
  const installer = installationScript("claude", "https://tunnel.example.test", ["image-to-editable", "project-audit"], "bundle");
  const selectionStart = installer.indexOf("$availableCapabilities");
  const selectionEnd = installer.indexOf('if ($ExecutionMode -ne "remote-only"');
  assert.ok(selectionStart >= 0 && selectionEnd > selectionStart, "generated installer must contain a bounded selection block");
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-installer-selection-"));
  const harnessPath = path.join(parent, "selection.ps1");
  try {
    fs.writeFileSync(harnessPath, `param([string[]]$Capabilities, [switch]$AllCapabilities, [string]$ExecutionMode)\n${installer.slice(selectionStart, selectionEnd)}Write-Output \"RESULT=$($selected -join ',')\"\n`, "utf8");
    const interactive = spawnSync("powershell", ["-NoProfile", "-File", harnessPath], { encoding: "utf8", input: "1,4\n2\n" });
    assert.equal(interactive.status, 0, interactive.stderr);
    assert.match(interactive.stdout, /RESULT=image-to-editable,project-audit/);
    const automated = spawnSync("powershell", ["-NoProfile", "-File", harnessPath, "-Capabilities", "1,4", "-ExecutionMode", "remote-only"], { encoding: "utf8" });
    assert.equal(automated.status, 0, automated.stderr);
    assert.match(automated.stdout, /RESULT=image-to-editable,project-audit/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("generated Windows installer rejects an empty legacy MCP URL without a null-method failure", { skip: process.platform !== "win32" }, () => {
  const installer = installationScript("codex", "https://tunnel.example.test", ["image-to-editable"], "bundle");
  const registrationStart = installer.indexOf('$serverName = "common-tools"');
  const registrationEnd = installer.indexOf('\n}\n$marketplaceName = "common-tools-remote"', registrationStart);
  assert.ok(registrationStart >= 0 && registrationEnd > registrationStart, "generated installer must contain a bounded Codex MCP registration block");
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-installer-migration-"));
  const harnessPath = path.join(parent, "migration.ps1");
  try {
    const registration = installer.slice(registrationStart, registrationEnd);
    const harness = `$ErrorActionPreference = "Stop"
function codex {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CommandArgs)
  if ($CommandArgs[0] -eq "mcp" -and $CommandArgs[1] -eq "get") {
    '{"url":null,"oauth_client_id":"common-tools-mcp","oauth_resource":null}'
    $global:LASTEXITCODE = 0
    return
  }
  $global:LASTEXITCODE = 0
}
$selected = @("image-to-editable")
$remoteSelected = @("image-to-editable")
${registration}`;
    fs.writeFileSync(harnessPath, harness, "utf8");
    const result = spawnSync("powershell", ["-NoProfile", "-File", harnessPath], { encoding: "utf8" });
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /already points to a different URL/);
    assert.doesNotMatch(output, /null-valued expression/i);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("generated Windows installer accepts the current Codex streamable HTTP configuration shape", { skip: process.platform !== "win32" }, () => {
  const installer = installationScript("codex", "https://tunnel.example.test", ["image-to-editable"], "bundle");
  const registrationStart = installer.indexOf('$serverName = "common-tools"');
  const registrationEnd = installer.indexOf('\n}\n$marketplaceName = "common-tools-remote"', registrationStart);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-installer-current-shape-"));
  const harnessPath = path.join(parent, "current-shape.ps1");
  try {
    const registration = installer.slice(registrationStart, registrationEnd);
    const harness = `$ErrorActionPreference = "Stop"
function codex {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CommandArgs)
  if ($CommandArgs[0] -eq "mcp" -and $CommandArgs[1] -eq "get") {
    '{"transport":{"type":"streamable_http","url":"https://tunnel.example.test/mcp"}}'
  } else {
    Write-Output "CALL=$($CommandArgs -join ' ')"
  }
  $global:LASTEXITCODE = 0
}
$selected = @("image-to-editable")
$remoteSelected = @("image-to-editable")
${registration}`;
    fs.writeFileSync(harnessPath, harness, "utf8");
    const result = spawnSync("powershell", ["-NoProfile", "-File", harnessPath], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /CALL=mcp login common-tools --scopes common-tools:capability:image-to-editable/);
    assert.doesNotMatch(result.stdout, /CALL=mcp (?:remove|add)/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("generated Windows installer safely replaces a prior managed Common Tools marketplace", { skip: process.platform !== "win32" }, () => {
  const installer = installationScript("codex", "https://tunnel.example.test", ["image-to-editable"], "bundle");
  const marketplaceStart = installer.indexOf('$marketplaceName = "common-tools-remote"');
  const marketplaceEnd = installer.indexOf("foreach ($pluginName in $pluginNames)");
  assert.ok(marketplaceStart >= 0 && marketplaceEnd > marketplaceStart, "generated installer must contain a bounded marketplace registration block");
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-installer-marketplace-"));
  const legacyRoot = path.join(parent, "legacy");
  const harnessPath = path.join(parent, "marketplace.ps1");
  try {
    fs.mkdirSync(path.join(legacyRoot, ".agents", "plugins"), { recursive: true });
    fs.writeFileSync(
      path.join(legacyRoot, ".agents", "plugins", "marketplace.json"),
      JSON.stringify({ name: "common-tools-remote", plugins: [{ name: "common-tools-remote", source: { source: "local" } }] }),
      "utf8"
    );
    const marketplaceJson = JSON.stringify({ marketplaces: [{ name: "common-tools-remote", root: legacyRoot }] });
    const marketplace = installer.slice(marketplaceStart, marketplaceEnd);
    const harness = [
      '$ErrorActionPreference = "Stop"',
      'function codex {',
      '  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CommandArgs)',
      '  if ($CommandArgs[0] -eq "plugin" -and $CommandArgs[1] -eq "marketplace" -and $CommandArgs[2] -eq "list") {',
      "    '" + marketplaceJson + "'",
      '    $global:LASTEXITCODE = 0',
      '    return',
      '  }',
      '  if ($CommandArgs[0] -eq "plugin" -and $CommandArgs[1] -eq "list") {',
      "    '{\"installed\":[{\"name\":\"common-tools-remote-image-to-editable\",\"marketplaceName\":\"common-tools-remote\"}]}'",
      '    $global:LASTEXITCODE = 0',
      '    return',
      '  }',
      '  Write-Output ("CALL=" + ($CommandArgs -join " "))',
      '  $global:LASTEXITCODE = 0',
      '}',
      "$root = " + JSON.stringify(parent),
      marketplace
    ].join("\n");
    fs.writeFileSync(harnessPath, harness, "utf8");
    const result = spawnSync("powershell", ["-NoProfile", "-File", harnessPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /CALL=plugin marketplace remove common-tools-remote/);
    assert.match(result.stdout, /CALL=plugin marketplace add /);
    assert.match(result.stdout, /CALL=plugin remove common-tools-remote-image-to-editable@common-tools-remote/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("remote installer verification is bounded, credential-free, and checks every selected capability", () => {
  const script = connectionVerificationScript("https://tunnel.example.test", ["image-to-editable", "project-audit"]);
  assert.match(script, /HttpCompletionOption\]::ResponseHeadersRead/);
  assert.match(script, /Read-BoundedResponse \$response 16384/);
  assert.match(script, /\/.well-known\/oauth-protected-resource\/mcp/);
  assert.match(script, /common-tools:capability:\$_/);
  assert.match(script, /Remote service does not advertise every selected capability/);
  assert.doesNotMatch(script, /password|secret|token|docker|SkipCertificateCheck/i);
});

test("unified bundle installer selects capability scopes while installing one plugin", () => {
  const bundle = installationScript("codex", "https://tunnel.example.test", ["image-to-editable", "project-audit"], "bundle");
  assert.match(bundle, /\$availableCapabilities = @\("image-to-editable", "project-audit"\)/);
  assert.match(bundle, /-AllCapabilities and -Capabilities cannot be used together/);
  assert.match(bundle, /Read-Host "Select capability codes/);
  assert.match(bundle, /"1" = "image-to-editable"/);
  assert.match(bundle, /"4" = "project-audit"/);
  assert.deepEqual(REMOTE_CAPABILITY_CODES, { "image-to-editable": "1", "ppt-improve": "2", "ppt-quality": "3", "project-audit": "4", "ppt-create": "5" });
  assert.match(bundle, /\$pluginNames = @\(\$plugins\["bundle"\]\)/);
  assert.match(bundle, /\$oauthScopes = \[string\]::Join\(",", @\(\$remoteSelected/);
  assert.doesNotMatch(bundle, /"image-to-editable" = "common-tools-remote-image-to-editable"/);
  assert.match(installGuide("codex", "https://tunnel.example.test", ["image-to-editable", "project-audit"]), /one capability-router Skill/);
  assert.match(installGuide("codex", "https://tunnel.example.test", ["image-to-editable", "project-audit"]), /-AllCapabilities/);
});

test("remote plugin bundle input rejects paths, insecure origins and unknown options", () => {
  assert.equal(parseOrigin("https://tunnel.example.test/"), "https://tunnel.example.test");
  assert.throws(() => parseOrigin("http://tunnel.example.test"), /HTTPS/);
  assert.throws(() => parseOrigin("https://tunnel.example.test/id"), /origin URL/);
  assert.deepEqual(parseCapabilities("project-audit,ppt-quality"), ["ppt-quality", "project-audit"]);
  assert.equal(parseLayout(undefined), "bundle");
  assert.equal(parseLayout("split"), "split");
  assert.throws(() => parseLayout("many"), /layout/);
  assert.throws(() => parseCapabilities("project-audit,project-audit"), /capabilities/);
  assert.throws(() => parseArguments(["--origin", "https://tunnel.example.test", "--output", "out"]), /--capabilities is required/);
  assert.throws(() => parseArguments(["--origin", "https://tunnel.example.test", "--output", "out", "--host", "other"]), /host/);
  assert.throws(() => parseArguments(["--origin", "https://tunnel.example.test", "--output", "out", "--capabilities", "project-audit", "--layout", "many"]), /layout/);
});

test("remote capability Skills are self-contained and use the team job protocol", () => {
  for (const capability of ["image-to-editable", "ppt-create", "ppt-improve", "ppt-quality", "project-audit"]) {
    const skill = remoteSkill(capability);
    assert.match(skill, new RegExp(`name: ${capability}`));
    assert.match(skill, /create_team_upload_target/);
    assert.match(skill, /get_team_artifact_target/);
    if (capability === "project-audit") {
      assert.match(skill, /runtime resolve --capability project-audit/);
      assert.match(skill, /请选择项目审计范围/);
      assert.match(skill, /--scope <selected-scope-ids>/);
      assert.match(skill, /local-preferred/);
      assert.match(skill, /never silently upload/);
      assert.match(skill, /four-domain static review/);
      assert.match(skill, /--mode enhanced/);
      assert.match(skill, /common-tools audit run/);
      assert.match(skill, /candidate-evidence inventory/);
      assert.match(skill, /confirmed-issue/);
      assert.match(skill, /scenarios remain `not-verified`/);
      assert.match(skill, /explicitly asks for a team\/remote audit/);
    } else if (capability === "ppt-create") {
      assert.match(skill, /runtime resolve --capability ppt-create/);
      assert.match(skill, /common-tools ppt create/);
      assert.match(skill, /PresentationSpec 1\.0/);
    } else {
      assert.doesNotMatch(skill, /\n.*common-tools plugin enable/);
      assert.doesNotMatch(skill, /\n.*common-tools (?:audit|editable|ppt-quality|ppt-improve)/);
    }
  }
});

test("unified remote router honors the visible MCP capability boundary", () => {
  const router = remoteRouterSkill(["image-to-editable", "project-audit"]);
  assert.match(router, /MCP tools visible in the current session are authoritative/);
  assert.match(router, /not selected, authorized, or deployed/);
  assert.match(router, /do not silently substitute another capability/);
  assert.match(router, /create_team_upload_target/);
  assert.match(router, /project-audit/);
  assert.throws(() => remoteRouterSkill(["project-audit", "project-audit"]), /invalid/);
});
