"use strict";
// @ts-check
const fs = require("node:fs");
const path = require("node:path");

/** @param {unknown} value @returns {string} */
function outputPath(value) {
  if (typeof value !== "string" || value.length > 32768 || value.includes("\0") || !path.isAbsolute(value)) {
    throw new TypeError("residual publication path is invalid");
  }
  return path.resolve(value);
}

/** @param {string} sourceFile @param {string} outputFile */
function assertSeparateOutput(sourceFile, outputFile) {
  const source = fs.statSync(sourceFile);
  if (!source.isFile()) throw new Error("residual source is invalid");
  if (sourceFile === outputFile) throw new Error("residual output would replace its source");
  const existing = fs.lstatSync(outputFile, { throwIfNoEntry: false });
  if (!existing) return;
  if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("residual output target is invalid");
  if (fs.realpathSync(sourceFile) === fs.realpathSync(outputFile) || (existing.dev === source.dev && existing.ino === source.ino)) {
    throw new Error("residual output would replace its source");
  }
}

/** Publish through a same-filesystem staging directory, never through the target inode.
 * @param {{ sourceFile: unknown, outputFile: unknown, write: (file: string) => void,
 * isCancellationRequested?: (() => boolean | Promise<boolean>) | undefined }} input
 */
async function publishResidual(input) {
  const sourceFile = outputPath(input.sourceFile), outputFile = outputPath(input.outputFile);
  if (typeof input.write !== "function" || (input.isCancellationRequested !== undefined && typeof input.isCancellationRequested !== "function")) {
    throw new TypeError("residual publication callbacks are invalid");
  }
  assertSeparateOutput(sourceFile, outputFile);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(outputFile), ".residual-"));
  try {
    const temporary = path.join(staging, "output.png");
    input.write(temporary);
    const info = fs.lstatSync(temporary);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 24) throw new Error("full-slide residual output is invalid");
    if (await input.isCancellationRequested?.()) throw new Error("editable job was cancelled");
    assertSeparateOutput(sourceFile, outputFile);
    fs.renameSync(temporary, outputFile);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { publishResidual };
