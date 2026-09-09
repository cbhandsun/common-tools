"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { summarizeCloseout, validateChecklist } = require("../scripts/verify-architecture-closeout");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

test("architecture closeout checklist validates current open and verified evidence boundaries", () => {
  const result = summarizeCloseout({ repositoryRoot: path.resolve(__dirname, "..") });
  assert.equal(result.failures.length, 0);
  assert.equal(result.complete, false);
  assert.ok(result.counts.verified >= 2);
  assert.ok(result.counts.partial >= 1);
  assert.ok(result.counts.open >= 1);
  assert.ok(result.items.some((item) => item.id === "local-authenticated-acceptance" && item.status === "open"));
});

test("architecture closeout checklist cannot mark missing evidence as verified", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const checklist = {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "missing-proof",
      area: "A",
      status: "verified",
      summary: "This item intentionally points at missing evidence.",
      evidenceFiles: ["missing.json"],
      verificationCommands: ["node scripts/verify-example.js"]
    }]
  };
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), checklist);
  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /marked verified but evidence is missing/u);
});

test("architecture closeout checklist require-complete mode rejects open work", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const evidence = path.join(workspace, "evidence.json");
  fs.writeFileSync(evidence, "{}");
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "still-open",
      area: "D",
      status: "open",
      summary: "This item remains open until real runtime evidence exists.",
      evidenceFiles: ["evidence.json"],
      verificationCommands: ["npm run verify"],
      remaining: ["Run real acceptance evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace, requireComplete: true });
  assert.equal(result.complete, false);
  assert.match(result.failures.join("\n"), /still-open is not verified/u);
});

test("architecture closeout checklist rejects absolute or parent-relative evidence paths", () => {
  assert.throws(() => validateChecklist({
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "unsafe-path",
      area: "B",
      status: "partial",
      summary: "This item has an unsafe evidence path.",
      evidenceFiles: ["../secret.json"],
      verificationCommands: ["npm run verify"],
      remaining: ["Replace unsafe evidence path."]
    }]
  }), /repository-relative/u);
});
