#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { INCLUDED_DIRECTORIES } = require("./build-project-audit-runtime-package");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const TARGET_ROOT = path.join(REPOSITORY_ROOT, "plugins", "common-tools", "runtime", "project-audit");

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("project audit runtime mirror must not contain symbolic links");
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
      else throw new Error("project audit runtime mirror contains an unsupported entry");
    }
  };
  visit(root);
  return files.sort();
}
function sourceFiles(repositoryRoot = REPOSITORY_ROOT) {
  return INCLUDED_DIRECTORIES.flatMap((directory) => listFiles(path.join(repositoryRoot, directory)).map((file) => `${directory}/${file}`)).sort();
}
const TEXT_EXTENSIONS = new Set([".js", ".json", ".md"]);
function mirrorDigest(file) {
  const bytes = fs.readFileSync(file);
  const content = TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())
    ? bytes.toString("utf8").replace(/\r\n?/gu, "\n")
    : bytes;
  return crypto.createHash("sha256").update(content).digest("hex");
}
function verifyProjectAuditPluginRuntime({ repositoryRoot = REPOSITORY_ROOT, targetRoot = path.join(repositoryRoot, "plugins", "common-tools", "runtime", "project-audit") } = {}) {
  const expected = sourceFiles(repositoryRoot);
  const observed = listFiles(targetRoot);
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error("embedded project audit Runtime file set is stale");
  for (const relative of expected) if (mirrorDigest(path.join(repositoryRoot, relative)) !== mirrorDigest(path.join(targetRoot, relative))) throw new Error(`embedded project audit Runtime is stale: ${relative}`);
  return Object.freeze({ fileCount: expected.length, synchronized: true });
}
function syncProjectAuditPluginRuntime({ repositoryRoot = REPOSITORY_ROOT, targetRoot = path.join(repositoryRoot, "plugins", "common-tools", "runtime", "project-audit"), temporaryDirectory = fs.mkdtempSync } = {}) {
  const resolvedRepository = fs.realpathSync.native(repositoryRoot);
  const expectedParent = path.join(resolvedRepository, "plugins", "common-tools", "runtime");
  const resolvedTarget = path.resolve(targetRoot);
  if (path.dirname(resolvedTarget) !== expectedParent || path.basename(resolvedTarget) !== "project-audit") throw new Error("embedded project audit Runtime target is invalid");
  fs.mkdirSync(expectedParent, { recursive: true, mode: 0o700 });
  const temporaryRoot = temporaryDirectory(path.join(expectedParent, ".project-audit-staging-"));
  let cleanable = false;
  try {
    const stat = fs.lstatSync(temporaryRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("embedded project audit Runtime staging directory is invalid");
    cleanable = true;
    for (const directory of INCLUDED_DIRECTORIES) fs.cpSync(path.join(resolvedRepository, directory), path.join(temporaryRoot, directory), { recursive: true, errorOnExist: true, force: false });
    if (fs.existsSync(resolvedTarget)) {
      const targetStat = fs.lstatSync(resolvedTarget);
      if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error("embedded project audit Runtime target is invalid");
      fs.rmSync(resolvedTarget, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
    }
    fs.renameSync(temporaryRoot, resolvedTarget);
    cleanable = false;
    return verifyProjectAuditPluginRuntime({ repositoryRoot: resolvedRepository, targetRoot: resolvedTarget });
  } finally {
    if (cleanable) fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length > 1 || argv.some((value) => typeof value !== "string")) throw new Error("sync arguments are invalid");
  if (argv.length === 0) return { write: false };
  if (argv[0] !== "--write") throw new Error("usage: sync-project-audit-plugin-runtime [--write]");
  return { write: true };
}

if (require.main === module) {
  const options = parseArguments(process.argv.slice(2));
  const result = options.write ? syncProjectAuditPluginRuntime() : verifyProjectAuditPluginRuntime();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = { TARGET_ROOT, listFiles, mirrorDigest, parseArguments, sourceFiles, syncProjectAuditPluginRuntime, verifyProjectAuditPluginRuntime };
