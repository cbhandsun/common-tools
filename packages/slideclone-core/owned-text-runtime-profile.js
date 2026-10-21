// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { run } = require("./renderer-process");
const { resolveLibreOffice, resolvePdfToPpm } = require("./libreoffice-tools");

/** @param {unknown} value @returns {string} */
function executableFile(value) {
  if (typeof value !== "string" || !value || value.length > 32768 || value.includes("\0")) throw new TypeError("owned renderer executable is invalid");
  const extensions = process.platform === "win32" ? ["", ".exe", ".com", ".cmd"] : [""];
  const candidates = path.isAbsolute(value) ? [value] : (process.env.PATH || "").split(path.delimiter)
    .flatMap(directory => extensions.map(extension => path.join(directory, `${value}${extension}`)));
  const file = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!file) throw new Error("owned renderer executable is unavailable");
  return fs.realpathSync(file);
}
/** @param {string} file @param {{bytes:number}} budget */
function hashFile(file, budget) {
  const descriptor = fs.openSync(file, "r");
  try {
    const before = fs.fstatSync(descriptor);
    budget.bytes += before.size;
    // TTC collections can exceed individual font sizes; streaming is bounded by the aggregate byte budget.
    if (!before.isFile() || before.size < 1 || budget.bytes > 4 * 1024 * 1024 * 1024) {
      throw new RangeError("owned renderer identity exceeds the processing boundary");
    }
    const hash = crypto.createHash("sha256"), buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (offset < before.size) {
      const count = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!count) throw new Error("owned renderer identity file changed");
      hash.update(buffer.subarray(0, count)); offset += count;
    }
    const after = fs.fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("owned renderer identity file changed");
    return hash.digest("hex");
  } finally { fs.closeSync(descriptor); }
}
/** @param {()=>boolean|Promise<boolean>} cancellation */
async function systemFontFiles(cancellation) {
  if (process.platform !== "win32") {
    const result = await run("fc-list", ["--format=%{file}\n"], { timeout: 30000, maxBuffer: 1024 * 1024,
      isCancellationRequested: cancellation });
    return result.stdout.split(/\r?\n/u).filter(Boolean);
  }
  const roots = [path.join(process.env.WINDIR || "C:/Windows", "Fonts"),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")] : [])];
  return roots.filter(root => fs.existsSync(root)).flatMap(root => fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:ttf|ttc|otf)$/iu.test(entry.name)).map(entry => path.join(root, entry.name)));
}

/** @typedef {{builderExecutable:string,renderExecutable?:string,pdfExecutable?:string,getFontFiles?:(cancellation:()=>boolean|Promise<boolean>)=>Promise<unknown>,runVersion?:(file:string,cancellation:()=>boolean|Promise<boolean>)=>Promise<unknown>}} Options */
/** Fingerprint the actual renderer, builder, loaded measurement code and installed fonts, not a claimed profile string.
 * @param {Options} options
 */
function createOwnedTextRuntimeProfile(options) {
  if (!options || typeof options !== "object" || typeof options.builderExecutable !== "string"
    || (options.getFontFiles !== undefined && typeof options.getFontFiles !== "function")
    || (options.runVersion !== undefined && typeof options.runVersion !== "function")) throw new TypeError("owned renderer profile options are invalid");
  const builder = executableFile(options.builderExecutable), renderer = executableFile(options.renderExecutable || resolveLibreOffice());
  const pdfRenderer = executableFile(options.pdfExecutable || resolvePdfToPpm());
  const getFontFiles = options.getFontFiles || systemFontFiles;
  const runVersion = options.runVersion || (async (/** @type {string} */ file, /** @type {()=>boolean|Promise<boolean>} */ cancellation) =>
    (await run(file, ["--version"], { timeout: 30000, maxBuffer: 4096, isCancellationRequested: cancellation })).stdout.trim());
  return async function describeRenderer(/** @type {()=>boolean|Promise<boolean>} */ cancellation = async () => false) {
    if (await cancellation()) throw new Error("editable job was cancelled");
    const version = await runVersion(renderer, cancellation), fonts = await getFontFiles(cancellation);
    if (typeof version !== "string" || !version || version.length > 128 || [...version].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      || !Array.isArray(fonts) || fonts.length < 1 || fonts.length > 4096
      || fonts.some(file => typeof file !== "string" || !path.isAbsolute(file) || file.length > 32768 || file.includes("\0"))) {
      throw new TypeError("owned renderer identity is invalid");
    }
    const companions = [path.join(path.dirname(builder), "OpenXmlDeckBuilder.dll"),
      path.join(path.dirname(renderer), "soffice.bin")].filter(file => fs.existsSync(file));
    const files = [...new Set([builder, renderer, pdfRenderer, ...companions,
      ...["owned-text-runtime-profile", "owned-text-probe", "owned-text-refinement", "owned-text-target-window", "owned-source-snapshot", "owned-text-advance", "owned-text-eligibility", "source-owned-glyph-shapes", "color-component-bounds", "text-ink-geometry", "render-libreoffice"]
        .map(name => path.join(__dirname, `${name}.js`)), ...fonts].map(file => fs.realpathSync(file)))].sort();
    const budget = { bytes: 0 }, identities = [];
    for (const file of files) {
      if (await cancellation()) throw new Error("editable job was cancelled");
      identities.push({ file, sha256: hashFile(file, budget) });
    }
    return { rendererId: "render-libreoffice", dpi: 144, version,
      runtimeHash: crypto.createHash("sha256").update(JSON.stringify({ version, identities })).digest("hex") };
  };
}

module.exports = { createOwnedTextRuntimeProfile };
