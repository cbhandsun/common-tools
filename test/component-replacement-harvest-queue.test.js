"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildComponentReplacementHarvestQueue,
  normalizeApplySessionTasks,
  normalizeGapTasks,
  parseArgs,
  renderHarvestQueueMarkdown
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-harvest-queue");

test("harvest queue parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-harvest-queue.js",
    "--gap-report",
    "gap.json",
    "--out",
    "queue.json",
    "--markdown-out",
    "guide.md"
  ]);

  assert.equal(args.gapReport, "gap.json");
  assert.equal(args.out, "queue.json");
  assert.equal(args.markdownOut, "guide.md");
  assert.throws(() => parseArgs(["node", "script"]), /--gap-report or --apply-session is required/);
});

test("harvest queue parses apply-session input", () => {
  const args = parseArgs([
    "node",
    "component-replacement-harvest-queue.js",
    "--apply-session",
    "session.json",
    "--out",
    "queue.json"
  ]);

  assert.equal(args.applySession, "session.json");
  assert.equal(args.out, "queue.json");
});

test("harvest queue converts sample gaps to actionable tasks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-queue-"));
  const gapReport = path.join(tmp, "gap.json");
  const out = path.join(tmp, "queue.json");
  const markdownOut = path.join(tmp, "guide.md");
  fs.writeFileSync(gapReport, JSON.stringify(makeGapReport(), null, 2));

  const queue = buildComponentReplacementHarvestQueue({ gapReport, out, markdownOut });

  assert.equal(queue.summary.taskCount, 1);
  assert.equal(queue.summary.affectedFiles, 1);
  assert.equal(queue.summary.totalAnchorCount, 13);
  assert.equal(queue.summary.readyToApplyAfterHarvest, false);
  assert.equal(queue.tasks[0].id, "officeplus:component:MatlComponentContent-11189");
  assert.equal(queue.tasks[0].title, "渐变4项流程箭头");
  assert.deepEqual(queue.tasks[0].targetMotifs, ["linear-arrow-chain"]);
  assert.deepEqual(queue.tasks[0].searchKeywords, ["渐变4项流程箭头", "流程箭头"]);
  assert.match(queue.tasks[0].harvestCommand, /--provider officeplus --label MatlComponentContent-11189/);
  assert.equal(queue.tasks[0].affectedFiles[0].anchorCount, 13);
  assert.equal(fs.existsSync(out), true);
  assert.match(fs.readFileSync(markdownOut, "utf8"), /Component Replacement Harvest Queue/);
  assert.match(fs.readFileSync(markdownOut, "utf8"), /MatlComponentContent-11189/);
  assert.match(fs.readFileSync(markdownOut, "utf8"), /Search keywords: 渐变4项流程箭头 \/ 流程箭头/);
});

test("harvest queue handles no-gap reports", () => {
  const tasks = normalizeGapTasks({ gaps: [] });
  const markdown = renderHarvestQueueMarkdown({
    createdAt: "2026-01-01T00:00:00.000Z",
    summary: { taskCount: 0, affectedFiles: 0, totalAnchorCount: 0 },
    tasks
  });

  assert.deepEqual(tasks, []);
  assert.match(markdown, /No missing component samples/);
});

test("harvest queue converts plugin apply-session actions to grouped harvest tasks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-apply-session-queue-"));
  const applySession = path.join(tmp, "plugin-apply-session.json");
  const out = path.join(tmp, "queue.json");
  const markdownOut = path.join(tmp, "guide.md");
  fs.writeFileSync(applySession, JSON.stringify(makeApplySessionReport(), null, 2));

  const queue = buildComponentReplacementHarvestQueue({ applySession, out, markdownOut });

  assert.equal(queue.sourceKind, "apply-session");
  assert.equal(queue.summary.taskCount, 1);
  assert.equal(queue.summary.totalAffectedTargets, 2);
  assert.equal(queue.tasks[0].componentId, "MatlComponentContent-11617");
  assert.equal(queue.tasks[0].totalAnchorCount, 2);
  assert.deepEqual(queue.tasks[0].targetMotifs, ["linear-arrow-chain", "whole-process-template"]);
  assert.equal(queue.tasks[0].affectedTargets[0].imageId, "native-flow");
  assert.deepEqual(queue.tasks[0].affectedSlides, [{ deck: "Deck_A", slide: 3 }]);
  assert.match(queue.tasks[0].harvestCommand, /--provider officeplus --label MatlComponentContent-11617/);
  const markdown = fs.readFileSync(markdownOut, "utf8");
  assert.match(markdown, /Source: apply-session/);
  assert.match(markdown, /Affected targets: 2/);
  assert.match(markdown, /Deck_A p3/);
});

test("normalizeApplySessionTasks preserves affected targets without pptx files", () => {
  const tasks = normalizeApplySessionTasks(makeApplySessionReport());

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].affectedFiles.length, 0);
  assert.equal(tasks[0].affectedTargets.length, 2);
  assert.equal(tasks[0].affectedFileCount, 0);
});

function makeGapReport() {
  return {
    gaps: [{
      provider: "officeplus",
      kind: "component",
      componentId: "MatlComponentContent-11189",
      title: "渐变4项流程箭头",
      targetMotifs: ["linear-arrow-chain"],
      searchKeywords: ["渐变4项流程箭头", "流程箭头"],
      tier: "strong",
      maxScore: 96,
      totalAnchorCount: 13,
      affectedFileCount: 1,
      nextAction: {
        harvestCommand: "node skills\\pd-hifi-slideclone\\scripts\\harvest-active-powerpoint-component.js --provider officeplus --label MatlComponentContent-11189",
        workflow: [
          "Open the matching officeplus component in PowerPoint and apply/download it into the active slide.",
          "Run the harvest command."
        ]
      },
      affectedFiles: [{
        inputPptx: "deck.pptx",
        groupKey: "officeplus:component:MatlComponentContent-11189:0:0",
        layer: "0:0",
        anchorCount: 13,
        slides: [1]
      }]
    }]
  };
}

function makeApplySessionReport() {
  return {
    provider: "component-plugin-apply-session-v1",
    actions: [{
      order: 1,
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-11617",
      title: "渐变6项流程",
      score: 93,
      searchText: "流程 箭头 组件",
      targetMotifs: ["linear-arrow-chain", "whole-process-template"],
      suitability: { tier: "strong", score: 100 },
      affectedTargets: [{
        deck: "Deck_A",
        slide: 3,
        imageId: "native-flow",
        imageIndex: 0,
        layerKey: "Deck_A:p3:native-flow"
      }, {
        deck: "Deck_A",
        slide: 3,
        imageId: "native-flow-2",
        imageIndex: 1,
        layerKey: "Deck_A:p3:native-flow-2"
      }],
      affectedSlides: [{ deck: "Deck_A", slide: 3 }]
    }]
  };
}
