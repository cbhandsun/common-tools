// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { types } = require("node:util");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {string} root @param {string} file */
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** @param {string} root @param {string} realRoot @param {string} file */
function sourceIdentity(root, realRoot, file) {
  if (!inside(root, file)) throw new TypeError("owned source snapshot file is outside the root");
  const info = fs.lstatSync(file), real = fs.realpathSync(file);
  if (!info.isFile() || info.isSymbolicLink() || !inside(realRoot, real)) throw new TypeError("owned source snapshot file is invalid");
  const fd = fs.openSync(file, "r");
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size < 1 || before.size > 60 * 1024 * 1024) throw new RangeError("owned source snapshot size is invalid");
    const digest = crypto.createHash("sha256"), buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (offset < before.size) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!count) throw new Error("owned source changed during snapshot");
      digest.update(buffer.subarray(0, count)); offset += count;
    }
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("owned source changed during snapshot");
    return JSON.stringify([real, digest.digest("hex")]);
  } finally { fs.closeSync(fd); }
}
/** Pin all source pages for one progressive run, including pages with no selected text.
 * @param {unknown} input @returns {()=>void} */
function createOwnedSourceSnapshot(input) {
  if (!record(input) || typeof input.root !== "string" || input.root.length > 32768 || input.root.includes("\0") || !path.isAbsolute(input.root)
    || types.isProxy(input.sourceImages) || !Array.isArray(input.sourceImages)
    || input.sourceImages.length < 1 || input.sourceImages.length > 20) throw new TypeError("owned source snapshot request is invalid");
  const root = path.resolve(input.root), info = fs.lstatSync(root), realRoot = fs.realpathSync(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new TypeError("owned source snapshot root is invalid");
  /** @type {string[]} */ const files = [];
  for (let index = 0; index < input.sourceImages.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input.sourceImages, String(index));
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string" || descriptor.value.length > 32768
      || descriptor.value.includes("\0") || !path.isAbsolute(descriptor.value)) {
      throw new TypeError("owned source snapshot path is invalid");
    }
    files.push(path.resolve(descriptor.value));
  }
  const identities = files.map(file => sourceIdentity(root, realRoot, file));
  return () => {
    const currentRoot = fs.lstatSync(root);
    if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || fs.realpathSync(root) !== realRoot) throw new Error("owned source root changed during refinement");
    if (files.some((file, index) => sourceIdentity(root, realRoot, file) !== identities[index])) throw new Error("owned source changed during refinement");
  };
}
module.exports = { createOwnedSourceSnapshot };
