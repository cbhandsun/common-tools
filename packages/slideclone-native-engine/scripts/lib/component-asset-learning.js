"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  collectColors,
  collectFillColors,
  emuToPt,
  extractTopLevelDrawingBlocks,
  hasPositiveBounds,
  normalizeChildBox,
  parseDirectChildBoxes,
  parseGradientFill,
  parseLineDash,
  parseNestedReplayChildBoxes,
  parsePresetGeometryAdjustments,
  parseRelationshipsXml,
  parseThemeColorsXml,
  parseThemeFontsXml,
  readSlideRelationships,
  readThemeColors,
  readThemeFonts,
  resolveRelationshipTarget,
  resolveThemeTypeface,
  unionBounds
} = require("./component-asset-ooxml");
const {
  countPptxSlides,
  listZipEntries,
  readZipEntry
} = require("./pptx-inventory");

function summarizeLocalComponentAsset(asset = {}, options = {}) {
  const file = safePath(asset.path);
  if (!file || !path.isAbsolute(file) || !safeExists(file)) {
    return { status: "unavailable", reason: "asset-path-not-readable" };
  }
  const kind = String(asset.assetKind || "").toLowerCase();
  const ext = path.extname(file).toLowerCase();
  try {
    if (kind === "presentation-template" || ext === ".pptx" || ext === ".potx") {
      return summarizePptxTemplate(file, options);
    }
    if (kind === "chart-template" || ext === ".crtx") {
      return summarizeChartTemplate(file, options);
    }
    if (kind === "component-metadata" || ext === ".json") {
      return summarizeStyleJson(file, options);
    }
    if (kind === "vector-component" || ext === ".svg") {
      return summarizeSvg(file, options);
    }
    return { status: "skipped", reason: "unsupported-asset-kind" };
  } catch (error) {
    return { status: "error", reason: safeString(error.message).slice(0, 160) };
  }
}

function summarizeChartTemplate(file) {
  const entries = listZipEntries(file);
  const chartEntry = entries.find((entry) => /^chart\/chart\.xml$/i.test(entry.name));
  if (!chartEntry) return { status: "skipped", reason: "chart-template-missing-chart-xml" };

  const chartXml = readZipEntry(file, chartEntry.name, { maxBytes: 4 * 1024 * 1024 }).toString("utf8");
  const chartType = detectChartTemplateType(chartXml);
  if (!chartType) return { status: "skipped", reason: "chart-template-type-not-supported" };
  const seriesCount = countMatches(chartXml, /<c:ser\b/g);
  const pointCount = countMatches(chartXml, /<c:dPt\b/g);
  const hasDataLabels = /<c:dLbls\b/i.test(chartXml);
  const hasLegend = /<c:legend\b/i.test(chartXml);
  const motifs = chartTemplateMotifs(chartType);
  const structure = {
    kind: chartType,
    roles: {
      background: 0,
      node: Math.max(1, seriesCount),
      connector: 0,
      textSlot: 0,
      pictureSlot: 0,
      decoration: 0
    },
    motifs,
    motifCounts: Object.fromEntries(motifs.map((motif) => [motif, Math.max(1, seriesCount)])),
    nodeCount: Math.max(1, seriesCount),
    connectorCount: 0,
    textSlotCount: 0,
    pictureSlotCount: 0
  };
  return {
    status: "ok",
    assetType: "chart-template",
    chartType,
    packageEntries: entries.length,
    chartSummary: {
      seriesCount,
      pointCount,
      hasDataLabels,
      hasLegend,
      hasThemeOverride: entries.some((entry) => /^chart\/theme\/themeOverride\d+\.xml$/i.test(entry.name)),
      hasStyle: entries.some((entry) => /^chart\/charts\/style\d+\.xml$/i.test(entry.name)),
      hasColors: entries.some((entry) => /^chart\/charts\/colors\d+\.xml$/i.test(entry.name))
    },
    componentSignals: ["native-office-chart-template", `native-${chartType}`],
    componentCatalog: [{
      id: "chart-template-1",
      name: chartType,
      childCount: Math.max(1, seriesCount),
      shapeCount: 0,
      pictureCount: 0,
      connectorCount: 0,
      textRuns: 0,
      structure,
      reuseReadiness: {
        level: "high",
        score: 92,
        reasons: ["native-office-chart-template", `native-${chartType}`, "chart-style-preserved"]
      },
      componentScore: 92
    }]
  };
}

function detectChartTemplateType(xml = "") {
  const match = String(xml).match(/<c:(pieChart|doughnutChart|barChart|lineChart|scatterChart|radarChart|areaChart|bubbleChart)\b/i);
  if (!match) return "";
  const type = match[1].toLowerCase();
  return {
    piechart: "pie-chart",
    doughnutchart: "donut-chart",
    barchart: "bar-chart",
    linechart: "line-chart",
    scatterchart: "scatter-chart",
    radarchart: "radar-chart",
    areachart: "area-chart",
    bubblechart: "bubble-chart"
  }[type] || "";
}

function chartTemplateMotifs(chartType = "") {
  if (chartType === "pie-chart") return ["pie-share-chart"];
  if (chartType === "donut-chart") return ["donut-segment-chart"];
  if (chartType === "scatter-chart" || chartType === "bubble-chart") return ["bubble-scatter-chart"];
  if (chartType === "radar-chart") return ["radar-chart"];
  return [];
}

function summarizePptxTemplate(file, options = {}) {
  const entries = listZipEntries(file);
  const themeColors = readThemeColors(file, entries);
  const themeFonts = readThemeFonts(file, entries);
  const slideEntries = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  const maxSlides = normalizePositiveInt(options.maxSlides, 12);
  const slides = slideEntries.slice(0, maxSlides).map((entry) => summarizeSlideXml(file, entry.name, { themeColors, themeFonts }));
  const totals = slides.reduce((acc, slide) => {
    acc.groups += slide.groups;
    acc.shapes += slide.shapes;
    acc.pictures += slide.pictures;
    acc.connectors += slide.connectors;
    acc.textRuns += slide.textRuns;
    acc.maxGroupChildren = Math.max(acc.maxGroupChildren, slide.maxGroupChildren);
    for (const color of slide.colors) acc.colors[color] = (acc.colors[color] || 0) + 1;
    return acc;
  }, { groups: 0, shapes: 0, pictures: 0, connectors: 0, textRuns: 0, maxGroupChildren: 0, colors: {} });
  return {
    status: "ok",
    assetType: "pptx-template",
    slides: countPptxSlides(file),
    inspectedSlides: slides.length,
    packageEntries: entries.length,
    totals: {
      groups: totals.groups,
      shapes: totals.shapes,
      pictures: totals.pictures,
      connectors: totals.connectors,
      textRuns: totals.textRuns,
      maxGroupChildren: totals.maxGroupChildren,
      topColors: topCounts(totals.colors, 8)
    },
    componentSignals: inferPptxComponentSignals(totals),
    componentCatalog: slides.flatMap((slide) => slide.groupCandidates || [])
      .sort((a, b) => b.componentScore - a.componentScore || b.childCount - a.childCount)
      .slice(0, normalizePositiveInt(options.maxComponentCatalogItems, 20)),
    slideSummaries: slides
  };
}

