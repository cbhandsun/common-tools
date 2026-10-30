// @ts-check
"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { absolutePath, hasControls } = require("./approved-frame-application-input");

/** @param {Uint8Array} bytes */
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
/** Reject redirects at the final file and every resolved parent. No supplied
 * path or underlying OS error is copied into the public failure message.
 * @param {unknown} value @param {number} [maximum] */
function readFile(value, maximum = 12 * 1024 * 1024) {
  const file = absolutePath(value);
  let fd;
  try {
    if (fs.realpathSync(file) !== file) throw new Error();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximum) throw new Error();
    fd = fs.openSync(file, "r");
    const opened = fs.fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) throw new Error();
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error();
      offset += count;
    }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) || fs.fstatSync(fd).size !== stat.size || fs.realpathSync(file) !== file) throw new Error();
    return bytes;
  } catch { throw new TypeError("approved-frame-file-unavailable"); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
/** @param {string} root @param {unknown} relative */
function assetFile(root, relative) {
  if (typeof relative !== "string" || relative.length > 4096 || path.isAbsolute(relative) || hasControls(relative)) throw new TypeError("invalid-approved-frame-asset");
  const file = path.resolve(root, relative), rel = path.relative(root, file);
  if (!rel || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) throw new TypeError("invalid-approved-frame-asset");
  return file;
}
/** @param {unknown} value */
function workspace(value) {
  const root = absolutePath(value);
  try {
    const assets = path.join(root, "assets");
    if (fs.realpathSync(root) !== root || fs.realpathSync(assets) !== assets || !fs.lstatSync(assets).isDirectory() || fs.lstatSync(assets).isSymbolicLink()) throw new Error();
    return { root, assets };
  } catch { throw new TypeError("invalid-approved-frame-workspace"); }
}
/** Delete only this transaction's freshly allocated staging directory.
 * @param {string} assets @param {string} directory */
function removeStaging(assets, directory) {
  try {
  if (path.dirname(path.resolve(directory)) !== assets || !path.basename(directory).startsWith("approved-frames-") || fs.realpathSync(assets) !== assets) throw new TypeError("invalid-approved-frame-cleanup");
  if (fs.lstatSync(directory).isSymbolicLink()) throw new TypeError("invalid-approved-frame-cleanup");
  fs.rmSync(directory, { recursive: true, force: true });
  } catch { throw new Error("approved-frame-cleanup-failed"); }
}

/** @param {string} assets */
function createStaging(assets) {
  try { return fs.mkdtempSync(path.join(assets, "approved-frames-")); }
  catch { throw new Error("approved-frame-write-failed"); }
}
/** @param {string} file @param {Buffer} bytes */
function writeAsset(file, bytes) {
  try { fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); }
  catch { throw new Error("approved-frame-write-failed"); }
}

module.exports = { digest, readFile, assetFile, workspace, removeStaging, createStaging, writeAsset };
