"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildPluginActionQueue,
  buildPluginActionQueueFromCoverageMatrix,
  buildPluginActionQueueFromHarvestShortlist,
  buildPluginActionQueueFromMotifRecall,
  buildPluginActionQueueFromRepairCoverage,
  buildPluginActionQueueFromTargetAudit,
  collectActionCandidates,
  collectCoverageBacklogActions,
  collectHarvestShortlistActions,
  collectMotifRecallActions,
  collectRepairCoverageBacklogActions,
  collectTargetAuditActions,
  parseArgs,
  renderPluginActionQueueMarkdown
} = require("../skills/pd-hifi-slideclone/scripts/component-plugin-action-queue");

function makeSearchReport() {
  return {
    results: [
      {
        task: {
          provider: "officeplus",
          kind: "component",
          layerKey: "slide1-layer-radial",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke",
          keywords: "中心 总分 关系图",
          alternateKeywords: ["圆形关系图", "四项中心"]
        },
        bestDocuments: [
          {
            acquisitionProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-11189",
            title: "蓝色简约圆通用4项中心总分PPT组件",
            acquisitionScore: 91.234,
            matchedKeywords: "中心 总分 关系图",
            fileName: "component.pptx",
            coverUrl: "https://example.test/cover.png",
            reuseHint: "downloadable-template",
            paymentType: 0,
            price: 0,
            downloadLookup: {
              status: "error",
              endpoint: "https://www.officeplus.cn/api/download",
              error: "401 Unauthorized"
            }
          },
          {
            acquisitionProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-11189",
            title: "蓝色简约圆通用4项中心总分PPT组件",
            acquisitionScore: 88,
            matchedKeywords: "中心 总分 关系图"
          }
        ]
      },
      {
        task: {
          provider: "islide",
          kind: "smartdiagram",
          layerKey: "slide1-layer-radial",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke",
          keywords: "中心关系"
        },
        bestDocuments: [
          {
            acquisitionProvider: "islide",
            kind: "smartdiagram",
            id: "islide-77",
            title: "中心发散关系图",
            acquisitionScore: 76.5,
            matchedKeywords: "中心关系",
            paymentType: 1,
            price: 4.9
          },
          {
            acquisitionProvider: "unknown",
            kind: "component",
            id: "bad",
            title: "ignored",
            acquisitionScore: 100
          }
        ]
      }
    ]
  };
}

function makeHarvestShortlist() {
  return {
    provider: "component-harvest-shortlist-v1",
    actions: [
      {
        status: "direct-target-candidate",
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-1900",
        title: "渐变风流程箭头元素_4项",
        score: 288,
        targetMotifs: ["linear-arrow-chain", "whole-process-template"],
        layerId: "p6-native-component",
        action: {
          mode: "plugin-ui-apply-and-harvest",
          tab: "OfficePLUS",
          library: "component",
          searchText: "渐变风流程箭头元素_4项",
          expectedCandidateId: "MatlComponentContent-1900",
          expectedTitle: "渐变风流程箭头元素_4项",
          instruction: "Open OfficePLUS and apply the exact component."
        }
      },
      {
        status: "structural-alternate",
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-14019",
        title: "扁平4项流程箭头",
        score: 188,
        targetMotifs: ["linear-arrow-chain", "whole-process-template"],
        layerId: "p6-native-component",
        action: {
          searchText: "扁平4项流程箭头"
        }
      },
      {
        status: "direct-target-search",
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-16000",
        title: "简约渐变3项向上箭头循环",
        score: 120,
        targetMotifs: ["arc-arrow", "ring-node", "whole-process-template"],
        layerId: "p5-cycle-component",
        action: {
          searchText: "简约渐变3项向上箭头循环",
          expectedCandidateId: "MatlComponentContent-16000"
        }
      }
    ]
  };
}

function makeOfficePlusResolve() {
  return {
    provider: "officeplus-component-resolve-v1",
    rows: [
      {
        target: { id: "MatlComponentContent-1900", keywords: "渐变风流程箭头元素_4项" },
        bestDocument: {
          id: "MatlComponentContent-1900",
          title: "渐变风流程箭头元素_4项",
          fileName: "4a962dae-0adb-0e87-8cac-3a19c1222a49.pptx",
          fileSize: 75996,
          itemCount: 4,
          paymentType: 1,
          price: 9.9,
          coverUrl: "https://image-prod.officeplus.cn/component.png"
        },
        downloadLookup: {
          status: "auth-required",
          downloadUrl: ""
        },
        acquisitionMode: "plugin-auth-required"
      }
    ]
  };
}

