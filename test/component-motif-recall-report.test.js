"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseArgs,
  buildMotifRecallReport,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-motif-recall-report");

test("buildMotifRecallReport marks motif ready when search and applied local structure agree", () => {
  const report = buildMotifRecallReport({
    motifs: ["arc-arrow"],
    candidateReports: [{
      provider: "component-candidate-search-v1",
      layers: [{
        plan: {
          targetMotifs: ["arc-arrow"],
          queries: [{ keywords: ["圆弧箭头", "循环箭头"] }]
        },
        bestCandidates: [{
          title: "圆弧箭头循环流程组件",
          downloadUrl: "https://example.invalid/component.pptx"
        }]
      }]
    }],
    assetManifests: [{
      provider: "component-asset-manifest-v1",
      layers: [{
        localAssets: [{
          title: "iSlide applied arc arrow",
          provider: "islide",
          roleTags: ["applied-component"],
          structureSignature: {
            primaryMotif: "arc-arrow",
            motifs: ["arc-arrow"],
            motifCounts: { "arc-arrow": 3 }
          }
        }]
      }]
    }]
  });

  assert.equal(report.summary.ready, 1);
  assert.equal(report.rows[0].status, "ready");
  assert.equal(report.rows[0].candidateHits, 1);
  assert.equal(report.rows[0].localStructureMatches, 1);
  assert.equal(report.rows[0].appliedComponentAssets, 1);
  assert.ok(report.rows[0].expectedKeywords.includes("圆弧箭头"));
});

test("buildMotifRecallReport exposes planned-only gaps without pretending assets exist", () => {
  const report = buildMotifRecallReport({
    motifs: ["tree-link"],
    candidateReports: [{
      layers: [{
        plan: {
          targetMotifs: ["tree-link"],
          queries: [{ keywords: ["组织结构图"] }]
        },
        bestCandidates: []
      }]
    }]
  });

  assert.equal(report.rows[0].status, "planned-only");
  assert.equal(report.rows[0].plannedQueries, 1);
  assert.equal(report.rows[0].candidateHits, 0);
  assert.equal(report.rows[0].localAssets, 0);
  assert.ok(report.rows[0].notes.some((note) => note.includes("no harvested local asset")));
});

test("buildMotifRecallReport preserves top-level dry-run plan when results are empty", () => {
  const report = buildMotifRecallReport({
    candidateReports: [{
      provider: "component-candidate-search-v1",
      plan: {
        targetMotifs: ["arc-arrow"],
        queries: [{ keywords: "圆弧箭头" }]
      },
      results: []
    }]
  });
  const row = report.rows.find((entry) => entry.motif === "arc-arrow");

  assert.equal(row.status, "planned-only");
  assert.equal(row.plannedQueries, 1);
});

test("buildMotifRecallReport can infer local motif from inventory text", () => {
  const report = buildMotifRecallReport({
    motifs: ["card-grid"],
    inventories: [{
      provider: "plugin-component-registry-v1",
      items: [{
        provider: "officeplus",
        title: "矩阵卡片信息图组件",
        roleTags: ["applied-component"],
        path: "OfficePLUS/card-grid.pptx"
      }]
    }]
  });

  assert.equal(report.rows[0].status, "local-only");
  assert.equal(report.rows[0].localAssets, 1);
  assert.equal(report.rows[0].appliedComponentAssets, 1);
});