function summarizeSlideXml(file, entryName, options = {}) {
  const xml = readZipEntry(file, entryName, { maxBytes: 8 * 1024 * 1024 }).toString("utf8");
  const relationships = readSlideRelationships(file, entryName);
  // iSlide commonly nests each card inside an outer component group. A balanced
  // scan keeps that reusable outer group intact instead of truncating at card one.
  const groupBlocks = extractTopLevelGroupBlocks(xml);
  const groupChildren = groupBlocks.map((block) => countMatches(block, /<p:(?:sp|pic|cxnSp)\b/g));
  const colors = {};
  for (const color of collectFillColors(xml, options.themeColors)) {
    colors[color] = (colors[color] || 0) + 1;
  }
  const groupCandidates = groupBlocks
    .map((block, index) => summarizeGroupBlock(block, slideNumber(entryName), index, relationships, options))
    .filter((group) => group.childCount >= 2 || group.connectorCount > 0)
    .sort((a, b) => b.componentScore - a.componentScore || b.childCount - a.childCount)
    .slice(0, 8);
  const ungroupedCandidate = groupCandidates.length === 0
    ? summarizeUngroupedSlideComponent(xml, slideNumber(entryName), relationships, options)
    : null;
  return {
    slide: slideNumber(entryName),
    groups: countMatches(xml, /<p:grpSp\b/g),
    shapes: countMatches(xml, /<p:sp\b/g),
    pictures: countMatches(xml, /<p:pic\b/g),
    connectors: countMatches(xml, /<p:cxnSp\b/g),
    textRuns: countMatches(xml, /<a:t>/g),
    maxGroupChildren: groupChildren.length ? Math.max(...groupChildren) : 0,
    colors: topCounts(colors, 8).map((item) => item.value),
    groupCandidates: ungroupedCandidate ? [ungroupedCandidate] : groupCandidates
  };
}