test("parseArgs accepts action queue CLI flags", () => {
  const args = parseArgs([
    "node",
    "component-plugin-action-queue.js",
    "--search",
    "search.json",
    "--out",
    "queue.json",
    "--markdown-out",
    "queue.md",
    "--max-actions",
    "3",
    "--min-score",
    "70",
    "--min-suitability",
    "45"
  ]);

  assert.equal(args.search, "search.json");
  assert.equal(args.out, "queue.json");
  assert.equal(args.markdownOut, "queue.md");
  assert.equal(args.maxActions, 3);
  assert.equal(args.minScore, 70);
  assert.equal(args.minSuitability, 45);
});

test("parseArgs rejects missing search report", () => {
  assert.throws(
    () => parseArgs(["node", "component-plugin-action-queue.js"]),
    /--search, --coverage-matrix, --repair-coverage, --motif-recall, --harvest-shortlist, or --target-audit is required/
  );
});

test("parseArgs accepts coverage matrix input", () => {
  const args = parseArgs([
    "node",
    "component-plugin-action-queue.js",
    "--coverage-matrix",
    "coverage.json",
    "--out",
    "queue.json"
  ]);

  assert.equal(args.coverageMatrix, "coverage.json");
  assert.equal(args.out, "queue.json");
});

test("parseArgs accepts expression policy repair coverage input", () => {
  const args = parseArgs([
    "node",
    "component-plugin-action-queue.js",
    "--repair-coverage",
    "repair-coverage.json",
    "--out",
    "queue.json"
  ]);

  assert.equal(args.repairCoverage, "repair-coverage.json");
  assert.equal(args.out, "queue.json");
});

test("parseArgs accepts motif recall input", () => {
  const args = parseArgs([
    "node",
    "component-plugin-action-queue.js",
    "--motif-recall",
    "recall.json",
    "--out",
    "queue.json"
  ]);

  assert.equal(args.motifRecall, "recall.json");
  assert.equal(args.out, "queue.json");
});

test("parseArgs accepts harvest shortlist input", () => {
  const args = parseArgs([
    "node",
    "component-plugin-action-queue.js",
    "--harvest-shortlist",
    "shortlist.json",
    "--officeplus-resolve",
    "resolve.json",
    "--out",
    "queue.json"
  ]);

  assert.equal(args.harvestShortlist, "shortlist.json");
  assert.equal(args.officePlusResolve, "resolve.json");
  assert.equal(args.out, "queue.json");
});

test("parseArgs accepts safe plugin target audit input", () => {
  const args = parseArgs([
    "node",
    "component-plugin-action-queue.js",
    "--target-audit",
    "targets.json",
    "--out",
    "queue.json"
  ]);

  assert.equal(args.targetAudit, "targets.json");
  assert.equal(args.out, "queue.json");
});

test("collectActionCandidates dedupes plugin documents and adds UI instructions", () => {
  const actions = collectActionCandidates(makeSearchReport());

  assert.equal(actions.length, 2);
  assert.equal(actions[0].provider, "officeplus");
  assert.equal(actions[0].id, "MatlComponentContent-11189");
  assert.equal(actions[0].score, 91.23);
  assert.equal(actions[0].action.tab, "OfficePLUS");
  assert.equal(actions[0].action.searchText, "中心 总分 关系图");
  assert.equal(actions[0].downloadLookup.status, "error");
  assert.equal(actions[0].suitability.tier, "strong");
  assert.equal(actions[1].provider, "islide");
  assert.equal(actions[1].action.tab, "iSlide");
});

test("collectHarvestShortlistActions converts close-loop shortlist to apply-session actions", () => {
  const actions = collectHarvestShortlistActions(makeHarvestShortlist());

  assert.equal(actions.length, 3);
  assert.equal(actions[0].provider, "officeplus");
  assert.equal(actions[0].id, "MatlComponentContent-1900");
  assert.equal(actions[0].action.tab, "OfficePLUS");
  assert.equal(actions[0].action.searchText, "渐变风流程箭头元素_4项");
  assert.equal(actions[0].suitability.tier, "strong");
  assert.ok(actions[0].suitability.reasons.includes("exact-component-id"));
});

