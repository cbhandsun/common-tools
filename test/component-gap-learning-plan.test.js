"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  _private,
  buildGapLearningPlan,
  parseArgs,
  renderPlanMarkdown
} = require("../skills/pd-hifi-slideclone/scripts/component-gap-learning-plan");

test("gap learning plan prioritizes collected components before new plugin collection", () => {
  const plan = buildGapLearningPlan({
    wave: { tasks: [
      { taskId: "collected-flow", provider: "officeplus", title: "Flow", status: "collected", targetMotifs: ["linear-arrow-chain"] },
      { taskId: "pending-flow", provider: "islide", title: "Flow", status: "pending", targetMotifs: ["linear-arrow-chain"] }
    ] },
    gapAudit: { gaps: [{
      deck: "Deck A", slide: 3, priority: "high", priorityScore: 99,
      targetMotifs: ["linear-arrow-chain"], expressionPolicy: { allowPluginTemplate: true }
    }] }
  });

  assert.equal(plan.summary.targets, 1);
  assert.deepEqual(plan.targets[0].next, {
    kind: "promote-collected",
    taskId: "collected-flow",
    provider: "officeplus",
    reason: "A structurally relevant component is collected but cannot be used until self-fidelity promotion passes."
  });
});

test("gap learning plan schedules focused collection when no collected component exists", () => {
  const plan = buildGapLearningPlan({
    wave: { tasks: [{
      taskId: "pending-pie", provider: "officeplus", title: "Pie", status: "pending",
      targetMotifs: ["pie-share-chart"], searchTerms: ["饼图", "占比图"]
    }] },
    gapAudit: { gaps: [{
      deck: "Deck B", slide: 4, targetMotifs: ["pie-share-chart"], expressionPolicy: { allowPluginTemplate: true }
    }, {
      deck: "Skip", slide: 1, targetMotifs: ["pie-share-chart"], expressionPolicy: { allowPluginTemplate: false }
    }] }
  });

  assert.equal(plan.summary.targets, 1);
  assert.equal(plan.targets[0].next.kind, "collect-plugin-component");
  assert.deepEqual(plan.targets[0].next.searchTerms, ["饼图", "占比图"]);
  assert.match(renderPlanMarkdown(plan), /Deck B slide 4/);
});

test("gap learning plan avoids elbow-arrow tasks when a whole-process component better fits the gap", () => {
  const plan = buildGapLearningPlan({
    wave: { tasks: [
      { taskId: "elbow", id: "elbow-arrow", provider: "islide", title: "折线箭头", status: "pending", targetMotifs: ["linear-arrow-chain"] },
      { taskId: "whole", id: "whole-process-flow", provider: "officeplus", title: "整组闭环流程", status: "pending", targetMotifs: ["linear-arrow-chain", "whole-process-template"] }
    ] },
    gapAudit: { gaps: [{
      deck: "Deck C", slide: 2, targetMotifs: ["linear-arrow-chain", "whole-process-template"], expressionPolicy: { allowPluginTemplate: true }
    }] }
  });

  assert.equal(plan.targets[0].next.taskId, "whole");
  assert.ok(plan.targets[0].candidateTasks[0].suitabilityScore > plan.targets[0].candidateTasks[1].suitabilityScore);
});

test("gap learning plan validates a direct promoted component before collecting a pending alternative", () => {
  const plan = buildGapLearningPlan({
    wave: { tasks: [
      { taskId: "promoted-cycle", provider: "islide", title: "整组闭环流程", status: "promoted", targetMotifs: ["linear-arrow-chain", "whole-process-template"] },
      { taskId: "pending-cycle", provider: "officeplus", title: "整组闭环流程", status: "pending", targetMotifs: ["linear-arrow-chain", "whole-process-template"] }
    ] },
    fidelityByTask: { "promoted-cycle": { passed: true, reportFile: "C:/reports/promoted.json" } },
    gapAudit: { gaps: [{
      deck: "Deck Existing", slide: 8, targetMotifs: ["linear-arrow-chain"], expressionPolicy: { allowPluginTemplate: true }
    }] }
  });

  assert.deepEqual(plan.targets[0].next, {
    kind: "validate-promoted-component",
    taskId: "promoted-cycle",
    provider: "islide",
    promotionReport: "C:/reports/promoted.json",
    reason: "A fidelity-promoted component has a direct motif match; run page-scoped adoption A/B before collecting more."
  });
  assert.match(plan.targets[0].acceptance.validation, /--deck 'Deck Existing'/);
  assert.match(plan.targets[0].acceptance.validation, /--component-self-fidelity-report 'C:\/reports\/promoted\.json'/);
});

test("gap learning plan skips self-fidelity-rejected collection in favor of a direct promoted alternative", () => {
  const plan = buildGapLearningPlan({
    wave: { tasks: [
      { taskId: "rejected-hub", provider: "officeplus", title: "关系图", status: "collected", targetMotifs: ["radial-link"] },
      { taskId: "promoted-hub", provider: "islide", title: "中心辐射", status: "promoted", targetMotifs: ["radial-link"] }
    ] },
    fidelityByTask: { "rejected-hub": { passed: false, createdAt: "2026-01-01T00:00:00Z" } },
    gapAudit: { gaps: [{
      deck: "Deck D", slide: 6, targetMotifs: ["radial-link"], expressionPolicy: { allowPluginTemplate: true }
    }] }
  });

  assert.equal(plan.targets[0].next.kind, "validate-promoted-component");
  assert.equal(plan.targets[0].next.taskId, "promoted-hub");
});

