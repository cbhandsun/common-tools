"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Keep existing numeric installer codes stable; append new capabilities.
const CAPABILITIES = Object.freeze(["image-to-editable", "ppt-improve", "ppt-quality", "project-audit", "ppt-create"]);
const REMOTE_CAPABILITY_CODES = Object.freeze(Object.fromEntries(CAPABILITIES.map((capability, index) => [capability, String(index + 1)])));
const REMOTE_PLUGIN_VERSION = "0.1.24";
const REPOSITORY_ROOT = path.resolve(__dirname, "..");
// Keep the on-device runtime revision aligned with the plugin release.  A
// source-package version is intentionally not used here: it can stay stable
// while the bundled runtime code changes, which would otherwise leave an old
// runtime in place after a plugin upgrade.
const LOCAL_RUNTIME_VERSION = REMOTE_PLUGIN_VERSION;
const LOCAL_RUNTIME_CAPABILITIES = Object.freeze(["ppt-create", "project-audit"]);
const LOCAL_RUNTIME_SOURCE_PATHS = Object.freeze([
  "packages/capability-contracts", "packages/capability-manifests", "packages/capability-runtime", "packages/cli", "packages/mcp-server", "packages/remote-mcp-server", "packages/project-audit-core", "packages/ppt-create-core", "packages/ppt-improve-core", "packages/ppt-quality-core", "packages/slideclone-core", "packages/team-runtime",
  "scripts/verify-plugins.js", "scripts/verify-capability-contracts.js", "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder", "skills/pd-hifi-slideclone/scripts/adapters/pptx-openxml-dotnet.js", "skills/pd-hifi-slideclone/scripts/lib", "package.json"
]);
const REMOTE_CAPABILITY_GUIDANCE = Object.freeze({
  "image-to-editable": Object.freeze({ contentType: "application/gzip", input: "one approved source archive containing one image, an explicitly ordered image batch, one PDF, or one image-based PPTX accepted by the service" }),
  "project-audit": Object.freeze({ contentType: "application/gzip", input: "a single approved project archive containing only the intended audit input" }),
  "ppt-quality": Object.freeze({ contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", input: "one approved PPTX file" }),
  "ppt-improve": Object.freeze({ contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", input: "one approved PPTX file; the service audits it first and only creates a separate improved PPTX when a safe repair is available" }),
  "ppt-create": Object.freeze({ contentType: "application/json", alternateContentType: "application/gzip", input: "one approved PresentationSpec 1.0 JSON file, or one hash-bound ppt-create archive when assets or a user-owned template are declared" })
});
const REMOTE_CAPABILITY_SCOPES = Object.freeze(Object.fromEntries(CAPABILITIES.map((capability) => [capability, `common-tools:capability:${capability}`])));

function usage() { return "usage: node scripts/generate-remote-plugin-bundles.js --origin <https://host> --output <empty-directory> --capabilities image-to-editable,ppt-create,ppt-improve,ppt-quality,project-audit [--host codex|claude|all] [--layout bundle|split]"; }
function parseOrigin(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("--origin is required");
  let url;
  try { url = new URL(value); } catch { throw new Error("--origin must be an absolute HTTPS origin URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("--origin must be an absolute HTTPS origin URL");
  return url.origin;
}
function parseCapabilities(value) {
  if (value === undefined) return CAPABILITIES;
  if (typeof value !== "string") throw new Error("--capabilities is invalid");
  const capabilities = value.split(",").map((item) => item.trim());
  if (!capabilities.length || capabilities.some((capability) => !CAPABILITIES.includes(capability)) || new Set(capabilities).size !== capabilities.length) throw new Error("--capabilities is invalid");
  return Object.freeze([...capabilities].sort());
}
function parseLayout(value) {
  if (value === undefined) return "bundle";
  if (value !== "bundle" && value !== "split") throw new Error("--layout must be bundle or split");
  return value;
}
function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--") || values.has(argument) || index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(usage());
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  for (const key of values.keys()) if (!["--origin", "--output", "--host", "--capabilities", "--layout"].includes(key)) throw new Error(usage());
  const host = values.get("--host") || "all";
  if (!["codex", "claude", "all"].includes(host)) throw new Error("--host must be codex, claude, or all");
  const output = values.get("--output");
  if (typeof output !== "string" || !output.trim()) throw new Error("--output is required");
  if (!values.has("--capabilities")) throw new Error("--capabilities is required");
  return Object.freeze({ origin: parseOrigin(values.get("--origin")), output: path.resolve(output), hosts: host === "all" ? ["codex", "claude"] : [host], capabilities: parseCapabilities(values.get("--capabilities")), layout: parseLayout(values.get("--layout")) });
}
function assertEmptyNewDirectory(output) {
  if (fs.existsSync(output)) throw new Error("--output must not already exist");
  const parent = path.dirname(output);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error("--output parent directory is unavailable");
}
function pluginName(capability) {
  return capability ? `common-tools-remote-${capability}` : "common-tools-remote";
}
function sha256File(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function listFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
function localRuntimeInstaller() {
  return `param(
  [ValidateSet("local-preferred", "remote-only", "local-only")]
  [string]$ExecutionMode = "local-preferred"
)

$ErrorActionPreference = "Stop"
$payloadRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$manifestFile = Join-Path $payloadRoot "payload-manifest.json"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 18 or newer is required for the Common Tools local runtime" }
$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(1[89]|[2-9][0-9])\\.') { throw "Node.js 18 or newer is required for the Common Tools local runtime" }
try { $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json -ErrorAction Stop } catch { throw "Common Tools local runtime manifest is invalid" }
if ($manifest.schemaVersion -ne 1 -or $manifest.runtimeVersion -ne "${LOCAL_RUNTIME_VERSION}" -or @($manifest.files).Count -eq 0) { throw "Common Tools local runtime manifest is invalid" }
foreach ($entry in @($manifest.files)) {
  if ($entry -isnot [pscustomobject] -or $entry.path -isnot [string] -or $entry.sha256 -isnot [string] -or $entry.path.Length -eq 0 -or $entry.path.Length -gt 512 -or $entry.path.Contains("..") -or [IO.Path]::IsPathRooted($entry.path) -or $entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw "Common Tools local runtime manifest is invalid" }
  $file = Join-Path $payloadRoot $entry.path
  if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Common Tools local runtime payload verification failed" }
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw "LOCALAPPDATA is unavailable; cannot install the local runtime" }
$base = Join-Path $env:LOCALAPPDATA "CommonTools"
$runtimeRoot = Join-Path $base "local-runtime"
$target = Join-Path $runtimeRoot "${LOCAL_RUNTIME_VERSION}"
if (-not (Test-Path -LiteralPath $target)) {
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  $staging = Join-Path $runtimeRoot ("${LOCAL_RUNTIME_VERSION}.staging-" + [Guid]::NewGuid().ToString("N"))
  try {
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    Copy-Item -LiteralPath $payloadRoot -Destination (Join-Path $staging "payload") -Recurse -Force
    $staged = Join-Path $staging "payload"
    foreach ($entry in @($manifest.files)) {
      $file = Join-Path $staged $entry.path
      if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Common Tools local runtime staging verification failed" }
    }
    Move-Item -LiteralPath $staged -Destination $target -ErrorAction Stop
  } finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
  }
}
$bin = Join-Path $base "bin"
New-Item -ItemType Directory -Path $bin -Force | Out-Null
$shim = Join-Path $bin "common-tools.cmd"
$marker = "REM Common Tools managed local runtime"
$shimBody = "@echo off" + [Environment]::NewLine + $marker + [Environment]::NewLine + "node " + [char]34 + "%~dp0..\\local-runtime\\${LOCAL_RUNTIME_VERSION}\\packages\\cli\\bin\\common-tools.js" + [char]34 + " %*" + [Environment]::NewLine
if ((Test-Path -LiteralPath $shim) -and -not ((Get-Content -LiteralPath $shim -Raw) -like "*$marker*")) { throw "Refusing to replace an unmanaged common-tools command shim: $shim" }
Set-Content -LiteralPath $shim -Value $shimBody -NoNewline -Encoding ascii
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$segments = @($userPath -split ';' | Where-Object { $_ })
if ($segments -notcontains $bin) {
  $newUserPath = @($segments + $bin) -join ';'
  [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
  $env:Path = "$bin;$env:Path"
}
$config = [ordered]@{ schemaVersion = 1; executionMode = $ExecutionMode; installedRuntimeVersion = "${LOCAL_RUNTIME_VERSION}" }
New-Item -ItemType Directory -Path $base -Force | Out-Null
$configFile = Join-Path $base "runtime.json"
$temporary = "$configFile.$PID.tmp"
$config | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding utf8 -NoNewline
Move-Item -LiteralPath $temporary -Destination $configFile -Force
Write-Host "Common Tools local runtime is ready: $target"
Write-Host "Execution mode: $ExecutionMode"
Write-Host "Open a new terminal before using common-tools from PATH."
`;
}
function writeLocalRuntimePayload(hostRoot) {
  const payloadRoot = path.join(hostRoot, "local-runtime");
  fs.mkdirSync(payloadRoot, { recursive: true });
  for (const relative of LOCAL_RUNTIME_SOURCE_PATHS) {
    const source = path.join(REPOSITORY_ROOT, relative);
    if (!fs.existsSync(source)) throw new Error(`local runtime source is unavailable: ${relative}`);
    const destination = path.join(payloadRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, force: false, filter: (file) => !["node_modules", ".git", ".codex", ".common-tools", "runs"].includes(path.basename(file)) });
  }
  const files = listFiles(payloadRoot).map((file) => ({ path: path.relative(payloadRoot, file).split(path.sep).join("/"), sha256: sha256File(file) })).sort((left, right) => left.path.localeCompare(right.path));
  fs.writeFileSync(path.join(payloadRoot, "payload-manifest.json"), `${JSON.stringify({ schemaVersion: 1, runtimeVersion: LOCAL_RUNTIME_VERSION, files }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(payloadRoot, "install-local-runtime.ps1"), localRuntimeInstaller(), "utf8");
}
function pluginMetadata(host, name = pluginName(), capabilities = CAPABILITIES) {
  const description = capabilities.length === 1
    ? `Use the ${capabilities[0]} Common Tools capability with its declared local or remote execution policy.`
    : "Use Common Tools capabilities with declared local-first or remote execution policies.";
  const shared = { name, version: REMOTE_PLUGIN_VERSION, description, author: { name: "common-tools" } };
  if (host === "claude") return shared;
  return {
    ...shared,
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: capabilities.length === 1 ? `Common Tools: ${capabilities[0]}` : "Common Tools",
      shortDescription: capabilities.length === 1 ? `Use ${capabilities[0]} with its execution policy.` : "Use local-first and remote Common Tools capabilities.",
      longDescription: `Provides the installed ${capabilities.join(", ")} capability skill${capabilities.length === 1 ? "" : "s"}, a versioned optional local runtime, and a single remote MCP entry when remote execution is selected.`,
      developerName: "common-tools",
      category: "Productivity",
      capabilities: ["Read", "Write"],
      defaultPrompt: [capabilities.includes("project-audit") ? "Ask me to choose a numbered project-audit scope before executing the approved audit." : "Use the installed common-tools capability to process this approved input."]
    }
  };
}
function marketplaceMetadata(host, plugins = [{ name: pluginName(), capabilities: CAPABILITIES }], installationPolicy = host === "codex" ? "INSTALLED_BY_DEFAULT" : undefined) {
  if (host === "codex" && !["AVAILABLE", "INSTALLED_BY_DEFAULT"].includes(installationPolicy)) throw new TypeError("Codex installation policy is invalid");
  const entries = plugins.map(({ name, capabilities }) => ({
    name,
    capabilities,
    description: capabilities.length === 1 ? `Connect to the remote ${capabilities[0]} common-tools capability.` : "Connect to an approved remote common-tools MCP service."
  }));
  if (host === "codex") return {
    name: "common-tools-remote",
    interface: { displayName: "Common Tools" },
    plugins: entries.map((entry) => ({
      name: entry.name,
      source: { source: "local", path: `./plugins/${entry.name}` },
      policy: { installation: installationPolicy, authentication: "ON_INSTALL" },
      category: "Productivity"
    }))
  };
  return {
    name: "common-tools-remote",
    description: "Installable local-first and remote Common Tools capabilities.",
    owner: { name: "common-tools" },
    plugins: entries.map((entry) => ({ name: entry.name, source: `./plugins/${entry.name}`, description: entry.description }))
  };
}
function installGuide(host, origin, capabilities, layout = "bundle") {
  const install = host === "codex" ? "codex plugin add" : "claude plugin install";
  const plugins = layout === "split" ? capabilities.map((capability) => pluginName(capability)) : [pluginName()];
  const commands = ["codex plugin marketplace add .".replace("codex", host === "codex" ? "codex" : "claude")];
  for (const name of plugins) commands.push(`${install} ${name}@common-tools-remote`);
  const selectionNote = layout === "split"
    ? "Each capability is a separate plugin. Install only the plugin or plugins you intend to use."
    : `This Marketplace contains one Common Tools plugin with one capability-router Skill. Its installer lets you choose from: ${capabilities.join(", ")}.`;
  const codes = capabilities.map((capability) => `${REMOTE_CAPABILITY_CODES[capability]}=${capability}`).join(", ");
  const installer = layout === "split"
    ? `On Windows, \`.\\install.ps1\` asks which separate plugins to install, then asks for the execution mode. Enter capability codes (${codes}; \`0\` means all). For automation, use \`.\\install.ps1 -Capabilities 1 -ExecutionMode local-preferred\` (names remain supported) or \`.\\install.ps1 -AllCapabilities -ExecutionMode remote-only\`.`
    : `On Windows, run \`.\\install.ps1\`, select one or more capability codes (${codes}; \`0\` means all), then select the execution mode. For automation, use \`.\\install.ps1 -Capabilities 1 -ExecutionMode local-preferred\` (names remain supported) or \`.\\install.ps1 -AllCapabilities -ExecutionMode remote-only\`.`;
  const codexMcpNote = host === "codex"
    ? `For Codex, use the included installer rather than only running the two marketplace commands: before changing the client, it verifies the remote \`/readyz\` endpoint and that the selected capability scopes are advertised. It then registers one global \`common-tools\` HTTP MCP server at \`${origin}/mcp\`, binds the public OAuth client \`common-tools-mcp\`, and starts the browser login. This avoids relying on host-specific plugin MCP auto-registration.\n\n`
    : "";
  const auditModeNote = capabilities.includes("project-audit")
    ? "Execution modes are explicit: `local-preferred` installs a versioned Local Runtime only when a selected capability supports it and keeps project-audit local by default; `remote-only` installs no Local Runtime; `local-only` rejects selected capabilities that require remote execution. The Local Runtime requires Node.js 18+, is installed under `%LOCALAPPDATA%\\CommonTools`, exposes a managed `common-tools` command shim, and records the selected policy. It never uploads source by default.\n\n"
    : "";
  return `# Install Common Tools\n\nThis Marketplace connects to \`${origin}/mcp\` when remote execution is selected. ${selectionNote} From this directory, run:\n\n\`\`\`text\n${commands.join("\n")}\n\`\`\`\n\n${installer}\n\nThe included \`verify-connection.ps1\` checks remote readiness and advertised selected capabilities without reading credentials. Run it again after a server upgrade or when a capability is unavailable.\n\n${codexMcpNote}${auditModeNote}Then start a new ${host === "codex" ? "Codex" : "Claude Code"} session. Complete OAuth only when the selected policy needs remote execution. This package contains no database, object-storage, Keycloak administrator, or static access credentials.\n`;
}
function connectionVerificationScript(origin, capabilities) {
  const parameter = `param(\n  [ValidateSet(${capabilities.map((capability) => `"${capability}"`).join(", ")})]\n  [string[]]$Capabilities\n)\n\n`;
  const available = capabilities.map((capability) => `"${capability}"`).join(", ");
  return `${parameter}$ErrorActionPreference = "Stop"\n$availableCapabilities = @(${available})\n$selected = if ($Capabilities.Count -gt 0) { @($Capabilities) } else { @($availableCapabilities) }\nif ($selected.Count -eq 0) { throw "At least one capability must be selected" }\nif (@($selected | Where-Object { $availableCapabilities -notcontains $_ }).Count -ne 0) { throw "Capabilities contain an unsupported value" }\nif (@($selected | Select-Object -Unique).Count -ne $selected.Count) { throw "Capabilities must not contain duplicates" }\n\nfunction Read-BoundedResponse([System.Net.Http.HttpResponseMessage]$Response, [int]$MaximumBytes) {\n  $declaredLength = $Response.Content.Headers.ContentLength\n  if ($null -ne $declaredLength -and $declaredLength -gt $MaximumBytes) { throw "Remote response is too large" }\n  $stream = $Response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()\n  $buffer = New-Object byte[] 4096\n  $memory = [System.IO.MemoryStream]::new()\n  try {\n    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {\n      if ($memory.Length + $read -gt $MaximumBytes) { throw "Remote response is too large" }\n      $memory.Write($buffer, 0, $read)\n    }\n    return [System.Text.Encoding]::UTF8.GetString($memory.ToArray())\n  } finally {\n    $memory.Dispose()\n    $stream.Dispose()\n  }\n}\n\nfunction Get-RemoteResponse([string]$Path) {\n  $handler = [System.Net.Http.HttpClientHandler]::new()\n  $client = [System.Net.Http.HttpClient]::new($handler)\n  $client.Timeout = [TimeSpan]::FromSeconds(8)\n  try {\n    $response = $client.GetAsync("${origin}$Path", [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()\n    try { return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Body = Read-BoundedResponse $response 16384 } }\n    finally { $response.Dispose() }\n  } finally {\n    $client.Dispose()\n    $handler.Dispose()\n  }\n}\n\n$ready = Get-RemoteResponse "/readyz"\nif ($ready.StatusCode -ne 200) { throw "Remote Common Tools service is not ready" }\ntry { $readyBody = $ready.Body | ConvertFrom-Json -ErrorAction Stop } catch { throw "Remote readiness response is invalid" }\nif ($null -eq $readyBody -or $readyBody.status -ne "ok") { throw "Remote Common Tools service is not ready" }\n\n$metadata = Get-RemoteResponse "/.well-known/oauth-protected-resource/mcp"\nif ($metadata.StatusCode -ne 200) { throw "Remote capability metadata is unavailable" }\ntry { $metadataBody = $metadata.Body | ConvertFrom-Json -ErrorAction Stop } catch { throw "Remote capability metadata is invalid" }\n$scopes = @($metadataBody.scopes_supported)\nif ($scopes.Count -gt 64 -or @($scopes | Where-Object { $_ -isnot [string] -or $_.Length -gt 128 }).Count -ne 0 -or @($scopes | Select-Object -Unique).Count -ne $scopes.Count) { throw "Remote capability metadata is invalid" }\n$missingScopes = @($selected | ForEach-Object { "common-tools:capability:$_" } | Where-Object { $scopes -notcontains $_ })\nif ($missingScopes.Count -gt 0) { throw "Remote service does not advertise every selected capability" }\nWrite-Host "Remote Common Tools verification passed: $($selected -join ', ')"\n`;
}
function installationScript(host, origin, capabilities, layout) {
  const executable = host === "codex" ? "codex" : "claude";
  const installCommand = host === "codex" ? "plugin add" : "plugin install";
  const plugins = layout === "split"
    ? capabilities.map((capability) => ({ capability, name: pluginName(capability) }))
    : [{ capability: null, name: pluginName() }];
  const parameter = "param(\n  [string[]]$Capabilities,\n  [switch]$AllCapabilities,\n  [ValidateSet(\"local-preferred\", \"remote-only\", \"local-only\")]\n  [string]$ExecutionMode\n)\n\n";
  const mapping = plugins.map(({ capability, name }) => `  "${capability || "bundle"}" = "${name}"`).join("\n");
  const capabilityCodes = capabilities.map((capability) => `  "${REMOTE_CAPABILITY_CODES[capability]}" = "${capability}"`).join("\n");
  const selection = `$availableCapabilities = @(${capabilities.map((capability) => `"${capability}"`).join(", ")})
$capabilityCodes = @{
${capabilityCodes}
}
function Resolve-CapabilitySelection([string[]]$Values) {
  $raw = @($Values | ForEach-Object { [string]$_ -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ } })
  if ($raw.Count -eq 0) { throw "At least one capability code or name must be selected" }
  if ($raw -contains "0") {
    if ($raw.Count -ne 1) { throw "Capability code 0 must be used by itself" }
    return @($availableCapabilities)
  }
  $selected = @(
    foreach ($value in $raw) {
      if ($capabilityCodes.ContainsKey($value)) { $capabilityCodes[$value]; continue }
      if ($availableCapabilities -contains $value) { $value; continue }
      throw "Unsupported capability code or name: $value"
    }
  )
  if (@($selected | Select-Object -Unique).Count -ne $selected.Count) { throw "Capabilities must not contain duplicates" }
  return @($selected)
}
$providedCapabilities = @($Capabilities | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
if ($AllCapabilities -and $providedCapabilities.Count -gt 0) { throw "-AllCapabilities and -Capabilities cannot be used together" }
if ($AllCapabilities) {
  $selected = @($availableCapabilities)
} elseif ($providedCapabilities.Count -gt 0) {
  $selected = Resolve-CapabilitySelection @($providedCapabilities)
} else {
  Write-Host "Available Common Tools capabilities:"
  foreach ($code in @($capabilityCodes.Keys | Sort-Object { [int]$_ })) { Write-Host "  $code. $($capabilityCodes[$code])" }
  Write-Host "  0. all listed capabilities"
  $entered = Read-Host "Select capability codes (comma-separated; 0 enables all)"
  $selected = Resolve-CapabilitySelection @($entered)
}
if ($selected.Count -eq 0) { throw "At least one capability must be selected" }
$localCapabilities = @(${LOCAL_RUNTIME_CAPABILITIES.map((capability) => `"${capability}"`).join(", ")})
if ([string]::IsNullOrWhiteSpace($ExecutionMode)) {
  Write-Host "Execution modes:"
  Write-Host "  1. local-preferred (recommended: run supported work locally; remote only when required)"
  Write-Host "  2. remote-only (do not install a local runtime)"
  Write-Host "  3. local-only (do not configure or authorize remote execution)"
  $modeChoice = Read-Host "Select execution mode (1, 2, or 3)"
  $ExecutionMode = switch ($modeChoice.Trim()) { "1" { "local-preferred" } "2" { "remote-only" } "3" { "local-only" } default { throw "Execution mode must be 1, 2, or 3" } }
}
$selectedLocal = @($selected | Where-Object { $localCapabilities -contains $_ })
$selectedRemoteOnly = @($selected | Where-Object { $localCapabilities -notcontains $_ })
if ($ExecutionMode -eq "local-only" -and $selectedRemoteOnly.Count -gt 0) { throw "Local-only mode cannot install capabilities that require remote execution: $($selectedRemoteOnly -join ', ')" }
$remoteSelected = if ($ExecutionMode -eq "remote-only") { @($selected) } else { @($selectedRemoteOnly) }
Write-Host "Installing Common Tools capabilities: $($selected -join ', ')"
Write-Host "Execution mode: $ExecutionMode"
${layout === "split" ? "$pluginNames = @($selected | ForEach-Object { $plugins[$_] })" : "$pluginNames = @($plugins[\"bundle\"])"}
`;
  const scopeMapping = capabilities.map((capability) => `  "${capability}" = "${REMOTE_CAPABILITY_SCOPES[capability]}"`).join("\n");
  const codexMcpRegistration = host === "codex" ? `$serverName = "common-tools"\n$serverUrl = "${origin}/mcp"\n$oauthScopesByCapability = @{\n${scopeMapping}\n}\n$existingJson = @(& codex mcp get $serverName --json 2>$null)\n$existingExitCode = $LASTEXITCODE\n$needsRegistration = $true\nif ($existingExitCode -eq 0) {\n  $existing = (($existingJson -join "\`n") | ConvertFrom-Json)\n  if ($existing.url -ne $serverUrl) { throw "Codex MCP '$serverName' already points to a different URL. Remove or rename that server before installing this package." }\n  $hasExpectedClient = $existing.oauth_client_id -eq "common-tools-mcp"\n  $hasStaticResource = -not [string]::IsNullOrWhiteSpace([string]$existing.oauth_resource)\n  $needsRegistration = -not ($hasExpectedClient -and -not $hasStaticResource)\n  if ($needsRegistration) {\n    & codex mcp remove $serverName\n    if ($LASTEXITCODE -ne 0) { throw "Codex MCP legacy configuration removal failed" }\n  }\n} elseif ($existingExitCode -ne 1) {\n  throw "Unable to inspect existing Codex MCP configuration"\n}\nif ($needsRegistration) {\n  & codex mcp add $serverName --url $serverUrl --oauth-client-id "common-tools-mcp"\n  if ($LASTEXITCODE -ne 0) { throw "Codex MCP registration failed" }\n}\n$oauthScopes = [string]::Join(",", @($remoteSelected | ForEach-Object { $oauthScopesByCapability[$_] }))\n& codex mcp login $serverName --scopes $oauthScopes\nif ($LASTEXITCODE -ne 0) { throw "Codex MCP OAuth login failed" }\n\n` : "";
  const normalizedCodexMcpRegistration = codexMcpRegistration.replace(
    `  if ($existing.url -ne $serverUrl) { throw "Codex MCP '$serverName' already points to a different URL. Remove or rename that server before installing this package." }`,
    `  # Preserve OAuth state for the current endpoint, and safely migrate only\n  # historical Common Tools root/MCP paths on this exact HTTPS origin.\n  $existingUrlValue = if ($null -ne $existing.transport -and $existing.transport.type -eq "streamable_http" -and -not [string]::IsNullOrWhiteSpace([string]$existing.transport.url)) { [string]$existing.transport.url } else { [string]$existing.url }\n  $existingUrl = $existingUrlValue.TrimEnd("/")\n  $expectedUrl = $serverUrl.TrimEnd("/")\n  if ($existingUrl -ne $expectedUrl) {\n    $existingUri = $null\n    try { $existingUri = [Uri]$existingUrlValue } catch { }\n    $expectedUri = [Uri]$serverUrl\n    $hasAbsoluteExistingUri = $null -ne $existingUri -and $existingUri.IsAbsoluteUri\n    $sameOrigin = $hasAbsoluteExistingUri -and $existingUri.Scheme -eq "https" -and [string]::IsNullOrWhiteSpace($existingUri.UserInfo) -and $existingUri.Query.Length -eq 0 -and $existingUri.Fragment.Length -eq 0 -and $existingUri.GetLeftPart([UriPartial]::Authority) -eq $expectedUri.GetLeftPart([UriPartial]::Authority)\n    $legacyPath = if (-not $hasAbsoluteExistingUri) { $null } else { $existingUri.AbsolutePath.TrimEnd("/") }\n    if (-not ($sameOrigin -and $legacyPath -in @("", "/mcp"))) { throw "Codex MCP '$serverName' already points to a different URL. Remove or rename that server before installing this package." }\n    # Force re-registration below after a safe legacy-path migration.\n    $existing.oauth_client_id = $null\n  }`
  );
  const configuredCodexMcpRegistration = normalizedCodexMcpRegistration
    .replace(
      `  $existingUrlValue = if ($null -ne $existing.transport -and $existing.transport.type -eq "streamable_http" -and -not [string]::IsNullOrWhiteSpace([string]$existing.transport.url)) { [string]$existing.transport.url } else { [string]$existing.url }`,
      `  if (-not ($existing.PSObject.Properties.Name -contains "oauth_client_id")) { $existing | Add-Member -NotePropertyName oauth_client_id -NotePropertyValue "common-tools-mcp" }
  if (-not ($existing.PSObject.Properties.Name -contains "oauth_resource")) { $existing | Add-Member -NotePropertyName oauth_resource -NotePropertyValue $null }
  $existingUrlValue = if ($null -ne $existing.transport -and $existing.transport.type -eq "streamable_http" -and -not [string]::IsNullOrWhiteSpace([string]$existing.transport.url)) { [string]$existing.transport.url } else { [string]$existing.url }`
    )
    .replace(
      `$needsRegistration = $true
if ($existingExitCode -eq 0) {`,
      `$needsRegistration = $true
$registeredNow = $false
if ($existingExitCode -eq 0) {`
    )
    .replace(
      `  if ($LASTEXITCODE -ne 0) { throw "Codex MCP registration failed" }
}
$oauthScopes`,
      `  if ($LASTEXITCODE -ne 0) { throw "Codex MCP registration failed" }
  $registeredNow = $true
}
$oauthScopes`
    )
    .replace(
      `& codex mcp login $serverName --scopes $oauthScopes
if ($LASTEXITCODE -ne 0) { throw "Codex MCP OAuth login failed" }`,
      `if (-not $registeredNow) {
  & codex mcp login $serverName --scopes $oauthScopes
  if ($LASTEXITCODE -ne 0) { throw "Codex MCP OAuth login failed" }
}`
    );
  const managedPluginNames = [pluginName(), ...CAPABILITIES.map((capability) => pluginName(capability))];
  const marketplaceRegistration = host === "codex" ? `$marketplaceName = "common-tools-remote"
function Get-NormalizedLocalPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  try { return (Resolve-Path -LiteralPath $Value -ErrorAction Stop).Path.TrimEnd([char[]]@('\\', '/')) } catch { return $null }
}
function Test-ManagedCommonToolsMarketplace([string]$MarketplaceRoot) {
  $metadataPath = Join-Path $MarketplaceRoot ".agents/plugins/marketplace.json"
  if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { return $false }
  try { $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json -ErrorAction Stop } catch { return $false }
  if ($metadata.name -ne $marketplaceName) { return $false }
  return @($metadata.plugins | Where-Object { $_.name -eq "common-tools-remote" -and $_.source.source -eq "local" }).Count -eq 1
}
$marketplaceJson = @(& codex plugin marketplace list --json 2>$null)
$marketplaceExitCode = $LASTEXITCODE
if ($marketplaceExitCode -ne 0) { throw "Unable to inspect configured Codex plugin marketplaces" }
try { $marketplaceSnapshot = (($marketplaceJson -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop) } catch { throw "Configured Codex plugin marketplaces are invalid" }
$matchingMarketplaces = @($marketplaceSnapshot.marketplaces | Where-Object { $_.name -eq $marketplaceName })
if ($matchingMarketplaces.Count -gt 1) { throw "More than one Codex plugin marketplace has the Common Tools name" }
$addMarketplace = $true
if ($matchingMarketplaces.Count -eq 1) {
  $existingMarketplace = $matchingMarketplaces[0]
  $existingMarketplaceRoot = Get-NormalizedLocalPath ([string]$existingMarketplace.root)
  $expectedMarketplaceRoot = Get-NormalizedLocalPath $root
  if ($null -ne $existingMarketplaceRoot -and $null -ne $expectedMarketplaceRoot -and [string]::Equals($existingMarketplaceRoot, $expectedMarketplaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $addMarketplace = $false
  } elseif (Test-ManagedCommonToolsMarketplace ([string]$existingMarketplace.root)) {
    & codex plugin marketplace remove $marketplaceName
    if ($LASTEXITCODE -ne 0) { throw "Codex Common Tools marketplace replacement failed" }
  } else {
    throw "Codex plugin marketplace '$marketplaceName' already points to an unrelated source. Remove or rename it before installing this package."
  }
}
if ($addMarketplace) {
  & codex plugin marketplace add $root
  if ($LASTEXITCODE -ne 0) { throw "Codex plugin marketplace add failed" }
}
$managedPluginNames = @(${managedPluginNames.map((name) => `"${name}"`).join(", ")})
$pluginListJson = @(& codex plugin list --json 2>$null)
$pluginListExitCode = $LASTEXITCODE
if ($pluginListExitCode -ne 0) { throw "Unable to inspect installed Codex plugins" }
try { $pluginSnapshot = (($pluginListJson -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop) } catch { throw "Installed Codex plugins are invalid" }
$legacyPlugins = @($pluginSnapshot.installed | Where-Object { $_.marketplaceName -eq $marketplaceName -and $managedPluginNames -contains $_.name })
foreach ($legacyPlugin in $legacyPlugins) {
  & codex plugin remove "$($legacyPlugin.name)@$marketplaceName"
  if ($LASTEXITCODE -ne 0) { throw "Codex Common Tools plugin migration failed" }
}

` : `& ${executable} plugin marketplace add $root
if ($LASTEXITCODE -ne 0) { throw "${executable} plugin marketplace add failed" }

`;
  const localRuntimeInstall = capabilities.some((capability) => LOCAL_RUNTIME_CAPABILITIES.includes(capability))
    ? `if ($ExecutionMode -ne "remote-only" -and $selectedLocal.Count -gt 0) {\n  & (Join-Path $root "local-runtime\\install-local-runtime.ps1") -ExecutionMode $ExecutionMode\n  if ($LASTEXITCODE -ne 0) { throw "Common Tools local runtime installation failed" }\n}\n`
    : "";
  const remoteInstall = `if ($remoteSelected.Count -gt 0) {\n  & (Join-Path $root "verify-connection.ps1") -Capabilities $remoteSelected\n${configuredCodexMcpRegistration}}\n`;
  return `${parameter}$ErrorActionPreference = "Stop"\n$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path\n$plugins = @{\n${mapping}\n}\n${selection}${localRuntimeInstall}${remoteInstall}${marketplaceRegistration}foreach ($pluginName in $pluginNames) {\n  & ${executable} ${installCommand} "${'$'}pluginName@common-tools-remote"\n  if ($LASTEXITCODE -ne 0) { throw "${executable} plugin installation failed" }\n}\n`;
}
function remoteSkill(capability) {
  const guidance = REMOTE_CAPABILITY_GUIDANCE[capability];
  if (!guidance) throw new TypeError("remote capability guidance is invalid");
  if (capability === "image-to-editable") return `---
name: image-to-editable
description: Convert approved images, a PDF, or an image-based PPTX into an editable PPTX using the hosted Common Tools Runtime.
---

Use only the installed \`common-tools\` remote MCP server and user-approved PNG/JPEG images, one PDF, or one image-based PPTX packaged as the bounded gzip TAR described by the installation guide. The archive may contain one \`assets/source.<ext>\` image entry, a contiguous image batch named \`assets/source-001.<ext>\` through \`assets/source-020.<ext>\`, or exactly one \`assets/source.pdf\` or \`assets/source.pptx\`. Upload it as \`application/gzip\` with \`create_team_upload_target\`, submit \`image-to-editable\` with \`create_team_job\` and a fresh opaque idempotency key, and poll only the returned job. Download only a reported artifact through \`get_team_artifact_target\`. Never expose or reuse signed URLs.

On success, inspect the complete bounded quality result before downloading a reported artifact. An image batch must pass \`raw-image-batch-validated\`; a PDF/PPTX must pass \`document-pages-normalized\`. Pages are rebuilt in declared/source order and fidelity metrics report the worst compared page. When a fidelity residual is present, require \`residual-native-duplicates-removed\`; this proves reconstructed native objects were removed from the raster residual so moving them will not reveal duplicate pixels. Describe the result as visually verified only when this gate, \`quality-rendered\`, and \`visual-fidelity\` pass. The residual may still contain complex details that were not confidently reconstructed, so do not describe every visual as native.
`;
  if (capability === "ppt-create") return `---
name: ppt-create
description: Create a new editable presentation from structured content or a bounded local document, with provenance-aware assets, safe user-owned templates, alternatives, citations, and notes.
---

Use the user-facing phrase “创建 PPT”; reserve \`ppt-create\` for the capability ID. Use the repository-owned PresentationSpec 1.0 schema and independent themes. Accept an approved spec directly, or locally run \`common-tools ppt ingest\` for bounded Markdown, DOCX, or PDF input. Do not copy Dashi or any third-party template, asset, schema, implementation code, prompt, or layout coordinate.

For long structured material, use the repository-owned PresentationBrief 1.0 contract and run \`common-tools ppt plan --input <brief.json> --out <presentation.json>\` locally. Preserve every source and required point, enforce the slide budget, pass \`planning-source-covered\` and \`planning-required-points-covered\`, and Never silently truncate content. \`variantCount\` controls per-slide candidates; \`deckVariantCount\` controls up to three structurally distinct whole-deck alternatives. Require \`layout-candidates-available\` and \`layout-selection-resolved\`.

Local media uses a hash-bound PNG/JPEG asset manifest with provenance and license; require \`asset-provenance-verified\`, \`semantic-visuals-resolved\`, \`semantic-component-plan-resolved\`, and \`native-data-editable\`. Local user-owned PPTX templates may import only safe master/theme data after rejecting macros, embedded objects, external relationships, invalid packages, and generated or unlicensed provenance; require \`template-package-safe\`. Slides may include bounded citations and speaker notes; require \`citations-editable\` and \`speaker-notes-native\`.

Run \`common-tools runtime resolve --capability ppt-create\` when the Local Runtime is available. For local execution, enable the capability and run \`common-tools ppt create --input <presentation.json> --out <new-directory>\`. The output directory must not exist.

Table and chart editing uses controlled visual panels instead of raw chart JSON, with the server-side IR validator remaining authoritative.

The local \`deck.preview.html\` editor persists spec edits through \`ppt apply-edit\` and direct Deck IR edits through revision-bound patches. The direct editor supports page-scoped 4pt drag snapping, validated style/layer operations, bounded text/shape add, object duplicate/delete, local image-path replacement, native table/chart data editing, and add/duplicate/delete/reorder page lifecycle operations; require \`ir-batch-style-validated\`, \`ir-object-lifecycle-validated\`, \`ir-page-lifecycle-validated\`, \`semantic-table-data-editable\`, and \`semantic-chart-data-editable\`. Use \`ppt edit-session\` for a \`loopback-editor-session-bound\` browser session with one-click atomic export, or \`ppt finalize-ir-edit\` for file-based automation; \`ppt apply-ir-edit\` and \`ppt export-ir\` remain available separately. For natural-language input, locally use \`ppt draft\` for a reviewable Spec or \`ppt compose\` for the bounded prompt-to-Brief-to-Spec-to-deck chain; require \`prompt-source-hash-recorded\`. An optional Provider requires both \`--provider-config\` and \`--provider-id\`; the file-only configuration may register no more than eight fixed HTTPS Providers. DOCX tables and PDF page headings must pass \`document-visual-structure-preserved\`; template layout/placeholder mapping must pass \`template-semantic-layout-mapped\`; image conversions must retain the \`complex-graphic-native-gate\`. For explicit remote execution, use a file-free spec or prompt envelope as \`application/json\`. When the spec binds assets or a user-owned template, first run \`common-tools ppt archive --input <presentation.json> --out <new.tar.gz>\` and use that exact hash-bound archive as \`application/gzip\`. Call \`create_team_upload_target\` with the selected content type and exact byte length, upload only to its returned URL, then submit capability \`ppt-create\` with \`create_team_job\`. The Worker rejects undeclared files, links, traversal, excess size, hash drift, unsafe templates, and mismatched provenance. Poll only the returned job and call \`get_team_artifact_target\` only for reported artifacts.

Every run reports \`deck.ir.json\`, \`deck.preview.html\`, \`deck.html\`, \`deck.pptx\`, \`deck.pdf\`, both reports, \`edit-finalization-report.json\`, and \`asset-manifest.json\`. Add \`template-manifest.json\` only for an applied template. For multiple whole-deck alternatives, add \`deck.variants.json\` and numbered secondary deck artifacts. This bounded dynamic artifact contract must pass \`multi-format-page-count-matches\` and \`multi-format-source-fingerprint-matches\`.
`;
  if (capability === "project-audit") return `---
name: project-audit
description: Audit an approved project locally by default, with an explicit remote team-audit option.
---

Use this Skill only for a user-approved workspace. Before executing, ask “请选择项目审计范围（可输入单个编号或用逗号组合）：1. 全部四域（推荐）；2. 产品闭环；3. 视觉、交互与无障碍；4. 数据、权限与可靠性；5. 工程与交付。” Wait for the reply unless the request already names exact domains. Accept \`1\` only by itself or a unique combination such as \`2,3\`; reject invalid, empty, duplicate, or mixed \`1,other\` input. Map choices to \`all\`, \`product-journey\`, \`visual-interaction\`, \`data-security\`, and \`engineering-delivery\`. Choice 1 does not authorize gates, browser work, upload, or full mode. First run \`common-tools runtime resolve --capability project-audit\` when the local Runtime is available. The resolved execution policy is authoritative: \`local-preferred\` uses local project-audit by default, \`remote-only\` uses remote execution, and \`local-only\` prohibits remote upload. If the local Runtime is unavailable and the user did not explicitly request a team/remote audit, explain that they must install the Local Runtime; never silently upload the project. Map an ordinary “审计当前项目” / “project audit” request to \`enhanced\`: a read-only four-domain static review of product journey, visual/interaction, data/security/reliability, and engineering delivery. Map an explicit code-only/static request to \`code\`, an explicit request to run tests, lint, checks, or build to \`gates\`, a user-journey/visual/interaction/responsive/keyboard/accessibility/browser request to \`experience\`, and complete/comprehensive/end-to-end requests to \`full\`. For ambiguity, run \`common-tools audit plan --instruction "<user request>"\`; it only selects a mode and never executes, browses, or uploads.

For local enhanced mode, run \`common-tools plugin enable --capability project-audit\`, then \`common-tools audit run --mode enhanced --scope <selected-scope-ids> --out .common-tools/reports/project-audit\`. Treat the generated artifacts as a candidate-evidence inventory, not the final audit. Open both JSON and Markdown reports; inspect every warning, missing item, evidence gap, and representative referenced file. Reject self-matches, regex/string examples, generated artifacts, fixtures, docs-only matches, and unrelated keyword hits. Classify conclusions only as \`confirmed-issue\`, \`healthy-with-evidence\`, \`not-verified\`, or \`not-applicable\`. Report each confirmed issue with priority, exact evidence, user or production impact, recommendation, and verification method. It is read-only: it does not upload source, execute project scripts, install dependencies, or scan outside the approved workspace. Use \`--mode code\` only for an explicit code-only/static request.

For gates, require explicit authorization and run \`--mode gates --run-gates\`. For experience, obtain explicit permission before browser work, create an eight-scenario manifest with \`common-tools audit evidence-template --out audit-evidence/experience.json\`, translate the approved natural-language journey into a bounded local plan, then use \`common-tools audit experience-collect --plan audit-evidence/plan.json --out audit-evidence/capture --run-browser\` only after the user starts the local app. The collector allows loopback targets and fixed safe actions, blocks off-origin HTTP(S) requests by default, and writes only local screenshot plus aggregate console/network evidence. Collection proves capture completion only; scenarios remain \`not-verified\` until every screenshot and console/network artifact is inspected. Reject blank, loading, blocked, cropped, wrong-state, and error-page screenshots. Do not infer keyboard, focus, contrast, reflow, screen-reader, or recovery health from screenshots alone. Pass a separately reviewed manifest as \`--experience-evidence\`; require both it and \`--run-gates\` for full review. Do not silently downgrade requested experience/full review to static-only.

Treat \`not-verified\` findings honestly. Static evidence cannot prove a complete user journey, visual quality, keyboard accessibility, responsive behavior, tests, builds, SCA, or production readiness. The final audit must include scope, user goal, coverage by applicable lens, evidence-backed strengths, prioritized findings, evidence gaps, ordered recommendations, and gates actually run. The experience manifest may reference only approved local screenshot, recording, console, or network capture files; report references and statuses, not sensitive contents. Local gates may run only declared \`check\`, \`lint\`, \`typecheck\`, \`test\`, and \`build\` scripts. Report each gate result separately.

Use this remote MCP workflow only when the resolved execution policy permits it and the user explicitly asks for a team/remote audit, centralized retention, or isolated execution. Accept ${guidance.input}; its upload content type must be \`${guidance.contentType}\`, its byte length must be exact, and it must not exceed 100 MiB. First call \`create_team_upload_target\` with \`capability: "project-audit"\`, that content type, and the exact byte length. Upload only that exact file to the returned short-lived \`uploadUrl\` using HTTP PUT; do not change headers, reuse the URL, or upload to another address. Then call \`create_team_job\` with \`capability: "project-audit"\`, the returned \`objectKey\`, and a newly generated opaque idempotency key.

Poll \`get_team_job\` only with the returned job ID until it reaches a terminal state. If it succeeds, inspect the bounded job summary and call \`get_team_artifact_target\` with an artifact name reported by that job to obtain a short-lived download URL. Do not claim completion before the job is terminal, and do not expose a returned signed URL outside the approved user context. The report may include relative paths and line numbers for possible secrets but must never reproduce source content or credentials.
`;
  return `---
name: ${capability}
description: Use the installed common-tools remote MCP service to submit and inspect a ${capability} job.
---

Use this Skill only with the installed \`common-tools\` remote MCP server and only for a user-approved input. This is a remote workflow: do not run the local \`common-tools\` CLI, enable local plugins, disclose credentials, or infer Docker, object-store, or server paths.

For ${capability}, accept ${guidance.input}. Its upload content type must be \`${guidance.contentType}\`, its byte length must be exact, and it must not exceed 100 MiB. First call \`create_team_upload_target\` with \`capability: "${capability}"\`, that content type, and the exact byte length. Upload only that exact file to the returned short-lived \`uploadUrl\` using HTTP PUT; do not change headers, reuse the URL, or upload to another address. Then call \`create_team_job\` with \`capability: "${capability}"\`, the returned \`objectKey\`, and a newly generated opaque idempotency key. Do not submit another job with the same key unless intentionally retrying the same input.

Poll \`get_team_job\` only with the returned job ID until it reaches a terminal state. If it succeeds, inspect the bounded job summary and call \`get_team_artifact_target\` with an artifact name reported by that job to obtain a short-lived download URL. Do not claim completion before the job is terminal, and do not expose a returned signed URL outside the approved user context. Use \`cancel_team_job\` only when the user asks to cancel the submitted job.
`;
}
function remoteRouterSkill(capabilities) {
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some((capability) => !CAPABILITIES.includes(capability)) || new Set(capabilities).size !== capabilities.length) throw new TypeError("remote router capabilities are invalid");
  const supported = capabilities.map((capability) => `\`${capability}\``).join(", ");
  const routes = capabilities.map((capability) => `- \`${capability}\`: ${REMOTE_CAPABILITY_GUIDANCE[capability].input}.`).join("\n");
  return `---
name: common-tools
description: Route approved work only to the currently authorized Common Tools remote capabilities.
---

Use this Skill only with the installed \`common-tools\` remote MCP server and only for user-approved input. This unified plugin can contain installation guidance for ${supported}, but the MCP tools visible in the current session are authoritative. Before creating a remote job, inspect the available Common Tools tools and confirm that the requested capability is visible. If its tool is unavailable, say that this capability was not selected, authorized, or deployed; do not silently substitute another capability, broaden OAuth access, run Docker, or use a local command.

Route natural-language requests as follows:
${routes}

For a requested remote capability, accept only its approved input type. First call \`create_team_upload_target\` with the exact \`capability\`, required content type and exact byte length. Upload only that exact file once to the returned short-lived \`uploadUrl\` using HTTP PUT without changing headers. Then call \`create_team_job\` with the returned \`objectKey\` and a newly generated opaque idempotency key. Poll \`get_team_job\` only for that returned job ID until terminal. On success, call \`get_team_artifact_target\` only for an artifact name reported by that job. Do not disclose signed URLs outside the approved user context.

For \`project-audit\`, run \`common-tools runtime resolve --capability project-audit\` first whenever the Local Runtime is available. Default to its resolved local route; if it is unavailable, ask the user to install the Local Runtime unless they explicitly ask for team/remote audit. A requested local code audit remains read-only by default. Do not turn a natural-language request into local gate execution, browser automation, or source upload without the separate explicit authorization required by that mode.

For \`ppt-create\`, run \`common-tools runtime resolve --capability ppt-create\` first whenever the Local Runtime is available. Default to local creation and use remote upload only when the resolved policy or the user's explicit request selects it.
`;
}
function mcpConfiguration(host, origin, serverName = "common-tools") {
  const server = { type: "http", url: `${origin}/mcp` };
  if (!['codex', 'claude'].includes(host)) throw new TypeError("plugin host is invalid");
  return { mcpServers: { [serverName]: { ...server, oauth: { clientId: "common-tools-mcp" } } } };
}
const CHINESE_CAPABILITY_GUIDANCE = Object.freeze({
  "image-to-editable": Object.freeze({ title: "图片/文档转可编辑", purpose: "将已获批准的图片、PDF 或图片版 PPTX 归档转换为可编辑产物。", input: "单个已获批准的来源归档（application/gzip）。" }),
  "ppt-improve": Object.freeze({ title: "PPT 改善", purpose: "先审视 PPTX，再在存在安全可修复项时生成独立改善版。", input: "单个已获批准的 PPTX 文件。" }),
  "ppt-quality": Object.freeze({ title: "PPT 质量审计", purpose: "审视 PPTX 的质量并生成独立质量报告。", input: "单个已获批准的 PPTX 文件。" }),
  "ppt-create": Object.freeze({ title: "创建 PPT", purpose: "从结构化内容创建新的可编辑 PPTX。", input: "无本地文件时使用已批准的 PresentationSpec 1.0 JSON；包含素材或用户自有模板时使用 `common-tools ppt archive` 生成的哈希绑定归档（application/gzip）。" }),
  "project-audit": Object.freeze({ title: "项目审计", purpose: "默认在本机执行只读项目审计；明确要求团队/远程审计时才上传归档。", input: "远程模式使用单个已获批准的项目归档（application/gzip）。" })
});
function chineseCapabilityGuide(capability) {
  const guidance = CHINESE_CAPABILITY_GUIDANCE[capability];
  if (!guidance) throw new TypeError("Chinese capability guidance is invalid");
  return [
    "# " + guidance.title,
    "",
    "## 适用场景",
    "",
    guidance.purpose,
    "",
    "## 输入边界",
    "",
    guidance.input + " 仅处理用户明确批准的输入；不要上传环境变量、密钥、凭据或无关文件。",
    "",
    "## 使用方式",
    "",
    capability === "project-audit"
      ? "在 Codex 中直接说明审计目标。普通“审计当前项目”会走 `enhanced` 本机只读审视，覆盖产品闭环、视觉交互、数据/权限/可靠性和工程交付四域；“只做代码审计”才走 `code`。若已安装 Local Runtime，先运行 `common-tools runtime resolve --capability project-audit`：只有用户明确要求团队/远程审计且策略允许时才上传归档。未安装 Local Runtime 时，不要把普通请求自动改为远程上传。"
      : capability === "ppt-create"
        ? "在 Codex 中直接说明创建目标并提供 PresentationSpec 1.0 JSON。先运行 `common-tools runtime resolve --capability ppt-create`；默认走本机创建。远程模式下，无本地文件的 spec 直接上传 JSON，带素材或模板的 spec 必须先运行 `common-tools ppt archive` 并上传生成的 application/gzip 归档。"
        : "在 Codex 中直接用自然语言说明目标，并明确所需能力。该能力当前需要远程 MCP；实际可调用范围以当前会话可见的 common-tools MCP 工具、已授权 OAuth scope 和服务端已部署能力为准。",
    "",
    "## 结果与限制",
    "",
    capability === "project-audit"
      ? "增强本机审计不会上传源码，也不会默认运行测试、构建或浏览器；这些结果会明确标为 `not-verified`，并可在用户授权后用 `gates`、`experience` 或 `full` 补齐。远程任务才会创建一次性上传地址、提交作业、轮询状态并只下载作业明确列出的产物。未授权、未选择或未部署的能力会停止并说明原因；不会自动扩大权限或改用其他能力。"
      : "远程任务会创建一次性上传地址、提交作业、轮询状态并只下载作业明确列出的产物。任务未成功前，不应宣称处理完成。未授权、未选择或未部署的能力会停止并说明原因；不会自动扩大权限或改用其他能力。",
    ""
  ].join("\n");
}
function chineseHelpSkill(capabilities) {
  const entries = capabilities.map((capability) => "- " + capability + "：" + CHINESE_CAPABILITY_GUIDANCE[capability].title + "（docs/zh-CN/" + capability + ".md）").join("\n");
  return [
    "---",
    "name: common-tools-help",
    "description: 用中文说明 Common Tools 的能力、边界、授权状态和对应使用文档。",
    "---",
    "",
    "当用户询问“怎么用”“帮助”“说明”“支持什么”“图片转可编辑说明”或“项目审计说明”时，使用中文回答，并先说明当前会话可见的 MCP 工具与 OAuth 授权才是能力是否可用的最终依据。可导航的随插件中文说明为：",
    "",
    "- 总览：docs/zh-CN/README.md",
    entries,
    "",
    "不要为了回答帮助而上传文件、创建任务、运行本机 CLI、扩大 OAuth scope 或泄露登录信息。若用户要实际执行能力，再交由对应 capability Skill，并遵守其输入、显式授权和远程/本机边界。",
    ""
  ].join("\n");
}
function chineseGuideIndex(capabilities) {
  const entries = capabilities.map((capability) => "- " + CHINESE_CAPABILITY_GUIDANCE[capability].title + "：./" + capability + ".md（" + capability + "）").join("\n");
  return [
    "# Common Tools 中文使用说明",
    "",
    "这是随插件安装的离线中文说明索引。插件提供一个统一入口；本机 Runtime 与远程 MCP 分别负责本机和远程执行。每项能力以独立 Skill 显示，远程能力共享同一个 MCP、当前 OAuth 授权和服务端能力边界。",
    "",
    entries,
    "",
    "安装器提供 local-preferred、remote-only、local-only 三种执行模式。项目审计在 local-preferred 模式默认本机运行；图片转可编辑目前需要远程 MCP。若插件页显示某项 Skill，但当前会话没有对应 MCP 工具，说明它尚未被选择、授权或部署；请重新运行安装器选择相应能力，或联系服务端管理员确认部署状态。",
    ""
  ].join("\n");
}
function writePluginPackage(host, origin, hostRoot, details) {
  const { name, capabilities, routerSkill = false } = details;
  const pluginRoot = path.join(hostRoot, "plugins", name);
  const metadataDirectory = path.join(pluginRoot, host === "codex" ? ".codex-plugin" : ".claude-plugin");
  fs.mkdirSync(metadataDirectory, { recursive: true });
  fs.writeFileSync(path.join(metadataDirectory, "plugin.json"), `${JSON.stringify(pluginMetadata(host, name, capabilities), null, 2)}\n`, "utf8");
  if (routerSkill) {
    const skillRoot = path.join(pluginRoot, "skills", "common-tools");
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), remoteRouterSkill(capabilities), "utf8");
    const helpSkillRoot = path.join(pluginRoot, "skills", "common-tools-help");
    fs.mkdirSync(helpSkillRoot, { recursive: true });
    fs.writeFileSync(path.join(helpSkillRoot, "SKILL.md"), chineseHelpSkill(capabilities), "utf8");
    for (const capability of capabilities) {
      const capabilitySkillRoot = path.join(pluginRoot, "skills", capability);
      fs.mkdirSync(capabilitySkillRoot, { recursive: true });
      fs.writeFileSync(path.join(capabilitySkillRoot, "SKILL.md"), remoteSkill(capability), "utf8");
    }
  } else {
    for (const capability of capabilities) {
      const skillRoot = path.join(pluginRoot, "skills", capability);
      fs.mkdirSync(skillRoot, { recursive: true });
      fs.writeFileSync(path.join(skillRoot, "SKILL.md"), remoteSkill(capability), "utf8");
    }
  }
  const chineseDocsRoot = path.join(pluginRoot, "docs", "zh-CN");
  fs.mkdirSync(chineseDocsRoot, { recursive: true });
  fs.writeFileSync(path.join(chineseDocsRoot, "README.md"), chineseGuideIndex(capabilities), "utf8");
  for (const capability of capabilities) fs.writeFileSync(path.join(chineseDocsRoot, `${capability}.md`), chineseCapabilityGuide(capability), "utf8");
  const mcp = mcpConfiguration(host, origin, details.serverName);
  if (mcp) fs.writeFileSync(path.join(pluginRoot, ".mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`, "utf8");
  const localRuntimeNote = capabilities.some((capability) => LOCAL_RUNTIME_CAPABILITIES.includes(capability))
    ? "`project-audit` and `ppt-create` can use the optional versioned Local Runtime. In the default `local-preferred` mode they stay on the current machine; choose `remote-only` or explicitly request remote execution to use the MCP service."
    : "All selected capabilities require remote execution through the MCP service.";
  fs.writeFileSync(path.join(pluginRoot, "README.md"), `# ${name}\n\nEnabled capabilities: ${capabilities.join(", ")}. ${localRuntimeNote}\n\nRun the host-level \`install.ps1\` to select capabilities and an execution mode. When remote work is selected, it connects to \`${origin}/mcp\` and opens OAuth sign-in. See [中文使用说明](./docs/zh-CN/README.md) for capability navigation, execution boundaries and natural-language examples. The service address, database, workers and object storage remain on the server.\n`, "utf8");
}
function writePlugin(host, origin, output, capabilities, layout) {
  const hostRoot = path.join(output, host);
  const marketplaceDirectory = host === "codex" ? path.join(hostRoot, ".agents", "plugins") : path.join(hostRoot, ".claude-plugin");
  fs.mkdirSync(marketplaceDirectory, { recursive: true });
  const plugins = layout === "split"
    ? capabilities.map((capability) => ({ name: pluginName(capability), capabilities: [capability], serverName: `common-tools-${capability}` }))
    : [{ name: pluginName(), capabilities, serverName: "common-tools", routerSkill: true }];
  const installationPolicy = host === "codex" && layout === "bundle" ? "INSTALLED_BY_DEFAULT" : "AVAILABLE";
  fs.writeFileSync(path.join(marketplaceDirectory, "marketplace.json"), `${JSON.stringify(marketplaceMetadata(host, plugins, installationPolicy), null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(hostRoot, "INSTALL.md"), installGuide(host, origin, capabilities, layout), "utf8");
  fs.writeFileSync(path.join(hostRoot, "install.ps1"), installationScript(host, origin, capabilities, layout), "utf8");
  fs.writeFileSync(path.join(hostRoot, "verify-connection.ps1"), connectionVerificationScript(origin, capabilities), "utf8");
  if (capabilities.some((capability) => LOCAL_RUNTIME_CAPABILITIES.includes(capability))) writeLocalRuntimePayload(hostRoot);
  for (const details of plugins) writePluginPackage(host, origin, hostRoot, details);
}
function generateRemotePluginBundles(options) {
  const capabilities = options?.capabilities === undefined ? CAPABILITIES : options.capabilities;
  const layout = options?.layout === undefined ? "bundle" : options.layout;
  if (!options || typeof options !== "object" || !Array.isArray(options.hosts) || options.hosts.some((host) => !["codex", "claude"].includes(host)) || !Array.isArray(capabilities) || !capabilities.length || capabilities.some((capability) => !CAPABILITIES.includes(capability)) || new Set(capabilities).size !== capabilities.length || !["bundle", "split"].includes(layout)) throw new TypeError("plugin bundle options are invalid");
  const origin = parseOrigin(options.origin);
  const output = path.resolve(options.output);
  assertEmptyNewDirectory(output);
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const host of options.hosts) writePlugin(host, origin, output, capabilities, layout);
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({ origin, output, hosts: Object.freeze([...options.hosts]), capabilities: Object.freeze([...capabilities]), layout });
}
function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  process.stdout.write(`${JSON.stringify(generateRemotePluginBundles(options))}\n`);
}

if (require.main === module) main();

module.exports = { CAPABILITIES, LOCAL_RUNTIME_CAPABILITIES, LOCAL_RUNTIME_VERSION, REMOTE_CAPABILITY_CODES, REMOTE_CAPABILITY_GUIDANCE, REMOTE_CAPABILITY_SCOPES, REMOTE_PLUGIN_VERSION, connectionVerificationScript, generateRemotePluginBundles, installGuide, installationScript, localRuntimeInstaller, marketplaceMetadata, mcpConfiguration, parseArguments, parseCapabilities, parseLayout, parseOrigin, pluginName, remoteRouterSkill, remoteSkill, writeLocalRuntimePayload };
