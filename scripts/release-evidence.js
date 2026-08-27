#!/usr/bin/env node
"use strict";

// A release evidence document intentionally has no timestamp or local paths.  It
// can therefore be regenerated and independently verified before a release is
// signed by the organization's key-management system.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createSbom } = require("./generate-sbom");

const SCHEMA_VERSION = "1.1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVISION_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const MAX_EVIDENCE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_RELEASE_MANIFEST_BYTES = 1024 * 1024;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function assertString(value, label) { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is invalid`); return value.trim(); }
function assertKeys(value, expected, label) {
  if (!plainObject(value) || Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) throw new TypeError(`${label} is invalid`);
}
function sha256File(filePath) {
  const target = path.resolve(assertString(filePath, "file path"));
  const details = fs.lstatSync(target);
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_EVIDENCE_FILE_BYTES) throw new Error("release evidence input is invalid");
  return crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}
function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(path.resolve(assertString(filePath, label)), "utf8")); } catch { throw new Error(`${label} is not valid JSON`); }
}
function assertRevision(value) {
  const revision = assertString(value, "revision").toLowerCase();
  if (!REVISION_PATTERN.test(revision)) throw new Error("revision must be a 40 or 64 character lowercase Git digest");
  return revision;
}
function assertSemver(value, label) {
  const version = assertString(value, label);
  if (!SEMVER_PATTERN.test(version)) throw new Error(`${label} is invalid`);
  return version;
}
function normalizeImageReference(value) {
  const reference = assertString(value, "image reference");
  const match = /^(.+)@sha256:([a-f0-9]{64})$/.exec(reference);
  if (!match) throw new Error("image reference must be immutable and use a sha256 digest");
  const name = match[1];
  const finalSegment = name.slice(name.lastIndexOf("/") + 1);
  if (name.length > 255 || !/^[a-z0-9][a-z0-9._:/-]*[a-z0-9]$/.test(name) || name.includes("//") || name.includes("..") || finalSegment.includes(":")) {
    throw new Error("image reference name is invalid");
  }
  return `${name}@sha256:${match[2]}`;
}
function normalizeImages(images) {
  if (!Array.isArray(images)) throw new TypeError("images are invalid");
  const normalized = images.map(normalizeImageReference).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error("image references must be unique");
  return Object.freeze(normalized);
}
function normalizeRawImageOcrProfiles(profiles, images) {
  if (!Array.isArray(profiles)) throw new TypeError("raw image OCR profiles are invalid");
  const imageSet = new Set(normalizeImages(images));
  const normalized = profiles.map((profile) => {
    assertKeys(profile, ["name", "image", "executable", "executableSha256", "languages", "license"], "raw image OCR profile");
    const name = assertString(profile.name, "raw image OCR profile name");
    if (name !== "tesseract-tsv-v1") throw new Error("raw image OCR profile name is unsupported");
    const image = normalizeImageReference(profile.image);
    if (!imageSet.has(image)) throw new Error("raw image OCR profile image is not a release image");
    const executable = assertString(profile.executable, "raw image OCR executable");
    if (!/^\/[A-Za-z0-9._/-]{1,255}$/.test(executable) || executable.includes("//") || executable.includes("..")) throw new Error("raw image OCR executable is invalid");
    const executableSha256 = assertString(profile.executableSha256, "raw image OCR executable digest").toLowerCase();
    if (!SHA256_PATTERN.test(executableSha256)) throw new Error("raw image OCR executable digest is invalid");
    if (!Array.isArray(profile.languages) || !profile.languages.length || profile.languages.length > 5 || new Set(profile.languages).size !== profile.languages.length || profile.languages.some((language) => typeof language !== "string" || !/^(?:eng|chi_sim|chi_tra|jpn|kor)$/.test(language))) throw new Error("raw image OCR languages are invalid");
    const license = assertString(profile.license, "raw image OCR license");
    if (!/^[A-Za-z0-9.+()\- ]{1,128}$/.test(license)) throw new Error("raw image OCR license is invalid");
    return Object.freeze({ name, image, executable, executableSha256, languages: Object.freeze([...profile.languages]), license });
  }).sort((left, right) => `${left.image}\u0000${left.name}`.localeCompare(`${right.image}\u0000${right.name}`));
  if (new Set(normalized.map((profile) => `${profile.image}\u0000${profile.name}`)).size !== normalized.length) throw new Error("raw image OCR profiles must be unique");
  return Object.freeze(normalized);
}
function packageIdentity({ packagePath, lockPath }) {
  const packageJson = readJson(packagePath, "package manifest");
  const lock = readJson(lockPath, "package lock");
  const name = assertString(packageJson?.name, "package name");
  const version = assertSemver(packageJson?.version, "package version");
  if (!plainObject(lock?.packages) || !plainObject(lock.packages[""]) || lock.packages[""].name !== name || lock.packages[""].version !== version) {
    throw new Error("package manifest and lock are inconsistent");
  }
  return Object.freeze({ name, version, packageLockSha256: sha256File(lockPath) });
}
function assertSbomForLock(sbomPath, lockPath) {
  const lock = readJson(lockPath, "package lock");
  const sbom = readJson(sbomPath, "SBOM");
  if (JSON.stringify(sbom) !== JSON.stringify(createSbom(lock))) throw new Error("SBOM does not match the package lock");
}
function createReleaseEvidence({ packagePath = "package.json", lockPath = "package-lock.json", sbomPath, revision, images = [], rawImageOcrProfiles = [] }) {
  const identity = packageIdentity({ packagePath, lockPath });
  const sbomFile = path.basename(path.resolve(assertString(sbomPath, "SBOM path")));
  if (!sbomFile || sbomFile === "." || sbomFile === path.sep) throw new Error("SBOM path is invalid");
  assertSbomForLock(sbomPath, lockPath);
  const normalizedImages = normalizeImages(images);
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    runtime: identity,
    source: Object.freeze({ revision: assertRevision(revision) }),
    artifacts: Object.freeze({ sbom: Object.freeze({ file: sbomFile, sha256: sha256File(sbomPath) }) }),
    images: normalizedImages,
    rawImageOcrProfiles: normalizeRawImageOcrProfiles(rawImageOcrProfiles, normalizedImages)
  });
}
function assertReleaseEvidence(value) {
  assertKeys(value, ["schemaVersion", "runtime", "source", "artifacts", "images", "rawImageOcrProfiles"], "release evidence");
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error("release evidence schema version is unsupported");
  assertKeys(value.runtime, ["name", "version", "packageLockSha256"], "release runtime");
  assertString(value.runtime.name, "release runtime name");
  assertSemver(value.runtime.version, "release runtime version");
  if (typeof value.runtime.packageLockSha256 !== "string" || !SHA256_PATTERN.test(value.runtime.packageLockSha256)) throw new Error("release package lock digest is invalid");
  assertKeys(value.source, ["revision"], "release source");
  assertRevision(value.source.revision);
  assertKeys(value.artifacts, ["sbom"], "release artifacts");
  assertKeys(value.artifacts.sbom, ["file", "sha256"], "release SBOM");
  if (path.basename(value.artifacts.sbom.file || "") !== value.artifacts.sbom.file || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.artifacts.sbom.file) || !SHA256_PATTERN.test(value.artifacts.sbom.sha256 || "")) throw new Error("release SBOM is invalid");
  normalizeRawImageOcrProfiles(value.rawImageOcrProfiles, value.images);
  return value;
}
function readReleaseEvidenceFile(manifestPath) {
  const target = path.resolve(assertString(manifestPath, "release evidence path"));
  let details;
  try { details = fs.lstatSync(target); } catch { throw new Error("release evidence file is unavailable"); }
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_RELEASE_MANIFEST_BYTES) throw new Error("release evidence file is invalid");
  let value;
  try { value = JSON.parse(fs.readFileSync(target, "utf8")); } catch { throw new Error("release evidence is not valid JSON"); }
  return Object.freeze({ evidence: assertReleaseEvidence(value), manifestPath: target });
}
function writeReleaseEvidence({ outputPath, ...options }) {
  const evidence = createReleaseEvidence(options);
  const target = path.resolve(assertString(outputPath, "output path"));
  if (fs.existsSync(target)) throw new Error("release evidence output already exists");
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return Object.freeze({ evidence, outputPath: target, deployable: evidence.images.length > 0 });
}
function verifyReleaseEvidence({ manifestPath, packagePath = "package.json", lockPath = "package-lock.json", sbomPath }) {
  const evidence = readReleaseEvidenceFile(manifestPath).evidence;
  const expected = createReleaseEvidence({ packagePath, lockPath, sbomPath, revision: evidence.source.revision, images: evidence.images, rawImageOcrProfiles: evidence.rawImageOcrProfiles });
  if (JSON.stringify(evidence) !== JSON.stringify(expected)) throw new Error("release evidence does not match its inputs");
  return Object.freeze({ evidence, deployable: evidence.images.length > 0 });
}
function verifyReleaseEvidenceFile({ manifestPath, packagePath = "package.json", lockPath = "package-lock.json" }) {
  const document = readReleaseEvidenceFile(manifestPath);
  const sbomPath = path.join(path.dirname(document.manifestPath), document.evidence.artifacts.sbom.file);
  return verifyReleaseEvidence({ manifestPath: document.manifestPath, packagePath, lockPath, sbomPath });
}
function parseArguments(argv) {
  const options = { packagePath: "package.json", lockPath: "package-lock.json", sbomPath: "artifacts/common-tools.spdx.json", outputPath: "artifacts/common-tools.release.json", images: [], rawImageOcrProfilePaths: [], verify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--verify") { options.verify = true; continue; }
    if (argument === "--image") {
      const value = argv[index + 1];
      if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error("--image requires a value");
      options.images.push(value); index += 1; continue;
    }
    if (argument === "--raw-image-ocr-profile") {
      const value = argv[index + 1];
      if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error("--raw-image-ocr-profile requires a value");
      options.rawImageOcrProfilePaths.push(value); index += 1; continue;
    }
    const field = { "--package": "packagePath", "--lock": "lockPath", "--sbom": "sbomPath", "--output": "outputPath", "--manifest": "manifestPath", "--revision": "revision" }[argument];
    if (!field) throw new Error(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[field] = value; index += 1;
  }
  if (options.verify) {
    if (!options.manifestPath) options.manifestPath = options.outputPath;
  } else if (!options.revision) throw new Error("--revision is required");
  options.rawImageOcrProfiles = options.rawImageOcrProfilePaths.map((profilePath) => readJson(profilePath, "raw image OCR profile"));
  delete options.rawImageOcrProfilePaths;
  return options;
}
if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = options.verify ? (options.sbomPath ? verifyReleaseEvidence(options) : verifyReleaseEvidenceFile(options)) : writeReleaseEvidence(options);
    process.stdout.write(`release evidence ${options.verify ? "verified" : "generated"} (${result.deployable ? "deployable" : "source-only"})\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "release evidence failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = { SCHEMA_VERSION, assertReleaseEvidence, assertRevision, assertSbomForLock, createReleaseEvidence, normalizeImageReference, normalizeImages, normalizeRawImageOcrProfiles, packageIdentity, parseArguments, readReleaseEvidenceFile, sha256File, verifyReleaseEvidence, verifyReleaseEvidenceFile, writeReleaseEvidence };
