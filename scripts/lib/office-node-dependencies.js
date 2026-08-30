"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { npmInvocation } = require("../verify-runtime-package");

const INSTALL_ARGS = Object.freeze(["ci", "--ignore-scripts", "--include=dev", "--include=optional"]);
const CHECK_ARGS = Object.freeze(["ls", "--all", "--offline", "--include=dev", "--include=optional", "--json"]);

function repositoryRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || /[\r\n\0]/u.test(value)) throw new TypeError("Office Node repository root is invalid");
  const root = fs.realpathSync(value);
  if (root === path.parse(root).root || !fs.statSync(root).isDirectory()) throw new TypeError("Office Node repository root is invalid");
  return root;
}

function readManifest(root, relative) {
  const file = path.join(root, relative);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error("Office Node cache manifest is invalid");
  return fs.readFileSync(file);
}

function dependencyCacheKey(rootValue, identity) {
  const root = repositoryRoot(rootValue);
  const fields = ["node", "npm", "platform", "arch"];
  if (!identity || fields.some((name) => typeof identity[name] !== "string" || !/^[a-zA-Z0-9.+_-]{1,128}$/u.test(identity[name]))) throw new TypeError("Office Node runtime identity is invalid");
  const rootManifest = readManifest(root, "package.json");
  const manifest = JSON.parse(rootManifest.toString("utf8"));
  if (!Array.isArray(manifest.workspaces) || manifest.workspaces.length !== 1 || manifest.workspaces[0] !== "packages/*") throw new Error("Office Node cache requires the declared packages/* workspace layout");
  const packageRoot = path.join(root, "packages");
  if (fs.lstatSync(packageRoot).isSymbolicLink()) throw new Error("Office Node cache refuses linked workspace directories");
  const entries = fs.readdirSync(packageRoot, { withFileTypes: true });
  if (entries.length > 256 || entries.some((entry) => entry.isSymbolicLink())) throw new Error("Office Node workspace inventory is invalid");
  const hash = crypto.createHash("sha256");
  const add = (name, bytes) => { hash.update(JSON.stringify([name, bytes.length])); hash.update(bytes); };
  // Bind to the checkout location as Windows workspace junctions may be absolute.
  add("identity", Buffer.from(JSON.stringify(["office-node-v1", root, ...fields.map((name) => identity[name]), INSTALL_ARGS])));
  add("package.json", rootManifest);
  add("package-lock.json", readManifest(root, "package-lock.json"));
  if (fs.existsSync(path.join(root, ".npmrc"))) add(".npmrc", readManifest(root, ".npmrc"));
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join("packages", entry.name, "package.json");
    if (fs.existsSync(path.join(root, relative))) add(relative, readManifest(root, relative));
  }
  return `office-node-v1-${hash.digest("hex")}`;
}

function parseCacheHit(value) {
  if (value === "true") return true;
  if (value === "false" || value === "" || value === undefined) return false;
  throw new TypeError("Office Node cache hit must be true, false, or empty");
}

function runNpm(args, root, timeout, run = spawnSync) {
  const invocation = npmInvocation(args);
  try {
    return run(invocation.command, invocation.arguments, { cwd: root, windowsHide: true, shell: false, stdio: "ignore", timeout });
  } catch {
    throw new Error("Office Node dependency command could not start");
  }
}

function succeeded(result) { return Boolean(result && !result.error && result.status === 0); }

function workspaceLinkEntries(root) {
  const lock = JSON.parse(readManifest(root, "package-lock.json").toString("utf8"));
  if (!lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) throw new Error("Office Node lock package inventory is invalid");
  const entries = [];
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!entry?.link) continue;
    if (!/^node_modules\/(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/u.test(relative)
      || relative.split("/").some((segment) => [".", ".."].includes(segment))
      || typeof entry.resolved !== "string" || !/^packages\/[a-z0-9][a-z0-9_-]*$/u.test(entry.resolved)) throw new Error("Office Node workspace link is invalid");
    entries.push({ relative, resolved: entry.resolved });
    if (entries.length > 256) throw new Error("Office Node workspace link inventory exceeds its bound");
  }
  return entries;
}

function workspaceLinksMatch(root) {
  for (const entry of workspaceLinkEntries(root)) {
    const { relative } = entry;
    const link = path.join(root, relative);
    try {
      if (!fs.lstatSync(link).isSymbolicLink() || fs.realpathSync(link) !== fs.realpathSync(path.join(root, entry.resolved))) return false;
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
      throw new Error("Office Node workspace link validation failed", { cause: error });
    }
  }
  return true;
}

