"use strict";

const crypto = require("crypto");
const fs = require("fs");
const { listZipEntries, readZipEntry } = require("./pptx-inventory");

const DEFAULT_LIMITS = Object.freeze({
  maxPackageBytes: 512 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 1024 * 1024 * 1024
});

function fingerprintOoxmlPackage(file, options = {}) {
  const limits = readLimits(options);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new Error("OOXML package must reference an existing file");
  if (stat.size <= 0 || stat.size > limits.maxPackageBytes) throw new Error("OOXML package size is outside the allowed range");

  const buffer = fs.readFileSync(file);
  const entries = listZipEntries(buffer);
  if (entries.length === 0 || entries.length > limits.maxEntries) throw new Error("OOXML package entry count is outside the allowed range");

  const normalizedNames = new Set();
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const name = normalizeEntryName(entry.name);
    if (!name || normalizedNames.has(name)) throw new Error("OOXML package contains an invalid or duplicate entry name");
    normalizedNames.add(name);
    if (entry.uncompressedSize > limits.maxEntryBytes) throw new Error(`OOXML package entry is too large: ${name}`);
    totalUncompressedBytes += entry.uncompressedSize;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) throw new Error("OOXML package expands beyond the allowed size");
  }

  const hash = crypto.createHash("sha256");
  hash.update("slideclone-ooxml-content-v1\0");
  for (const entry of [...entries].sort((left, right) => normalizeEntryName(left.name).localeCompare(normalizeEntryName(right.name)))) {
    const name = normalizeEntryName(entry.name);
    const content = readZipEntry(buffer, entry.name, { maxBytes: limits.maxEntryBytes });
    if (!content || content.length !== entry.uncompressedSize) throw new Error(`OOXML package entry length mismatch: ${name}`);
    hash.update(String(Buffer.byteLength(name)));
    hash.update(":");
    hash.update(name);
    hash.update(":");
    hash.update(String(content.length));
    hash.update(":");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function normalizeEntryName(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function readLimits(options) {
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, fallback]) => {
    const value = Number(options[key]);
    return [key, Number.isSafeInteger(value) && value > 0 ? value : fallback];
  }));
}

module.exports = { DEFAULT_LIMITS, fingerprintOoxmlPackage, normalizeEntryName };
