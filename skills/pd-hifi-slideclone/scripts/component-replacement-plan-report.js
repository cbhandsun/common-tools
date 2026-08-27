"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    ir: "",
    out: path.join("runs", "plugin-component-inventory", "component-replacement-plan-report.json"),
    maxExamples: 8
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--ir" || arg === "--in") && next) {
      args.ir = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--max-examples" && next) {
      args.maxExamples = Number(next);
      i += 1;
    } else {
      throw new Error(`Unknown component-replacement-plan-report argument: ${arg}`);
    }
  }
  if (!args.ir) throw new Error("--ir is required");
  return args;
}

function buildComponentReplacementPlanReport(options = {}) {
  const irFile = path.resolve(String(options.ir || ""));
  const deck = options.deck && typeof options.deck === "object" ? options.deck : readJson(irFile);
  const maxExamples = normalizePositiveInt(options.maxExamples, 8);
  const byComponent = new Map();
  const byLayer = new Map();
  let totalShapes = 0;
  let totalTextBoxes = 0;
  let pagesWithPlans = 0;

  for (const [pageIndex, page] of (Array.isArray(deck.pages) ? deck.pages : []).entries()) {
    let pageHasPlans = false;
    for (const element of collectReplacementElements(page, pageIndex)) {
      pageHasPlans = true;
      if (element.elementType === "shape") totalShapes += 1;
      if (element.elementType === "textBox") totalTextBoxes += 1;
      addElement(byComponent, componentKey(element.plan), element, maxExamples);
      addElement(byLayer, safeString(element.plan.layerKey || "unknown-layer"), element, maxExamples);
    }
    if (pageHasPlans) pagesWithPlans += 1;
  }

  const components = [...byComponent.values()].sort(compareRows);
  const layers = [...byLayer.values()].sort(compareRows);
  return {
    provider: "component-replacement-plan-report-v1",
    generatedAt: new Date().toISOString(),
    ir: irFile,
    summary: {
      pages: Array.isArray(deck.pages) ? deck.pages.length : 0,
      pagesWithPlans,
      components: components.length,
      layers: layers.length,
      shapes: totalShapes,
      textBoxes: totalTextBoxes,
      elements: totalShapes + totalTextBoxes,
      bySuitabilityTier: countBy(components, (row) => row.suitabilityTier || "unknown"),
      byProvider: countBy(components, (row) => row.sourceProvider || "unknown")
    },
    components,
    layers
  };
}

function collectReplacementElements(page = {}, pageIndex = 0) {
  const elements = [];
  for (const shape of Array.isArray(page.shapes) ? page.shapes : []) {
    const plan = replacementPlanFor(shape);
    if (!plan) continue;
    elements.push(elementSummary({ item: shape, pageIndex, elementType: "shape", plan }));
  }
  for (const textBox of Array.isArray(page.textBoxes) ? page.textBoxes : []) {
    const plan = replacementPlanFor(textBox);
    if (!plan) continue;
    elements.push(elementSummary({ item: textBox, pageIndex, elementType: "textBox", plan, text: textBox.text }));
  }
  return elements;
}

function replacementPlanFor(item = {}) {
  const plan = item?.source?.componentReplacementPlan;
  if (!plan || typeof plan !== "object") return null;
  const componentId = safeString(plan.componentId || item.source?.componentReplacementCandidateId);
  if (!componentId) return null;
  return {
    provider: safeString(plan.provider || "plugin-component-template-replacement-plan-v1"),
    layerKey: safeString(plan.layerKey || item.source?.componentReplacementLayerKey),
    sourceProvider: safeString(plan.sourceProvider),
    componentKind: safeString(plan.componentKind),
    componentId,
    title: safeString(plan.title).slice(0, 200),
    suitabilityTier: safeString(plan.suitabilityTier || item.source?.componentReplacementSuitabilityTier),
    suitabilityScore: numberOrZero(plan.suitabilityScore ?? item.source?.componentReplacementSuitabilityScore)
  };
}

function elementSummary({ item, pageIndex, elementType, plan, text = "" }) {
  return {
    pageIndex,
    elementType,
    id: safeString(item.id).slice(0, 160),
    text: safeString(text).slice(0, 80),
    detector: safeString(item.source?.detector).slice(0, 120),
    box: normalizeBox(item.box),
    plan
  };
}

function addElement(map, key, element, maxExamples) {
  const safeKey = safeString(key || "unknown");
  if (!map.has(safeKey)) {
    map.set(safeKey, {
      key: safeKey,
      sourceProvider: element.plan.sourceProvider,
      componentKind: element.plan.componentKind,
      componentId: element.plan.componentId,
      title: element.plan.title,
      layerKey: element.plan.layerKey,
      suitabilityTier: element.plan.suitabilityTier,
      suitabilityScore: element.plan.suitabilityScore,
      shapes: 0,
      textBoxes: 0,
      elements: 0,
      pages: [],
      examples: []
    });
  }
  const row = map.get(safeKey);
  if (element.elementType === "shape") row.shapes += 1;
  if (element.elementType === "textBox") row.textBoxes += 1;
  row.elements += 1;
  if (!row.pages.includes(element.pageIndex)) row.pages.push(element.pageIndex);
  if (row.examples.length < maxExamples) {
    row.examples.push({
      pageIndex: element.pageIndex,
      elementType: element.elementType,
      id: element.id,
      text: element.text,
      detector: element.detector,
      box: element.box
    });
  }
}

function componentKey(plan = {}) {
  return [
    safeString(plan.sourceProvider || "unknown"),
    safeString(plan.componentKind || "component"),
    safeString(plan.componentId || "unknown")
  ].join(":");
}

function compareRows(a, b) {
  return Number(b.elements || 0) - Number(a.elements || 0)
    || safeString(a.key).localeCompare(safeString(b.key));
}

function countBy(rows = [], keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = safeString(keyFn(row) || "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function normalizeBox(box = {}) {
  const x = numberOrNull(box?.x);
  const y = numberOrNull(box?.y);
  const w = numberOrNull(box?.w);
  const h = numberOrNull(box?.h);
  return [x, y, w, h].every((value) => value !== null) ? { x, y, w, h } : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number * 100) / 100)) : 0;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildComponentReplacementPlanReport(args);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`replacement components: ${report.summary.components}`);
  console.log(`replacement elements: ${report.summary.elements}`);
  console.log(`report: ${path.resolve(args.out)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(safeString(error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  buildComponentReplacementPlanReport,
  parseArgs,
  _private: {
    collectReplacementElements,
    replacementPlanFor
  }
};