test("buildPluginActionQueueFromHarvestShortlist prioritizes direct targets over alternates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-action-queue-shortlist-"));
  const shortlist = path.join(dir, "shortlist.json");
  const resolve = path.join(dir, "resolve.json");
  fs.writeFileSync(shortlist, `${JSON.stringify(makeHarvestShortlist())}\n`, "utf8");
  fs.writeFileSync(resolve, `${JSON.stringify(makeOfficePlusResolve())}\n`, "utf8");

  const queue = buildPluginActionQueueFromHarvestShortlist({
    harvestShortlist: shortlist,
    officePlusResolve: resolve,
    maxActions: 3,
    minScore: 0,
    minSuitability: 0
  });

  assert.equal(queue.harvestShortlist, shortlist);
  assert.equal(queue.actions.length, 3);
  assert.deepEqual(queue.actions.map((action) => action.id), [
    "MatlComponentContent-1900",
    "MatlComponentContent-16000",
    "MatlComponentContent-14019"
  ]);
  assert.equal(queue.actions[0].order, 1);
  assert.equal(queue.actions[0].acquisitionMode, "plugin-auth-required");
  assert.equal(queue.actions[0].downloadLookup.status, "auth-required");
  assert.equal(queue.actions[0].fileName, "4a962dae-0adb-0e87-8cac-3a19c1222a49.pptx");
  assert.equal(queue.actions[0].price, 9.9);
  assert.equal(queue.actions[1].suitability.tier, "strong");
  assert.equal(queue.actions[1].action.expectedCandidateId, "MatlComponentContent-16000");
});

test("buildPluginActionQueue writes ranked watcher-ready plugin actions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-action-queue-"));
  const search = path.join(dir, "search.json");
  fs.writeFileSync(search, `${JSON.stringify(makeSearchReport())}\n`, "utf8");

  const queue = buildPluginActionQueue({
    search,
    maxActions: 5,
    minScore: 50
  });

  assert.equal(queue.provider, "component-plugin-action-queue-v1");
  assert.equal(queue.summary.actions, 2);
  assert.equal(queue.summary.rejectedCandidates, 0);
  assert.equal(queue.summary.bySuitabilityTier.strong, 1);
  assert.equal(queue.summary.bySuitabilityTier.weak, 1);
  assert.equal(queue.summary.byProvider.officeplus, 1);
  assert.equal(queue.summary.byProvider.islide, 1);
  assert.equal(queue.summary.byMotif["radial-link"], 2);
  assert.equal(queue.summary.paidCandidates, 1);
  assert.equal(queue.summary.downloadUrlErrors, 1);
  assert.equal(queue.actions[0].order, 1);
  assert.equal(queue.actions[0].provider, "officeplus");
  assert.equal(queue.actions[0].watcherProvider, "officeplus");
  assert.match(queue.actions[0].postActionHarvestHint, /OfficePLUS local cache/);
  assert.equal(queue.actions[1].watcherProvider, "islide");
});