function restoreCachedWorkspaceLinks(rootValue) {
  const root = repositoryRoot(rootValue);
  const repairs = [];
  // Windows bsdtar expands junctions into directories. Only replace the exact
  // lock-declared cache entries, never workspace sources or linked parents.
  for (const { relative, resolved } of workspaceLinkEntries(root)) {
    const source = path.join(root, resolved);
    const target = path.join(root, relative);
    const sourceParents = [path.join(root, "packages"), source];
    const targetParents = [path.join(root, "node_modules")];
    if (relative.split("/").length === 3) targetParents.push(path.dirname(target));
    try {
      for (const directory of [...sourceParents, ...targetParents]) {
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) throw new Error("Unsafe cached workspace boundary");
      }
      readManifest(root, path.join(resolved, "package.json"));
      let stat;
      try { stat = fs.lstatSync(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (stat?.isSymbolicLink()) {
        if (fs.realpathSync(target) !== source) return false;
        continue;
      }
      if (stat && (!stat.isDirectory() || fs.realpathSync(target) !== target)) return false;
      repairs.push({ source, target, exists: Boolean(stat) });
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
      throw new Error("Office Node cached workspace inspection failed", { cause: error });
    }
  }
  // Inspect every entry before mutating any cache directory.
  for (const { source, target, exists } of repairs) {
    if (exists) fs.rmSync(target, { recursive: true });
    fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  }
  return true;
}

function lockedPackagesMatch(root) {
  const lock = JSON.parse(readManifest(root, "package-lock.json").toString("utf8"));
  if (!lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) throw new Error("Office Node lock package inventory is invalid");
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative || entry?.link || !relative.split("/").includes("node_modules")) continue;
    const segments = relative.split("/");
    if (relative.length > 1024 || segments.some((segment) => !/^[a-zA-Z0-9@_.-]+$/u.test(segment) || [".", ".."].includes(segment))
      || typeof entry?.version !== "string" || entry.version.length < 1 || entry.version.length > 256) throw new Error("Office Node locked package entry is invalid");
    const directory = path.join(root, relative);
    try {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    } catch (error) {
      // npm may omit optional dependencies that do not support this OS/CPU.
      if (error.code === "ENOENT" && entry.optional === true) continue;
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
      throw new Error("Office Node locked package validation failed", { cause: error });
    }
    try {
      const manifest = JSON.parse(readManifest(root, path.join(relative, "package.json")).toString("utf8"));
      if (manifest?.version !== entry.version) return false;
    } catch (error) {
      if (error instanceof SyntaxError || ["ENOENT", "ENOTDIR"].includes(error.code) || error.message === "Office Node cache manifest is invalid") return false;
      throw new Error("Office Node installed manifest validation failed", { cause: error });
    }
  }
  return true;
}

function prepareNodeDependencies(rootValue, cacheHitValue, run = spawnSync) {
  const root = repositoryRoot(rootValue);
  const cacheHit = parseCacheHit(cacheHitValue);
  if (typeof run !== "function") throw new TypeError("Office Node command adapter is invalid");
  const healthy = () => workspaceLinksMatch(root) && lockedPackagesMatch(root) && succeeded(runNpm(CHECK_ARGS, root, 60_000, run));
  if (cacheHit && restoreCachedWorkspaceLinks(root) && healthy()) return Object.freeze({ reused: true, installed: false, reason: "validated-cache-hit" });
  if (!succeeded(runNpm(INSTALL_ARGS, root, 300_000, run))) throw new Error("Office Node locked dependency installation failed");
  if (!healthy()) throw new Error("Office Node installed dependency validation failed");
  return Object.freeze({ reused: false, installed: true, reason: cacheHit ? "cache-validation-failed" : "cache-miss" });
}

function runtimeIdentity() {
  const invocation = npmInvocation(["--version"]);
  const result = spawnSync(invocation.command, invocation.arguments, { windowsHide: true, shell: false, encoding: "utf8", timeout: 30_000, maxBuffer: 1024, stdio: ["ignore", "pipe", "ignore"] });
  if (!succeeded(result) || typeof result.stdout !== "string") throw new Error("Office Node npm identity is unavailable");
  return { node: process.version, npm: result.stdout.trim(), platform: process.platform, arch: process.arch };
}

module.exports = { CHECK_ARGS, INSTALL_ARGS, dependencyCacheKey, lockedPackagesMatch, parseCacheHit, prepareNodeDependencies, restoreCachedWorkspaceLinks, runtimeIdentity, workspaceLinksMatch };
