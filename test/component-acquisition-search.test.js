"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectAcquisitionTasks,
  collectCoverageAcquisitionTasks,
  collectRepairCoverageAcquisitionTasks,
  _private,
  parseArgs,
  runComponentAcquisitionSearch,
  scoreAcquisitionDocument,
  shouldResolveOfficePlusDownload
} = require("../skills/pd-hifi-slideclone/scripts/component-acquisition-search");

test("component acquisition search collects unique manifest tasks", () => {
  const manifest = {
    layers: [{
      layerKey: "0:0",
      componentAcquisitionTasks: [
        {
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          alternateKeywords: ["放射关系图"],
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        },
        {
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          alternateKeywords: ["放射关系图"],
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        }
      ]
    }]
  };

  const tasks = collectAcquisitionTasks(manifest);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].provider, "officeplus");
  assert.equal(tasks[0].keywords, "中心辐射");
  assert.deepEqual(tasks[0].targetMotifs, ["radial-link"]);
});

test("component acquisition search collects only replacement candidates from repair coverage", () => {
  const tasks = collectRepairCoverageAcquisitionTasks({
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
        imageId: "plugin-arrow-icon",
        detector: "visual-example-icon",
        minimumUnitPolicy: "preserve-as-single-crop"
      }, {
        action: "replacement-candidate",
        page: 4,
        image: 1,
        imageId: "plugin-arrow-preview",
        detector: "component-preview-illustration-crop",
        expressionSubtype: "圆弧箭头 图示样例",
        unitDisposition: "intentional-visual-crop",
        minimumUnitPolicy: "preserve-as-single-crop"
      }, {
        action: "replacement-candidate",
        page: 5,
        image: 1,
        imageId: "unknown-visual-unit",
        detector: "unknown-graphic-underlay",
        unitDisposition: "classification-needed",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  });

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => `${task.provider}:${task.kind}`), [
    "officeplus:component",
    "islide:smartdiagram"
  ]);
  assert.equal(tasks[0].deck, "Deck_A");
  assert.equal(tasks[0].layerKey, "Deck_A:p2:native-graphic-underlay-split-0");
  assert.equal(tasks[0].keywords, "矩阵卡片表格图示");
  assert.deepEqual(tasks[0].targetMotifs, ["card-grid"]);
  assert.match(tasks[0].reason, /expression-policy-final-disposition/);
});

test("component acquisition search only creates repair tasks for semantic visual units when disposition is explicit", () => {
  const tasks = collectRepairCoverageAcquisitionTasks({
    decks: [{
      deck: "Deck_Units",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 1,
        image: 1,
        imageId: "flow-structure",
        detector: "workflow-underlay-crop",
        unitDisposition: "semantic-native-structure",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 2,
        image: 1,
        imageId: "icon-preview",
        detector: "plugin-arrow-icon-preview",
        unitDisposition: "intentional-visual-crop",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 3,
        image: 1,
        imageId: "needs-classification",
        detector: "ambiguous-underlay",
        unitDisposition: "classification-needed",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  });

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => task.layerKey), [
    "Deck_Units:p1:flow-structure",
    "Deck_Units:p1:flow-structure"
  ]);
});

