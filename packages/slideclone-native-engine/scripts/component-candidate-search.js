"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildLegacyLayerComponentSeed,
  buildComponentSearchPlan,
  searchComponentCandidates
} = require("./lib/component-candidate-planner");
const { recommendComponentRenderStrategy } = require("./lib/component-render-strategy");

function parseArgs(argv) {
  const args = {
    in: "",
    ir: "",
    out: path.join("runs", "plugin-component-inventory", "component-candidates.json"),
    archetype: "flow-card-chain",
    templateFamily: "process-chain",
    mode: "component-template",
    keywords: "流程",
    targetMotifs: [],
    size: 6,
    queryCacheDir: path.join("runs", "slideclone-component-query-cache"),
    queryConcurrency: 3,
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--in" && next) {
      args.in = next;
      i += 1;
    } else if (arg === "--ir" && next) {
      args.ir = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--archetype" && next) {
      args.archetype = next;
      i += 1;
    } else if (arg === "--template-family" && next) {
      args.templateFamily = next;
      i += 1;
    } else if (arg === "--mode" && next) {
      args.mode = next;
      i += 1;
    } else if (arg === "--keywords" && next) {
      args.keywords = next;
      i += 1;
    } else if (arg === "--target-motifs" && next) {
      args.targetMotifs = splitList(next);
      i += 1;
    } else if (arg === "--size" && next) {
      args.size = Number(next);
      i += 1;
    } else if (arg === "--query-cache-dir" && next) {
      args.queryCacheDir = next;
      i += 1;
    } else if (arg === "--query-concurrency" && next) {
      args.queryConcurrency = Number(next);
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.ir) {
    const report = await searchIrComponentCandidates(args);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`IR component candidate layers: ${report.layers.length}`);
    for (const layer of report.layers.slice(0, 8)) {
      const layerLabel = layer.imageIndex == null ? "shape-group" : `img${layer.imageIndex + 1}`;
      console.log(`- p${layer.pageIndex + 1} ${layerLabel} ${layer.templateFamily} ${layer.componentRenderStrategy?.mode || "unknown"} ${layer.bestCandidates.length} candidates`);
      for (const candidate of layer.bestCandidates.slice(0, 2)) console.log(`  ${candidate.sourceProvider || "officeplus"}:${candidate.kind}:${candidate.id} ${candidate.title}`);
    }
    console.log(`report: ${path.resolve(args.out)}`);
    return;
  }
  const diagramUnderstanding = loadDiagramUnderstanding(args);
  const result = args.dryRun
    ? { provider: "component-candidate-search-v1", plan: buildComponentSearchPlan(diagramUnderstanding, args), results: [] }
    : await searchComponentCandidates(diagramUnderstanding, args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`component candidate queries: ${result.plan.queries.length}`);
  for (const entry of result.results || []) {
    console.log(`- ${entry.query.kind}:${entry.query.keywords} ${entry.status} ${entry.documents?.length || 0}/${entry.total || 0}`);
    for (const doc of (entry.documents || []).slice(0, 3)) {
      console.log(`  ${doc.id} ${doc.title} score=${doc.candidateScore}`);
    }
  }
  console.log(`report: ${path.resolve(args.out)}`);
}

