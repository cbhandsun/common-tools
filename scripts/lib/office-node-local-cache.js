"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { repositoryRoot, workspaceLinkEntries, workspaceLinksMatch, lockedPackagesMatch } = require("./office-node-dependencies");

function statOrMissing(target) {
  try { return fs.lstatSync(target); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function plainDirectory(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Office local cache directory boundary is invalid");
}

function plainAncestors(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, part);
    plainDirectory(current);
  }
}

function ensureChild(parent, name) {
  plainAncestors(parent);
  const target = path.join(parent, name);
  if (!statOrMissing(target)) fs.mkdirSync(target);
  plainDirectory(target);
  return target;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function localCacheContext(rootValue, key, environment) {
  const root = repositoryRoot(rootValue);
  const toolCache = environment.RUNNER_TOOL_CACHE;
  if (typeof toolCache !== "string" || !path.isAbsolute(toolCache) || toolCache.length > 4096 || /[\r\n\0]/u.test(toolCache)) throw new Error("Office local cache root is invalid");
  const cacheRoot = path.resolve(toolCache);
  if (cacheRoot === path.parse(cacheRoot).root || inside(root, cacheRoot) || inside(cacheRoot, root)) throw new Error("Office local cache must be separate from the checkout");
  plainAncestors(root);
  plainAncestors(cacheRoot);
  if (typeof key !== "string" || !/^office-node-v1-[a-f0-9]{64}$/u.test(key)) throw new Error("Office local cache key is invalid");
  const repository = environment.GITHUB_REPOSITORY;
  const ref = environment.GITHUB_REF;
  if (typeof repository !== "string" || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u.test(repository)
    || typeof ref !== "string" || !/^refs\/(?:heads|pull|tags)\/[A-Za-z0-9_./-]{1,240}$/u.test(ref)) throw new Error("Office local cache trust scope is invalid");
  const scope = crypto.createHash("sha256").update(JSON.stringify([repository, ref])).digest("hex");
  const managed = ensureChild(ensureChild(ensureChild(cacheRoot, "ct"), "node-local-v1"), scope);
  const entry = path.join(managed, key.slice("office-node-v1-".length));
  const packageRoot = path.join(root, "packages");
  plainDirectory(packageRoot);
  const packages = fs.readdirSync(packageRoot, { withFileTypes: true });
  if (packages.length > 256 || packages.some((item) => item.isSymbolicLink())) throw new Error("Office local cache workspace inventory is invalid");
  const roots = ["node_modules"];
  for (const item of packages) {
    if (!item.isDirectory()) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(item.name)) throw new Error("Office local cache workspace name is invalid");
    roots.push(`packages/${item.name}/node_modules`);
  }
  return Object.freeze({ root, key, scope, managed, entry, roots });
}

// Never follow dependency symlinks. The only permitted source links are the
// lock-declared workspace links, omitted at save and rebuilt by normal prepare.
function inventory(base, skip = new Set()) {
  plainAncestors(base);
  const entries = [];
  const pending = [""];
  let bytes = 0;
  while (pending.length) {
    const relative = pending.pop();
    const directory = path.join(base, relative);
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name.length > 255 || /[\x00-\x1f\x7f\\/:]/u.test(item.name)) throw new Error("Office local cache entry name is invalid");
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (skip.has(name)) continue;
      if (name.length > 2048 || name.split("/").length > 48 || entries.length >= 100000) throw new Error("Office local cache inventory exceeds its bound");
      const stat = fs.lstatSync(path.join(base, name));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1)) throw new Error("Office local cache contains an unsafe entry");
      bytes += stat.isFile() ? stat.size : 0;
      if (bytes > 1024 * 1024 * 1024) throw new Error("Office local cache size exceeds its bound");
      entries.push({ name, directory: stat.isDirectory(), bytes: stat.isFile() ? stat.size : 0 });
      if (stat.isDirectory()) pending.push(name);
    }
  }
  return entries;
}

function copyInventory(source, destination, entries) {
  plainAncestors(path.dirname(destination));
  fs.mkdirSync(destination);
  for (const entry of entries.filter((item) => item.directory).sort((a, b) => a.name.split("/").length - b.name.split("/").length)) fs.mkdirSync(path.join(destination, entry.name));
  for (const entry of entries.filter((item) => !item.directory)) fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name), fs.constants.COPYFILE_EXCL);
}

