// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
/** @type {Readonly<Record<string, string>>} */
const MEDIA_TYPES = Object.freeze({ ".json": "application/json", ".html": "text/html", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pdf": "application/pdf" });
/** @typedef {Readonly<{name: string, file: string, mediaType: string}>} DeliveryArtifact */

/** @param {string} file @param {string} root */
function validateFile(file, root) {
  if (path.dirname(path.resolve(file)) !== root) throw new Error("editable delivery artifact is invalid");
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_ARTIFACT_BYTES) throw new Error("invalid file");
  } catch { throw new Error("editable delivery artifact file is invalid"); }
}

/** Validate every entry before the first external write; retain only known fields.
 * @param {unknown} value @param {string} root @returns {readonly DeliveryArtifact[]} */
function prepareDeliveryArtifacts(value, root) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new Error("editable delivery artifact list is invalid");
  const names = new Set();
  return Object.freeze(value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("editable delivery artifact is invalid");
    const { name, file, mediaType } = /** @type {Record<string, unknown>} */ (entry);
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9.-]{0,127}$/u.test(name) || path.posix.basename(name) !== name || names.has(name)
      || typeof file !== "string" || typeof mediaType !== "string" || MEDIA_TYPES[path.extname(name)] !== mediaType) throw new Error("editable delivery artifact is invalid");
    validateFile(file, root);
    names.add(name);
    return Object.freeze({ name, file, mediaType });
  }));
}

/** Recheck files after asynchronous writes of earlier artifacts.
 * @param {DeliveryArtifact} artifact @param {string} root @returns {Buffer} */
function readDeliveryArtifact(artifact, root) {
  validateFile(artifact.file, root);
  try {
    const body = fs.readFileSync(artifact.file);
    if (body.length < 1 || body.length > MAX_ARTIFACT_BYTES) throw new Error("invalid file size");
    return body;
  } catch { throw new Error("editable delivery artifact file is invalid"); }
}

module.exports = { MAX_ARTIFACT_BYTES, prepareDeliveryArtifacts, readDeliveryArtifact };
