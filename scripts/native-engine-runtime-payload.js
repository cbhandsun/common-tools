#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const policyFile = path.join(root, "config", "native-engine-runtime-payload.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.includes("\\") || path.isAbsolute(value) || value.includes("\0")) {
    throw new TypeError(`${label} path is invalid`);
  }
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new TypeError(`${label} path escapes repository`);
  return value;
}

function safeName(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function safeNameList(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} is invalid`);
  const names = value.map((item) => safeName(item, label)).sort();
  if (new Set(names).size !== names.length) throw new TypeError(`${label} contains duplicates`);
  return Object.freeze(names);
}

function safeNameMap(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) throw new TypeError(`${label} is invalid`);
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([name, list]) => [
    safeName(name, label),
    safeNameList(list, `${label}.${name}`)
  ]).sort(([left], [right]) => left.localeCompare(right))));
}

function validatePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) throw new TypeError("native engine runtime payload policy is invalid");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "directories,entrypoint,forbiddenRepositoryPaths,managedBy,packageName,packageRoot,payloadRoot,rootScriptGroups,rootScripts,runtimeEntrypoint,version") {
    throw new TypeError("native engine runtime payload policy keys are invalid");
  }
  if (value.packageName !== "@common-tools/slideclone-native-engine") throw new TypeError("native engine runtime payload package is invalid");
  if (!Array.isArray(value.managedBy) || value.managedBy.some((item) => typeof item !== "string" || item.length === 0 || item.length > 128)) {
    throw new TypeError("native engine runtime payload managedBy is invalid");
  }
  const rootScripts = safeNameList(value.rootScripts, "rootScripts");
  const rootScriptGroups = safeNameMap(value.rootScriptGroups, "rootScriptGroups");
  const groupedScripts = Object.values(rootScriptGroups).flat().sort();
  if (groupedScripts.join("\n") !== rootScripts.join("\n")) throw new TypeError("native engine runtime payload root script groups must cover rootScripts exactly once");
  return Object.freeze({
    version: 1,
    packageName: value.packageName,
    packageRoot: safeRelativePath(value.packageRoot, "packageRoot"),
    payloadRoot: safeRelativePath(value.payloadRoot, "payloadRoot"),
    entrypoint: safeRelativePath(value.entrypoint, "entrypoint"),
    runtimeEntrypoint: safeName(value.runtimeEntrypoint, "runtimeEntrypoint"),
    managedBy: Object.freeze([...value.managedBy]),
    directories: safeNameList(value.directories, "directories"),
    rootScripts,
    rootScriptGroups,
    forbiddenRepositoryPaths: Object.freeze(value.forbiddenRepositoryPaths.map((item) => safeRelativePath(item, "forbiddenRepositoryPaths")).sort())
  });
}

function loadPolicy(file = policyFile) {
  return validatePolicy(readJson(file));
}

function resolveRepositoryPath(repositoryRoot, relativePath) {
  return path.join(repositoryRoot, relativePath);
}

function isWithin(directory, file) {
  const relative = path.relative(directory, file);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function isRuntimePayloadPath(file, policy = loadPolicy()) {
  return isWithin(resolveRepositoryPath(root, policy.payloadRoot), path.resolve(file));
}

function listFiles(directory, base = directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("native engine runtime payload must not contain symbolic links");
    if (entry.isDirectory()) files.push(...listFiles(target, base));
    else if (entry.isFile()) files.push(path.relative(base, target).replaceAll("\\", "/"));
  }
  return files;
}

function verifyNativeEngineRuntimePayload(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("native engine runtime payload verifier options are invalid");
  const policy = validatePolicy(options.policy || loadPolicy(options.policyFile));
  const repositoryRoot = options.repositoryRoot === undefined ? root : fs.realpathSync(options.repositoryRoot);
  const packageRoot = resolveRepositoryPath(repositoryRoot, policy.packageRoot);
  const payloadRoot = resolveRepositoryPath(repositoryRoot, policy.payloadRoot);
  const entrypoint = resolveRepositoryPath(repositoryRoot, policy.entrypoint);
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!fs.statSync(packageRoot, { throwIfNoEntry: false })?.isDirectory()) fail(`package root is missing: ${policy.packageRoot}`);
  if (!fs.statSync(payloadRoot, { throwIfNoEntry: false })?.isDirectory()) fail(`payload root is missing: ${policy.payloadRoot}`);
  if (!fs.statSync(entrypoint, { throwIfNoEntry: false })?.isFile()) fail(`entrypoint is missing: ${policy.entrypoint}`);

  for (const forbidden of policy.forbiddenRepositoryPaths) {
    if (fs.existsSync(resolveRepositoryPath(repositoryRoot, forbidden))) fail(`forbidden repository path exists: ${forbidden}`);
  }

  if (fs.statSync(payloadRoot, { throwIfNoEntry: false })?.isDirectory()) {
    for (const directory of policy.directories) {
      const directoryPath = path.join(payloadRoot, directory);
      if (!fs.statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory()) fail(`payload directory is missing: ${directory}`);
    }
    for (const script of policy.rootScripts) {
      if (!fs.statSync(path.join(payloadRoot, script), { throwIfNoEntry: false })?.isFile()) fail(`payload root script is missing: ${script}`);
    }
    const rootScripts = fs.readdirSync(payloadRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => entry.name)
      .sort();
    for (const script of rootScripts.filter((script) => !policy.rootScripts.includes(script))) fail(`payload root script is not declared: ${script}`);
    if (!policy.rootScriptGroups.productionEntrypoints?.includes(policy.runtimeEntrypoint)) fail(`runtime entrypoint is not classified as a production entrypoint: ${policy.runtimeEntrypoint}`);
    const files = listFiles(payloadRoot);
    if (files.length === 0) fail("payload root is empty");
  }

  if (fs.statSync(entrypoint, { throwIfNoEntry: false })?.isFile()) {
    const source = fs.readFileSync(entrypoint, "utf8");
    const bareRuntimeEntrypoint = policy.runtimeEntrypoint.replace(/\.js$/u, "");
    const expected = [
      `require("./scripts/${policy.runtimeEntrypoint}")`,
      `require("./scripts/${bareRuntimeEntrypoint}")`
    ];
    if (!expected.some((statement) => source.includes(statement))) fail(`entrypoint must load ./scripts/${bareRuntimeEntrypoint}`);
  }

  if (failures.length > 0) throw new Error(`native engine runtime payload verification failed:\n- ${failures.join("\n- ")}`);
  return Object.freeze({ packageRoot: policy.packageRoot, payloadRoot: policy.payloadRoot, rootScriptCount: policy.rootScripts.length, rootScriptGroupCount: Object.keys(policy.rootScriptGroups).length, directoryCount: policy.directories.length });
}

if (require.main === module) {
  try {
    const result = verifyNativeEngineRuntimePayload();
    process.stdout.write(`verified native engine runtime payload at ${result.payloadRoot} with ${result.rootScriptCount} root scripts across ${result.rootScriptGroupCount} groups and ${result.directoryCount} directories\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "native engine runtime payload verification failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  isRuntimePayloadPath,
  loadPolicy,
  validatePolicy,
  verifyNativeEngineRuntimePayload
};
