"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SKILL_ROOT = path.join(ROOT, "skills", "pd-hifi-slideclone");
const PROFILE_ROOT = path.join(SKILL_ROOT, "profiles");
const REGISTRY_FILE = path.join(PROFILE_ROOT, "registry.json");
const MAX_PROFILE_BYTES = 64 * 1024;
const MAX_REGISTRY_BYTES = 512 * 1024;
const MAX_ARGUMENTS = 128;
const MAX_PROFILES = 256;
let cachedRegistry = null;

function parseCli(argv = process.argv.slice(2)) {
  const separator = argv.indexOf("--");
  const profileArgs = separator >= 0 ? argv.slice(0, separator) : argv;
  const extraArgs = separator >= 0 ? argv.slice(separator + 1) : [];
  if (profileArgs.length !== 1) throw new Error("usage: slideclone-profile <profile> [-- <extra args>]");
  return { name: validateProfileName(profileArgs[0]), extraArgs: validateArguments(extraArgs, "extra arguments") };
}

function validateProfileName(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error("slideclone profile name is invalid");
  }
  return value;
}

function validateArguments(value, label) {
  if (!Array.isArray(value) || value.length > MAX_ARGUMENTS) throw new Error(`${label} are invalid`);
  return value.map((argument) => {
    if (typeof argument !== "string" || argument.length > 32768 || argument.includes("\0")) throw new Error(`${label} are invalid`);
    return argument;
  });
}

function loadProfile(name) {
  const approvedName = validateProfileName(name);
  const registry = loadRegistry();
  if (registry[approvedName]) return resolveProfile(approvedName, registry[approvedName]);
  const profileFile = path.join(PROFILE_ROOT, `${approvedName}.json`);
  const stat = fs.lstatSync(profileFile, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_PROFILE_BYTES) {
    throw new Error(`slideclone profile does not exist: ${approvedName}`);
  }
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(profileFile, "utf8"));
  } catch {
    throw new Error(`slideclone profile is invalid JSON: ${approvedName}`);
  }
  return resolveProfile(approvedName, profile);
}

function loadRegistry() {
  if (cachedRegistry) return cachedRegistry;
  const stat = fs.lstatSync(REGISTRY_FILE, { throwIfNoEntry: false });
  if (!stat) return Object.freeze({});
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_REGISTRY_BYTES) {
    throw new Error("slideclone profile registry is unavailable");
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
  } catch {
    throw new Error("slideclone profile registry is invalid JSON");
  }
  if (!registry || typeof registry !== "object" || Array.isArray(registry) || registry.version !== 1
    || !registry.profiles || typeof registry.profiles !== "object" || Array.isArray(registry.profiles)
    || Object.keys(registry).some((key) => !["version", "profiles"].includes(key))) {
    throw new Error("slideclone profile registry has an invalid shape");
  }
  const entries = Object.entries(registry.profiles);
  if (entries.length < 1 || entries.length > MAX_PROFILES) throw new Error("slideclone profile registry size is invalid");
  const profiles = {};
  for (const [name, profile] of entries) profiles[validateProfileName(name)] = validateProfileDefinition(name, profile);
  cachedRegistry = Object.freeze(profiles);
  return cachedRegistry;
}

function validateProfileDefinition(name, profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile) || Object.keys(profile).some((key) => !["description", "script", "args"].includes(key))) {
    throw new Error(`slideclone profile has an invalid shape: ${name}`);
  }
  if (typeof profile.script !== "string" || !profile.script.startsWith("scripts/") || !profile.script.endsWith(".js") || profile.script.includes("\\") || profile.script.includes("\0")) {
    throw new Error(`slideclone profile script is invalid: ${name}`);
  }
  return Object.freeze({
    description: typeof profile.description === "string" && profile.description.length <= 512 ? profile.description : "",
    script: profile.script,
    args: Object.freeze(validateArguments(profile.args || [], "profile arguments"))
  });
}

function resolveProfile(name, rawProfile) {
  const profile = validateProfileDefinition(name, rawProfile);
  const script = path.resolve(SKILL_ROOT, profile.script);
  const relative = path.relative(path.join(SKILL_ROOT, "scripts"), script);
  const scriptStat = fs.lstatSync(script, { throwIfNoEntry: false });
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !scriptStat?.isFile() || scriptStat.isSymbolicLink()) {
    throw new Error(`slideclone profile script is unavailable: ${name}`);
  }
  return Object.freeze({ name, script, args: profile.args });
}

function buildInvocation(name, extraArgs = []) {
  const profile = loadProfile(name);
  return Object.freeze({ command: process.execPath, args: Object.freeze([profile.script, ...profile.args, ...validateArguments(extraArgs, "extra arguments")]), cwd: ROOT });
}

function runProfile(name, extraArgs = []) {
  const invocation = buildInvocation(name, extraArgs);
  const result = spawnSync(invocation.command, invocation.args, { cwd: invocation.cwd, stdio: "inherit", windowsHide: true });
  if (result.error) throw new Error(`slideclone profile failed to start: ${name}`);
  return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
  try {
    const { name, extraArgs } = parseCli();
    process.exitCode = runProfile(name, extraArgs);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "slideclone profile failed");
    process.exitCode = 1;
  }
}

module.exports = {
  MAX_ARGUMENTS,
  MAX_PROFILES,
  buildInvocation,
  loadProfile,
  loadRegistry,
  parseCli,
  runProfile,
  validateArguments,
  validateProfileName
};
