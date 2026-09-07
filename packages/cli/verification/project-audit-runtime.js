"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
const INCLUDED_DIRECTORIES = Object.freeze([
  "packages/capability-contracts",
  "packages/capability-manifests",
  "packages/capability-runtime",
  "packages/project-audit-core",
  "packages/project-audit-runtime"
]);
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
module.exports = { INCLUDED_DIRECTORIES, listFiles, sourceFiles, mirrorDigest, verifyProjectAuditPluginRuntime };
