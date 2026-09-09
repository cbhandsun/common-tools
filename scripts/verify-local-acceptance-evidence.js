#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_EVIDENCE_DIRECTORY = path.join("artifacts", "local-acceptance");
const MAX_EVIDENCE_BYTES = 512 * 1024;
const SECRET_KEY_PATTERN = /(?:password|secret|token|cookie|authorization|signedurl|uploadurl|downloadurl|credential|header)/iu;
const SECRET_VALUE_PATTERN = /(?:Bearer\s+[A-Za-z0-9._~+/=-]{12,}|eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{12,}|postgres(?:ql)?:\/\/[^/\s:]+:[^@\s]+@|redis:\/\/[^/\s:]+:[^@\s]+@)/iu;

function parseArgs(argv) {
  const options = { evidenceFile: "", capabilities: "image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--evidence-file") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.startsWith("--")) throw new Error("--evidence-file requires a value");
      options.evidenceFile = value;
      index += 1;
    } else if (item === "--capabilities") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.startsWith("--")) throw new Error("--capabilities requires a value");
      options.capabilities = value;
      index += 1;
    } else {
      throw new Error(`unexpected argument: ${item}`);
    }
  }
  return options;
}

function parseCapabilityList(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("capabilities are invalid");
  const capabilities = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (capabilities.length === 0 || capabilities.some((item) => !/^[a-z][a-z0-9-]{2,63}$/u.test(item)) || new Set(capabilities).size !== capabilities.length) {
    throw new Error("capabilities are invalid");
  }
  return capabilities;
}

function assertRepositoryFile(repositoryRoot, file, label) {
  if (typeof file !== "string" || file.length === 0 || file.length > 4096 || file.includes("\0") || /[\r\n]/u.test(file)) throw new Error(`${label} is invalid`);
  const resolved = path.resolve(repositoryRoot, file);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the repository`);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0 || stat.size > MAX_EVIDENCE_BYTES) throw new Error(`${label} is invalid`);
  return resolved;
}

function latestEvidenceFile(repositoryRoot) {
  const directory = path.resolve(repositoryRoot, DEFAULT_EVIDENCE_DIRECTORY);
  const relative = path.relative(repositoryRoot, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("local acceptance evidence directory is invalid");
  if (!fs.existsSync(directory)) throw new Error("local acceptance evidence file is unavailable");
  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^local-acceptance-\d{8}T\d{6}-[a-f0-9]{32}\.json$/u.test(entry.name))
    .map((entry) => {
      const file = path.join(directory, entry.name);
      return { file, mtimeMs: fs.statSync(file).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (candidates.length === 0) throw new Error("local acceptance evidence file is unavailable");
  return assertRepositoryFile(repositoryRoot, candidates[0].file, "local acceptance evidence file");
}

function readEvidenceFile(repositoryRoot, evidenceFile) {
  const file = evidenceFile ? assertRepositoryFile(repositoryRoot, evidenceFile, "local acceptance evidence file") : latestEvidenceFile(repositoryRoot);
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error("local acceptance evidence JSON is invalid"); }
  return { file, evidence };
}

function walkForSecrets(value, pathParts = []) {
  const findings = [];
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => findings.push(...walkForSecrets(item, [...pathParts, String(index)])));
      return findings;
    }
    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (SECRET_KEY_PATTERN.test(key)) findings.push(nextPath.join("."));
      findings.push(...walkForSecrets(child, nextPath));
    }
    return findings;
  }
  if (typeof value === "string" && SECRET_VALUE_PATTERN.test(value)) findings.push(pathParts.join(".") || "<root>");
  return findings;
}

function validateEvidence(evidence, expectedCapabilities) {
  const failures = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) failures.push("evidence must be an object");
  if (failures.length > 0) return Object.freeze({ passed: false, failures });

  if (evidence.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (evidence.passed !== true) failures.push("evidence.passed must be true");
  if (typeof evidence.project !== "string" || !evidence.project) failures.push("project is required");
  if (typeof evidence.capability !== "string" || !expectedCapabilities.includes(evidence.capability)) failures.push("capability is not one of the expected capabilities");
  if (!Array.isArray(evidence.capabilities) || expectedCapabilities.some((capability) => !evidence.capabilities.includes(capability))) failures.push("capabilities do not cover the expected local runtime scope");
  if (!evidence.localSmoke || typeof evidence.localSmoke !== "object" || evidence.localSmoke.runtimeOk !== true) failures.push("local smoke did not pass");
  if (evidence.localSmoke?.identityProviderVerified !== true) failures.push("local identity provider was not verified");
  if (evidence.localSmoke?.unauthorizedChallengeVerified !== true) failures.push("unauthorized MCP challenge was not verified");
  if (typeof evidence.localSmoke?.metadataScopesVerified !== "number" || evidence.localSmoke.metadataScopesVerified < expectedCapabilities.length) failures.push("capability metadata scopes were not fully verified");
  if (!evidence.testUser || typeof evidence.testUser !== "object") failures.push("test user evidence is missing");
  if (!(evidence.testUser?.changed === true || evidence.testUser?.status === "current")) failures.push("test user was not prepared or confirmed current");
  if (!evidence.authenticatedJobSmoke || typeof evidence.authenticatedJobSmoke !== "object" || evidence.authenticatedJobSmoke.passed !== true) failures.push("authenticated job smoke did not pass");
  if (typeof evidence.authenticatedJobSmoke?.jobId !== "string" || evidence.authenticatedJobSmoke.jobId.length === 0) failures.push("authenticated job id is missing");
  const secretFindings = walkForSecrets(evidence);
  if (secretFindings.length > 0) failures.push(`evidence contains secret-shaped fields: ${secretFindings.slice(0, 8).join(", ")}`);
  return Object.freeze({ passed: failures.length === 0, failures });
}

function verifyLocalAcceptanceEvidence(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || process.cwd());
  const expectedCapabilities = parseCapabilityList(options.capabilities || "image-to-editable,ppt-create,ppt-quality,ppt-improve,project-audit");
  const { file, evidence } = readEvidenceFile(repositoryRoot, options.evidenceFile || "");
  const result = validateEvidence(evidence, expectedCapabilities);
  return Object.freeze({ evidenceFile: file, expectedCapabilities, ...result });
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = verifyLocalAcceptanceEvidence(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.passed ? 0 : 2;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "local acceptance evidence verification failed"}\n`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, parseCapabilityList, readEvidenceFile, validateEvidence, verifyLocalAcceptanceEvidence, walkForSecrets };