test("buildMotifRecallReport reads plugin registry candidates and role tags", () => {
  const report = buildMotifRecallReport({
    motifs: ["arc-arrow"],
    inventories: [{
      provider: "plugin-component-registry-v1",
      candidates: [{
        id: "islide-applied-arc-arrow",
        provider: "islide",
        name: "islide-applied-arc-arrow-cycle.pptx",
        assetKind: "presentation-template",
        roleTags: ["applied-component", "openxml-inspectable"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        path: "runs/plugin-component-inventory/islide-applied-components/arc-arrow-cycle.pptx"
      }]
    }]
  });

  assert.equal(report.rows[0].status, "local-only");
  assert.equal(report.rows[0].localAssets, 1);
  assert.equal(report.rows[0].appliedComponentAssets, 1);
  assert.equal(report.rows[0].sampleAssets[0].includes("islide-applied-arc-arrow-cycle"), true);
});

test("buildMotifRecallReport treats learned inventory structure signatures as ready", () => {
  const report = buildMotifRecallReport({
    motifs: ["arc-arrow"],
    inventories: [{
      provider: "plugin-component-registry-v1",
      candidates: [{
        id: "islide-applied-arc-arrow",
        provider: "islide",
        name: "islide-applied-arc-arrow-cycle.pptx",
        assetKind: "presentation-template",
        roleTags: ["applied-component", "openxml-inspectable"],
        structureSignature: {
          primaryMotif: "arc-arrow",
          motifs: ["arc-arrow"],
          motifCounts: { "arc-arrow": 13 }
        }
      }]
    }]
  });

  assert.equal(report.summary.ready, 1);
  assert.equal(report.rows[0].status, "ready");
  assert.equal(report.rows[0].localStructureMatches, 1);
  assert.equal(report.rows[0].appliedComponentAssets, 1);
});

test("buildMotifRecallReport reads inventory structure coverage summaries", () => {
  const report = buildMotifRecallReport({
    motifs: ["arc-arrow"],
    inventories: [{
      provider: "plugin-component-registry-v1",
      summary: {
        byStructureMotif: {
          "arc-arrow": 13
        }
      }
    }]
  });

  assert.equal(report.rows[0].status, "local-structure-only");
  assert.equal(report.rows[0].inventoryStructureCoverage, 13);
  assert.equal(report.rows[0].localStructureMatches, 13);
});

test("buildMotifRecallReport emits concrete collection actions for missing motif coverage", () => {
  const report = buildMotifRecallReport({
    motifs: ["whole-process-template"],
    candidateReports: [{
      layers: [{
        plan: {
          targetMotifs: ["whole-process-template"],
          queries: [{ keywords: ["整组流程组件"] }]
        },
        bestCandidates: []
      }]
    }]
  });
  const row = report.rows[0];

  assert.equal(row.status, "planned-only");
  assert.ok(row.suggestedCollectionActions.some((action) => action.action === "search-plugin-component-library"));
  assert.ok(row.suggestedCollectionActions.some((action) => action.action === "apply-and-harvest-plugin-component"));
  assert.ok(row.suggestedCollectionActions.some((action) => String(action.command || "").includes("--active-powerpoint")));
  assert.ok(row.suggestedCollectionActions[0].keywords.includes("整组流程组件"));
});

test("motif recall does not assign all motifs to unclassified local assets", () => {
  assert.deepEqual(_private.normalizeDetectedMotifs([]), []);
  assert.deepEqual(_private.motifsForAsset({
    provider: "officeplus",
    name: "generic-template.pptx",
    roleTags: ["template-layout"],
    path: "OfficePLUS/generic-template.pptx"
  }), []);
  assert.deepEqual(_private.motifsForInventoryItem({
    provider: "officeplus",
    name: "generic-template.pptx",
    roleTags: ["template-layout"],
    path: "OfficePLUS/generic-template.pptx"
  }), []);
});

test("parseArgs accepts repeated report inputs and fail gate flag", () => {
  const args = parseArgs([
    "node",
    "component-motif-recall-report.js",
    "--candidate-report",
    "candidate.json",
    "--asset-manifest",
    "assets.json",
    "--inventory",
    "inventory.json",
    "--motifs",
    "arc-arrow,tree-link",
    "--out",
    "out.json",
    "--fail-on-missing-ready"
  ]);

  assert.deepEqual(args.candidateReports, ["candidate.json"]);
  assert.deepEqual(args.assetManifests, ["assets.json"]);
  assert.deepEqual(args.inventories, ["inventory.json"]);
  assert.deepEqual(args.motifs, ["arc-arrow", "tree-link"]);
  assert.equal(args.out, "out.json");
  assert.equal(args.failOnMissingReady, true);
});

test("motif helpers read nested component strategy target motifs", () => {
  assert.deepEqual(
    _private.motifsForCandidateLayer({
      diagramUnderstanding: {
        componentStrategy: {
          targetMotifs: ["radial-link"]
        }
      }
    }),
    ["radial-link"]
  );
  assert.equal(_private.textMatchesMotif("这是一个中心辐射关系组件", "radial-link"), true);
  assert.equal(_private.textMatchesMotif("OfficePLUS applied roadmap timeline component", "linear-arrow-chain"), true);
});

test("motif recall includes expanded semantic diagram motifs", () => {
  const report = buildMotifRecallReport({
    candidateReports: [{
      layers: [{
        plan: {
          targetMotifs: ["fishbone-cause", "venn-overlap", "quadrant-axis", "pie-share-chart"],
          queries: [
            { keywords: ["鱼骨图", "因果分析"] },
            { keywords: ["Venn图", "交集关系"] },
            { keywords: ["四象限", "优先级矩阵"] },
            { keywords: ["饼图", "扇区占比图"] }
          ]
        },
        bestCandidates: [
          { title: "鱼骨图因果分析组件", downloadUrl: "https://example.invalid/fishbone.pptx" },
          { title: "Venn图集合关系组件", downloadUrl: "https://example.invalid/venn.pptx" },
          { title: "四象限优先级矩阵", downloadUrl: "https://example.invalid/quadrant.pptx" },
          { title: "四扇区饼图占比组件", downloadUrl: "https://example.invalid/pie.pptx" }
        ]
      }]
    }]
  });

  for (const motif of ["fishbone-cause", "venn-overlap", "quadrant-axis", "pie-share-chart"]) {
    const row = report.rows.find((entry) => entry.motif === motif);
    assert.ok(row, `missing motif row ${motif}`);
    assert.ok(row.plannedQueries >= 1, `missing planned query for ${motif}`);
    assert.ok(row.candidateHits >= 1, `missing candidate hit for ${motif}`);
    assert.equal(row.status, "search-only");
  }
});