test("buildPluginActionQueue rejects motif-conflicting plugin search candidates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-action-reject-"));
  const search = path.join(dir, "search.json");
  fs.writeFileSync(search, `${JSON.stringify({
    results: [{
      task: {
        provider: "islide",
        kind: "smartdiagram",
        layerKey: "slide1-layer-radial",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke",
        keywords: "中心辐射"
      },
      bestDocuments: [{
        acquisitionProvider: "islide",
        kind: "smartdiagram",
        id: "483",
        title: "多色插画PPT柱状图",
        acquisitionScore: 64,
        matchedKeywords: "中心辐射",
        reuseHint: "candidate-smart-diagram-reference"
      }, {
        acquisitionProvider: "islide",
        kind: "diagram",
        id: "4938671",
        title: "信息中心数据共享交换平台架构图",
        acquisitionScore: 64,
        matchedKeywords: "中心辐射",
        reuseHint: "candidate-polished-diagram-reference"
      }, {
        acquisitionProvider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-11189",
        title: "蓝色简约圆通用4项中心总分PPT组件",
        acquisitionScore: 62,
        matchedKeywords: "中心辐射",
        reuseHint: "candidate-grouped-pptx-component"
      }]
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueue({
    search,
    maxActions: 5,
    minScore: 40,
    minSuitability: 35
  });

  assert.equal(queue.summary.actions, 1);
  assert.equal(queue.actions[0].id, "MatlComponentContent-11189");
  assert.equal(queue.summary.rejectedCandidates, 2);
  assert.equal(queue.summary.rejectedByReason["radial-motif-conflicting-visual"], 1);
  assert.equal(queue.summary.rejectedByReason["radial-architecture-diagram-weak-match"], 1);
  assert.equal(queue.rejectedCandidates[0].id, "483");
  assert.equal(queue.rejectedCandidates[0].suitability.tier, "rejected");
});

test("buildPluginActionQueue ranks strong suitability ahead of higher raw search score", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-action-rank-"));
  const search = path.join(dir, "search.json");
  fs.writeFileSync(search, `${JSON.stringify({
    results: [{
      task: {
        provider: "officeplus",
        kind: "component",
        layerKey: "slide1-layer-radial",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke",
        keywords: "中心辐射"
      },
      bestDocuments: [{
        acquisitionProvider: "islide",
        kind: "diagram",
        id: "weak-relationship",
        title: "多色圆形扁平3项PPT关系",
        acquisitionScore: 95,
        reuseHint: "candidate-polished-diagram-reference"
      }, {
        acquisitionProvider: "officeplus",
        kind: "component",
        id: "strong-component",
        title: "渐变4项中心",
        acquisitionScore: 45,
        reuseHint: "candidate-grouped-pptx-component"
      }]
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueue({
    search,
    maxActions: 2,
    minScore: 30,
    minSuitability: 35
  });

  assert.equal(queue.actions[0].id, "strong-component");
  assert.equal(queue.actions[0].suitability.tier, "strong");
  assert.equal(queue.actions[1].id, "weak-relationship");
  assert.equal(queue.actions[1].suitability.tier, "weak");
});

test("collectCoverageBacklogActions turns matrix backlog into plugin UI actions", () => {
  const actions = collectCoverageBacklogActions({
    totals: {
      componentAssetAcquisitionExamples: [
        {
          deck: "Deck_A",
          layerKey: "0:0",
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke",
          reason: "download matching component"
        },
        {
          deck: "Deck_A",
          layerKey: "0:0",
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        },
        {
          deck: "Deck_A",
          layerKey: "0:0",
          provider: "islide",
          kind: "smartdiagram",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        }
      ]
    }
  });

  assert.equal(actions.length, 2);
  assert.equal(actions[0].provider, "officeplus");
  assert.equal(actions[0].kind, "component");
  assert.equal(actions[0].matchedKeywords, "中心辐射");
  assert.equal(actions[0].targetMotifs[0], "radial-link");
  assert.equal(actions[0].action.tab, "OfficePLUS");
  assert.equal(actions[0].action.mode, "plugin-ui-search-backlog");
  assert.match(actions[0].action.instruction, /best matching component for radial-link/);
  assert.equal(actions[1].action.tab, "iSlide");
});

test("buildPluginActionQueueFromCoverageMatrix ranks coverage backlog actions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-coverage-queue-"));
  const coverageMatrix = path.join(dir, "coverage.json");
  fs.writeFileSync(coverageMatrix, `${JSON.stringify({
    totals: {
      componentAssetAcquisitionExamples: [
        {
          deck: "Deck_A",
          layerKey: "0:0",
          provider: "islide",
          kind: "smartdiagram",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        },
        {
          deck: "Deck_A",
          layerKey: "0:0",
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        }
      ]
    }
  })}\n`, "utf8");

  const queue = buildPluginActionQueueFromCoverageMatrix({
    coverageMatrix,
    maxActions: 10
  });

  assert.equal(queue.provider, "component-plugin-action-queue-v1");
  assert.equal(queue.summary.actions, 2);
  assert.equal(queue.summary.byProvider.officeplus, 1);
  assert.equal(queue.summary.byProvider.islide, 1);
  assert.equal(queue.summary.byMotif["radial-link"], 2);
  assert.equal(queue.actions[0].provider, "officeplus");
  assert.equal(queue.actions[0].watcherProvider, "officeplus");
  assert.match(queue.actions[0].postActionHarvestHint, /OfficePLUS/);
});

test("collectRepairCoverageBacklogActions turns final replacement candidates into plugin UI actions only", () => {
  const actions = collectRepairCoverageBacklogActions({
    decks: [{
      deck: "Deck_A",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 2,
        image: 1,
        imageId: "native-graphic-underlay-split-0",
        detector: "split-table-grid-residual-crop",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "preserve-fidelity-crop",
        page: 3,
        image: 1,
        imageId: "plugin-icon",
        detector: "visual-example-icon",
        minimumUnitPolicy: "preserve-as-single-crop"
      }]
    }]
  });

  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => `${action.provider}:${action.kind}`), [
    "officeplus:component",
    "islide:smartdiagram"
  ]);
  assert.equal(actions[0].deck, "Deck_A");
  assert.equal(actions[0].slide, 2);
  assert.equal(actions[0].id, "repair:Deck_A:p2:native-graphic-underlay-split-0:officeplus:component:card-grid");
  assert.equal(actions[0].imageId, "native-graphic-underlay-split-0");
  assert.deepEqual(actions[0].affectedTargets, [{
    deck: "Deck_A",
    slide: 2,
    imageId: "native-graphic-underlay-split-0",
    imageIndex: 0,
    layerKey: "Deck_A:p2:native-graphic-underlay-split-0"
  }]);
  assert.equal(actions[0].matchedKeywords, "矩阵卡片表格图示");
  assert.deepEqual(actions[0].targetMotifs, ["card-grid"]);
  assert.equal(actions[0].action.mode, "plugin-ui-search-repair-coverage");
  assert.match(actions[0].action.instruction, /Deck_A slide 2/);
  assert.equal(actions[0].suitability.tier, "strong");
});

