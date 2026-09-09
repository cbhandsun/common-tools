"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_PRODUCTION_ENV_FILE_BYTES = 64 * 1024;
const PRODUCTION_ENV_NAME = /^COMMON_TOOLS_[A-Z0-9_]{1,120}$/u;

function isSet(environment, name) {
  return typeof environment?.[name] === "string" && Boolean(environment[name].trim());
}

function normalizeProductionEnvFilePath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) throw new TypeError("--production-env-file is required");
  if (filePath.includes("\0")) throw new TypeError("--production-env-file contains an invalid path character");
  if (!path.isAbsolute(filePath)) throw new TypeError("--production-env-file must be an absolute path");
  return path.resolve(filePath);
}

function parseProductionEnvFileValue(rawValue, lineNumber) {
  if (rawValue.includes("\0")) throw new TypeError(`production env file line ${lineNumber} contains an invalid value`);
  const value = rawValue.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "\"" || first === "'") || (last === "\"" || last === "'")) {
      if (!((first === "\"" && last === "\"") || (first === "'" && last === "'"))) {
        throw new TypeError(`production env file line ${lineNumber} has an unterminated quoted value`);
      }
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("\"") || value.startsWith("'") || value.endsWith("\"") || value.endsWith("'")) {
    throw new TypeError(`production env file line ${lineNumber} has an unterminated quoted value`);
  }
  return value;
}

function parseProductionEnvFileContent(content) {
  if (typeof content !== "string") throw new TypeError("production env file content is invalid");
  const parsed = {};
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].replace(/\r$/u, "");
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const assignment = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
    const separator = assignment.indexOf("=");
    if (separator <= 0) throw new TypeError(`production env file line ${lineNumber} must be KEY=VALUE`);
    const name = assignment.slice(0, separator).trim();
    if (!PRODUCTION_ENV_NAME.test(name)) throw new TypeError(`production env file line ${lineNumber} has an unsupported variable name`);
    if (Object.hasOwn(parsed, name)) throw new TypeError(`production env file line ${lineNumber} duplicates ${name}`);
    parsed[name] = parseProductionEnvFileValue(assignment.slice(separator + 1), lineNumber);
  }
  return Object.freeze(parsed);
}

function readProductionEnvFile(filePath, fileSystem = fs) {
  const resolved = normalizeProductionEnvFilePath(filePath);
  let stat;
  try {
    stat = fileSystem.lstatSync(resolved);
  } catch {
    throw new TypeError("--production-env-file must point to an existing file");
  }
  if (stat.isSymbolicLink()) throw new TypeError("--production-env-file must not be a symbolic link");
  if (!stat.isFile()) throw new TypeError("--production-env-file must point to a file");
  if (stat.size > MAX_PRODUCTION_ENV_FILE_BYTES) throw new TypeError("--production-env-file is too large");
  try {
    return parseProductionEnvFileContent(fileSystem.readFileSync(resolved, "utf8"));
  } catch {
    throw new TypeError("--production-env-file could not be read");
  }
}

function environmentWithProductionEnvFile(environment, filePath, fileSystem = fs) {
  if (!environment || typeof environment !== "object") throw new TypeError("production environment is invalid");
  const fileEnvironment = readProductionEnvFile(filePath, fileSystem);
  const merged = { ...environment };
  for (const [name, value] of Object.entries(fileEnvironment)) {
    if (isSet(merged, name)) throw new TypeError(`--production-env-file duplicates existing ${name}`);
    merged[name] = value;
  }
  return Object.freeze(merged);
}

module.exports = {
  MAX_PRODUCTION_ENV_FILE_BYTES,
  environmentWithProductionEnvFile,
  normalizeProductionEnvFilePath,
  parseProductionEnvFileContent,
  readProductionEnvFile
};
