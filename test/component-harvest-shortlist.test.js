"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildHarvestShortlist,
  collectCandidateDocuments,
  parseArgs,
  renderHarvestShortlistMarkdown,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-harvest-shortlist");

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function makeQueue() {
  return {
    tasks: [
      {
        id: "officeplus:component:MatlComponentContent-1900",
        provider: "officeplus",
        kind: "component",
        componentId: "MatlComponentContent-1900",
        title: "渐变风流程箭头元素_4项",
        targetMotifs: ["branch-card-flow", "linear-arrow-chain"],
        searchKeywords: ["渐变风流程箭头元素_4项", "流程箭头"],
        totalAnchorCount: 120,
        affectedFiles: [
          { slides: [6, 7], layer: "5:0" }
        ]
      },
      {
        id: "officeplus:component:MatlComponentContent-16000",
        provider: "officeplus",
        kind: "component",
        componentId: "MatlComponentContent-16000",
        title: "简约渐变3项向上箭头循环",
        targetMotifs: ["arc-arrow", "ring-node"],
        searchKeywords: ["简约渐变3项向上箭头循环", "循环箭头"],
        totalAnchorCount: 72,
        affectedFiles: [
          { slides: [5], layer: "4:0" }
        ]
      }
    ]
  };
}

function makeCandidateReport() {
  return {
    layers: [
      {
        shapeLayerId: "p6-demand-native-component",
        componentOwnerId: "demand-native-component",
        templateFamily: "process-chain",
        plan: {
          targetMotifs: ["branch-card-flow", "linear-arrow-chain"],
          structureSignature: {
            layout: "linear-process",
            stepCount: 4,
            columns: 4
          }
        },
        bestCandidates: [
          {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-14019",
            title: "扁平4项流程箭头",
            candidateScore: 90
          },
          {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-1900",
            title: "渐变风流程箭头元素_4项",
            candidateScore: 90
          }
        ]
      },
      {
        shapeLayerId: "p5-cycle-native-component",
        templateFamily: "cycle-loop",
        plan: {
          targetMotifs: ["arc-arrow", "ring-node"],
          structureSignature: {
            layout: "cycle-loop",
            stepCount: 4
          }
        },
        bestCandidates: [
          {
            sourceProvider: "officeplus",
            kind: "shape",
            id: "ShapeContent-3623",
            title: "四个箭头循环",
            candidateScore: 96.84
          },
          {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-15229",
            title: "渐变4项可爱循环",
            candidateScore: 76
          }
        ]
      },
      {
        shapeLayerId: "p2-icon",
        layerType: "illustration-zone",
        templateFamily: "icon-or-illustration",
        componentRenderStrategy: { mode: "preserve-local-crop" },
        plan: {
          targetMotifs: ["linear-arrow-chain"]
        },
        bestCandidates: [
          {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-999",
            title: "不应采集的图标组件",
            candidateScore: 99
          }
        ]
      }
    ]
  };
}

test("parseArgs accepts harvest shortlist flags", () => {
  const args = parseArgs([
    "node",
    "component-harvest-shortlist.js",
    "--candidates",
    "candidates.json",
    "--queue",
    "queue.json",
    "--out",
    "out.json",
    "--markdown-out",
    "guide.md",
    "--max-actions",
    "5",
    "--max-actions-per-task",
    "2"
  ]);

  assert.equal(args.candidates, "candidates.json");
  assert.equal(args.queue, "queue.json");
  assert.equal(args.out, "out.json");
  assert.equal(args.markdownOut, "guide.md");
  assert.equal(args.maxActions, 5);
  assert.equal(args.maxActionsPerTask, 2);
});

test("collectCandidateDocuments skips protected icon and illustration crops", () => {
  const documents = collectCandidateDocuments(makeCandidateReport());

  assert.equal(documents.some((document) => document.id === "MatlComponentContent-999"), false);
  assert.equal(documents.some((document) => document.id === "MatlComponentContent-1900"), true);
});

test("buildHarvestShortlist ranks exact queue target before structural alternates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-harvest-shortlist-"));
  const candidates = writeJson(dir, "candidates.json", makeCandidateReport());
  const queue = writeJson(dir, "queue.json", makeQueue());

  const report = buildHarvestShortlist({
    candidates,
    queue,
    maxActions: 6,
    maxActionsPerTask: 3
  });

  const firstTask = report.tasks.find((task) => task.componentId === "MatlComponentContent-1900");
  assert.equal(firstTask.status, "target-found-in-candidates");
  assert.equal(firstTask.actions[0].id, "MatlComponentContent-1900");
  assert.equal(firstTask.actions[0].status, "direct-target-candidate");
  assert.ok(firstTask.actions[0].reasons.includes("exact-component-id"));

  const cycleTask = report.tasks.find((task) => task.componentId === "MatlComponentContent-16000");
  assert.equal(cycleTask.status, "target-not-found-use-direct-search-or-structural-alternate");
  assert.equal(cycleTask.actions[0].status, "direct-target-search");
  assert.equal(cycleTask.actions[0].slide, 5);
  assert.deepEqual(cycleTask.actions[0].affectedSlides, [5]);
  assert.equal(cycleTask.actions.some((action) => action.id === "MatlComponentContent-15229"), true);
});

test("renderHarvestShortlistMarkdown includes watcher guidance and direct target", () => {
  const report = {
    generatedAt: "2026-07-04T00:00:00.000Z",
    summary: { taskCount: 1, actionCount: 1 },
    actions: [
      {
        order: 1,
        status: "direct-target-search",
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-16000",
        title: "简约渐变3项向上箭头循环",
        score: 120,
        taskTitle: "简约渐变3项向上箭头循环",
        reasons: ["manual-plugin-search-required"],
        action: {
          tab: "OfficePLUS",
          searchText: "循环箭头",
          instruction: "Open OfficePLUS and apply the target."
        }
      }
    ]
  };

  const markdown = renderHarvestShortlistMarkdown(report);
  assert.match(markdown, /watch-plugin-component-downloads/);
  assert.match(markdown, /MatlComponentContent-16000/);
});

test("private helpers identify protected layers and slide numbers", () => {
  assert.equal(_private.isProtectedCropLayer({ layerType: "illustration-zone" }), true);
  assert.equal(_private.isProtectedCropLayer({ templateFamily: "process-chain" }), false);
  assert.equal(_private.slideNumberFromLayer({ shapeLayerId: "p7-product-brain" }), 7);
});
