"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildComponentReplacementSampleGapReport,
  collectSampleGaps,
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-sample-gap-report");

test("sample gap report parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-sample-gap-report.js",
    "--batch-report",
    "batch.json",
    "--out",
    "gap.json"
  ]);

  assert.equal(args.batchReport, "batch.json");
  assert.equal(args.out, "gap.json");
  assert.throws(() => parseArgs(["node", "script"]), /--batch-report is required/);
});

test("sample gap report groups repeated missing components across decks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-sample-gap-"));
  const planA = path.join(tmp, "a-plan.json");
  const planB = path.join(tmp, "b-plan.json");
  const batchReport = path.join(tmp, "batch.json");
  const out = path.join(tmp, "gap.json");
  fs.writeFileSync(planA, JSON.stringify(makePlan({ pptx: "a.pptx", anchorCount: 13 }), null, 2));
  fs.writeFileSync(planB, JSON.stringify(makePlan({ pptx: "b.pptx", anchorCount: 5 }), null, 2));
  fs.writeFileSync(batchReport, JSON.stringify({
    totals: { files: 2, missingSampleFiles: 2, failed: 0 },
    results: [
      { inputPptx: "a.pptx", planOut: planA, reportOut: "a-report.json", outputPptx: "a-out.pptx" },
      { inputPptx: "b.pptx", planOut: planB, reportOut: "b-report.json", outputPptx: "b-out.pptx" }
    ]
  }, null, 2));

  const report = buildComponentReplacementSampleGapReport({ batchReport, out });

  assert.equal(report.totals.missingComponents, 1);
  assert.equal(report.totals.affectedFiles, 2);
  assert.equal(report.totals.totalAnchorCount, 18);
  assert.equal(report.totals.canApplyAll, false);
  assert.equal(report.gaps[0].provider, "officeplus");
  assert.equal(report.gaps[0].componentId, "MatlComponentContent-11189");
  assert.equal(report.gaps[0].title, "渐变4项流程箭头");
  assert.deepEqual(report.gaps[0].targetMotifs, ["linear-arrow-chain"]);
  assert.deepEqual(report.gaps[0].searchKeywords, ["渐变4项流程箭头", "流程箭头"]);
  assert.equal(report.gaps[0].affectedFileCount, 2);
  assert.match(report.gaps[0].nextAction.harvestCommand, /MatlComponentContent-11189/);
  assert.equal(fs.existsSync(out), true);
});

test("sample gap report returns canApplyAll when no gaps and no failures", () => {
  const report = {
    totals: { files: 1, failed: 0 },
    results: []
  };

  assert.deepEqual(collectSampleGaps(report), []);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-no-sample-gap-"));
  const batchReport = path.join(tmp, "batch.json");
  fs.writeFileSync(batchReport, JSON.stringify(report, null, 2));
  const gap = buildComponentReplacementSampleGapReport({ batchReport });

  assert.equal(gap.totals.missingComponents, 0);
  assert.equal(gap.totals.canApplyAll, true);
});

function makePlan({ pptx, anchorCount }) {
  return {
    pptx,
    operations: [{
      status: "missing_sample",
      groupKey: "officeplus:component:MatlComponentContent-11189:0:0",
      provider: "officeplus",
      kind: "component",
      componentId: "MatlComponentContent-11189",
      layer: "0:0",
      tier: "strong",
      score: 96,
      title: "渐变4项流程箭头",
      targetMotifs: ["linear-arrow-chain"],
      anchorCount,
      slides: [1],
      nextAction: {
        requiredSample: {
          searchKeywords: ["渐变4项流程箭头", "流程箭头"]
        },
        harvestCommand: "node skills\\pd-hifi-slideclone\\scripts\\harvest-active-powerpoint-component.js --provider officeplus --label MatlComponentContent-11189"
      }
    }]
  };
}
