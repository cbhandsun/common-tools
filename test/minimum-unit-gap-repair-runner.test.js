"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDeckPlans,
  isStructuralRebuildAction,
  parseArgs,
  parsePageSet
} = require("../skills/pd-hifi-slideclone/scripts/minimum-unit-gap-repair-runner");

test("minimum unit gap repair runner parses bounded CLI options", () => {
  const args = parseArgs([
    "node",
    "minimum-unit-gap-repair-runner.js",
    "--repair-queue",
    "queue.json",
    "--work-root",
    "work",
    "--out",
    "out",
    "--only",
    "Deck_A",
    "--pages",
    "2,4-5",
    "--max-pages",
    "3",
    "--deck-concurrency",
    "2",
    "--page-concurrency",
    "4",
    "--dry-run",
    "--skip-pptx",
    "--component-assets",
    "true",
    "--objectify-component-group-matches",
    "true",
    "--replace-safe-component-template-crops",
    "--hybrid-component-template-residuals",
    "--erase-specialized-hybrid-residual-text"
  ]);

  assert.equal(args.repairQueue, "queue.json");
  assert.equal(args.workRoot, "work");
  assert.equal(args.out, "out");
  assert.equal(args.only, "Deck_A");
  assert.equal(args.pages, "2,4-5");
  assert.equal(args.maxPages, 3);
  assert.equal(args.deckConcurrency, 2);
  assert.equal(args.pageConcurrency, 4);
  assert.equal(args.dryRun, true);
  assert.equal(args.skipPptx, true);
  assert.equal(args.componentAssets, true);
  assert.equal(args.objectifyComponentGroupMatches, true);
  assert.equal(args.replaceSafeComponentTemplateCrops, true);
  assert.equal(args.hybridComponentTemplateResiduals, true);
  assert.equal(args.eraseSpecializedHybridResidualText, true);
});

test("minimum unit gap repair runner selects only structural rebuild pages", () => {
  const queue = {
    actions: [
      structuralAction({ deck: "Deck_A", page: 2, imageId: "flow", areaRatio: 0.52, templateFamily: "process-flow" }),
      structuralAction({ deck: "Deck_A", page: 2, imageId: "chart", areaRatio: 0.26, templateFamily: "chart", motifs: ["bar-chart"] }),
      preserveAction({ deck: "Deck_A", page: 3, imageId: "icon", candidateTitle: "图标 图示" }),
      structuralAction({ deck: "Deck_B", page: 1, imageId: "grid", areaRatio: 0.4, templateFamily: "matrix-grid" })
    ]
  };

  const plans = buildDeckPlans(queue, { maxPages: 10 });

  assert.deepEqual(plans.map((plan) => plan.deck), ["Deck_A", "Deck_B"]);
  assert.deepEqual(plans[0].pages, [2]);
  assert.equal(plans[0].actions, 2);
  assert.deepEqual(plans[0].pageDetails[0].motifs, ["bar-chart", "linear-arrow-chain"]);
  assert.deepEqual(plans[1].pages, [1]);
});

test("minimum unit gap repair runner routes actionable visual unit crops only when structure evidence is required", () => {
  const queue = {
    actions: [
      actionableVisualUnitCrop({
        deck: "Deck_A",
        page: 4,
        imageId: "unknown-cycle-arrow",
        areaRatio: 0.44,
        templateFamily: "cycle-arrow",
        motifs: ["arc-arrow", "circular-process"]
      }),
      actionableVisualUnitCrop({
        deck: "Deck_A",
        page: 5,
        imageId: "protected-icon",
        candidateTitle: "icon illustration 图标 插画",
        forcePreserveLocalCrop: true
      })
    ]
  };

  const plans = buildDeckPlans(queue, { maxPages: 10 });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].deck, "Deck_A");
  assert.deepEqual(plans[0].pages, [4]);
  assert.equal(plans[0].actions, 1);
  assert.deepEqual(plans[0].pageDetails[0].motifs, ["arc-arrow", "circular-process"]);
  assert.deepEqual(plans[0].pageDetails[0].routes, ["cycle-arrow"]);
});

