#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const defaultBudgetFile = path.join(root, "config", "skill-source-migration-budget.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("\\") || path.isAbsolute(value)) throw new TypeError(`${label} is invalid`);
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new TypeError(`${label} is invalid`);
  return value;
}

function validateBudget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) throw new TypeError("skill source migration budget is invalid");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "legacySkillScriptPrefix,maxFileCount,maxReferenceCount,scanRoots,version") throw new TypeError("skill source migration budget is invalid");
  if (!Number.isSafeInteger(value.maxReferenceCount) || value.maxReferenceCount < 0 || !Number.isSafeInteger(value.maxFileCount) || value.maxFileCount < 0) throw new TypeError("skill source migration budget limits are invalid");
  if (!Array.isArray(value.scanRoots) || value.scanRoots.length === 0 || value.scanRoots.length > 16 || new Set(value.scanRoots).size !== value.scanRoots.length) throw new TypeError("skill source migration scan roots are invalid");
  return Object.freeze({
    version: 1,
    legacySkillScriptPrefix: safeRelativePath(value.legacySkillScriptPrefix, "legacy skill script prefix").replaceAll("\\", "/"),
    scanRoots: Object.freeze(value.scanRoots.map((entry) => safeRelativePath(entry, "skill source migration scan root"))),
    maxReferenceCount: value.maxReferenceCount,
    maxFileCount: value.maxFileCount
  });
}

function listJavaScriptFiles(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (["node_modules", "obj"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("skill source migration scan roots must not contain symbolic links");
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(target));
    else if (entry.isFile() && /\.[cm]?js$/u.test(entry.name)) files.push(target);
  }
  return files;
}

function countOccurrences(source, needle) {
  let count = 0;
  let index = source.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }
  return count;
}

function measureSkillSourceReferences(workspaceRoot = root, budget = validateBudget(readJson(defaultBudgetFile))) {
  const resolvedRoot = fs.realpathSync(workspaceRoot);
  const hits = [];
  for (const scanRoot of budget.scanRoots) {
    for (const file of listJavaScriptFiles(path.join(resolvedRoot, scanRoot))) {
      const source = fs.readFileSync(file, "utf8");
      const referenceCount = countOccurrences(source.replaceAll("\\", "/"), budget.legacySkillScriptPrefix);
      if (referenceCount > 0) hits.push(Object.freeze({ file: path.relative(resolvedRoot, file).replaceAll("\\", "/"), referenceCount }));
    }
  }
  return Object.freeze({
    legacySkillScriptPrefix: budget.legacySkillScriptPrefix,
    referenceCount: hits.reduce((total, hit) => total + hit.referenceCount, 0),
    fileCount: hits.length,
    files: Object.freeze(hits)
  });
}

function listSkillRootScripts(workspaceRoot = root, budget = validateBudget(readJson(defaultBudgetFile))) {
  const scriptRoot = path.join(fs.realpathSync(workspaceRoot), budget.legacySkillScriptPrefix);
  if (!fs.statSync(scriptRoot, { throwIfNoEntry: false })?.isDirectory()) return [];
  return fs.readdirSync(scriptRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(scriptRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function measureSkillRootScriptWrappers(workspaceRoot = root, budget = validateBudget(readJson(defaultBudgetFile))) {
  const scripts = listSkillRootScripts(workspaceRoot, budget);
  const violations = [];
  for (const file of scripts) {
    const source = fs.readFileSync(file, "utf8");
    const normalized = source.replaceAll("\\", "/");
    const lineCount = source.split(/\r?\n/u).length;
    const nativeRequireCount = countOccurrences(normalized, 'require("../../../packages/slideclone-native-engine/scripts/');
    const functionDeclarationCount = [...source.matchAll(/\bfunction\s+[A-Za-z0-9_]+\s*\(/gu)].length;
    if (nativeRequireCount !== 1 || lineCount > 24 || functionDeclarationCount > 0) {
      violations.push(Object.freeze({
        file: path.relative(fs.realpathSync(workspaceRoot), file).replaceAll("\\", "/"),
        lineCount,
        nativeRequireCount,
        functionDeclarationCount
      }));
    }
  }
  return Object.freeze({ scriptCount: scripts.length, violations: Object.freeze(violations) });
}

function verifySkillSourceMigrationBudget(options = {}) {
  const workspaceRoot = options.workspaceRoot || root;
  const budget = validateBudget(options.budget || readJson(options.budgetFile || defaultBudgetFile));
  const measured = measureSkillSourceReferences(workspaceRoot, budget);
  const wrappers = measureSkillRootScriptWrappers(workspaceRoot, budget);
  const failures = [];
  if (measured.referenceCount > budget.maxReferenceCount) failures.push(`legacy skill script references ${measured.referenceCount} exceed ${budget.maxReferenceCount}`);
  if (measured.fileCount > budget.maxFileCount) failures.push(`legacy skill script reference files ${measured.fileCount} exceed ${budget.maxFileCount}`);
  if (measured.referenceCount < budget.maxReferenceCount) failures.push(`legacy skill script references improved to ${measured.referenceCount}; ratchet maxReferenceCount down from ${budget.maxReferenceCount}`);
  if (measured.fileCount < budget.maxFileCount) failures.push(`legacy skill script reference files improved to ${measured.fileCount}; ratchet maxFileCount down from ${budget.maxFileCount}`);
  for (const violation of wrappers.violations) {
    failures.push(`skill root script is not a thin native-engine wrapper: ${violation.file}`);
  }
  if (failures.length) throw new Error(`skill source migration budget verification failed:\n- ${failures.join("\n- ")}`);
  return Object.freeze({ ...measured, skillRootScriptCount: wrappers.scriptCount });
}

if (require.main === module) {
  try {
    const result = verifySkillSourceMigrationBudget();
    process.stdout.write(`verified ${result.referenceCount} legacy skill script references across ${result.fileCount} files; budget is decreasing-only\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "skill source migration budget verification failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  countOccurrences,
  measureSkillRootScriptWrappers,
  measureSkillSourceReferences,
  validateBudget,
  verifySkillSourceMigrationBudget
};
