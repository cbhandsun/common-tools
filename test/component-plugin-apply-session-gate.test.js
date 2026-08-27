"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  buildPluginApplySessionGate,
  parseArgs,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-plugin-apply-session-gate");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-apply-session-gate-"));
}

function writeReport(dir, fulfillmentRows) {
  const reportFile = path.join(dir, "plugin-apply-session.json");
  fs.writeFileSync(
    reportFile,
    `${JSON.stringify(
      {
        provider: "component-plugin-apply-session-v1",
        fulfillment: {
          provider: "component-plugin-apply-session-fulfillment-v1",
          rows: fulfillmentRows
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return reportFile;
}

test("plugin apply session gate passes when required motifs are fulfilled", () => {
  const dir = makeTempDir();
  const report = writeReport(dir, [
    {
      motif: "arc-arrow",
      status: "fulfilled",
      structureMatches: 2,
      relatedActions: [{ id: "a1", provider: "islide", targetMotif: "arc-arrow" }]
    }
  ]);

  const gate = buildPluginApplySessionGate({
    report,
    requiredFulfilledMotifs: ["arc-arrow"],
    failOnPending: true
  });

  assert.equal(gate.passed, true);
  assert.equal(gate.summary.fulfilled, 1);
  assert.deepEqual(gate.summary.missingRequiredMotifs, []);
});

test("plugin apply session gate preserves action evidence from apply-session rows", () => {
  const row = _private.normalizeFulfillmentRow({
    motif: "linear-arrow-chain",
    status: "fulfilled",
    structureMatches: 1,
    actions: [{
      order: 1,
      provider: "officeplus",
      kind: "component",
      searchText: "流程 箭头 组件"
    }]
  });

  assert.equal(row.relatedActions.length, 1);
  assert.deepEqual(row.relatedActions[0], {
    id: "1",
    provider: "officeplus",
    kind: "component",
    targetMotif: "linear-arrow-chain",
    searchQuery: "流程 箭头 组件"
  });
});

test("plugin apply session gate fails when a required motif is still pending", () => {
  const dir = makeTempDir();
  const report = writeReport(dir, [
    {
      motif: "whole-process-template",
      status: "pending",
      structureMatches: 0,
      relatedActions: [{ id: "a2", provider: "officeplus", targetMotif: "whole-process-template" }]
    }
  ]);

  const gate = buildPluginApplySessionGate({
    report,
    requiredFulfilledMotifs: "whole-process-template"
  });

  assert.equal(gate.passed, false);
  assert.deepEqual(gate.summary.missingRequiredMotifs, ["whole-process-template"]);
  assert.equal(gate.failures[0].code, "required-motif-not-fulfilled");
});

test("plugin apply session gate can fail on any pending motif", () => {
  const dir = makeTempDir();
  const report = writeReport(dir, [
    { motif: "arc-arrow", status: "fulfilled", structureMatches: 1 },
    { motif: "ring-node", status: "pending", structureMatches: 0 }
  ]);

  const gate = buildPluginApplySessionGate({
    report,
    failOnPending: true
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.summary.pending, 1);
  assert.equal(gate.failures[0].code, "pending-motifs");
});

test("plugin apply session gate parses CLI arguments", () => {
  const args = parseArgs([
    "--report",
    "session.json",
    "--out",
    "gate.json",
    "--require-fulfilled-motifs",
    "arc-arrow, whole-process-template",
    "--min-fulfilled",
    "2",
    "--fail-on-pending"
  ]);

  assert.equal(args.report, "session.json");
  assert.equal(args.out, "gate.json");
  assert.deepEqual(args.requiredFulfilledMotifs, ["arc-arrow", "whole-process-template"]);
  assert.equal(args.minFulfilled, 2);
  assert.equal(args.failOnPending, true);
});

test("plugin apply session gate CLI writes a report and exits non-zero on failure", () => {
  const dir = makeTempDir();
  const report = writeReport(dir, [{ motif: "radial-link", status: "pending", structureMatches: 0 }]);
  const out = path.join(dir, "gate.json");
  const script = path.join(process.cwd(), "skills/pd-hifi-slideclone/scripts/component-plugin-apply-session-gate.js");
  const result = spawnSync(
    process.execPath,
    [script, "--report", report, "--out", out, "--require-fulfilled-motifs", "radial-link"],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(out), true);
  const gate = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.summary.missingRequiredMotifs, ["radial-link"]);
});