async function searchIrComponentCandidates(args) {
  const ir = JSON.parse(fs.readFileSync(args.ir, "utf8"));
  const layers = [];
  const queryMemo = args.queryMemo instanceof Map ? args.queryMemo : new Map();
  const pages = Array.isArray(ir.pages) ? ir.pages : [];
  for (const [pageIndex, page] of pages.entries()) {
    for (const [imageIndex, image] of (page.images || []).entries()) {
      const layer = image.source?.layer;
      if (!layer || image.source?.editable === true) continue;
      if (Number(layer.areaRatio || 0) < 0.08 && !/diagram|illustration/.test(String(layer.layerType || ""))) continue;
      const diagramUnderstanding = layer.diagramUnderstanding?.componentStrategy
        ? layer.diagramUnderstanding
        : buildLegacyLayerComponentSeed(layer, image, page);
      const searchContext = {
        ...args,
        queryMemo,
        layerType: layer.layerType || "",
        detector: image.source?.detector || layer.detector || "unknown"
      };
      const result = args.dryRun
        ? { plan: buildComponentSearchPlan(diagramUnderstanding, searchContext), results: [] }
        : await searchComponentCandidates(diagramUnderstanding, searchContext);
      const bestCandidates = bestCandidateDocuments(result.results, 8);
      const renderLayer = withPlanComponentFamily(layer, result.plan);
      layers.push({
        pageIndex,
        imageIndex,
        detector: image.source?.detector || layer.detector || "unknown",
        layerType: layer.layerType || "unknown",
        areaRatio: layer.areaRatio || null,
        box: sanitizeBox(image.box),
        aspectRatio: aspectRatio(image.box),
        templateFamily: result.plan?.templateFamily || diagramUnderstanding.componentStrategy?.templateFamily || "unknown",
        mode: result.plan?.mode || diagramUnderstanding.componentStrategy?.mode || "unknown",
        plan: result.plan,
        componentRenderStrategy: recommendComponentRenderStrategy(renderLayer, bestCandidates),
        bestCandidates
      });
    }
    for (const shapeLayer of semanticCycleShapeLayers(page, pageIndex)) {
      const result = args.dryRun
        ? { plan: buildComponentSearchPlan(shapeLayer.diagramUnderstanding, { ...args, layerType: shapeLayer.layerType, textBoxes: shapeLayer.textBoxes }), results: [] }
        : await searchComponentCandidates(shapeLayer.diagramUnderstanding, { ...args, queryMemo, layerType: shapeLayer.layerType, textBoxes: shapeLayer.textBoxes });
      const bestCandidates = bestCandidateDocuments(result.results, 8);
      const renderLayer = withPlanComponentFamily(shapeLayer.layer, result.plan);
      layers.push({
        pageIndex,
        imageIndex: null,
        shapeLayerId: shapeLayer.id,
        detector: shapeLayer.detector,
        layerType: shapeLayer.layerType,
        areaRatio: shapeLayer.areaRatio,
        box: sanitizeBox(shapeLayer.box),
        aspectRatio: aspectRatio(shapeLayer.box),
        templateFamily: result.plan?.templateFamily || shapeLayer.diagramUnderstanding.componentStrategy?.templateFamily || "unknown",
        mode: result.plan?.mode || shapeLayer.diagramUnderstanding.componentStrategy?.mode || "unknown",
        plan: result.plan,
        componentRenderStrategy: recommendComponentRenderStrategy(renderLayer, bestCandidates),
        bestCandidates
      });
    }
    for (const ownerLayer of componentOwnerShapeLayers(page, pageIndex)) {
      const result = args.dryRun
        ? { plan: buildComponentSearchPlan(ownerLayer.diagramUnderstanding, { ...args, layerType: ownerLayer.layerType, textBoxes: ownerLayer.textBoxes }) , results: [] }
        : await searchComponentCandidates(ownerLayer.diagramUnderstanding, { ...args, queryMemo, layerType: ownerLayer.layerType, textBoxes: ownerLayer.textBoxes });
      const bestCandidates = bestCandidateDocuments(result.results, 8);
      const renderLayer = withPlanComponentFamily(ownerLayer.layer, result.plan);
      layers.push({
        pageIndex,
        imageIndex: null,
        shapeLayerId: ownerLayer.id,
        componentOwnerId: ownerLayer.componentOwnerId,
        componentOwnerKind: ownerLayer.componentOwnerKind,
        detector: ownerLayer.detector,
        layerType: ownerLayer.layerType,
        areaRatio: ownerLayer.areaRatio,
        box: sanitizeBox(ownerLayer.box),
        aspectRatio: aspectRatio(ownerLayer.box),
        templateFamily: result.plan?.templateFamily || ownerLayer.diagramUnderstanding.componentStrategy?.templateFamily || "unknown",
        mode: result.plan?.mode || ownerLayer.diagramUnderstanding.componentStrategy?.mode || "unknown",
        plan: result.plan,
        componentRenderStrategy: recommendComponentRenderStrategy(renderLayer, bestCandidates),
        bestCandidates
      });
    }
  }
  return {
    provider: "ir-component-candidate-report-v1",
    ir: path.resolve(args.ir),
    layers
  };
}