test("minimum unit gap repair runner blocks protected non-semantic crop actions", () => {
  const queue = {
    actions: [{
      deck: "Deck_A",
      page: 7,
      image: 1,
      imageId: "standalone-icon-diagram",
      violation: "actionable-unexplained-visual-unit-crop",
      detector: "visual-unit-decision-profile",
      candidateTitle: "polished icon diagram",
      templateFamily: "process-flow",
      targetMotifs: ["linear-arrow-chain"],
      expressionPolicy: {
        kind: "standalone-visual-asset",
        unitDisposition: "intentional-visual-crop"
      },
      repair: {
        mode: "classify-visual-unit-then-rebuild-or-protect",
        requireSemanticStructureEvidence: true,
        forcePreserveLocalCrop: false
      }
    }]
  };

  const plans = buildDeckPlans(queue, { maxPages: 10 });

  assert.deepEqual(plans, []);
});

test("minimum unit gap repair runner honors page/deck filters and max page budget", () => {
  const queue = {
    actions: [
      structuralAction({ deck: "Deck_A", page: 1, imageId: "one" }),
      structuralAction({ deck: "Deck_A", page: 2, imageId: "two" }),
      structuralAction({ deck: "Deck_A", page: 3, imageId: "three" }),
      structuralAction({ deck: "Deck_B", page: 1, imageId: "other" })
    ]
  };

  const plans = buildDeckPlans(queue, {
    only: "Deck_A",
    pages: "2-3",
    maxPages: 1
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].deck, "Deck_A");
  assert.deepEqual(plans[0].pages, [2]);
});

test("minimum unit gap repair runner protects icons screenshots and forced crops", () => {
  assert.equal(isStructuralRebuildAction(structuralAction({ imageId: "flow" })), true);
  assert.equal(isStructuralRebuildAction(preserveAction({ imageId: "screenshot", candidateTitle: "ui screenshot 截图" })), false);
  assert.equal(isStructuralRebuildAction({
    deck: "Deck",
    page: 1,
    violation: "minimum-unit-structural-crop-gap",
    candidateTitle: "diagram icon 示意图",
    repair: {
      mode: "reclassify-structural-diagram-or-component-template",
      requireSemanticStructureEvidence: true,
      forcePreserveLocalCrop: true
    }
  }), false);
});

test("minimum unit gap repair runner parses compact page ranges", () => {
  assert.deepEqual([...parsePageSet("1,3-5,7")], [1, 3, 4, 5, 7]);
});

function structuralAction({ deck = "Deck", page = 1, imageId = "image", areaRatio = 0.3, templateFamily = "process-flow", motifs = ["linear-arrow-chain"] } = {}) {
  return {
    deck,
    page,
    image: 1,
    imageId,
    violation: "minimum-unit-structural-crop-gap",
    layerType: "diagram-zone",
    candidateTitle: "process flow diagram",
    areaRatio,
    templateFamily,
    targetMotifs: motifs,
    repair: {
      mode: "reclassify-structural-diagram-or-component-template",
      requireSemanticStructureEvidence: true,
      forcePreserveLocalCrop: false
    }
  };
}

function preserveAction({ deck = "Deck", page = 1, imageId = "icon", candidateTitle = "图标" } = {}) {
  return {
    deck,
    page,
    image: 1,
    imageId,
    violation: "minimum-unit-visual-asset",
    layerType: "illustration-zone",
    candidateTitle,
    repair: {
      mode: "preserve-fidelity-crop",
      forcePreserveLocalCrop: true
    }
  };
}

function actionableVisualUnitCrop({
  deck = "Deck",
  page = 1,
  imageId = "unknown-visual-unit",
  areaRatio = 0.3,
  templateFamily = "generic-diagram",
  motifs = ["whole-process-template"],
  candidateTitle = "unknown diagram crop",
  forcePreserveLocalCrop = false
} = {}) {
  return {
    deck,
    page,
    image: 1,
    imageId,
    violation: "actionable-unexplained-visual-unit-crop",
    layerType: "diagram-zone",
    detector: "visual-unit-decision-profile",
    candidateTitle,
    areaRatio,
    templateFamily,
    targetMotifs: motifs,
    repair: {
      mode: "classify-visual-unit-then-rebuild-or-protect",
      requireSemanticStructureEvidence: true,
      forcePreserveLocalCrop,
      allowNativeOverlays: true
    }
  };
}
