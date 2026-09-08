"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { isRuntimePayloadPath } = require("./native-engine-runtime-payload");

const root = path.resolve(__dirname, "..");
const packages = path.join(root, "packages");

function walkJavaScriptFiles(directory, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJavaScriptFiles(target, files);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
  }
}

function collectCommonToolFiles(workspaceRoot = root) {
  const files = [];
  walkJavaScriptFiles(path.join(workspaceRoot, "packages"), files);
  files.push(path.join(workspaceRoot, "scripts", "generate-sbom.js"), path.join(workspaceRoot, "scripts", "release-evidence.js"), path.join(workspaceRoot, "scripts", "verify-capability-contracts.js"), path.join(workspaceRoot, "scripts", "verify-capability-catalogs.js"), path.join(workspaceRoot, "scripts", "verify-plugins.js"), path.join(workspaceRoot, "scripts", "verify-release-signature.js"), path.join(workspaceRoot, "scripts", "verify-runtime-package.js"), path.join(workspaceRoot, "scripts", "verify-observability-config.js"), path.join(workspaceRoot, "scripts", "verify-adrs.js"));
  return Object.freeze(files);
}

function syntaxCheck(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve();
      else reject(new Error(stderr || stdout || `syntax check failed: ${file}`));
    });
  });
}

async function runLimited(items, limit, task) {
  if (!Array.isArray(items) || !Number.isSafeInteger(limit) || limit < 1 || typeof task !== "function") throw new TypeError("limited runner configuration is invalid");
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

function syntaxCheckConcurrency() {
  return Math.max(1, Math.min(8, os.availableParallelism ? os.availableParallelism() : os.cpus().length || 1));
}

async function checkCommonTools(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("common-tools check options are invalid");
  const files = options.files === undefined ? collectCommonToolFiles() : options.files;
  if (!Array.isArray(files) || files.some((file) => typeof file !== "string" || file.length === 0)) throw new TypeError("common-tools check files are invalid");
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (/console\.log\(/.test(content) && !/bin[\\/]/.test(path.relative(packages, file)) && !isRuntimePayloadPath(file)) {
      throw new Error(`library code must not use console.log: ${path.relative(root, file)}`);
    }
  }
  await runLimited(files, syntaxCheckConcurrency(), syntaxCheck);
  process.stdout.write(`checked ${files.length} common-tools JavaScript files\n`);
  return files.length;
}

if (require.main === module) {
  checkCommonTools().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "common-tools check failed"}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  checkCommonTools,
  collectCommonToolFiles,
  runLimited,
  syntaxCheckConcurrency
};