function bestCandidateDocuments(results = [], limit = 8) {
  const byKey = new Map();
  for (const entry of Array.isArray(results) ? results : []) {
    for (const document of Array.isArray(entry.documents) ? entry.documents : []) {
      const candidate = {
        ...document,
        queryProvider: entry.query?.provider,
        queryKind: entry.query?.kind
      };
      const key = candidateDocumentKey(candidate);
      const previous = byKey.get(key);
      if (!previous || Number(candidate.candidateScore || 0) > Number(previous.candidateScore || 0)) {
        byKey.set(key, candidate);
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.candidateScore || 0) - Number(a.candidateScore || 0)
      || String(a.title || "").localeCompare(String(b.title || "")))
    .slice(0, Math.max(1, Math.trunc(Number(limit) || 8)));
}

function candidateDocumentKey(candidate = {}) {
  return [
    candidate.sourceProvider || candidate.queryProvider || "",
    candidate.kind || candidate.queryKind || "",
    candidate.id || "",
    String(candidate.title || "").toLowerCase()
  ].join(":");
}

function semanticCycleShapeLayers(page = {}, pageIndex = 0) {
  const shapes = (page.shapes || []).filter((shape) => String(shape?.source?.detector || "").startsWith("semantic-cycle-native-"));
  if (shapes.length < 6) return [];
  const box = unionBoxes(shapes.map((shape) => shape.box).filter(Boolean));
  if (!box) return [];
  const slide = page.slideSize || { widthPt: 960, heightPt: 540 };
  const areaRatio = (box.w * box.h) / Math.max(1, Number(slide.widthPt || 960) * Number(slide.heightPt || 540));
  const textBoxes = (page.textBoxes || [])
    .filter((textBox) => boxIntersects(textBox.box, box))
    .map((textBox) => ({ text: textBox.text, box: textBox.box }));
  return [{
    id: `p${pageIndex + 1}-semantic-cycle-native-shapes`,
    detector: "semantic-cycle-native-shape-group",
    layerType: "diagram-zone",
    areaRatio: round(areaRatio),
    box,
    textBoxes,
    layer: {
      layerType: "diagram-zone",
      detector: "semantic-cycle-native-shape-group",
      areaRatio: round(areaRatio),
      diagramUnderstanding: {
        provider: "diagram-understanding-v1",
        archetype: "cycle-loop",
        confidence: 0.82,
        nativeReadiness: "native-rebuild",
        componentStrategy: {
          provider: "component-strategy-v1",
          mode: "component-template",
          templateFamily: "cycle-loop",
          targetMotifs: ["arc-arrow", "ring-node"],
          sourcePreference: ["officeplus-search", "islide-search"],
          reason: "semantic-cycle native shapes should continue searching polished loop/cycle components"
        },
        targetMotifs: ["arc-arrow", "ring-node"],
        nodes: textBoxes.map((textBox, index) => ({ id: `text-${index + 1}`, text: textBox.text })).filter((node) => node.text)
      }
    },
    diagramUnderstanding: {
      provider: "diagram-understanding-v1",
      archetype: "cycle-loop",
      confidence: 0.82,
      nativeReadiness: "native-rebuild",
      componentStrategy: {
        provider: "component-strategy-v1",
        mode: "component-template",
        templateFamily: "cycle-loop",
        targetMotifs: ["arc-arrow", "ring-node"],
        sourcePreference: ["officeplus-search", "islide-search"],
        reason: "semantic-cycle native shapes should continue searching polished loop/cycle components"
      },
      targetMotifs: ["arc-arrow", "ring-node"],
      nodes: textBoxes.map((textBox, index) => ({ id: `text-${index + 1}`, text: textBox.text })).filter((node) => node.text)
    }
  }];
}

function componentOwnerShapeLayers(page = {}, pageIndex = 0) {
  const groups = new Map();
  for (const shape of (page.shapes || [])) {
    const ownerId = String(shape?.source?.componentOwnerId || "");
    if (!ownerId) continue;
    if (!groups.has(ownerId)) {
      groups.set(ownerId, {
        ownerId,
        ownerKind: String(shape?.source?.componentOwnerKind || "native-component"),
        shapes: []
      });
    }
    groups.get(ownerId).shapes.push(shape);
  }
  const slide = page.slideSize || { widthPt: 960, heightPt: 540 };
  return Array.from(groups.values())
    .map((group) => componentOwnerLayerFromGroup(group, page, pageIndex, slide))
    .filter(Boolean);
}

function componentOwnerLayerFromGroup(group = {}, page = {}, pageIndex = 0, slide = { widthPt: 960, heightPt: 540 }) {
  if (!group.ownerId || !Array.isArray(group.shapes) || group.shapes.length < 6) return null;
  const box = unionBoxes(group.shapes.map((shape) => shape.box).filter(Boolean));
  if (!box) return null;
  const areaRatio = (box.w * box.h) / Math.max(1, Number(slide.widthPt || 960) * Number(slide.heightPt || 540));
  const textBoxes = (page.textBoxes || [])
    .filter((textBox) => textBox?.source?.componentOwnerId === group.ownerId || boxIntersects(textBox.box, box))
    .map((textBox) => ({ text: textBox.text, box: textBox.box }));
  const strategy = componentOwnerStrategy(group.ownerKind, group.ownerId, textBoxes);
  const detectorCounts = {};
  for (const shape of group.shapes) {
    const detector = String(shape?.source?.detector || shape?.type || "unknown");
    detectorCounts[detector] = (detectorCounts[detector] || 0) + 1;
  }
  const structureSignature = componentOwnerStructureSignature(strategy, group, detectorCounts, textBoxes);
  const layer = {
    layerType: "diagram-zone",
    detector: "native-component-owner-shape-group",
    componentOwnerId: group.ownerId,
    componentOwnerKind: group.ownerKind,
    areaRatio: round(areaRatio),
    diagramUnderstanding: {
      provider: "diagram-understanding-v1",
      archetype: strategy.archetype,
      confidence: 0.82,
      nativeReadiness: "native-rebuild",
      ...(structureSignature ? { structureSignature } : {}),
      componentStrategy: {
        provider: "component-strategy-v1",
        mode: "component-template",
        templateFamily: strategy.templateFamily,
        targetMotifs: strategy.targetMotifs,
        ...(structureSignature ? { structureSignature } : {}),
        sourcePreference: ["officeplus-search", "islide-search"],
        reason: `native component owner ${group.ownerKind} should search reusable grouped PPT components`
      },
      targetMotifs: strategy.targetMotifs,
      nodes: textBoxes.map((textBox, index) => ({ id: `text-${index + 1}`, text: textBox.text })).filter((node) => node.text)
    }
  };
  return {
    id: `p${pageIndex + 1}-${group.ownerId}`,
    componentOwnerId: group.ownerId,
    componentOwnerKind: group.ownerKind,
    detector: "native-component-owner-shape-group",
    layerType: "diagram-zone",
    areaRatio: round(areaRatio),
    box,
    textBoxes,
    shapeCount: group.shapes.length,
    detectorCounts,
    layer,
    diagramUnderstanding: layer.diagramUnderstanding
  };
}

function componentOwnerStructureSignature(strategy = {}, group = {}, detectorCounts = {}, textBoxes = []) {
  const family = String(strategy.templateFamily || "");
  const owner = `${group.ownerKind || ""} ${group.ownerId || ""}`.toLowerCase();
  const shapeCount = Array.isArray(group.shapes) ? group.shapes.length : 0;
  if (family === "cycle-loop") {
    const nodeCount = countDetectors(detectorCounts, /native-node$/) || countDetectors(detectorCounts, /node/);
    const stepCount = clampStepCount(nodeCount || textBoxes.length || 4);
    return {
      layout: "cycle-loop",
      stepCount,
      direction: "clockwise",
      wholeGroupTemplatePriority: "high",
      regularSpacing: stepCount >= 3,
      evidence: ["component-owner-cycle"]
    };
  }
  if (family === "process-chain") {
    const stepCount = /demand-understanding|smart-review|risk-gate/.test(owner)
      ? 4
      : clampStepCount(textBoxes.length || countDetectors(detectorCounts, /card|node|doc|output/) || 4);
    return {
      layout: "linear-process",
      stepCount,
      rows: 1,
      columns: stepCount,
      direction: "left-to-right",
      wholeGroupTemplatePriority: "high",
      regularSpacing: stepCount >= 3,
      evidence: ["component-owner-process"]
    };
  }
  if (family === "network-diagram" && shapeCount < 120) {
    return {
      layout: "network",
      stepCount: clampStepCount(textBoxes.length || countDetectors(detectorCounts, /node/) || 0),
      direction: "multi-direction",
      wholeGroupTemplatePriority: "medium",
      regularSpacing: false,
      evidence: ["component-owner-network"]
    };
  }
  return null;
}

function countDetectors(detectorCounts = {}, pattern) {
  return Object.entries(detectorCounts)
    .filter(([name]) => pattern.test(String(name || "")))
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
}

function clampStepCount(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.max(1, Math.min(12, number));
}

function componentOwnerStrategy(ownerKind = "", ownerId = "", textBoxes = []) {
  const value = `${ownerKind} ${ownerId}`.toLowerCase();
  const text = textBoxes.map((item) => String(item.text || "")).join(" ");
  if (/system-map/.test(value)) {
    return {
      archetype: "network-map",
      templateFamily: "network-diagram",
      targetMotifs: ["tree-link", "radial-link", "card-grid"]
    };
  }
  if (/closed-loop|cycle/.test(value)) {
    return {
      archetype: "cycle-loop",
      templateFamily: "cycle-loop",
      targetMotifs: ["arc-arrow", "ring-node", "whole-process-template"]
    };
  }
  if (/demand-understanding/.test(value)) {
    return {
      archetype: "process-chain",
      templateFamily: "process-chain",
      targetMotifs: ["branch-card-flow", "lens-funnel-flow", "linear-arrow-chain"]
    };
  }
  if (/smart-review|risk-gate/.test(value)) {
    return {
      archetype: "process-chain",
      templateFamily: "process-chain",
      targetMotifs: ["branch-card-flow", "linear-arrow-chain", "whole-process-template"]
    };
  }
  if (/entropy/.test(value) || /熵增|挑战/.test(text)) {
    return {
      archetype: "relationship-map",
      templateFamily: "relationship-diagram",
      targetMotifs: ["card-grid", "branch-card-flow", "linear-arrow-chain"]
    };
  }
  return {
    archetype: "flow-card-chain",
    templateFamily: "process-chain",
    targetMotifs: ["whole-process-template", "linear-arrow-chain"]
  };
}

function withPlanComponentFamily(layer = {}, plan = {}) {
  const templateFamily = String(plan?.templateFamily || "");
  if (!templateFamily || templateFamily === "unknown") return layer;
  const diagramUnderstanding = layer.diagramUnderstanding || {};
  const targetMotifs = Array.isArray(plan?.targetMotifs) ? plan.targetMotifs : [];
  return {
    ...layer,
    diagramUnderstanding: {
      ...diagramUnderstanding,
      ...(targetMotifs.length ? { targetMotifs } : {}),
      componentStrategy: {
        ...(diagramUnderstanding.componentStrategy || {}),
        templateFamily,
        ...(targetMotifs.length ? { targetMotifs } : {})
      }
    }
  };
}

function sanitizeBox(box = {}) {
  if (!box || typeof box !== "object") return null;
  return {
    x: finiteNumber(box.x),
    y: finiteNumber(box.y),
    w: finiteNumber(box.w),
    h: finiteNumber(box.h)
  };
}

function aspectRatio(box = {}) {
  const width = Number(box?.w);
  const height = Number(box?.h);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? Math.round((width / height) * 10000) / 10000
    : null;
}

function unionBoxes(boxes = []) {
  const valid = boxes
    .map((box) => sanitizeBox(box))
    .filter((box) => Number.isFinite(box?.x) && Number.isFinite(box?.y) && Number.isFinite(box?.w) && Number.isFinite(box?.h));
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((box) => box.x));
  const top = Math.min(...valid.map((box) => box.y));
  const right = Math.max(...valid.map((box) => box.x + box.w));
  const bottom = Math.max(...valid.map((box) => box.y + box.h));
  return { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) };
}

function boxIntersects(a = {}, b = {}) {
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return right > left && bottom > top;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function loadDiagramUnderstanding(args) {
  if (args.in) {
    const parsed = JSON.parse(fs.readFileSync(args.in, "utf8"));
    return parsed.diagramUnderstanding || parsed;
  }
  return {
    provider: "diagram-understanding-v1",
    archetype: args.archetype,
    confidence: 0.7,
    nativeReadiness: "hybrid-native-plus-residual-crops",
    componentStrategy: {
      provider: "component-strategy-v1",
      mode: args.mode,
      templateFamily: args.templateFamily,
      targetMotifs: args.targetMotifs,
      sourcePreference: ["officeplus-polished-card-style"],
      reason: "CLI supplied component candidate search"
    },
    targetMotifs: args.targetMotifs,
    nodes: args.keywords ? [{ id: "node-1", text: args.keywords }] : []
  };
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  searchIrComponentCandidates,
  loadDiagramUnderstanding,
  parseArgs,
  _private: {
    aspectRatio,
    bestCandidateDocuments,
    boxIntersects,
    componentOwnerShapeLayers,
    componentOwnerStrategy,
    sanitizeBox,
    semanticCycleShapeLayers,
    unionBoxes,
    withPlanComponentFamily
  }
};