test("collectRepairCoverageBacklogActions only queues explicit semantic visual units", () => {
  const actions = collectRepairCoverageBacklogActions({
    decks: [{
      deck: "Deck_Units",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 1,
        image: 1,
        imageId: "semantic-flow",
        detector: "workflow-underlay-crop",
        unitDisposition: "semantic-native-structure",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 2,
        image: 1,
        imageId: "plugin-arrow-preview",
        detector: "component-preview-illustration-crop",
        unitDisposition: "intentional-visual-crop",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 3,
        image: 1,
        imageId: "ambiguous-underlay",
        detector: "unknown-graphic-underlay",
        unitDisposition: "classification-needed",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  });

  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => action.layerKey), [
    "Deck_Units:p1:semantic-flow",
    "Deck_Units:p1:semantic-flow"
  ]);
});

test("collectRepairCoverageBacklogActions blocks legacy plugin visual assets without unit disposition", () => {
  const actions = collectRepairCoverageBacklogActions({
    decks: [{
      deck: "Deck_Legacy_Assets",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 1,
        image: 1,
        imageId: "semantic-matrix",
        detector: "split-table-grid-residual-crop",
        expressionForm: "table-or-matrix",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 2,
        image: 1,
        imageId: "legacy-cycle-preview",
        detector: "component-preview-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "iSlide 圆弧箭头 图标图示 素材",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  });

  assert.equal(actions.length, 2);
  assert.ok(actions.every((action) => action.imageId === "semantic-matrix"));
});

test("buildPluginActionQueueFromRepairCoverage ranks watcher-ready final repair targets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-repair-coverage-queue-"));
  const repairCoverage = path.join(dir, "repair-coverage.json");
  fs.writeFileSync(repairCoverage, `${JSON.stringify({
    decks: [{
      deck: "Deck_Process",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 5,
        image: 2,
        imageId: "collaboration-flow",
        detector: "collaboration-flow-underlay-crop",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueueFromRepairCoverage({
    repairCoverage,
    maxActions: 10
  });

  assert.equal(queue.provider, "component-plugin-action-queue-v1");
  assert.equal(queue.repairCoverage, repairCoverage);
  assert.equal(queue.summary.actions, 2);
  assert.equal(queue.summary.protectedNonSemanticSkips, 0);
  assert.equal(queue.summary.byProvider.officeplus, 1);
  assert.equal(queue.summary.byProvider.islide, 1);
  assert.equal(queue.summary.byMotif["whole-process-template"], 2);
  assert.equal(queue.actions[0].order, 1);
  assert.equal(queue.actions[0].watcherRecommended, true);
  assert.match(queue.actions[0].id, /^repair:Deck_Process:p5:collaboration-flow:officeplus:component:/);
  assert.match(queue.actions[0].postActionHarvestHint, /repair-coverage target/);
});

test("buildPluginActionQueueFromRepairCoverage reports protected legacy visual asset skips", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-repair-coverage-protected-"));
  const repairCoverage = path.join(dir, "repair-coverage.json");
  fs.writeFileSync(repairCoverage, `${JSON.stringify({
    decks: [{
      deck: "Deck_Protected",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 1,
        imageId: "semantic-flow",
        detector: "workflow-underlay-crop",
        unitDisposition: "semantic-native-structure",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 2,
        imageId: "legacy-icon-preview",
        detector: "component-preview-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "圆弧箭头 图标图示 素材",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueueFromRepairCoverage({
    repairCoverage,
    maxActions: 10
  });

  assert.equal(queue.summary.actions, 2);
  assert.equal(queue.summary.protectedNonSemanticSkips, 1);
  assert.ok(queue.actions.every((action) => action.imageId === "semantic-flow"));
});

test("buildPluginActionQueueFromRepairCoverage balances OfficePLUS and iSlide under action caps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-repair-coverage-balanced-"));
  const repairCoverage = path.join(dir, "repair-coverage.json");
  fs.writeFileSync(repairCoverage, `${JSON.stringify({
    decks: [{
      deck: "Deck_Balanced",
      finalDeckDispositions: Array.from({ length: 6 }, (_, index) => ({
        action: "replacement-candidate",
        page: index + 1,
        image: 1,
        imageId: `matrix-${index}`,
        detector: "split-table-grid-residual-crop",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }))
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueueFromRepairCoverage({
    repairCoverage,
    maxActions: 6
  });

  assert.equal(queue.summary.actions, 6);
  assert.equal(queue.summary.byProvider.officeplus, 3);
  assert.equal(queue.summary.byProvider.islide, 3);
  assert.deepEqual(queue.actions.slice(0, 2).map((action) => action.provider), ["officeplus", "islide"]);
});

test("collectMotifRecallActions turns motif gaps into plugin UI search actions", () => {
  const actions = collectMotifRecallActions({
    rows: [{
      motif: "whole-process-template",
      status: "missing",
      expectedKeywords: ["整组流程组件", "流程组件"],
      suggestedCollectionActions: [{
        action: "apply-and-harvest-plugin-component",
        providers: ["islide", "officeplus"],
        keywords: ["整组流程组件", "流程组件"],
        command: "node watch-plugin-component-downloads.js --active-powerpoint",
        reason: "missing whole process template"
      }]
    }, {
      motif: "arc-arrow",
      status: "ready",
      suggestedCollectionActions: [{
        action: "apply-and-harvest-plugin-component",
        providers: ["islide"],
        keywords: ["圆弧箭头"]
      }]
    }]
  });

  assert.equal(actions.length, 3);
  assert.equal(actions[0].targetMotifs[0], "whole-process-template");
  assert.ok(actions.some((action) => action.provider === "officeplus" && action.kind === "component"));
  assert.ok(actions.some((action) => action.provider === "islide" && action.kind === "smartdiagram"));
  assert.ok(actions.every((action) => action.action.mode === "plugin-ui-search-backlog"));
  assert.ok(actions.every((action) => action.suggestedWorkflowCommand.includes("--active-powerpoint")));
  assert.ok(actions.every((action) => action.suitability.tier !== "rejected"));
});

test("buildPluginActionQueueFromMotifRecall ranks watcher-ready motif gap actions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-motif-recall-queue-"));
  const motifRecall = path.join(dir, "recall.json");
  fs.writeFileSync(motifRecall, `${JSON.stringify({
    rows: [{
      motif: "whole-process-template",
      status: "missing",
      expectedKeywords: ["整组流程组件", "流程组件"],
      suggestedCollectionActions: [{
        action: "apply-and-harvest-plugin-component",
        providers: ["islide", "officeplus"],
        keywords: ["整组流程组件", "流程组件"],
        command: "node watch-plugin-component-downloads.js --active-powerpoint",
        reason: "not backed by applied component"
      }]
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueueFromMotifRecall({
    motifRecall,
    maxActions: 10
  });

  assert.equal(queue.provider, "component-plugin-action-queue-v1");
  assert.equal(queue.summary.actions, 3);
  assert.equal(queue.summary.byMotif["whole-process-template"], 3);
  assert.equal(queue.summary.bySuitabilityTier.rejected, undefined);
  assert.equal(queue.actions[0].provider, "officeplus");
  assert.equal(queue.actions[0].kind, "component");
  assert.equal(queue.actions[0].watcherRecommended, true);
  assert.match(queue.actions[0].postActionHarvestHint, /motif-gap/);
});

function makeTargetAudit() {
  return {
    provider: "plugin-component-target-audit-v1",
    decks: [{
      deck: "Deck_A",
      executableTargets: [{
        deck: "Deck_A",
        slide: 3,
        imageIndex: 0,
        imageId: "matrix-underlay",
        detector: "comparison-matrix-crop",
        layerType: "table-zone",
        expressionForm: "table-or-matrix",
        expressionSubtype: "comparison-matrix",
        decision: "executable-plugin-target",
        expressionPolicy: {
          kind: "structured-native",
          minimumUnitPolicy: "rebuild-semantic-structure",
          unitDisposition: "semantic-native-structure"
        },
        structural: {
          nodeCount: 8,
          connectorCount: 0,
          atomCount: 12,
          reasons: ["chart-table-matrix-minimum-unit", "semantic-structure-evidence"]
        },
        pluginAction: {
          provider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-20568",
          title: "扁平3项箭头矩阵",
          confidence: 46
        },
        reasons: ["structured-expression-safe-for-plugin-component"]
      }],
      protectedCropTargets: [{
        deck: "Deck_A",
        slide: 4,
        imageId: "icon",
        decision: "preserve-local-crop",
        pluginAction: {
          provider: "officeplus",
          kind: "component",
          id: "bad-icon",
          title: "图标组件"
        }
      }]
    }]
  };
}

test("collectTargetAuditActions turns safe executable targets into plugin actions only", () => {
  const actions = collectTargetAuditActions(makeTargetAudit());

  assert.equal(actions.length, 1);
  assert.equal(actions[0].provider, "officeplus");
  assert.equal(actions[0].id, "MatlComponentContent-20568");
  assert.equal(actions[0].deck, "Deck_A");
  assert.equal(actions[0].slide, 3);
  assert.deepEqual(actions[0].targetMotifs, ["card-grid"]);
  assert.equal(actions[0].action.searchText, "矩阵 关系 对比 组件");
  assert.equal(actions[0].implementationStatus, "unresolved");
  assert.equal(actions[0].suitability.tier, "strong");
});

test("collectTargetAuditActions rejects executable targets with non-semantic unit disposition", () => {
  const audit = makeTargetAudit();
  audit.decks[0].executableTargets.push({
    ...audit.decks[0].executableTargets[0],
    imageId: "plugin-arrow-preview",
    expressionPolicy: {
      kind: "standalone-visual-asset",
      minimumUnitPolicy: "preserve-as-single-crop",
      unitDisposition: "intentional-visual-crop"
    },
    pluginAction: {
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-icon",
      title: "圆弧箭头图标"
    }
  });

  const actions = collectTargetAuditActions(audit);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].imageId, "matrix-underlay");
});

test("collectTargetAuditActions blocks legacy icon diagram targets even without unit disposition", () => {
  const audit = makeTargetAudit();
  audit.decks[0].executableTargets.push({
    ...audit.decks[0].executableTargets[0],
    imageId: "legacy-arc-arrow-icon",
    detector: "component-preview-illustration-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "iSlide 圆弧箭头 图标图示 素材",
    expressionPolicy: {
      kind: "",
      minimumUnitPolicy: "rebuild-semantic-structure"
    },
    pluginAction: {
      provider: "islide",
      kind: "component",
      id: "legacy-icon-component",
      title: "圆弧箭头图标素材"
    }
  });

  const actions = collectTargetAuditActions(audit);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].imageId, "matrix-underlay");
});

test("collectTargetAuditActions queues download-gated targets and skips import-ready targets", () => {
  const audit = makeTargetAudit();
  audit.decks[0].executableTargets[0].pluginAction = {
    ...audit.decks[0].executableTargets[0].pluginAction,
    implementationMode: "auth-or-download-required",
    implementationStatus: "download-gated",
    targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available"
  };
  audit.decks[0].executableTargets.push({
    ...audit.decks[0].executableTargets[0],
    imageId: "matrix-underlay-import-ready",
    pluginAction: {
      ...audit.decks[0].executableTargets[0].pluginAction,
      id: "MatlComponentContent-99999",
      title: "本地已收集矩阵",
      implementationMode: "import-ready",
      implementationStatus: "import-ready"
    }
  });

  const actions = collectTargetAuditActions(audit);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, "MatlComponentContent-20568");
  assert.equal(actions[0].implementationStatus, "download-gated");
  assert.equal(actions[0].implementationMode, "auth-or-download-required");
  assert.equal(actions[0].downloadLookup.status, "auth-or-download-required");
});

test("collectTargetAuditActions groups repeated component targets for one harvest", () => {
  const audit = makeTargetAudit();
  audit.decks[0].executableTargets.push({
    ...audit.decks[0].executableTargets[0],
    slide: 7,
    imageId: "matrix-underlay-copy"
  });

  const actions = collectTargetAuditActions(audit);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].affectedTargets.length, 2);
  assert.deepEqual(actions[0].affectedSlides, [
    { deck: "Deck_A", slide: 3 },
    { deck: "Deck_A", slide: 7 }
  ]);
  assert.match(actions[0].action.instruction, /1 other safe target/);
});

test("buildPluginActionQueueFromTargetAudit ranks watcher-ready safe component targets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-target-queue-"));
  const targetAudit = path.join(dir, "targets.json");
  fs.writeFileSync(targetAudit, `${JSON.stringify(makeTargetAudit())}\n`, "utf8");

  const queue = buildPluginActionQueueFromTargetAudit({
    targetAudit,
    maxActions: 10,
    minScore: 0,
    minSuitability: 0
  });

  assert.equal(queue.provider, "component-plugin-action-queue-v1");
  assert.equal(queue.summary.actions, 1);
  assert.equal(queue.summary.protectedNonSemanticSkips, 0);
  assert.equal(queue.summary.byProvider.officeplus, 1);
  assert.equal(queue.summary.byMotif["card-grid"], 1);
  assert.equal(queue.actions[0].watcherProvider, "officeplus");
  assert.match(queue.actions[0].postActionHarvestHint, /safe OfficePLUS structural target/);
});

