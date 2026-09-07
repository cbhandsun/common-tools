// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {run} = require("./renderer-process");
const {validateDeckTemplateContext} = require("./deck-template-context");
const INVALID = "editable deck template inspection failed";
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} input @param {{runProcess?: typeof run}} [dependencies] */
async function admitTemplateBuild(input, dependencies = {}) {
  if (!record(input) || typeof input.executable !== "string" || !path.isAbsolute(input.executable)
    || !Array.isArray(input.builderArgs) || input.builderArgs.length > 240
    || !input.builderArgs.every(arg => typeof arg === "string" && arg.length > 0 && arg.length <= 32768 && !arg.includes("\0"))
    || typeof input.cwd !== "string" || !path.isAbsolute(input.cwd)
    || typeof input.deckFile !== "string" || !path.isAbsolute(input.deckFile)
    || typeof input.timeoutMs !== "number" || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 540000
    || typeof input.isCancellationRequested !== "function") throw new TypeError(INVALID);
  /** @type {string[]} */ const args = input.builderArgs;
  const cancelled = /** @type {() => boolean | Promise<boolean>} */ (input.isCancellationRequested);
  if (await cancelled()) throw new Error("editable job was cancelled");
  let template = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg?.toLowerCase() === "--inspect-template") throw new TypeError(INVALID);
    if (arg?.toLowerCase() !== "--template-pptx") continue;
    const value = args[index + 1];
    if (template !== null || typeof value !== "string" || !value.trim() || value.startsWith("--")) throw new TypeError(INVALID);
    template = value;
    index += 1;
  }
  let pages;
  try {
    const info = fs.lstatSync(input.deckFile);
    const root = fs.realpathSync(input.cwd), file = fs.realpathSync(input.deckFile);
    const relative = path.relative(root, file);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || !info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 32 * 1024 * 1024) throw new TypeError(INVALID);
    const parsed = /** @type {unknown} */ (JSON.parse(fs.readFileSync(file, "utf8")));
    if (!record(parsed)) throw new TypeError(INVALID);
    pages = parsed.pages;
  } catch { throw new Error(INVALID); }
  let context = null;
  if (template !== null) {
    try {
      const result = await (dependencies.runProcess ?? run)(input.executable, [...args, "--inspect-template", template], {
        cwd: input.cwd, timeout: Math.min(input.timeoutMs, 60000), maxBuffer: 1024 * 1024, isCancellationRequested: cancelled
      });
      if (result.stdout.length > 1024 * 1024) throw new Error(INVALID);
      context = /** @type {unknown} */ (JSON.parse(result.stdout));
      if (context === null) throw new Error(INVALID);
    } catch {
      if (await cancelled()) throw new Error("editable job was cancelled");
      throw new Error(INVALID);
    }
  }
  if (await cancelled()) throw new Error("editable job was cancelled");
  validateDeckTemplateContext(pages, context);
}
module.exports = {admitTemplateBuild};
