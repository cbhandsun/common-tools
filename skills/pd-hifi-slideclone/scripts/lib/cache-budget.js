"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STATE_FILE = ".slideclone-cache-maintenance.json";

function maintainHashedCache({ root, maxBytes, layout = "nested", intervalMs = 60 * 60 * 1000, force = false } = {}) {
  const cacheRoot = path.resolve(String(root || ""));
  const limit = boundedBytes(maxBytes);
  if (!root || !limit || !fs.existsSync(cacheRoot) || !fs.statSync(cacheRoot).isDirectory()) return { scanned: false, removed: 0, bytes: 0 };
  const stateFile = path.join(cacheRoot, STATE_FILE);
  const previous = readState(stateFile);
  if (!force && (!previous || Date.now() - previous.checkedAt < intervalMs)) {
    if (!previous) writeState(stateFile, { checkedAt: Date.now() });
    return { scanned: false, removed: 0, bytes: 0 };
  }
  const entries = listEntries(cacheRoot, layout);
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let removed = 0;
  if (bytes > limit) {
    const target = Math.floor(limit * 0.9);
    for (const entry of entries.sort((a, b) => a.mtimeMs - b.mtimeMs || a.file.localeCompare(b.file))) {
      if (bytes <= target) break;
      assertCacheChild(cacheRoot, entry.file);
      fs.rmSync(entry.file, { recursive: entry.directory, force: true });
      bytes -= entry.bytes;
      removed += 1;
    }
  }
  writeState(stateFile, { checkedAt: Date.now(), bytes, removed });
  return { scanned: true, removed, bytes };
}

function listEntries(root, layout) {
  if (layout === "flat") {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
      .map((entry) => entryInfo(path.join(root, entry.name), false));
  }
  const result = [];
  for (const prefix of fs.readdirSync(root, { withFileTypes: true })) {
    if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/.test(prefix.name)) continue;
    const prefixDir = path.join(root, prefix.name);
    for (const entry of fs.readdirSync(prefixDir, { withFileTypes: true })) {
      if (entry.isDirectory() && new RegExp(`^${prefix.name}[a-f0-9]{62}$`).test(entry.name)) result.push(entryInfo(path.join(prefixDir, entry.name), true));
    }
  }
  return result;
}

function entryInfo(file, directory) {
  const stat = fs.statSync(file);
  return { file, directory, bytes: directory ? directoryBytes(file) : stat.size, mtimeMs: stat.mtimeMs };
}

function directoryBytes(root) {
  let bytes = 0;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile()) bytes += fs.statSync(file).size;
    }
  }
  return bytes;
}

function assertCacheChild(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("cache maintenance target escaped its root");
}

function readState(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return Number.isSafeInteger(value.checkedAt) && value.checkedAt > 0 ? value : null;
  } catch { return null; }
}

function writeState(file, state) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch {
    try { fs.rmSync(temporary, { force: true }); } catch {}
  }
}

function boundedBytes(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1024 * 1024 && number <= 1024 * 1024 * 1024 * 1024 ? number : null;
}

module.exports = { maintainHashedCache };
