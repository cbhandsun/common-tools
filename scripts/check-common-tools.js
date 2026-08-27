"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packages = path.join(root, "packages");
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
  }
}
walk(packages);
files.push(path.join(root, "scripts", "generate-sbom.js"), path.join(root, "scripts", "release-evidence.js"), path.join(root, "scripts", "verify-capability-contracts.js"), path.join(root, "scripts", "verify-plugins.js"), path.join(root, "scripts", "verify-release-signature.js"), path.join(root, "scripts", "verify-runtime-package.js"), path.join(root, "scripts", "verify-observability-config.js"), path.join(root, "scripts", "verify-adrs.js"));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `syntax check failed: ${file}`);
  const content = fs.readFileSync(file, "utf8");
  if (/console\.log\(/.test(content) && !/bin[\\/]/.test(path.relative(packages, file))) {
    throw new Error(`library code must not use console.log: ${path.relative(root, file)}`);
  }
}
console.log(`checked ${files.length} common-tools JavaScript files`);
