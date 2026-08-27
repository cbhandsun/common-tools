#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeImageReference } = require("./release-evidence");

const DEFAULT_RUNTIME_IMAGE = "common-tools-image-to-editable-ocr:local";
const MAX_OUTPUT_BYTES = 16 * 1024;

function assertRuntimeImage(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._/:@-]{0,255}$/.test(value) || value.includes("//") || value.includes("..")) throw new Error("runtime image is invalid");
  return value;
}
function normalizeLicense(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9.+()\- ]{1,128}$/.test(value)) throw new Error("license is invalid");
  return value;
}
function parseArguments(argv) {
  const options = { runtimeImage: DEFAULT_RUNTIME_IMAGE, license: "Apache-2.0" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const field = { "--image": "image", "--runtime-image": "runtimeImage", "--output": "output", "--license": "license" }[argument];
    if (!field) throw new Error(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[field] = value; index += 1;
  }
  if (!options.image || !options.output) throw new Error("--image and --output are required");
  options.image = normalizeImageReference(options.image);
  options.runtimeImage = assertRuntimeImage(options.runtimeImage);
  options.license = normalizeLicense(options.license);
  return Object.freeze(options);
}
function runDocker(args, commandRunner = childProcess.spawnSync) {
  const result = commandRunner("docker", args, { encoding: "utf8", windowsHide: true, shell: false });
  if (!result || result.error || result.status !== 0 || Buffer.byteLength(result.stdout || "", "utf8") > MAX_OUTPUT_BYTES) throw new Error("OCR runtime image inspection failed");
  return result.stdout || "";
}
function inspectOcrRuntimeImage(runtimeImage, { commandRunner = childProcess.spawnSync } = {}) {
  assertRuntimeImage(runtimeImage);
  const imageId = runDocker(["image", "inspect", "--format", "{{.Id}}", runtimeImage], commandRunner).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error("OCR runtime image inspection failed");
  const probe = "set -eu; sha256sum /usr/bin/tesseract | awk '{print $1}'; tesseract --list-langs | grep -E '^(eng|chi_sim)$' | sort";
  const lines = runDocker(["run", "--rm", "--network", "none", "--read-only", "--user", "10001:10001", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--entrypoint", "/bin/sh", runtimeImage, "-c", probe], commandRunner).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (lines.length !== 3 || !/^[a-f0-9]{64}$/.test(lines[0]) || lines[1] !== "chi_sim" || lines[2] !== "eng") throw new Error("OCR runtime image profile is invalid");
  return Object.freeze({ executable: "/usr/bin/tesseract", executableSha256: lines[0], languages: Object.freeze(["eng", "chi_sim"]) });
}
function safeOutput(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("release input output is invalid");
  const target = path.resolve(value.trim());
  if (fs.existsSync(target)) throw new Error("release input output already exists");
  let parent;
  try { parent = fs.lstatSync(path.dirname(target)); } catch { throw new Error("release input output directory is unavailable"); }
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("release input output directory is invalid");
  return target;
}
function writeRawImageOcrReleaseInput({ image, runtimeImage = DEFAULT_RUNTIME_IMAGE, output, license = "Apache-2.0" }, { commandRunner = childProcess.spawnSync } = {}) {
  const normalizedImage = normalizeImageReference(image);
  const normalizedRuntimeImage = assertRuntimeImage(runtimeImage);
  const normalizedLicense = normalizeLicense(license);
  const target = safeOutput(output);
  const profile = inspectOcrRuntimeImage(normalizedRuntimeImage, { commandRunner });
  const value = { name: "tesseract-tsv-v1", image: normalizedImage, executable: profile.executable, executableSha256: profile.executableSha256, languages: [...profile.languages], license: normalizedLicense };
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, body, { encoding: "utf8", mode: 0o600, flag: "wx" }); fs.renameSync(temporary, target); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch { /* Preserve the primary release-input failure. */ } throw error; }
  return Object.freeze({ output: target, profile: Object.freeze(value) });
}
if (require.main === module) {
  try { const result = writeRawImageOcrReleaseInput(parseArguments(process.argv.slice(2))); process.stdout.write(`${JSON.stringify(result)}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "OCR release input generation failed"}\n`); process.exitCode = 1; }
}

module.exports = { DEFAULT_RUNTIME_IMAGE, inspectOcrRuntimeImage, parseArguments, writeRawImageOcrReleaseInput };
