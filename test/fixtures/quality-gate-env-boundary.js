"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const input = path.resolve(process.env.QUALITY_GATE_BOUNDARY_INPUT);
delete process.env.QUALITY_GATE_BOUNDARY_INPUT;
const originalRead = fs.readFileSync;
fs.readFileSync = function readAtBoundary(file, ...options) {
  if (typeof file === "string" && path.resolve(file) === input) {
    assert.equal(Object.hasOwn(process.env, "SLIDECLONE_PADDLE_OCR_BROKER_URL"), false);
    assert.equal(Object.hasOwn(process.env, "SLIDECLONE_PADDLE_OCR_BROKER_TOKEN"), false);
    process.stdout.write("broker-environment-consumed-before-input\n");
    process.exit(0);
  }
  return originalRead.call(this, file, ...options);
};