test("buildPluginActionQueueFromTargetAudit reports protected legacy visual asset skips", () => {
  const audit = makeTargetAudit();
  audit.decks[0].executableTargets.push({
    ...audit.decks[0].executableTargets[0],
    imageId: "legacy-arc-arrow-icon",
    detector: "component-preview-illustration-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "iSlide 圆弧箭头 图标图示 素材",
    expressionPolicy: {
      minimumUnitPolicy: "rebuild-semantic-structure"
    },
    pluginAction: {
      provider: "islide",
      kind: "component",
      id: "legacy-icon-component",
      title: "圆弧箭头图标素材"
    }
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-target-protected-"));
  const targetAudit = path.join(dir, "target-audit.json");
  fs.writeFileSync(targetAudit, `${JSON.stringify(audit)}\n`, "utf8");

  const queue = buildPluginActionQueueFromTargetAudit({
    targetAudit,
    maxActions: 10,
    minScore: 0,
    minSuitability: 0
  });

  assert.equal(queue.summary.actions, 1);
  assert.equal(queue.summary.protectedNonSemanticSkips, 1);
  assert.equal(queue.actions[0].imageId, "matrix-underlay");
});

test("buildPluginActionQueueFromTargetAudit rejects mismatched flow components for card-grid targets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-plugin-target-mismatch-"));
  const targetAudit = path.join(dir, "targets.json");
  fs.writeFileSync(targetAudit, `${JSON.stringify({
    decks: [{
      deck: "Deck_A",
      executableTargets: [{
        deck: "Deck_A",
        slide: 5,
        imageId: "table-underlay",
        layerType: "table-zone",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        decision: "executable-plugin-target",
        expressionPolicy: {
          kind: "structured-native",
          minimumUnitPolicy: "rebuild-semantic-structure"
        },
        structural: {
          nodeCount: 8,
          connectorCount: 0,
          atomCount: 10
        },
        pluginAction: {
          provider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-11617",
          title: "渐变6项流程",
          confidence: 46
        }
      }]
    }]
  })}\n`, "utf8");

  const queue = buildPluginActionQueueFromTargetAudit({
    targetAudit,
    maxActions: 10,
    minScore: 0,
    minSuitability: 35
  });

  assert.equal(queue.summary.actions, 0);
  assert.equal(queue.summary.rejectedCandidates, 1);
  assert.equal(queue.summary.rejectedByReason["flow-title-for-card-grid-target"], 1);
  assert.equal(queue.rejectedCandidates[0].suitability.tier, "rejected");
});