function summarizeGroupBlock(block, slide, index, relationships = {}, options = {}) {
  const childCount = countMatches(block, /<p:(?:sp|pic|cxnSp)\b/g);
  const connectorCount = countMatches(block, /<p:cxnSp\b/g);
  const pictureCount = countMatches(block, /<p:pic\b/g);
  const shapeCount = countMatches(block, /<p:sp\b/g);
  const textRuns = countMatches(block, /<a:t>/g);
  const colors = {};
  for (const color of collectFillColors(block, options.themeColors)) {
    colors[color] = (colors[color] || 0) + 1;
  }
  const childLayout = summarizeGroupChildLayout(block, relationships, options);
  const replayChildLayout = summarizeGroupReplayChildLayout(block, relationships, options);
  const structureSelection = selectStructureLayout(childLayout, replayChildLayout);
  const structureLayout = structureSelection.layout;
  const structure = refineGroupStructure(
    structureSelection.structure,
    summarizeGroupVisualSignals(block),
    {
      childLayout: structureLayout,
      directChildLayout: childLayout,
      replayChildLayout,
      pictureCount,
      connectorCount,
      textRuns
    }
  );
  const componentScore = scoreGroupCandidate({ childCount, connectorCount, pictureCount, shapeCount, textRuns });
  return {
    id: `slide${slide}-group${index + 1}`,
    slide,
    groupIndex: index,
    name: safeString((block.match(/<p:cNvPr[^>]*\bname="([^"]*)"/) || [])[1]),
    boundsPt: parseGroupBounds(block),
    childLayout,
    replayChildLayout,
    childCount,
    shapeCount,
    pictureCount,
    connectorCount,
    textRuns,
    topColors: topCounts(colors, 5),
    structure,
    reuseReadiness: summarizeComponentReuseReadiness({
      childLayout: structureLayout,
      structure,
      childCount,
      shapeCount,
      pictureCount,
      connectorCount,
      textRuns,
      componentScore
    }),
    componentScore
  };
}

function selectStructureLayout(childLayout = {}, replayChildLayout = {}) {
  const directChildren = Array.isArray(childLayout?.children) ? childLayout.children : [];
  const replayChildren = Array.isArray(replayChildLayout?.children) ? replayChildLayout.children : [];
  const direct = { layout: childLayout, structure: summarizeComponentStructure(childLayout) };
  if (replayChildren.length < 2 || replayChildren.length < directChildren.length * 0.8) return direct;
  const validReplayBoxes = replayChildren
    .map((child) => child?.box)
    .filter((box) => hasNormalizedPositiveBounds(box)
      && Number(box.x) >= -0.18 && Number(box.y) >= -0.18
      && Number(box.x) + Number(box.w) <= 1.18
      && Number(box.y) + Number(box.h) <= 1.18);
  if (validReplayBoxes.length < replayChildren.length * 0.9) return direct;
  const union = unionBounds(validReplayBoxes);
  if (!union || Number(union.w) < 0.45 || Number(union.h) < 0.45) return direct;
  const replay = { layout: replayChildLayout, structure: summarizeComponentStructure(replayChildLayout) };
  return structureEvidenceScore(replay) > structureEvidenceScore(direct) ? replay : direct;
}

function structureEvidenceScore(candidate = {}) {
  const structure = candidate.structure || {};
  const children = Array.isArray(candidate.layout?.children) ? candidate.layout.children : [];
  const kind = safeString(structure.kind).toLowerCase();
  const specialized = !["", "unknown", "mixed", "card-group"].includes(kind);
  const motifs = Array.isArray(structure.motifs) ? structure.motifs.length : 0;
  const validBoxes = children.filter((child) => {
    const box = child?.box;
    return hasNormalizedPositiveBounds(box)
      && Number(box.x) >= -0.18 && Number(box.y) >= -0.18
      && Number(box.x) + Number(box.w) <= 1.18
      && Number(box.y) + Number(box.h) <= 1.18;
  }).length;
  const validRatio = children.length > 0 ? validBoxes / children.length : 0;
  return (specialized ? 30 : 0)
    + motifs * 10
    + validRatio * 20
    + Math.min(12, Number(structure.nodeCount || 0) + Number(structure.connectorCount || 0));
}

function summarizeUngroupedSlideComponent(xml, slide, relationships = {}, options = {}) {
  const shapeCount = countMatches(xml, /<p:sp\b/g);
  const pictureCount = countMatches(xml, /<p:pic\b/g);
  const connectorCount = countMatches(xml, /<p:cxnSp\b/g);
  const childCount = shapeCount + pictureCount + connectorCount;
  const textRuns = countMatches(xml, /<a:t>/g);
  if (childCount < 4 || shapeCount < 3) return null;
  const childLayout = summarizeGroupChildLayout(xml, relationships, options);
  if (!childLayout || childLayout.childBoxCount < 4) return null;
  const measured = parseDirectChildBoxes(xml)
    .map((child) => child.boxPt)
    .filter(hasPositiveBounds);
  const structure = summarizeComponentStructure(childLayout);
  const componentScore = scoreGroupCandidate({ childCount, connectorCount, pictureCount, shapeCount, textRuns });
  return {
    id: `slide${slide}-ungrouped-component`,
    slide,
    groupIndex: null,
    name: `slide ${slide} ungrouped component`,
    boundsPt: unionBounds(measured),
    childLayout: {
      ...childLayout,
      provider: "pptx-slide-ungrouped-child-layout-v1"
    },
    childCount,
    shapeCount,
    pictureCount,
    connectorCount,
    textRuns,
    topColors: topCounts(collectColors(xml, options.themeColors), 5),
    structure,
    reuseReadiness: summarizeComponentReuseReadiness({
      childLayout,
      structure,
      childCount,
      shapeCount,
      pictureCount,
      connectorCount,
      textRuns,
      componentScore
    }),
    componentScore,
    sourceKind: "slide-level-ungrouped"
  };
}

function parseGroupBounds(block) {
  const xfrm = (block.match(/<a:xfrm[\s\S]*?<\/a:xfrm>/) || [])[0] || "";
  const off = xfrm.match(/<a:off[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const ext = xfrm.match(/<a:ext[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/);
  if (!off || !ext) return null;
  return {
    x: emuToPt(off[1]),
    y: emuToPt(off[2]),
    w: emuToPt(ext[1]),
    h: emuToPt(ext[2])
  };
}

function summarizeGroupChildLayout(block, relationships = {}, options = {}) {
  const groupBounds = /^\s*<p:grpSp\b/i.test(String(block || "")) ? parseGroupBounds(block) : null;
  const nestedGroupBoxes = parseDirectChildGroupBoxes(block, relationships, options);
  const childBoxes = nestedGroupBoxes.length >= 3
    ? nestedGroupBoxes
    : parseDirectChildBoxes(block, relationships, options);
  const measured = childBoxes.filter((child) => child.boxPt && child.boxPt.w > 0 && child.boxPt.h > 0);
  if (measured.length === 0) return null;
  const reference = hasPositiveBounds(groupBounds) ? groupBounds : unionBounds(measured.map((child) => child.boxPt));
  if (!hasPositiveBounds(reference)) return null;
  const children = measured
    .map((child) => ({
      kind: child.kind,
      box: normalizeChildBox(child.boxPt, reference),
      style: child.style
    }))
    .filter((child) => child.box.w > 0 && child.box.h > 0)
    .map((child) => Object.keys(child.style || {}).length ? child : { kind: child.kind, box: child.box })
    .slice(0, 48);
  if (children.length === 0) return null;
  return {
    provider: "pptx-group-child-layout-v1",
    boundsSource: hasPositiveBounds(groupBounds) ? "group-xfrm" : "child-union",
    childBoxCount: children.length,
    children
  };
}

function summarizeGroupReplayChildLayout(block, relationships = {}, options = {}) {
  const groupBounds = /^\s*<p:grpSp\b/i.test(String(block || "")) ? parseGroupBounds(block) : null;
  const childBoxes = parseNestedReplayChildBoxes(block, relationships, options);
  const measured = childBoxes.filter((child) => child.boxPt && child.boxPt.w > 0 && child.boxPt.h > 0);
  if (measured.length === 0) return null;
  const reference = hasPositiveBounds(groupBounds) ? groupBounds : unionBounds(measured.map((child) => child.boxPt));
  if (!hasPositiveBounds(reference)) return null;
  const children = measured
    .map((child) => ({
      kind: child.kind,
      box: normalizeChildBox(child.boxPt, reference),
      style: child.style
    }))
    .filter((child) => child.box.w > 0 && child.box.h > 0)
    .map((child) => Object.keys(child.style || {}).length ? child : { kind: child.kind, box: child.box })
    .slice(0, 96);
  if (children.length === 0) return null;
  return {
    provider: "pptx-group-replay-child-layout-v1",
    boundsSource: hasPositiveBounds(groupBounds) ? "group-xfrm" : "child-union",
    childBoxCount: children.length,
    children
  };
}

function extractTopLevelGroupBlocks(xml) {
  const source = String(xml || "");
  const blocks = [];
  const tagPattern = /<\/?p:grpSp\b[^>]*>/gi;
  let depth = 0;
  let start = -1;
  for (const match of source.matchAll(tagPattern)) {
    const tag = match[0] || "";
    const closing = /^<\/p:grpSp\b/i.test(tag);
    if (!closing) {
      if (depth === 0) start = match.index;
      depth += 1;
      continue;
    }
    if (depth <= 0) continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      blocks.push(source.slice(start, Number(match.index) + tag.length));
      start = -1;
    }
  }
  return blocks;
}

function parseDirectChildGroupBoxes(block, relationships = {}, options = {}) {
  const inner = stripOuterGroupBlock(block);
  const nestedGroups = extractTopLevelGroupBlocks(inner);
  return nestedGroups
    .map((group) => {
      const boxPt = parseGroupBounds(group);
      if (!hasPositiveBounds(boxPt)) return null;
      return {
        kind: "shape",
        boxPt,
        style: summarizeNestedGroupNodeStyle(group, relationships, options)
      };
    })
    .filter(Boolean);
}

function stripOuterGroupBlock(block) {
  const source = String(block || "");
  const openEnd = source.indexOf(">");
  const closeStart = source.lastIndexOf("</p:grpSp>");
  return openEnd >= 0 && closeStart > openEnd ? source.slice(openEnd + 1, closeStart) : "";
}

function summarizeNestedGroupNodeStyle(group, relationships = {}, options = {}) {
  const style = {};
  const shapes = parseDirectChildBoxes(group, relationships, options)
    .filter((child) => child.kind === "shape" && Object.keys(child.style || {}).length > 0);
  // iSlide card groups often place a triangular shadow before the editable card.
  // Prefer the actual card geometry so the parent group is classified by content.
  const firstShape = shapes.find((child) => /rect|ellipse|oval|diamond|hexagon|parallelogram|cloud|document/.test(
    safeString(child.style?.shapeType).toLowerCase()
  )) || shapes[0];
  if (!firstShape) return { shapeType: "rect" };
  for (const key of ["fill", "stroke", "strokeWidthPt", "shapeType", "adjustments", "opacity", "gradient", "shadow"]) {
    if (firstShape.style?.[key] !== undefined) style[key] = firstShape.style[key];
  }
  if (!style.shapeType) style.shapeType = "rect";
  return style;
}

function summarizeComponentStructure(layout = {}) {
  const children = Array.isArray(layout?.children) ? layout.children : [];
  const roles = {
    background: 0,
    node: 0,
    connector: 0,
    textSlot: 0,
    pictureSlot: 0,
    decoration: 0
  };
  const nodeCenters = [];
  for (const child of children) {
    const role = classifyComponentChildRole(child);
    roles[role] = (roles[role] || 0) + 1;
    if (role === "node") {
      const box = child.box || {};
      nodeCenters.push({
        x: Number(box.x || 0) + Number(box.w || 0) / 2,
        y: Number(box.y || 0) + Number(box.h || 0) / 2
      });
    }
  }
  const kind = inferComponentStructureKind({ children, roles, nodeCenters });
  const motifCounts = summarizeComponentMotifs({ children, roles, nodeCenters, kind });
  const motifs = Object.keys(motifCounts).sort((a, b) => motifCounts[b] - motifCounts[a] || a.localeCompare(b));
  return {
    kind,
    roles,
    motifs,
    motifCounts,
    nodeCount: roles.node,
    connectorCount: roles.connector,
    textSlotCount: roles.textSlot,
    pictureSlotCount: roles.pictureSlot
  };
}

function summarizeGroupVisualSignals(block = "") {
  const source = String(block || "");
  return {
    customGeometryCount: countMatches(source, /<a:custGeom\b/g),
    ellipseCount: countMatches(source, /<a:prstGeom\b[^>]*\bprst="ellipse"/gi),
    arcGeometryCount: countMatches(source, /<a:prstGeom\b[^>]*\bprst="(?:arc|blockArc|circularArrow|leftCircularArrow|rightCircularArrow)"/gi)
  };
}

function refineGroupStructure(structure = {}, visualSignals = {}, context = {}) {
  if (isFishboneCauseEffectGroup(structure, context)) {
    const connectorCount = Math.max(0, Number(context.connectorCount || 0));
    const motifCounts = { ...(structure.motifCounts || {}) };
    motifCounts["fishbone-cause"] = Math.max(
      6,
      Number(motifCounts["fishbone-cause"] || 0),
      fishboneBranchConnectorCount(context) + 1
    );
    const motifs = Object.keys(motifCounts)
      .sort((a, b) => motifCounts[b] - motifCounts[a] || a.localeCompare(b));
    return {
      ...structure,
      kind: "fishbone-cause-effect",
      roles: { ...(structure.roles || {}), connector: connectorCount },
      connectorCount,
      motifs,
      motifCounts
    };
  }
  const stackedMotif = inferStackedStructureMotif(context);
  if (stackedMotif) {
    const motifCounts = { ...(structure.motifCounts || {}) };
    motifCounts[stackedMotif] = Math.max(5, Number(motifCounts[stackedMotif] || 0));
    const motifs = Object.keys(motifCounts)
      .sort((a, b) => motifCounts[b] - motifCounts[a] || a.localeCompare(b));
    return { ...structure, motifs, motifCounts };
  }
  if (isConnectorRichBranchRelationshipGroup(structure, context)) {
    const connectorCount = Math.max(0, Number(context.connectorCount || 0));
    const motifCounts = { ...(structure.motifCounts || {}) };
    motifCounts["tree-link"] = Math.max(5, Number(motifCounts["tree-link"] || 0), connectorCount + Number(structure.nodeCount || 0));
    const motifs = Object.keys(motifCounts)
      .sort((a, b) => motifCounts[b] - motifCounts[a] || a.localeCompare(b));
    return {
      ...structure,
      kind: "hub-spoke",
      roles: { ...(structure.roles || {}), connector: connectorCount },
      connectorCount,
      motifs,
      motifCounts
    };
  }
  if (!isSnakeRoadmapGroup(structure, visualSignals, context)) return structure;
  const motifCounts = { ...(structure.motifCounts || {}) };
  motifCounts["milestone-roadmap"] = Math.max(5, Number(motifCounts["milestone-roadmap"] || 0));
  const motifs = Object.keys(motifCounts)
    .sort((a, b) => motifCounts[b] - motifCounts[a] || a.localeCompare(b));
  return {
    ...structure,
    kind: "timeline",
    motifs,
    motifCounts
  };
}

function inferStackedStructureMotif(context = {}) {
  const directChildren = Array.isArray(context.directChildLayout?.children)
    ? context.directChildLayout.children
    : (Array.isArray(context.childLayout?.children) ? context.childLayout.children : []);
  const replayChildren = Array.isArray(context.replayChildLayout?.children) ? context.replayChildLayout.children : [];
  if (isQuadrantAxisLayout(directChildren)) return "quadrant-axis";
  if (isLayeredStackLayout(directChildren)) return "layered-stack";
  if (isPyramidStackLayout(directChildren)) return "pyramid-stack";
  if (isFunnelStackLayout(directChildren, replayChildren)) return "funnel-stack";
  return "";
}

function isQuadrantAxisLayout(children = []) {
  const shapes = children.filter((child) => child?.kind === "shape" && child?.box);
  if (shapes.length < 5) return false;

  const cards = shapes.filter((shape) => {
    const type = String(shape.style?.shapeType || "").toLowerCase();
    const { w = 0, h = 0 } = shape.box;
    return ["rect", "roundrect"].includes(type)
      && w >= 0.35 && w <= 0.55
      && h >= 0.35 && h <= 0.55;
  });
  if (cards.length !== 4 || !isGridNodeLayout(cards.map((card) => card.box))) return false;

  return shapes.some((shape) => {
    const type = String(shape.style?.shapeType || "").toLowerCase();
    const { x = 0, y = 0, w = 0, h = 0 } = shape.box;
    return ["ellipse", "oval"].includes(type)
      && x >= 0.3 && x <= 0.5
      && y <= 0.3
      && w >= 0.12 && w <= 0.3
      && h >= 0.45;
  });
}

function isLayeredStackLayout(children = []) {
  const bands = normalizedStackBands(
    children,
    (child) => /^(?:rect|roundrect|rightarrow)$/i.test(safeString(child?.style?.shapeType))
  );
  if (bands.length < 3 || !bandStackSpans(bands)) return false;

  const topToBottom = [...bands].sort((a, b) => a.y - b.y);
  const heights = topToBottom.map((band) => band.h);
  const averageHeight = heights.reduce((sum, height) => sum + height, 0) / heights.length;
  return Math.max(...heights) - Math.min(...heights) <= Math.max(0.08, averageHeight * 0.25)
    && monotonicSteps(topToBottom.map((band) => band.w), "descending") >= topToBottom.length - 1
    && monotonicSteps(topToBottom.map((band) => band.x), "ascending") >= topToBottom.length - 1
    && topToBottom[0].w - topToBottom.at(-1).w >= 0.1;
}

function isPyramidStackLayout(children = []) {
  const bands = normalizedStackBands(children, (child) => /^(?:rect|roundrect|trapezoid)$/i.test(safeString(child?.style?.shapeType)));
  if (bands.length < 3) return false;
  const topToBottom = [...bands].sort((a, b) => a.y - b.y);
  return bandStackSpans(topToBottom)
    && monotonicSteps(topToBottom.map((band) => band.w), "ascending") >= topToBottom.length - 1
    && monotonicSteps(topToBottom.map((band) => band.x), "descending") >= topToBottom.length - 1
    && topToBottom.at(-1).w - topToBottom[0].w >= 0.14;
}

function isFunnelStackLayout(directChildren = [], replayChildren = []) {
  const bands = normalizedStackBands(directChildren, (child) => /^(?:ellipse|oval)$/i.test(safeString(child?.style?.shapeType)));
  if (bands.length < 3 || !bandStackSpans(bands)) return false;
  const topToBottom = [...bands].sort((a, b) => a.y - b.y);
  const hasFunnelBody = replayChildren.some((child) => /trapezoid/i.test(safeString(child?.style?.shapeType)));
  return hasFunnelBody
    && monotonicSteps(topToBottom.map((band) => band.w), "descending") >= topToBottom.length - 1
    && topToBottom[0].w - topToBottom.at(-1).w >= 0.06;
}

function normalizedStackBands(children = [], predicate = () => true) {
  return (Array.isArray(children) ? children : [])
    .filter((child) => safeString(child?.kind).toLowerCase() === "shape" && predicate(child))
    .map((child) => child.box || {})
    .filter(hasNormalizedPositiveBounds)
    .map((box) => ({ x: Number(box.x), y: Number(box.y), w: Number(box.w), h: Number(box.h) }))
    .filter((box) => box.w >= 0.45 && box.h >= 0.08);
}

function bandStackSpans(bands = []) {
  if (!Array.isArray(bands) || bands.length < 3) return false;
  const ys = bands.map((band) => Number(band.y));
  return Math.max(...ys) - Math.min(...ys) >= 0.3;
}

function monotonicSteps(values = [], direction = "ascending") {
  const sign = direction === "descending" ? -1 : 1;
  let count = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (sign * (Number(values[index]) - Number(values[index - 1])) >= -0.015) count += 1;
  }
  return count;
}

function isFishboneCauseEffectGroup(structure = {}, context = {}) {
  const connectorCount = Number(context.connectorCount || 0);
  const nodes = Number(structure?.nodeCount || structure?.roles?.node || 0);
  const textRuns = Number(context.textRuns || 0);
  const children = Array.isArray(context.replayChildLayout?.children)
    ? context.replayChildLayout.children
    : [];
  if (connectorCount < 6 || nodes < 4 || textRuns < 12 || children.length < 16) return false;

  const hasLongSpine = children.some((child) => {
    if (safeString(child?.kind).toLowerCase() !== "connector") return false;
    const box = child.box || {};
    return Number(box.w || 0) >= 0.55 && Number(box.h || 0) <= 0.04;
  });
  const hasFreeformSpine = children.some((child) => {
    if (safeString(child?.kind).toLowerCase() !== "shape") return false;
    const box = child.box || {};
    const points = Array.isArray(child?.style?.freeform?.points) ? child.style.freeform.points : [];
    return Number(box.w || 0) >= 0.75 && Number(box.h || 0) >= 0.2 && points.length >= 18;
  });
  return (hasLongSpine || hasFreeformSpine) && fishboneBranchConnectorCount(context) >= 4;
}

function fishboneBranchConnectorCount(context = {}) {
  const children = Array.isArray(context.replayChildLayout?.children)
    ? context.replayChildLayout.children
    : [];
  return children.filter((child) => {
    if (safeString(child?.kind).toLowerCase() !== "connector") return false;
    const box = child.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    return width >= 0.04 && width <= 0.18 && height >= 0.18;
  }).length;
}

function isConnectorRichBranchRelationshipGroup(structure = {}, context = {}) {
  const connectorCount = Number(context.connectorCount || 0);
  const nodes = Number(structure?.nodeCount || structure?.roles?.node || 0);
  const textRuns = Number(context.textRuns || 0);
  const replayChildCount = Array.isArray(context.replayChildLayout?.children)
    ? context.replayChildLayout.children.length
    : 0;
  return connectorCount >= 4
    && nodes >= 3
    && textRuns >= 8
    && replayChildCount >= 12;
}

function isSnakeRoadmapGroup(structure = {}, visualSignals = {}, context = {}) {
  const childCount = Array.isArray(context.childLayout?.children) ? context.childLayout.children.length : 0;
  const nodes = Number(structure?.nodeCount || structure?.roles?.node || 0);
  const textRuns = Number(context.textRuns || 0);
  const pictures = Number(context.pictureCount || 0);
  const customGeometryCount = Number(visualSignals.customGeometryCount || 0);
  const ellipseCount = Number(visualSignals.ellipseCount || 0);
  const arcGeometryCount = Number(visualSignals.arcGeometryCount || 0);
  return childCount >= 5
    && nodes >= 5
    && textRuns >= 5
    && pictures >= 3
    && customGeometryCount >= 2
    && ellipseCount >= 8
    && arcGeometryCount >= 1;
}

function summarizeComponentReuseReadiness({
  childLayout = null,
  structure = null,
  childCount = 0,
  shapeCount = 0,
  pictureCount = 0,
  connectorCount = 0,
  textRuns = 0,
  componentScore = 0
} = {}) {
  const safeChildCount = Math.max(0, Number(childCount) || 0);
  const safeShapeCount = Math.max(0, Number(shapeCount) || 0);
  const safePictureCount = Math.max(0, Number(pictureCount) || 0);
  const safeConnectorCount = Math.max(0, Number(connectorCount) || 0);
  const safeTextRuns = Math.max(0, Number(textRuns) || 0);
  const kind = safeString(structure?.kind).toLowerCase();
  const reasons = [];
  let score = 0;

  add(Math.min(22, Math.max(0, Number(componentScore) || 0) * 0.22), "component-score");
  if (childLayout && Array.isArray(childLayout.children) && childLayout.children.length >= 2) {
    add(18, "has-child-layout");
  } else {
    add(-25, "missing-child-layout");
  }
  if (/^(process-chain|timeline|matrix|hub-spoke|cycle-loop|card-group|fishbone-cause-effect)$/.test(kind)) {
    add(18, `structured-${kind}`);
  }
  if (safeShapeCount >= 3) add(12, "native-shape-rich");
  if (safeConnectorCount >= 1) add(8, "connector-ready");
  if (safeTextRuns >= 1 || Number(structure?.textSlotCount || 0) >= 1) add(8, "editable-text-slots");
  if (/^(process-chain|timeline|matrix|hub-spoke|cycle-loop|card-group|fishbone-cause-effect)$/.test(kind)
    && safeShapeCount >= 3
    && (safeConnectorCount >= 1 || Number(structure?.textSlotCount || 0) >= 1)) {
    add(8, "structured-editable-component");
  }
  if (Number(structure?.pictureSlotCount || 0) >= 1) add(4, "picture-slot-aware");
  if (safeChildCount >= 6) add(8, "multi-part-component");
  if (kind === "image-heavy" || safePictureCount > Math.max(2, safeShapeCount + safeConnectorCount)) {
    add(-28, "bitmap-heavy");
  }
  if (safeChildCount > 48) add(-10, "too-many-children-for-safe-replay");
  if (safeChildCount < 2) add(-18, "too-few-children");

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    level: score >= 70 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "avoid",
    score,
    reasons: reasons.slice(0, 10)
  };

  function add(value, reason) {
    score += value;
    if (value > 0) reasons.push(reason);
  }
}

function classifyComponentChildRole(child = {}) {
  const kind = safeString(child.kind).toLowerCase();
  const box = child.box || {};
  const style = child.style || {};
  if (kind === "connector") return "connector";
  if (kind === "picture") return "pictureSlot";
  if (style.text?.placeholderText) return "textSlot";
  const shapeType = safeString(style.shapeType).toLowerCase();
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const area = width * height;
  if (isFreeformArrowShape(child)) return "decoration";
  if (area >= 0.45 && width >= 0.55 && height >= 0.35) return "background";
  if (/line|arc|brace|bracket|triangle|chevron|circular|arrow/.test(shapeType)) return "decoration";
  if (/rect|roundrect|ellipse|oval|diamond|hexagon|parallelogram|cloud|document/.test(shapeType)) return "node";
  if (area <= 0.015 || width <= 0.04 || height <= 0.04) return "decoration";
  if (kind === "shape") return "node";
  return "node";
}

function inferComponentStructureKind({ children = [], roles = {}, nodeCenters = [] } = {}) {
  const total = children.length;
  const nodes = Number(roles.node || 0);
  const connectors = Number(roles.connector || 0);
  const pictures = Number(roles.pictureSlot || 0);
  if (total === 0) return "unknown";
  if (pictures >= Math.max(2, total * 0.45)) return "image-heavy";
  if (connectors >= 3 && nodes >= 4 && isRadialNodeLayout(nodeCenters)) return "hub-spoke";
  if (nodes >= 4 && hasCircularOrArcEvidence(children)) return "cycle-loop";
  if (isSegmentedArcArrowLayout(children, roles)) return "cycle-loop";
  if (isCyclicFreeformArrowLayout(children, roles)) return "cycle-loop";
  if (isLinearFreeformArrowChain(children)) return "process-chain";
  if (nodes >= 3 && isHorizontalNodeLayout(nodeCenters)) return connectors >= 1 ? "process-chain" : "timeline";
  if (nodes >= 4 && isGridNodeLayout(nodeCenters)) return "matrix";
  if (nodes >= 2 && connectors >= 1) return "process-chain";
  if (nodes >= 3) return "card-group";
  return "mixed";
}

function summarizeComponentMotifs({ children = [], roles = {}, nodeCenters = [], kind = "" } = {}) {
  const counts = {};
  const safeKind = safeString(kind).toLowerCase();
  const shapeTypes = children.map((child) => safeString(child?.style?.shapeType).toLowerCase()).filter(Boolean);
  const connectorChildren = children.filter((child) => safeString(child?.kind).toLowerCase() === "connector");
  const arrowLikeConnectors = connectorChildren.filter((child) =>
    child?.style?.endArrow || child?.style?.startArrow || /arrow/.test(safeString(child?.style?.connectorType).toLowerCase())
  ).length;
  const arcShapes = shapeTypes.filter((type) => /arc|circular|cycle|uturn|blockarc|pie|donut/.test(type)).length;
  const triangleOrArrowShapes = shapeTypes.filter((type) => /triangle|arrow|chevron/.test(type)).length;
  const freeformArrowShapes = freeformArrowShapeCount(children);
  const nodeShapes = shapeTypes.filter((type) => /rect|roundrect|ellipse|oval|diamond|hexagon|parallelogram|document/.test(type)).length;
  const ringShapes = shapeTypes.filter((type) => /donut|ellipse|oval|arc|circular/.test(type)).length;
  const nodes = Number(roles.node || 0);
  const connectors = Number(roles.connector || 0);

  if (arcShapes >= 1 && (triangleOrArrowShapes >= 1 || arrowLikeConnectors >= 1 || safeKind === "cycle-loop")) {
    add("arc-arrow", arcShapes + triangleOrArrowShapes + arrowLikeConnectors);
  }
  if (isSegmentedArcArrowLayout(children, roles)) {
    add("arc-arrow", Math.max(6, Number(roles.decoration || 0)));
  }
  if (isCyclicFreeformArrowLayout(children, roles)) {
    add("arc-arrow", freeformShapeCount(children));
  }
  if ((safeKind === "cycle-loop" || isRadialNodeLayout(nodeCenters)) && ringShapes >= 1 && nodes >= 2) {
    add("ring-node", ringShapes + nodes);
  }
  if ((safeKind === "matrix" || isGridNodeLayout(nodeCenters)) && nodeShapes >= 4) {
    add("card-grid", nodeShapes);
  }
  if ((safeKind === "hub-spoke" || isRadialNodeLayout(nodeCenters)) && connectors >= 3) {
    add("radial-link", connectors + nodes);
  }
  if (connectors >= 2 && nodes >= 3 && hasBranchingNodeLayout(nodeCenters)) {
    add("tree-link", connectors + nodes);
  }
  if (arrowLikeConnectors >= 1 && safeKind === "process-chain") {
    add("linear-arrow-chain", arrowLikeConnectors + nodes);
  }
  if (freeformArrowShapes >= 2 && isLinearFreeformArrowChain(children)) {
    add("linear-arrow-chain", freeformArrowShapes);
  }
  if (safeKind === "process-chain" && nodes >= 3 && isHorizontalNodeLayout(nodeCenters)) {
    add("whole-process-template", nodes + arrowLikeConnectors + Math.min(3, Number(roles.textSlot || 0)));
  }
  if (nodes >= 4 && hasLensFunnelFlowEvidence(children, nodeCenters, roles)) {
    add("lens-funnel-flow", nodes + connectors + ringShapes + triangleOrArrowShapes + freeformShapeCount(children));
  }
  if (nodes >= 4 && hasBranchCardFlowEvidence(children, nodeCenters, roles)) {
    add("branch-card-flow", nodes + connectors + arrowLikeConnectors);
  }
  return counts;

  function add(name, value = 1) {
    counts[name] = (counts[name] || 0) + Math.max(1, Math.round(Number(value) || 1));
  }
}

function hasLensFunnelFlowEvidence(children = [], nodeCenters = [], roles = {}) {
  const shapeTypes = children.map((child) => safeString(child?.style?.shapeType).toLowerCase()).filter(Boolean);
  const ringShapes = shapeTypes.filter((type) => /donut|ellipse|oval|arc|circular/.test(type)).length;
  const funnelLikeShapes = shapeTypes.filter((type) => /triangle|parallelogram|funnel|chevron|arrow/.test(type)).length
    + freeformShapeCount(children);
  const textSlots = Number(roles.textSlot || 0);
  return ringShapes >= 1
    && funnelLikeShapes >= 1
    && (textSlots >= 2 || hasBranchingNodeLayout(nodeCenters) || isHorizontalNodeLayout(nodeCenters));
}

function hasBranchCardFlowEvidence(_children = [], nodeCenters = [], roles = {}) {
  const nodes = Number(roles.node || 0);
  const connectors = Number(roles.connector || 0);
  const textSlots = Number(roles.textSlot || 0);
  const hasRightBranch = Array.isArray(nodeCenters)
    && nodeCenters.length >= 4
    && clusteredAxisCount(nodeCenters.map((point) => point.y), 0.12) >= 3
    && clusteredAxisCount(nodeCenters.map((point) => point.x), 0.18) >= 2;
  return nodes >= 4
    && hasRightBranch
    && (connectors >= 2 || textSlots >= 3);
}

function freeformShapeCount(children = []) {
  return (Array.isArray(children) ? children : []).filter((child) => {
    if (safeString(child?.kind).toLowerCase() !== "shape") return false;
    return child?.style?.freeform && typeof child.style.freeform === "object";
  }).length;
}

function freeformArrowShapeCount(children = []) {
  return (Array.isArray(children) ? children : []).filter(isFreeformArrowShape).length;
}

function isFreeformArrowShape(child = {}) {
  if (safeString(child?.kind).toLowerCase() !== "shape") return false;
  const points = Array.isArray(child?.style?.freeform?.points) ? child.style.freeform.points : [];
  if (points.length < 3 || points.length > 16) return false;
  const normalized = points
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (normalized.length < 3) return false;
  const minX = Math.min(...normalized.map((point) => point.x));
  const maxX = Math.max(...normalized.map((point) => point.x));
  const minY = Math.min(...normalized.map((point) => point.y));
  const maxY = Math.max(...normalized.map((point) => point.y));
  const hasRightTip = normalized.some((point) => point.x >= 0.88 && point.y >= 0.25 && point.y <= 0.75);
  const hasLeftTip = normalized.some((point) => point.x <= 0.12 && point.y >= 0.25 && point.y <= 0.75);
  const spansUnitBox = minX <= 0.12 && maxX >= 0.88 && minY <= 0.08 && maxY >= 0.92;
  const hasArrowBody = normalized.some((point) => point.y <= 0.12) && normalized.some((point) => point.y >= 0.88);
  return spansUnitBox && hasArrowBody && (hasRightTip || hasLeftTip);
}

function isLinearFreeformArrowChain(children = []) {
  const arrows = (Array.isArray(children) ? children : [])
    .filter(isFreeformArrowShape)
    .map((child) => child.box || {})
    .filter(hasNormalizedPositiveBounds)
    .map((box) => ({
      x: Number(box.x) + Number(box.w) / 2,
      y: Number(box.y) + Number(box.h) / 2,
      w: Number(box.w),
      h: Number(box.h)
    }));
  if (arrows.length < 2) return false;
  const spreadX = Math.max(...arrows.map((point) => point.x)) - Math.min(...arrows.map((point) => point.x));
  const spreadY = Math.max(...arrows.map((point) => point.y)) - Math.min(...arrows.map((point) => point.y));
  const maxHeight = Math.max(...arrows.map((point) => point.h));
  return spreadX >= 0.22 && spreadY <= Math.max(0.18, maxHeight * 0.45);
}

function isHorizontalNodeLayout(points = []) {
  if (!Array.isArray(points) || points.length < 3) return false;
  const spreadX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const spreadY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  return spreadX >= 0.45 && spreadY <= 0.35;
}

function isGridNodeLayout(points = []) {
  // A 2x2 card component is the smallest useful matrix and is common in iSlide.
  if (!Array.isArray(points) || points.length < 4) return false;
  const xs = clusteredAxisCount(points.map((point) => point.x), 0.08);
  const ys = clusteredAxisCount(points.map((point) => point.y), 0.08);
  return xs >= 2 && ys >= 2 && xs * ys >= points.length * 0.55;
}

function isRadialNodeLayout(points = []) {
  if (!Array.isArray(points) || points.length < 4) return false;
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
  const distances = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  const max = Math.max(...distances);
  const min = Math.min(...distances);
  if (max <= 0) return false;
  const nearCenter = distances.filter((distance) => distance <= max * 0.35).length;
  return nearCenter >= 1 && min / max <= 0.45;
}

function hasBranchingNodeLayout(points = []) {
  if (!Array.isArray(points) || points.length < 3) return false;
  const xs = clusteredAxisCount(points.map((point) => point.x), 0.12);
  const ys = clusteredAxisCount(points.map((point) => point.y), 0.12);
  return ys >= 2 && xs >= 2;
}

function hasCircularOrArcEvidence(children = []) {
  return children.some((child) => /arc|circular|cycle|blockarc|uturn|pie|donut/.test(safeString(child?.style?.shapeType).toLowerCase()));
}

function isSegmentedArcArrowLayout(children = [], roles = {}) {
  if (!Array.isArray(children) || children.length < 8) return false;
  const shapes = children.filter((child) => safeString(child?.kind).toLowerCase() === "shape");
  if (shapes.length < 8) return false;
  const boxes = shapes.map((child) => child.box || {}).filter(hasNormalizedPositiveBounds);
  if (boxes.length < 8) return false;
  const small = boxes.filter((box) => Number(box.w || 0) * Number(box.h || 0) <= 0.03);
  const large = boxes.filter((box) => Number(box.w || 0) >= 0.28 && Number(box.h || 0) >= 0.28);
  const spreadX = Math.max(...boxes.map((box) => Number(box.x) + Number(box.w))) - Math.min(...boxes.map((box) => Number(box.x)));
  const spreadY = Math.max(...boxes.map((box) => Number(box.y) + Number(box.h))) - Math.min(...boxes.map((box) => Number(box.y)));
  const decorationCount = Number(roles.decoration || 0);
  return small.length >= 6
    && large.length >= 2
    && decorationCount >= 6
    && spreadX >= 0.72
    && spreadY >= 0.72;
}

function isCyclicFreeformArrowLayout(children = [], roles = {}) {
  const freeforms = (Array.isArray(children) ? children : []).filter((child) => {
    if (safeString(child?.kind).toLowerCase() !== "shape") return false;
    const points = Array.isArray(child?.style?.freeform?.points) ? child.style.freeform.points : [];
    return points.length >= 18 && child?.style?.freeform?.closePath === true;
  });
  if (freeforms.length < 3 || freeforms.length > 6 || Number(roles.textSlot || 0) > 0) return false;
  const centers = freeforms
    .map((child) => child.box || {})
    .filter(hasNormalizedPositiveBounds)
    .map((box) => ({
      x: Number(box.x) + Number(box.w) / 2,
      y: Number(box.y) + Number(box.h) / 2
    }));
  return centers.length === freeforms.length
    && !isLinearFreeformArrowChain(children)
    && isGridNodeLayout(centers);
}

function hasNormalizedPositiveBounds(box = {}) {
  return Number.isFinite(Number(box.x))
    && Number.isFinite(Number(box.y))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}

function clusteredAxisCount(values = [], tolerance = 0.08) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  let clusters = 0;
  let current = null;
  for (const value of sorted) {
    if (current === null || Math.abs(value - current) > tolerance) {
      clusters += 1;
      current = value;
    } else {
      current = (current + value) / 2;
    }
  }
  return clusters;
}