test("gap learning plan records page-scoped A/B evidence before scheduling more component collection", () => {
  const plan = buildGapLearningPlan({
    wave: { tasks: [{ taskId: "promoted-grid", provider: "islide", title: "卡片矩阵", status: "promoted", targetMotifs: ["card-grid"] }] },
    adoptionByTarget: {
      "Deck E#4": { status: "failed-no-adoption", componentHighReusableGroupMatches: 2, componentLocalAssetMatches: 3, preserveLocalCropImages: 0 }
    },
    gapAudit: { gaps: [{ deck: "Deck E", slide: 4, targetMotifs: ["card-grid"], expressionPolicy: { allowPluginTemplate: true } }] }
  });

  assert.equal(plan.targets[0].next.kind, "review-template-replay-eligibility");
  assert.equal(plan.targets[0].next.taskId, "promoted-grid");
});

test("gap learning plan switches to an untried fidelity-promoted component after a no-adoption A/B", () => {
  const islideReport = "C:/reports/islide.json";
  const officeplusReport = "C:/reports/officeplus.json";
  const plan = buildGapLearningPlan({
    wave: {
      tasks: [
        { taskId: "officeplus-flow", provider: "officeplus", title: "整组闭环流程", status: "pending", targetMotifs: ["linear-arrow-chain"] },
        { taskId: "islide-flow", provider: "islide", title: "整组闭环流程", status: "promoted", targetMotifs: ["linear-arrow-chain"] }
      ]
    },
    fidelityByTask: {
      "officeplus-flow": { passed: true, reportFile: officeplusReport },
      "islide-flow": { passed: true, reportFile: islideReport }
    },
    adoptionByTarget: {
      "Deck G#3": {
        status: "failed-no-adoption",
        componentHighReusableGroupMatches: 0,
        componentLocalAssetMatches: 1,
        preserveLocalCropImages: 0,
        promotionReports: [islideReport]
      }
    },
    gapAudit: { gaps: [{ deck: "Deck G", slide: 3, targetMotifs: ["linear-arrow-chain"], expressionPolicy: { allowPluginTemplate: true } }] }
  });

  assert.equal(plan.targets[0].next.kind, "validate-alternative-promoted-component");
  assert.equal(plan.targets[0].next.taskId, "officeplus-flow");
  assert.match(plan.targets[0].acceptance.validation, /officeplus\.json/);
});

test("gap learning plan retains every attempted promotion report for the same page", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-adoption-history-"));
  const first = path.join(root, "first.json");
  const second = path.join(root, "second.json");
  const createReport = (file, promotionReport) => fs.writeFileSync(file, JSON.stringify({
    status: "failed-no-adoption",
    promotionReports: [promotionReport],
    deckPages: { Deck_H: "5" },
    matrix: { totals: { componentLocalAssetMatches: 1, componentTemplateAppliedShapes: 0 } }
  }), "utf8");
  createReport(first, "C:/reports/islide.json");
  createReport(second, "C:/reports/officeplus.json");

  const adoption = _private.loadAdoptionByTarget([first, second])["Deck_H#5"];

  assert.deepEqual(adoption.promotionReports, ["C:\\reports\\islide.json", "C:\\reports\\officeplus.json"]);
  assert.equal(adoption.status, "failed-no-adoption");
});

test("gap learning plan retains intentional local visual assets after a no-adoption A/B", () => {
  const plan = buildGapLearningPlan({
    adoptionByTarget: {
      "Deck F#2": { status: "failed-no-adoption", componentHighReusableGroupMatches: 0, componentLocalAssetMatches: 0, preserveLocalCropImages: 3 }
    },
    gapAudit: { gaps: [{ deck: "Deck F", slide: 2, targetMotifs: ["radial-link"], expressionPolicy: { allowPluginTemplate: true } }] }
  });

  assert.equal(plan.targets[0].next.kind, "preserve-minimum-unit-crop");
});

test("gap learning plan excludes fidelity crops that await a specialized subtype rebuilder", () => {
  const gap = {
    recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
    expressionPolicy: { allowPluginTemplate: true },
    targetMotifs: ["linear-arrow-chain"]
  };

  assert.equal(_private.isPluginEligibleGap(gap), false);
});

test("gap learning plan excludes chart snapshots without recoverable series data", () => {
  const gap = {
    recommendedAction: "keep-crop-until-source-data-or-axis-series-detected",
    expressionPolicy: { allowPluginTemplate: true },
    targetMotifs: ["pie-share-chart"]
  };

  assert.equal(_private.isPluginEligibleGap(gap), false);
});

test("gap learning plan exposes stable CLI defaults and rejects unknown flags", () => {
  const args = parseArgs(["node", "plan.js", "--max-targets", "2"]);
  assert.equal(args.maxTargets, 2);
  assert.throws(() => parseArgs(["node", "plan.js", "--unknown"]), /Unknown/);
});