test("renderPluginActionQueueMarkdown produces a click-by-click plugin collection guide", () => {
  const markdown = renderPluginActionQueueMarkdown({
    generatedAt: "2026-07-02T00:00:00.000Z",
    summary: { actions: 1 },
    actions: [{
      order: 1,
      provider: "officeplus",
      kind: "component",
      targetMotifs: ["whole-process-template"],
      matchedKeywords: "整组流程组件",
      searchKeywords: ["整组流程组件", "流程组件"],
      acquisitionReason: "missing whole process template",
      acquisitionMode: "plugin-auth-required",
      fileName: "component.pptx",
      paymentType: 1,
      price: 9.9,
      downloadLookup: { status: "auth-required" },
      suitability: { tier: "strong", score: 96 },
      action: {
        tab: "OfficePLUS",
        library: "component",
        searchText: "整组流程组件",
        instruction: "Open OfficePLUS and apply the matching component."
      }
    }]
  });

  assert.match(markdown, /# Plugin Component Action Queue/);
  assert.match(markdown, /watch-plugin-component-downloads\.js --provider all --active-powerpoint/);
  assert.match(markdown, /OfficePLUS component for whole-process-template/);
  assert.match(markdown, /Search: 整组流程组件/);
  assert.match(markdown, /Acquisition mode: plugin-auth-required/);
  assert.match(markdown, /Source file: component\.pptx/);
  assert.match(markdown, /Price: 9\.9/);
  assert.match(markdown, /Download lookup: auth-required/);
  assert.match(markdown, /component-library-refresh\.js --learn-structure/);
});