function scoreGroupCandidate({ childCount, connectorCount, pictureCount, shapeCount, textRuns }) {
  let score = 0;
  score += Math.min(childCount, 30) * 2;
  score += Math.min(connectorCount, 12) * 5;
  score += Math.min(shapeCount, 30);
  score += Math.min(textRuns, 10) * 2;
  if (pictureCount > childCount * 0.6) score -= 20;
  return Math.max(0, score);
}

function summarizeStyleJson(file, options = {}) {
  const maxBytes = normalizePositiveInt(options.maxStyleBytes, 512 * 1024);
  const stat = fs.statSync(file);
  if (stat.size > maxBytes) return { status: "skipped", reason: "style-json-too-large", sizeBytes: stat.size };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const libraries = Array.isArray(parsed) ? parsed : [];
  const fonts = {};
  const colors = {};
  const styleKinds = {};
  let styleCount = 0;
  for (const lib of libraries) {
    for (const style of Array.isArray(lib.styles) ? lib.styles : []) {
      styleCount += 1;
      const name = safeString(style.styleName || style.BaseStyle?.chineseNameLocal || style.BaseStyle?.englishNameLocal);
      addStyleKind(styleKinds, name);
      const font = style.wordStyles?.font || {};
      if (font.name) fonts[safeString(font.name)] = (fonts[safeString(font.name)] || 0) + 1;
      if (font.color) colors[safeColor(font.color)] = (colors[safeColor(font.color)] || 0) + 1;
    }
  }
  return {
    status: "ok",
    assetType: "officeplus-style-json",
    libraries: libraries.length,
    styles: styleCount,
    topFonts: topCounts(fonts, 8),
    topColors: topCounts(colors, 8),
    styleKinds
  };
}