test("component acquisition search accepts repair coverage as a direct dry-run source", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-acquisition-repair-coverage-"));
  try {
    const repairCoverageFile = path.join(tmp, "repair-coverage.json");
    fs.writeFileSync(repairCoverageFile, `${JSON.stringify({
      decks: [{
        deck: "Deck_Process",
        finalDeckDispositions: [{
          action: "replacement-candidate",
          page: 1,
          image: 2,
          imageId: "flow-underlay",
          detector: "collaboration-flow-underlay-crop",
          minimumUnitPolicy: "rebuild-semantic-structure"
        }]
      }]
    })}\n`, "utf8");

    const args = parseArgs(["node", "script", "--repair-coverage", repairCoverageFile, "--dry-run"]);
    assert.equal(args.repairCoverage, repairCoverageFile);

    const report = await runComponentAcquisitionSearch({
      repairCoverage: repairCoverageFile,
      dryRun: true,
      maxKeywordsPerTask: 1
    });

    assert.equal(report.sourceType, "expression-policy-repair-coverage");
    assert.equal(report.summary.tasks, 2);
    assert.equal(report.summary.planned, 2);
    assert.equal(report.results[0].task.keywords, "流程箭头组件");
    assert.equal(report.results[0].task.deck, "Deck_Process");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("component acquisition search routes specialty diagram repair coverage to precise plugin motifs", () => {
  const tasks = collectRepairCoverageAcquisitionTasks({
    decks: [{
      deck: "Deck_Specialty",
      finalDeckDispositions: [{
        action: "replacement-candidate",
        page: 1,
        image: 1,
        imageId: "map-region-underlay",
        detector: "semantic-map-chart-underlay",
        recommendedRoute: "plugin-map-chart-component",
        recommendedFamily: "map-chart",
        unitDisposition: "semantic-native-structure",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 2,
        image: 1,
        imageId: "word-cloud-underlay",
        detector: "semantic-word-cloud-underlay",
        recommendedRoute: "plugin-word-cloud-component",
        recommendedMotif: "word-cloud-chart",
        unitDisposition: "semantic-native-structure",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }, {
        action: "replacement-candidate",
        page: 3,
        image: 1,
        imageId: "sankey-underlay",
        detector: "semantic-sankey-flow-underlay",
        recommendedRoute: "plugin-sankey-flow-component",
        unitDisposition: "semantic-native-structure",
        minimumUnitPolicy: "rebuild-semantic-structure"
      }]
    }]
  });

  assert.equal(tasks.length, 6);
  assert.deepEqual(tasks.map((task) => task.targetMotifs[0]), [
    "map-chart",
    "map-chart",
    "word-cloud-chart",
    "word-cloud-chart",
    "sankey-flow-chart",
    "sankey-flow-chart"
  ]);
  assert.deepEqual(tasks.map((task) => task.templateFamily), [
    "map-chart",
    "map-chart",
    "word-cloud-chart",
    "word-cloud-chart",
    "sankey-flow-chart",
    "sankey-flow-chart"
  ]);
});

test("component acquisition search keeps treemap and chart motifs out of generic hierarchy fallback", () => {
  const treemapProfile = _private.repairDispositionSearchProfile({
    detector: "semantic-treemap-chart-underlay",
    recommendedRoute: "plugin-or-native-treemap-component",
    minimumUnitPolicy: "rebuild-semantic-structure"
  });
  const donutProfile = _private.repairDispositionSearchProfile({
    detector: "segmented-donut-chart-underlay",
    recommendedRoute: "plugin-or-native-donut-component",
    minimumUnitPolicy: "rebuild-semantic-structure"
  });

  assert.equal(treemapProfile.templateFamily, "treemap-chart");
  assert.deepEqual(treemapProfile.targetMotifs, ["treemap-chart"]);
  assert.equal(donutProfile.templateFamily, "chart");
  assert.deepEqual(donutProfile.targetMotifs, ["pie-share-chart", "donut-segment-chart"]);
});

test("component acquisition search normalizes cycle arrow motif aliases", () => {
  const task = _private.normalizeTask({
    provider: "islide",
    kind: "smartdiagram",
    keywords: "环形箭头",
    targetMotifs: ["cycle-arrow", "circular-arrow", "arc-arrow"]
  }, "Deck_A:p1:cycle");

  assert.deepEqual(task.targetMotifs, ["arc-arrow"]);
  assert.ok(_private.motifTokens(task.targetMotifs).includes("圆弧"));
});

test("component acquisition search collects coverage matrix backlog tasks", () => {
  const coverageMatrix = {
    totals: {
      componentAssetAcquisitionExamples: [{
        deck: "PM_Portal",
        layerKey: "0:0",
        provider: "officeplus",
        kind: "component",
        keywords: "中心辐射",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke"
      }]
    },
    rows: [{
      componentAssetAcquisitionExamples: [{
        deck: "PM_Portal",
        layerKey: "0:0",
        provider: "officeplus",
        kind: "component",
        keywords: "中心辐射",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke"
      }, {
        deck: "PM_Portal",
        layerKey: "0:0",
        provider: "islide",
        kind: "smartdiagram",
        keywords: "中心辐射",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke"
      }]
    }]
  };

  const tasks = collectCoverageAcquisitionTasks(coverageMatrix);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => `${task.provider}:${task.kind}`), [
    "officeplus:component",
    "islide:smartdiagram"
  ]);
  assert.equal(tasks[0].deck, "PM_Portal");
});

