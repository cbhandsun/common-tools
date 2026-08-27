#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertString(value, label) { if (typeof value !== "string" || !value) throw new TypeError(`${label} is invalid`); return value; }
function parseIntegrity(value) {
  if (typeof value !== "string") return undefined;
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return undefined;
  return { algorithm: match[1].toUpperCase(), checksumValue: Buffer.from(match[2], "base64").toString("hex").toUpperCase() };
}
function packageNameFromPath(packagePath) {
  if (typeof packagePath !== "string") return null;
  const marker = "node_modules/";
  const position = packagePath.lastIndexOf(marker);
  if (position < 0 || (position !== 0 && packagePath[position - 1] !== "/")) return null;
  const segments = packagePath.slice(position + marker.length).split("/");
  if (segments.length === 1 && !segments[0].startsWith("@")) return segments[0];
  if (segments.length === 2 && segments[0].startsWith("@")) return `${segments[0]}/${segments[1]}`;
  return null;
}
function packageEntry(name, version, packagePath, integrity) {
  const checksum = parseIntegrity(integrity);
  const entry = {
    SPDXID: `SPDXRef-Package-${sha256(`${name}\u0000${version}\u0000${packagePath}`).slice(0, 24)}`,
    name,
    versionInfo: version,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: "NOASSERTION",
    copyrightText: "NOASSERTION",
    primaryPackagePurpose: "LIBRARY"
  };
  if (checksum) entry.checksums = [checksum];
  return entry;
}
function createSbom(lock) {
  if (!lock || typeof lock !== "object" || Array.isArray(lock) || !Number.isSafeInteger(lock.lockfileVersion) || lock.lockfileVersion < 2 || !lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) throw new TypeError("package lock format is unsupported");
  const root = lock.packages[""];
  const rootName = assertString(root?.name, "root package name");
  const rootVersion = assertString(root?.version, "root package version");
  const components = [];
  for (const [packagePath, details] of Object.entries(lock.packages)) {
    const name = packageNameFromPath(packagePath);
    if (!name || !details || typeof details !== "object" || Array.isArray(details) || details.dev === true || details.link === true || typeof details.version !== "string" || !details.version) continue;
    components.push({ name, version: details.version, packagePath, integrity: details.integrity });
  }
  components.sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version) || left.packagePath.localeCompare(right.packagePath));
  const rootPackage = packageEntry(rootName, rootVersion, "", undefined);
  rootPackage.primaryPackagePurpose = "APPLICATION";
  const documentHash = sha256(JSON.stringify({ name: rootName, version: rootVersion, components }));
  const packages = [rootPackage, ...components.map((component) => packageEntry(component.name, component.version, component.packagePath, component.integrity))];
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${rootName}-${rootVersion}`,
    documentNamespace: `https://common-tools.invalid/spdx/${encodeURIComponent(rootName)}/${encodeURIComponent(rootVersion)}/${documentHash}`,
    creationInfo: { creators: ["Tool: common-tools-sbom"], created: "1970-01-01T00:00:00Z" },
    packages,
    relationships: [{ spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: rootPackage.SPDXID }]
  };
}
function generateSbom({ lockPath, outputPath }) {
  const source = fs.readFileSync(path.resolve(assertString(lockPath, "lock path")), "utf8");
  let lock;
  try { lock = JSON.parse(source); } catch { throw new Error("package lock is not valid JSON"); }
  const sbom = createSbom(lock);
  const target = path.resolve(assertString(outputPath, "output path"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(sbom, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return Object.freeze({ outputPath: target, packageCount: sbom.packages.length });
}
function parseArguments(argv) {
  const options = { lockPath: "package-lock.json", outputPath: "artifacts/common-tools.spdx.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--lock" || argument === "--output") {
      const value = argv[index + 1];
      if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[argument === "--lock" ? "lockPath" : "outputPath"] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}
if (require.main === module) {
  try {
    const result = generateSbom(parseArguments(process.argv.slice(2)));
    process.stdout.write(`SPDX SBOM generated (${result.packageCount} packages)\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "SBOM generation failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createSbom, generateSbom, packageNameFromPath, parseArguments, parseIntegrity };