function summarizeSvg(file, options = {}) {
  const maxBytes = normalizePositiveInt(options.maxSvgBytes, 256 * 1024);
  const stat = fs.statSync(file);
  if (stat.size > maxBytes) return { status: "skipped", reason: "svg-too-large", sizeBytes: stat.size };
  const text = fs.readFileSync(file, "utf8");
  const colors = {};
  for (const match of text.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"/g)) {
    const color = safeColor(match[1]);
    colors[color] = (colors[color] || 0) + 1;
  }
  return {
    status: "ok",
    assetType: "svg-vector",
    viewBox: safeString((text.match(/\bviewBox="([^"]+)"/i) || [])[1]),
    paths: countMatches(text, /<path\b/g),
    rects: countMatches(text, /<rect\b/g),
    circles: countMatches(text, /<circle\b/g),
    gradients: countMatches(text, /<linearGradient\b|<radialGradient\b/g),
    topColors: topCounts(colors, 8)
  };
}

function inferPptxComponentSignals(totals) {
  const signals = [];
  if (totals.groups >= 4) signals.push("grouped-shape-components");
  if (totals.connectors >= 4) signals.push("connector-rich-diagrams");
  if (totals.pictures > totals.shapes * 0.5) signals.push("bitmap-heavy-reference");
  if (totals.maxGroupChildren >= 6) signals.push("multi-part-component-groups");
  if (totals.textRuns >= 20) signals.push("text-bearing-templates");
  return signals;
}

function addStyleKind(target, name) {
  const text = String(name || "").toLowerCase();
  if (/标题|heading|title/.test(text)) target.heading = (target.heading || 0) + 1;
  else if (/正文|body|normal/.test(text)) target.body = (target.body || 0) + 1;
  else target.other = (target.other || 0) + 1;
}

function topCounts(counts = {}, limit = 8) {
  return Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function slideNumber(name) {
  return Number((String(name).match(/slide(\d+)\.xml/i) || [])[1] || 0);
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function safePath(value) {
  return safeString(value);
}

function safeString(value) {
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result.trim().slice(0, 200);
}

function safeColor(value) {
  const text = safeString(value).toUpperCase();
  return /^#[0-9A-F]{3,8}$/.test(text) ? text : "";
}

function safeExists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

module.exports = {
  summarizeLocalComponentAsset,
  summarizePptxTemplate,
  summarizeChartTemplate,
  summarizeStyleJson,
  summarizeSvg,
  _private: {
    inferPptxComponentSignals,
    parseThemeColorsXml,
    parseThemeFontsXml,
    resolveThemeTypeface,
    parseGradientFill,
    parseDirectChildBoxes,
    parsePresetGeometryAdjustments,
    parseNestedReplayChildBoxes,
    parseDirectChildGroupBoxes,
    extractTopLevelDrawingBlocks,
    extractTopLevelGroupBlocks,
    parseRelationshipsXml,
    resolveRelationshipTarget,
    summarizeComponentStructure,
    refineGroupStructure,
    summarizeGroupVisualSignals,
    summarizeGroupChildLayout,
    summarizeGroupReplayChildLayout,
    parseLineDash,
    detectChartTemplateType,
    chartTemplateMotifs,
    slideNumber,
    topCounts
  }
};
