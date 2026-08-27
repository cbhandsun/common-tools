"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

function assertName(value) {
  if (typeof value !== "string" || !CAPABILITY_PATTERN.test(value)) throw new Error("capability name is invalid");
  return value;
}
function assertOutput(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("scaffold output is required");
  const output = path.resolve(value);
  if (path.parse(output).root === output) throw new Error("scaffold output is invalid");
  return output;
}
function titleFor(name) { return name.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" "); }
function manifest(name, host) {
  const title = titleFor(name);
  const codex = host === "codex";
  return JSON.stringify(codex ? {
    name,
    version: "0.1.0+codex.draft",
    description: `Draft ${name} capability plugin for common-tools.`,
    author: { name: "common-tools" },
    skills: "./skills/",
    interface: { displayName: title, shortDescription: `Draft ${name} capability.`, longDescription: `A draft, separately installable ${name} capability for common-tools.`, developerName: "common-tools", category: "Productivity", capabilities: ["Read"], defaultPrompt: [`Use the ${title} capability on this approved task.`] }
  } : {
    name,
    version: "0.1.0",
    description: `Draft ${name} capability plugin for common-tools.`,
    author: { name: "common-tools" }
  }, null, 2).concat("\n");
}
function skill(name) {
  return `---\nname: ${name}\ndescription: Draft ${name} capability guidance.\n---\n\n# ${titleFor(name)}\n\nThis is a draft capability plugin. It must not claim access to a Runtime tool, MCP server, Worker, user file, or external service until its capability manifest, handler, tests, and deployment profile have been implemented and approved.\n\nBefore enabling it in common-tools, complete the integration checklist in the bundle README and run the repository distribution and capability-contract verification commands.\n`;
}
function marketplace(name, host) {
  const codex = host === "codex";
  const marketplaceName = `common-tools-${name}-draft${codex ? "-codex" : ""}`;
  const plugin = codex ? { name, source: { source: "local", path: `./plugins/${name}` }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" } : { name, source: `./plugins/${name}`, description: `Draft ${name} capability plugin for common-tools.` };
  const root = codex ? { name: marketplaceName, interface: { displayName: `Common Tools ${titleFor(name)} Draft` }, plugins: [plugin] } : { name: marketplaceName, description: `Draft Common Tools ${name} marketplace.`, owner: { name: "common-tools" }, plugins: [plugin] };
  return JSON.stringify(root, null, 2).concat("\n");
}
function draftManifest(name) {
  return JSON.stringify({ status: "draft", capability: name, version: "0.1.0", toolNames: [], dependencies: [], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "base", team: { oauthScope: `common-tools:capability:${name}`, acceptedUploadMediaTypes: ["application/gzip"] }, note: "This draft is intentionally not a runtime capability manifest. Declare any prerequisite capabilities explicitly, then complete a handler, worker profile, tests, and verified contentSha256 before moving it under packages/capability-manifests/." }, null, 2).concat("\n");
}
function readme(name) {
  return `# ${titleFor(name)} capability draft\n\nThis bundle contains self-contained Codex and Claude plugin packages plus mirrored local marketplaces. It is intentionally not registered with the common-tools Runtime.\n\n## Safe integration sequence\n\n1. Implement the local MCP handler and add its exact tool names and prerequisite capabilities to a verified capability manifest.\n2. Implement a constrained team Worker when remote execution is required; do not add a capability to the team allowlist without a worker.\n3. For a remote capability, declare one bounded \`team.deployment\` block in its manifest and add the matching Compose Worker service/profile/image. Local-only capabilities must omit that block.\n4. Copy the host packages and marketplace mirrors into the common-tools repository.\n5. Run \`npm run common-tools:verify-capabilities\`, \`npm run common-tools:verify-plugins\`, and \`npm run common-tools:test\`.\n6. Publish the Runtime first, then install only this capability from the relevant marketplace.\n\nThe draft Skill must remain guidance-only until those steps are complete.\n`;
}
function bundleFiles(name) {
  const files = new Map();
  files.set("README.md", readme(name));
  files.set("capability.manifest.draft.json", draftManifest(name));
  for (const host of ["codex", "claude"]) {
    const metadataPath = host === "codex" ? `.codex-plugin/plugin.json` : `.claude-plugin/plugin.json`;
    const sourceRoot = `plugins/${host}/${name}`;
    const marketplaceRoot = `marketplaces/${host}`;
    const marketplaceMetadata = host === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json";
    files.set(`${sourceRoot}/${metadataPath}`, manifest(name, host));
    files.set(`${sourceRoot}/skills/${name}/SKILL.md`, skill(name));
    files.set(`${marketplaceRoot}/${marketplaceMetadata}`, marketplace(name, host));
    files.set(`${marketplaceRoot}/plugins/${name}/${metadataPath}`, manifest(name, host));
    files.set(`${marketplaceRoot}/plugins/${name}/skills/${name}/SKILL.md`, skill(name));
  }
  return files;
}
function renameDirectoryAtomically(temporary, destination) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.renameSync(temporary, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!(error && (error.code === "EPERM" || error.code === "EBUSY")) || attempt === 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
  throw lastError;
}
function scaffoldPlan({ name, output }) {
  const capability = assertName(name);
  const root = assertOutput(output);
  const files = bundleFiles(capability);
  return Object.freeze({ capability, output: root, fileCount: files.size, files: Object.freeze([...files.keys()].sort()) });
}
function writeScaffold(plan) {
  if (!plan || typeof plan !== "object" || typeof plan.capability !== "string" || typeof plan.output !== "string") throw new TypeError("scaffold plan is invalid");
  if (fs.existsSync(plan.output)) throw new Error("scaffold output already exists");
  const parent = path.dirname(plan.output);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error("scaffold output parent is invalid");
  const temporary = `${plan.output}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const files = bundleFiles(plan.capability);
  try {
    fs.mkdirSync(temporary, { mode: 0o700 });
    for (const [relative, content] of files) {
      const destination = path.join(temporary, relative);
      const normalized = path.relative(temporary, destination);
      if (!normalized || normalized.startsWith("..") || path.isAbsolute(normalized)) throw new Error("scaffold file path is invalid");
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.writeFileSync(destination, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }
    renameDirectoryAtomically(temporary, plan.output);
    return Object.freeze({ ...plan, written: true });
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { assertName, assertOutput, bundleFiles, renameDirectoryAtomically, scaffoldPlan, writeScaffold };
