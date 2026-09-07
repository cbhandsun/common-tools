#!/usr/bin/env node
"use strict";

// Keep signature verification outside the release evidence document.  The
// document stays reproducible while the signature and public key can live in
// the release system or a secure deployment volume.
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeImageReference } = require("./release-evidence");

const MAX_SIGNATURE_INPUT_BYTES = 1024 * 1024;

function safeFile(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const target = path.resolve(value.trim());
  let details;
  try { details = fs.lstatSync(target); } catch { throw new Error(`${label} is unavailable`); }
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_SIGNATURE_INPUT_BYTES) throw new Error(`${label} is invalid`);
  return target;
}

function verifyReleaseSignature({ evidencePath, signaturePath, publicKeyPath, images, commandRunner = childProcess.spawnSync }) {
  if (!Array.isArray(images) || !images.length || images.some((image) => typeof image !== "string")) throw new Error("release signature images are invalid");
  if (typeof commandRunner !== "function") throw new TypeError("release signature command runner is invalid");
  const evidence = safeFile(evidencePath, "release evidence file");
  const signature = safeFile(signaturePath, "release signature file");
  const publicKey = safeFile(publicKeyPath, "Cosign public key file");
  const verifiedImages = [...new Set(images.map(normalizeImageReference))].sort();
  if (verifiedImages.length !== images.length) throw new Error("release signature images are invalid");
  const verify = (argumentsList) => {
    const result = commandRunner("cosign", argumentsList, { encoding: "utf8", windowsHide: true, shell: false });
    if (!result || result.error || result.status !== 0) throw new Error("Cosign release signature verification failed");
  };
  verify(["verify-blob", "--key", publicKey, "--signature", signature, evidence]);
  for (const image of verifiedImages) verify(["verify", "--key", publicKey, image]);
  return Object.freeze({ verified: true, images: Object.freeze(verifiedImages) });
}

module.exports = { MAX_SIGNATURE_INPUT_BYTES, safeFile, verifyReleaseSignature };
