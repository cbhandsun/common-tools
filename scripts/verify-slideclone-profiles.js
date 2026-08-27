#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { loadProfile, loadRegistry } = require("./slideclone-profile");

const root = path.resolve(__dirname, "..");

function verifySlidecloneProfiles(packageFile = path.join(root, "package.json")) {
  const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8").replace(/^\uFEFF/u, ""));
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) throw new TypeError("package scripts are invalid");
  const registry = loadRegistry();
  const aliases = [];
  const errors = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith("slideclone:")) continue;
    if (typeof command !== "string" || command.length > 32768 || command.includes("\0")) {
      errors.push(`${name} has an invalid command`);
      continue;
    }
    if (command.startsWith("node skills/pd-hifi-slideclone/scripts/")) {
      errors.push(`${name} bypasses the versioned profile registry`);
      continue;
    }
    const match = /^node scripts\/slideclone-profile\.js ([a-z0-9][a-z0-9-]{0,63})$/u.exec(command);
    if (!match) continue;
    try {
      const profile = loadProfile(match[1]);
      aliases.push({ name, profile: profile.name });
    } catch (error) {
      errors.push(`${name} references an invalid profile: ${error.message}`);
    }
  }
  if (errors.length > 0) throw new Error(`slideclone profile verification failed:\n- ${errors.join("\n- ")}`);
  return Object.freeze({ profileCount: Object.keys(registry).length, aliasCount: aliases.length });
}

if (require.main === module) {
  try {
    const result = verifySlidecloneProfiles();
    process.stdout.write(`verified ${result.profileCount} slideclone profiles and ${result.aliasCount} package aliases\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { verifySlidecloneProfiles };
