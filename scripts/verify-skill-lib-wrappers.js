#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MAX_NON_WRAPPER_LINES = 50;
const WRAPPER_PATTERN = /module\.exports\s*=\s*require\(\s*["']\.\.\/\.\.\/\.\.\/\.\.\/packages\/slideclone-native-engine\/scripts\/lib\/[a-z0-9-]+["']\s*\)/u;

function listJavaScriptFiles(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("skill lib wrapper verification does not allow symbolic links");
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
  }
  return files;
}

function lineCount(source) {
  return source.split(/\r?\n/u).length;
}

function isPackageWrapper(source) {
  return WRAPPER_PATTERN.test(source.slice(0, 240));
}

function verifySkillLibWrappers(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const skillLib = path.resolve(options.skillLib || path.join(root, "skills", "pd-hifi-slideclone", "scripts", "lib"));
  const failures = [];
  for (const file of listJavaScriptFiles(skillLib)) {
    const source = fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
    const lines = lineCount(source);
    if (lines <= MAX_NON_WRAPPER_LINES || isPackageWrapper(source)) continue;
    failures.push(`${path.relative(root, file).replaceAll("\\", "/")} has ${lines} lines and is not a package wrapper`);
  }
  if (failures.length > 0) throw new Error(`skill lib wrapper verification failed:\n- ${failures.join("\n- ")}`);
  return Object.freeze({ checkedFiles: listJavaScriptFiles(skillLib).length, maxNonWrapperLines: MAX_NON_WRAPPER_LINES });
}

if (require.main === module) {
  try {
    const result = verifySkillLibWrappers();
    process.stdout.write(`verified ${result.checkedFiles} skill lib files; non-wrapper implementations are capped at ${result.maxNonWrapperLines} lines\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "skill lib wrapper verification failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = { isPackageWrapper, lineCount, verifySkillLibWrappers };