function validateCombinedInventory(copies) {
  let bytes = 0;
  let count = 0;
  for (const copy of copies) {
    count += copy.entries.length;
    bytes += copy.entries.reduce((total, entry) => total + entry.bytes, 0);
  }
  if (bytes > 1024 * 1024 * 1024 || count > 99000) throw new Error("Office local cache combined inventory exceeds its bound");
}

function readEntry(context) {
  plainAncestors(context.managed);
  if (!statOrMissing(context.entry)) return null;
  plainDirectory(context.entry);
  const marker = path.join(context.entry, "entry.json");
  const stat = statOrMissing(marker);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Office local cache marker is unsafe");
  if (stat.size > 16384) return null;
  let record;
  try { record = JSON.parse(fs.readFileSync(marker, "utf8")); } catch (error) { if (error instanceof SyntaxError) return null; throw error; }
  if (!record || record.schemaVersion !== 1 || record.key !== context.key || record.scope !== context.scope
    || !Array.isArray(record.roots) || !record.roots.includes("node_modules") || record.roots.length > context.roots.length
    || new Set(record.roots).size !== record.roots.length || record.roots.some((name) => !context.roots.includes(name))) return null;
  return record;
}

function restoreLocalCache(context) {
  const record = readEntry(context);
  if (!record) return false;
  const payload = path.join(context.entry, "payload");
  if (!statOrMissing(payload)) return false;
  plainAncestors(payload);
  if (record.roots.some((name) => !statOrMissing(path.join(payload, name)))) return false;
  const copies = record.roots.map((name) => {
    const source = path.join(payload, name);
    const destination = path.join(context.root, name);
    plainAncestors(path.dirname(destination));
    if (statOrMissing(destination)) throw new Error("Office local cache requires clean dependency targets");
    return { source, destination, entries: inventory(source) };
  });
  // Inspect every source and destination before the first checkout write.
  validateCombinedInventory(copies);
  for (const copy of copies) copyInventory(copy.source, copy.destination, copy.entries);
  return true;
}

function removeManagedEntry(context, target) {
  if (path.dirname(target) !== context.managed || !/^(?:[a-f0-9]{64}|staging-[A-Za-z0-9]+)$/u.test(path.basename(target))) throw new Error("Office local cache removal boundary is invalid");
  inventory(target);
  fs.rmSync(target, { recursive: true });
}

function saveLocalCache(context) {
  plainAncestors(context.managed);
  if (!workspaceLinksMatch(context.root) || !lockedPackagesMatch(context.root)) throw new Error("Office local cache source dependencies are invalid");
  const workspaceLinks = workspaceLinkEntries(context.root).map((entry) => entry.relative);
  const copies = context.roots.filter((name) => statOrMissing(path.join(context.root, name))).map((name) => {
    const source = path.join(context.root, name);
    const skip = new Set(workspaceLinks.filter((link) => link.startsWith(`${name}/`)).map((link) => link.slice(name.length + 1)));
    return { name, source, entries: inventory(source, skip) };
  });
  if (!copies.some((copy) => copy.name === "node_modules")) throw new Error("Office local cache dependencies are missing");
  validateCombinedInventory(copies);
  // Refuse unsafe existing cache paths even when replacing a damaged snapshot.
  if (statOrMissing(context.entry)) inventory(context.entry);
  const staging = fs.mkdtempSync(path.join(context.managed, "staging-"));
  try {
    const payload = ensureChild(staging, "payload");
    for (const copy of copies) {
      let parent = payload;
      for (const part of copy.name.split("/").slice(0, -1)) parent = ensureChild(parent, part);
      copyInventory(copy.source, path.join(parent, "node_modules"), copy.entries);
    }
    fs.writeFileSync(path.join(staging, "entry.json"), JSON.stringify({ schemaVersion: 1, key: context.key, scope: context.scope, roots: copies.map((copy) => copy.name) }), { flag: "wx", mode: 0o600 });
    if (statOrMissing(context.entry)) removeManagedEntry(context, context.entry);
    fs.renameSync(staging, context.entry);
  } finally {
    if (statOrMissing(staging)) removeManagedEntry(context, staging);
  }
}

module.exports = { inventory, localCacheContext, restoreLocalCache, saveLocalCache };
