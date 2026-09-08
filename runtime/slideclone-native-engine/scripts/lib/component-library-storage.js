"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_EXTENSIONS = new Set([".pptx", ".png", ".json", ".dll", ".pdb"]);
const SOURCE_HINTS = ["learned", "harvested", "installed", "applied", "manual"];
const EVIDENCE_HINTS = ["visual-regression", "before", "after", "render", "batch", "probe", "repair"];

function classifyStorageRole(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/bin/") || normalized.includes("/obj/")) return "tool-build-output";
  if (SOURCE_HINTS.some((hint) => normalized.includes(hint))) return "component-source";
  if (EVIDENCE_HINTS.some((hint) => normalized.includes(hint))) return "regenerable-evidence";
  if (normalized.endsWith(".json")) return "metadata";
  return "unclassified";
}

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function scanComponentLibrary(root, options = {}) {
  const extensions = options.extensions || DEFAULT_EXTENSIONS;
  const skipDirectories = new Set([".asset-store", "node_modules", ".git"]);
  const records = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirectories.has(entry.name)) visit(absolutePath);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!entry.isFile() || !extensions.has(extension)) continue;
      const stat = fs.statSync(absolutePath);
      records.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath),
        extension,
        bytes: stat.size,
        sha256: hashFile(absolutePath),
        role: classifyStorageRole(absolutePath)
      });
    }
  }

  if (fs.existsSync(root)) visit(root);
  return records.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function canonicalRank(record) {
  const sourceRank = record.role === "component-source" ? 0 : 1;
  const evidenceRank = record.role === "regenerable-evidence" ? 1 : 0;
  return [sourceRank, evidenceRank, record.relativePath.toLowerCase()];
}

function compareRank(left, right) {
  const a = canonicalRank(left);
  const b = canonicalRank(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

function sumBytes(records) {
  return records.reduce((total, record) => total + record.bytes, 0);
}

function bytesBy(records, getKey) {
  const buckets = new Map();
  for (const record of records) {
    const key = getKey(record);
    buckets.set(key, (buckets.get(key) || 0) + record.bytes);
  }
  return Object.fromEntries([...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function buildComponentLibraryStoragePlan(records) {
  const byHash = new Map();
  for (const record of records) {
    const group = byHash.get(record.sha256) || [];
    group.push(record);
    byHash.set(record.sha256, group);
  }

  const duplicateGroups = [];
  for (const [sha256, group] of byHash) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(compareRank);
    const [canonical, ...duplicates] = sorted;
    duplicateGroups.push({
      sha256,
      canonical: canonical.relativePath,
      bytesPerCopy: canonical.bytes,
      duplicatePaths: duplicates.map((record) => record.relativePath),
      reclaimableBytes: sumBytes(duplicates)
    });
  }
  duplicateGroups.sort((left, right) => right.reclaimableBytes - left.reclaimableBytes);

  const regenerableEvidence = records.filter((record) => record.role === "regenerable-evidence");
  const buildOutputs = records.filter((record) => record.role === "tool-build-output");
  const duplicateRecords = duplicateGroups.flatMap((group) => group.duplicatePaths);
  const duplicateByExtension = {};
  for (const group of duplicateGroups) {
    const extension = path.extname(group.canonical).toLowerCase() || "[none]";
    duplicateByExtension[extension] = (duplicateByExtension[extension] || 0) + group.reclaimableBytes;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      files: records.length,
      bytes: sumBytes(records),
      exactDuplicateGroups: duplicateGroups.length,
      exactDuplicateCopies: duplicateRecords.length,
      exactDuplicateReclaimableBytes: duplicateGroups.reduce((total, group) => total + group.reclaimableBytes, 0),
      regenerableEvidenceBytes: sumBytes(regenerableEvidence),
      toolBuildOutputBytes: sumBytes(buildOutputs),
      bytesByExtension: bytesBy(records, (record) => record.extension || "[none]"),
      bytesByRole: bytesBy(records, (record) => record.role),
      duplicateReclaimableBytesByExtension: Object.fromEntries(Object.entries(duplicateByExtension).sort(([left], [right]) => left.localeCompare(right)))
    },
    policy: {
      componentAssetStore: "Keep each downloaded component PPTX once at assets/sha256/<hash>.pptx; the component registry stores component IDs and source metadata as references.",
      evidenceRetention: "Keep metrics and manifests; render previews and batch outputs are regenerable evidence and should be pruned by a separate explicit retention command.",
      deduplication: "This report is read-only. Replacing exact duplicate paths with hard links is a separate opt-in operation after consumers are migrated to hash references."
    },
    duplicateGroups,
    regenerableEvidence: regenerableEvidence.map((record) => ({ path: record.relativePath, bytes: record.bytes, extension: record.extension })),
    toolBuildOutputs: buildOutputs.map((record) => ({ path: record.relativePath, bytes: record.bytes, extension: record.extension }))
  };
}

module.exports = {
  DEFAULT_EXTENSIONS,
  classifyStorageRole,
  scanComponentLibrary,
  buildComponentLibraryStoragePlan
};
