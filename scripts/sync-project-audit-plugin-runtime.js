#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { INCLUDED_DIRECTORIES, listFiles, sourceFiles, mirrorDigest, verifyProjectAuditPluginRuntime } = require("../packages/cli/verification/project-audit-runtime");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const TARGET_ROOT = path.join(REPOSITORY_ROOT, "plugins", "common-tools", "runtime", "project-audit");

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