test("component acquisition search accepts coverage matrix as a direct dry-run source", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-acquisition-coverage-"));
  const coverageMatrixFile = path.join(tmp, "coverage-matrix.json");
  fs.writeFileSync(coverageMatrixFile, `${JSON.stringify({
    totals: {
      componentAssetAcquisitionExamples: [{
        deck: "PM_Portal",
        layerKey: "0:0",
        provider: "officeplus",
        kind: "component",
        keywords: "中心辐射",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke"
      }]
    }
  })}\n`, "utf8");

  const args = parseArgs(["node", "script", "--coverage-matrix", coverageMatrixFile, "--dry-run"]);
  assert.equal(args.coverageMatrix, coverageMatrixFile);
  assert.equal(args.dryRun, true);

  const report = await runComponentAcquisitionSearch({
    coverageMatrix: coverageMatrixFile,
    dryRun: true,
    maxKeywordsPerTask: 1
  });

  assert.equal(report.sourceType, "component-coverage-matrix");
  assert.equal(report.summary.tasks, 1);
  assert.equal(report.summary.planned, 1);
  assert.equal(report.results[0].task.keywords, "中心辐射");
  assert.equal(report.results[0].keywordRuns[0].status, "planned");
});

test("component acquisition search executes OfficePLUS and iSlide tasks with bounded results", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-acquisition-search-"));
  const manifestFile = path.join(tmp, "component-assets.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    layers: [{
      layerKey: "0:0",
      componentAcquisitionTasks: [
        {
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          alternateKeywords: ["放射关系图"],
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        },
        {
          provider: "islide",
          kind: "smartdiagram",
          keywords: "中心辐射",
          alternateKeywords: ["径向关系"],
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke"
        }
      ]
    }]
  })}\n`, "utf8");

  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => {
      if (String(url).includes("officeplus")) {
        return JSON.stringify({
          total: 1,
          documents: [{
            id: "MatlComponentContent-1",
            title: "中心辐射关系图",
            fileName: "radial.pptx",
            l1Tags: [{ name: "关系图" }]
          }]
        });
      }
      return JSON.stringify({
        code: 200,
        body: {
          total: 1,
          items: [{
            id: "islide-radial-1",
            title: "放射关系图 Smart",
            downloadable: true,
            group: { permission: "1" }
          }]
        }
      });
    }
  });

  const report = await runComponentAcquisitionSearch({
    manifest: manifestFile,
    size: 3,
    maxKeywordsPerTask: 1,
    fetchImpl
  });

  assert.equal(report.summary.tasks, 2);
  assert.equal(report.summary.ok, 2);
  assert.equal(report.summary.documents, 2);
  assert.equal(report.summary.byMotif["radial-link"], 2);
  assert.equal(report.results[0].bestDocuments[0].acquisitionProvider, "officeplus");
  assert.equal(report.results[1].bestDocuments[0].acquisitionProvider, "islide");
  assert.ok(report.results[1].bestDocuments[0].acquisitionScore > 0);
});

test("component acquisition search optionally resolves OfficePLUS download URLs", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-acquisition-download-"));
  const manifestFile = path.join(tmp, "component-assets.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    layers: [{
      layerKey: "0:0",
      componentAcquisitionTasks: [{
        provider: "officeplus",
        kind: "component",
        keywords: "中心辐射",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke"
      }]
    }]
  })}\n`, "utf8");

  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => {
        if (String(url).includes("/download/")) {
          return JSON.stringify({ data: { downloadUrl: "https://download.officeplus.cn/radial.pptx" } });
        }
        return JSON.stringify({
          total: 1,
          documents: [{
            id: "MatlComponentContent-11189",
            title: "中心辐射关系图",
            fileName: "radial.pptx",
            l1Tags: [{ name: "关系图" }]
          }]
        });
      }
    };
  };

  const report = await runComponentAcquisitionSearch({
    manifest: manifestFile,
    size: 1,
    maxKeywordsPerTask: 1,
    resolveOfficePlusDownloads: true,
    fetchImpl
  });

  assert.equal(report.summary.downloadUrlResolved, 1);
  assert.equal(report.summary.downloadUrlErrors, 0);
  assert.match(calls.find((url) => url.includes("/download/")), /anonymous\/download-url/);
  assert.equal(report.results[0].bestDocuments[0].downloadLookup.downloadUrl, "https://download.officeplus.cn/radial.pptx");
});

