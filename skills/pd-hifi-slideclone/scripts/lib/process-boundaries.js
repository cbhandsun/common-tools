"use strict";

const fs = require("fs");

function normalizeTimeoutMs(value, fallbackMs, maxMs = 10 * 60 * 1000) {
  const resolved = value == null || value === "" ? fallbackMs : Number(value);
  if (!Number.isInteger(resolved) || resolved < 1000 || resolved > maxMs) {
    throw new RangeError(`process timeout must be an integer from 1000 to ${maxMs} milliseconds`);
  }
  return resolved;
}

function readBoundedUtf8(file, maxBytes = 64 * 1024 * 1024) {
  const stats = fs.statSync(file);
  if (!stats.isFile() || stats.size > maxBytes) {
    throw new Error(`process output exceeds the ${maxBytes}-byte boundary`);
  }
  return fs.readFileSync(file, "utf8");
}

module.exports = {
  normalizeTimeoutMs,
  readBoundedUtf8
};