test("component acquisition search records OfficePLUS download URL errors without failing the task", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-acquisition-download-error-"));
  const manifestFile = path.join(tmp, "component-assets.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    layers: [{
      layerKey: "0:0",
      componentAcquisitionTasks: [{
        provider: "officeplus",
        kind: "component",
        keywords: "中心辐射",
        targetMotifs: ["radial-link"],
        templateFamily: "hub-spoke"
      }]
    }]
  })}\n`, "utf8");

  const fetchImpl = async (url) => {
    if (String(url).includes("/download/")) {
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => JSON.stringify({ message: "login required" })
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        total: 1,
        documents: [{ id: "MatlComponentContent-11189", title: "中心辐射关系图" }]
      })
    };
  };

  const report = await runComponentAcquisitionSearch({
    manifest: manifestFile,
    size: 1,
    maxKeywordsPerTask: 1,
    resolveOfficePlusDownloads: true,
    fetchImpl
  });

  assert.equal(report.summary.ok, 1);
  assert.equal(report.summary.downloadUrlResolved, 0);
  assert.equal(report.summary.downloadUrlErrors, 1);
  assert.equal(report.results[0].bestDocuments[0].downloadLookup.status, "error");
});

test("component acquisition search only resolves safe OfficePLUS document ids", () => {
  assert.equal(shouldResolveOfficePlusDownload({
    acquisitionProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-11189"
  }), true);
  assert.equal(shouldResolveOfficePlusDownload({
    acquisitionProvider: "islide",
    kind: "diagram",
    id: "islide-1"
  }), false);
  assert.equal(shouldResolveOfficePlusDownload({
    acquisitionProvider: "officeplus",
    kind: "component",
    id: "../secret"
  }), false);
});

test("component acquisition scoring prefers motif-matching downloadable documents", () => {
  const generic = scoreAcquisitionDocument({
    id: "generic",
    title: "商务图示",
    reuseHint: "candidate-style-reference"
  }, {
    provider: "islide",
    kind: "smartdiagram",
    keywords: "中心辐射",
    alternateKeywords: ["径向关系"],
    targetMotifs: ["radial-link"]
  });
  const radial = scoreAcquisitionDocument({
    id: "radial",
    title: "中心辐射径向关系图",
    downloadable: true,
    reuseHint: "candidate-smart-diagram-reference"
  }, {
    provider: "islide",
    kind: "smartdiagram",
    keywords: "中心辐射",
    alternateKeywords: ["径向关系"],
    targetMotifs: ["radial-link"]
  });

  assert.ok(radial.acquisitionScore > generic.acquisitionScore);
});
