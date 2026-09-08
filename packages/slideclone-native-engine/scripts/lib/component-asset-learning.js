"use strict";

const fs = require("node:fs");
const path = require("node:path");
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

function collectColors(xml, themeColors = {}) {
  const colors = {};
  for (const color of collectFillColors(xml, themeColors)) {
    colors[color] = (colors[color] || 0) + 1;
  }
  return colors;
}

function parseDirectChildBoxes(block, relationships = {}, options = {}) {
  const children = [];
  const childPattern = /<p:(sp|pic|cxnSp)\b[\s\S]*?<\/p:\1>|<p:(sp|pic|cxnSp)\b[^>]*\/>/g;
  for (const match of String(block || "").matchAll(childPattern)) {
    const childXml = match[0] || "";
    const kind = match[1] || match[2] || "";
    const isConnector = kind === "cxnSp";
    children.push({
      kind: isConnector ? "connector" : kind === "pic" ? "picture" : "shape",
      // DrawingML stores horizontal and vertical connectors with a zero-sized
      // minor axis. Keep them as thin editable line boxes instead of dropping
      // the connector during positive-area filtering.
      boxPt: isConnector ? normalizeConnectorBounds(parseFirstXfrmBounds(childXml)) : parseFirstXfrmBounds(childXml),
      style: summarizeChildStyle(childXml, kind, relationships, options)
    });
  }
  return children;
}

function parseNestedReplayChildBoxes(block, relationships = {}, options = {}) {
  const source = String(block || "");
  if (!/^\s*<p:grpSp\b/i.test(source)) return parseDirectChildBoxes(source, relationships, options);
  const result = [];
  walkNestedReplayGroup(source, identityMatrix(), { rotation: 0, flipH: false, flipV: false }, result, relationships, options, 0);
  return result.slice(0, 192);
}

function walkNestedReplayGroup(groupXml, parentMatrix, parentState, result, relationships, options, depth) {
  if (depth > 12 || result.length >= 192) return;
  const groupTransform = parseGroupChildTransform(groupXml);
  const currentMatrix = multiplyMatrices(parentMatrix, groupTransform.matrix);
  const currentState = {
    rotation: normalizeRotation(parentState.rotation + groupTransform.rotation),
    flipH: Boolean(parentState.flipH) !== Boolean(groupTransform.flipH),
    flipV: Boolean(parentState.flipV) !== Boolean(groupTransform.flipV)
  };
  for (const child of extractTopLevelDrawingBlocks(stripOuterGroupBlock(groupXml))) {
    if (result.length >= 192) break;
    if (child.kind === "grpSp") {
      walkNestedReplayGroup(child.xml, currentMatrix, currentState, result, relationships, options, depth + 1);
      continue;
    }
    const rawBox = parseFirstXfrmBounds(child.xml);
    const boxPt = transformBounds(rawBox, currentMatrix);
    const isConnector = child.kind === "cxnSp";
    const style = applyInheritedGroupStyle(
      summarizeChildStyle(child.xml, child.kind, relationships, options),
      currentState
    );
    result.push({
      kind: isConnector ? "connector" : child.kind === "pic" ? "picture" : "shape",
      boxPt: isConnector ? normalizeConnectorBounds(boxPt) : boxPt,
      style
    });
  }
}

function extractTopLevelDrawingBlocks(xml) {
  const source = String(xml || "");
  const blocks = [];
  const stack = [];
  let start = -1;
  let rootKind = "";
  const tagPattern = /<\/?p:(grpSp|sp|pic|cxnSp)\b[^>]*>/gi;
  for (const match of source.matchAll(tagPattern)) {
    const tag = match[0] || "";
    const kind = match[1] || "";
    const closing = /^<\//.test(tag);
    const selfClosing = /\/\s*>$/.test(tag);
    if (!closing) {
      if (stack.length === 0) {
        start = Number(match.index);
        rootKind = kind;
      }
      if (selfClosing) {
        if (stack.length === 0 && blocks.length < 256) {
          blocks.push({ kind, xml: tag });
          start = -1;
          rootKind = "";
        }
      } else {
        stack.push(kind);
      }
      continue;
    }
    if (stack.length === 0 || stack[stack.length - 1] !== kind) continue;
    stack.pop();
    if (stack.length === 0 && start >= 0 && blocks.length < 256) {
      blocks.push({ kind: rootKind, xml: source.slice(start, Number(match.index) + tag.length) });
      start = -1;
      rootKind = "";
    }
  }
  return blocks;
}

function parseGroupChildTransform(groupXml) {
  const properties = (String(groupXml || "").match(/<p:grpSpPr\b[^>]*>[\s\S]*?<\/p:grpSpPr>/i) || [])[0] || "";
  const xfrm = (properties.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/i) || [])[0] || "";
  const off = parseCoordinatePair(xfrm, "off", "x", "y");
  const ext = parseCoordinatePair(xfrm, "ext", "cx", "cy");
  const childOff = parseCoordinatePair(xfrm, "chOff", "x", "y");
  const childExt = parseCoordinatePair(xfrm, "chExt", "cx", "cy");
  if (!off || !ext || !childOff || !childExt || ext.x <= 0 || ext.y <= 0 || childExt.x <= 0 || childExt.y <= 0) {
    return { matrix: identityMatrix(), rotation: 0, flipH: false, flipV: false };
  }
  const opening = (xfrm.match(/<a:xfrm\b[^>]*>/i) || [])[0] || "";
  const rotation = parseOpenXmlRotation(opening);
  const flipH = parseXmlBooleanAttribute(opening, "flipH");
  const flipV = parseXmlBooleanAttribute(opening, "flipV");
  const scaleX = ext.x / childExt.x;
  const scaleY = ext.y / childExt.y;
  const base = {
    a: scaleX,
    b: 0,
    c: 0,
    d: scaleY,
    e: off.x - childOff.x * scaleX,
    f: off.y - childOff.y * scaleY
  };
  const center = { x: off.x + ext.x / 2, y: off.y + ext.y / 2 };
  const orientation = matrixAroundCenter(rotation, flipH, flipV, center);
  return {
    matrix: multiplyMatrices(orientation, base),
    rotation,
    flipH,
    flipV
  };
}

function parseCoordinatePair(xml, tagName, firstAttribute, secondAttribute) {
  const tag = (String(xml || "").match(new RegExp(`<a:${tagName}\\b[^>]*>`, "i")) || [])[0]
    || (String(xml || "").match(new RegExp(`<a:${tagName}\\b[^>]*/>`, "i")) || [])[0]
    || "";
  const first = Number((tag.match(new RegExp(`\\b${firstAttribute}="(-?\\d+)"`, "i")) || [])[1]);
  const second = Number((tag.match(new RegExp(`\\b${secondAttribute}="(-?\\d+)"`, "i")) || [])[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return { x: emuToPt(first), y: emuToPt(second) };
}

function parseOpenXmlRotation(tag) {
  const raw = Number((String(tag || "").match(/\brot="(-?\d+)"/i) || [])[1]);
  return Number.isFinite(raw) ? normalizeRotation(raw / 60000) : 0;
}

function parseXmlBooleanAttribute(tag, name) {
  const value = safeString((String(tag || "").match(new RegExp(`\\b${name}="([^"]+)"`, "i")) || [])[1]).toLowerCase();
  return value === "1" || value === "true";
}

function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrices(parent, child) {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f
  };
}

function matrixAroundCenter(rotationDeg, flipH, flipV, center) {
  const angle = rotationDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const flipX = flipH ? -1 : 1;
  const flipY = flipV ? -1 : 1;
  const oriented = { a: cos * flipX, b: sin * flipX, c: -sin * flipY, d: cos * flipY, e: 0, f: 0 };
  return multiplyMatrices(
    { a: 1, b: 0, c: 0, d: 1, e: center.x, f: center.y },
    multiplyMatrices(oriented, { a: 1, b: 0, c: 0, d: 1, e: -center.x, f: -center.y })
  );
}

function transformBounds(box, matrix) {
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  const corners = [
    transformPoint(box.x, box.y, matrix),
    transformPoint(box.x + box.w, box.y, matrix),
    transformPoint(box.x, box.y + box.h, matrix),
    transformPoint(box.x + box.w, box.y + box.h, matrix)
  ];
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function transformPoint(x, y, matrix) {
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

function applyInheritedGroupStyle(style = {}, state = {}) {
  const result = { ...(style || {}) };
  const ownRotation = Number(result.rotation || 0);
  const rotation = normalizeRotation((Number.isFinite(ownRotation) ? ownRotation : 0) + Number(state.rotation || 0));
  if (Math.abs(rotation) > 0.001) result.rotation = rotation;
  if (state.flipH === true) result.flipH = true;
  if (state.flipV === true) result.flipV = true;
  return result;
}

function normalizeRotation(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  let result = number % 360;
  if (result > 180) result -= 360;
  if (result <= -180) result += 360;
  return Math.round(result * 100) / 100;
}

function normalizeConnectorBounds(box = {}) {
  if (!box || !Number.isFinite(Number(box.x)) || !Number.isFinite(Number(box.y))) return null;
  const w = Number(box.w);
  const h = Number(box.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || (w <= 0 && h <= 0)) return null;
  const minorAxisPt = 0.75;
  return {
    ...box,
    w: w > 0 ? w : minorAxisPt,
    h: h > 0 ? h : minorAxisPt
  };
}

function summarizeChildStyle(xml, kind, relationships = {}, options = {}) {
  const style = {};
  const fill = kind === "cxnSp" ? "" : parseSolidFillColor(xml, options.themeColors);
  const stroke = parseLineColor(xml, options.themeColors);
  const strokeWidthPt = parseLineWidthPt(xml);
  const shapeType = parsePresetGeometry(xml);
  const freeform = shapeType ? null : parseCustomGeometryFreeform(xml);
  const adjustments = parsePresetGeometryAdjustments(xml, shapeType);
  const opacity = parseSolidFillOpacity(xml);
  const gradient = kind === "cxnSp" ? null : parseGradientFill(xml, options.themeColors);
  const shadow = parseOuterShadow(xml);
  const arrow = parseLineArrows(xml);
  const dash = parseLineDash(xml);
  const text = kind === "sp" ? parseShapeTextStyle(xml, options.themeColors, options.themeFonts) : null;
  const picture = kind === "pic" ? parsePictureStyle(xml, relationships) : null;
  const rotation = parseXfrmRotationDeg(xml);
  if (fill) style.fill = fill;
  if (kind !== "cxnSp" && hasShapeNoFill(xml)) style.fill = "none";
  if (stroke) style.stroke = stroke;
  if (hasLineNoFill(xml)) style.stroke = "none";
  if (strokeWidthPt !== null) style.strokeWidthPt = strokeWidthPt;
  if (shapeType) style.shapeType = shapeType;
  if (freeform) style.freeform = freeform;
  if (adjustments.length > 0) style.adjustments = adjustments;
  if (opacity !== null) style.opacity = opacity;
  if (gradient) style.gradient = gradient;
  if (shadow) style.shadow = shadow;
  if (arrow.startArrow) style.startArrow = arrow.startArrow;
  if (arrow.endArrow) style.endArrow = arrow.endArrow;
  if (dash) style.dash = dash;
  if (text) style.text = text;
  if (picture) style.picture = picture;
  if (rotation !== null) style.rotation = rotation;
  if (kind === "cxnSp") style.connectorType = "straight";
  return style;
}

function parsePictureStyle(xml, relationships = {}) {
  const relId = (String(xml || "").match(/<a:blip\b[^>]*(?:r:embed|embed)="([^"]+)"/i) || [])[1];
  const crop = parsePictureCrop(xml);
  const opacity = parsePictureOpacity(xml);
  if (!relId && !crop && opacity === null) return null;
  const picture = {};
  const safeRelId = relId ? safeRelationshipId(relId) : "";
  if (safeRelId) {
    picture.embedRelId = safeRelId;
    const mediaTarget = safeMediaTarget(relationships[safeRelId]);
    if (mediaTarget) picture.mediaTarget = mediaTarget;
  }
  if (crop) picture.crop = crop;
  if (opacity !== null) picture.opacity = opacity;
  return Object.keys(picture).length ? picture : null;
}

function parsePictureCrop(xml) {
  const srcRect = (String(xml || "").match(/<a:srcRect\b[^>]*\/?>/i) || [])[0] || "";
  if (!srcRect) return null;
  const crop = {};
  for (const [attr, key] of [["l", "left"], ["t", "top"], ["r", "right"], ["b", "bottom"]]) {
    const raw = (srcRect.match(new RegExp(`\\b${attr}="(-?\\d+)"`, "i")) || [])[1];
    if (!raw) continue;
    const value = Math.round(Math.max(0, Math.min(1, Number(raw) / 100000)) * 10000) / 10000;
    if (Number.isFinite(value) && value > 0) crop[key] = value;
  }
  return Object.keys(crop).length ? crop : null;
}

function parsePictureOpacity(xml) {
  const blip = (String(xml || "").match(/<a:blip\b[\s\S]*?<\/a:blip>|<a:blip\b[^>]*\/>/i) || [])[0] || "";
  const raw = (blip.match(/<a:alphaModFix\b[^>]*\bamt="(\d+)"/i) || [])[1]
    || (blip.match(/<a:alpha\b[^>]*\bval="(\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100000;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function parseShapeTextStyle(xml, themeColors = {}, themeFonts = {}) {
  const source = String(xml || "");
  const textValues = [];
  for (const match of source.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi)) {
    const value = decodeXmlText(match[1]);
    if (value) textValues.push(value);
  }
  if (textValues.length === 0) return null;
  const runBlock = firstXmlElement(source, "a:rPr");
  const run = openingTag(runBlock);
  const levelParagraphBlock = firstXmlElement(source, "a:lvl1pPr") || firstXmlElement(source, "a:defPPr");
  const levelParagraph = openingTag(levelParagraphBlock);
  const defaultRunBlock = firstXmlElement(levelParagraphBlock, "a:defRPr");
  const defaultRun = openingTag(defaultRunBlock);
  const paragraphBlock = firstXmlElement(source, "a:pPr");
  const paragraph = openingTag(paragraphBlock);
  const body = (source.match(/<a:bodyPr\b[^>]*>/i) || [])[0] || "";
  const fontSizePt = parseTextFontSizePt(run) ?? parseTextFontSizePt(defaultRun);
  const color = parseTextColor(runBlock, themeColors) || parseTextColor(defaultRunBlock, themeColors);
  const gradient = parseGradientFill(runBlock, themeColors) || parseGradientFill(defaultRunBlock, themeColors);
  const reflection = parseTextReflection(runBlock) || parseTextReflection(defaultRunBlock);
  const lineHeightMultiple = parseTextLineHeightMultiple(paragraphBlock);
  const align = normalizeTextAlign((paragraph.match(/\balgn="([^"]+)"/i) || [])[1]
    || (levelParagraph.match(/\balgn="([^"]+)"/i) || [])[1]);
  const valign = normalizeTextValign((body.match(/\banchor="([^"]+)"/i) || [])[1]);
  const vertical = normalizeTextVertical((body.match(/\bvert="([^"]+)"/i) || [])[1]);
  const typeface = parseTextTypeface(runBlock)
    || parseTextTypeface(defaultRunBlock)
    || parseTextTypeface(source);
  const text = {
    placeholderText: safeString(textValues.join("\n")).slice(0, 120)
  };
  const margins = parseTextBodyMargins(body);
  if (fontSizePt !== null) text.fontSizePt = fontSizePt;
  if (color) text.color = color;
  if (gradient) text.gradient = gradient;
  if (reflection) text.reflection = reflection;
  if (lineHeightMultiple !== null) text.lineHeightMultiple = lineHeightMultiple;
  if (/\bb="1"/i.test(run) || /\bb="1"/i.test(defaultRun)) text.weight = "bold";
  if (align) text.align = align;
  if (valign) text.valign = valign;
  if (vertical) text.vertical = vertical;
  if (margins) Object.assign(text, margins);
  if (typeface) text.family = resolveThemeTypeface(typeface, themeFonts).slice(0, 80);
  return text;
}

function parseTextBodyMargins(bodyPropertiesXml) {
  const body = String(bodyPropertiesXml || "");
  if (!body) return null;
  const toPoints = (attribute, fallback) => {
    const raw = (body.match(new RegExp(`\\b${attribute}="(-?\\d+)"`, "i")) || [])[1];
    const value = raw === undefined ? fallback : Number(raw) / 12700;
    return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(72, value)) * 100) / 100 : fallback;
  };
  // These are DrawingML's text-body defaults when the inset attributes are absent.
  return {
    marginLeftPt: toPoints("lIns", 7.2),
    marginRightPt: toPoints("rIns", 7.2),
    marginTopPt: toPoints("tIns", 3.6),
    marginBottomPt: toPoints("bIns", 3.6)
  };
}

function firstXmlElement(xml, qualifiedName) {
  const source = String(xml || "");
  const escaped = String(qualifiedName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return "";
  const paired = source.match(new RegExp(`<${escaped}\\b[\\s\\S]*?<\\/${escaped}>`, "i"));
  if (paired) return paired[0];
  return (source.match(new RegExp(`<${escaped}\\b[^>]*/>`, "i")) || [])[0] || "";
}

function openingTag(xml) {
  return (String(xml || "").match(/^<[^>]+>/i) || [])[0] || "";
}

function parseTextTypeface(xml) {
  return (String(xml || "").match(/<a:latin\b[^>]*\btypeface="([^"]+)"/i) || [])[1]
    || (String(xml || "").match(/<a:ea\b[^>]*\btypeface="([^"]+)"/i) || [])[1]
    || "";
}

function parseTextLineHeightMultiple(paragraphXml) {
  const raw = (String(paragraphXml || "").match(/<a:lnSpc>\s*<a:spcPct\b[^>]*\bval="(\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100000;
  if (!Number.isFinite(value) || value < 0.5 || value > 4) return null;
  return Math.round(value * 1000) / 1000;
}

function parseTextReflection(xml) {
  const reflection = (String(xml || "").match(/<a:reflection\b[^>]*\/?>/i) || [])[0] || "";
  if (!reflection) return null;
  const out = {};
  addBoundedXmlNumber(out, "blurPt", reflection, "blurRad", 1 / 12700, 0, 40);
  addBoundedXmlNumber(out, "startAlpha", reflection, "stA", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "startPosition", reflection, "stPos", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "endAlpha", reflection, "endA", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "endPosition", reflection, "endPos", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "distancePt", reflection, "dist", 1 / 12700, 0, 40);
  addBoundedXmlNumber(out, "directionDeg", reflection, "dir", 1 / 60000, -360, 360);
  addBoundedXmlNumber(out, "fadeDirectionDeg", reflection, "fadeDir", 1 / 60000, -360, 360);
  addBoundedXmlNumber(out, "scaleX", reflection, "sx", 1 / 100000, -2, 2);
  addBoundedXmlNumber(out, "scaleY", reflection, "sy", 1 / 100000, -2, 2);
  addBoundedXmlNumber(out, "skewXDeg", reflection, "kx", 1 / 60000, -90, 90);
  addBoundedXmlNumber(out, "skewYDeg", reflection, "ky", 1 / 60000, -90, 90);
  const alignment = safeString((reflection.match(/\balgn="([^"]+)"/i) || [])[1]).toLowerCase();
  if (/^(tl|t|tr|l|ctr|r|bl|b|br)$/.test(alignment)) out.alignment = alignment;
  const rotateWithShape = (reflection.match(/\brotWithShape="([^"]+)"/i) || [])[1];
  if (rotateWithShape !== undefined) out.rotateWithShape = /^(1|true)$/i.test(rotateWithShape);
  return Object.keys(out).length ? out : null;
}

function addBoundedXmlNumber(target, key, xml, attribute, scale, min, max) {
  const raw = (String(xml || "").match(new RegExp(`\\b${attribute}="(-?\\d+)"`, "i")) || [])[1];
  if (raw === undefined) return;
  const value = Number(raw) * scale;
  if (!Number.isFinite(value)) return;
  target[key] = Math.round(Math.max(min, Math.min(max, value)) * 10000) / 10000;
}

function normalizeTextVertical(value) {
  const normalized = safeString(value).toLowerCase();
  if (["vert", "vert270", "wordartvert", "eavert", "mongolianvert", "wordartvertrtl"].includes(normalized)) {
    return normalized;
  }
  return "";
}

function parseTextFontSizePt(runXml) {
  const raw = (String(runXml || "").match(/\bsz="(\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(Math.max(4, Math.min(96, value)) * 100) / 100;
}

function parseTextColor(xml, themeColors = {}) {
  return resolveColorInBlock(xml, themeColors);
}

function normalizeTextAlign(value) {
  const text = safeString(value).toLowerCase();
  if (text === "ctr" || text === "center") return "center";
  if (text === "r" || text === "right") return "right";
  if (text === "just" || text === "justify") return "justify";
  return text === "l" || text === "left" ? "left" : "";
}

function normalizeTextValign(value) {
  const text = safeString(value).toLowerCase();
  if (text === "ctr" || text === "mid" || text === "middle") return "middle";
  if (text === "b" || text === "bottom") return "bottom";
  return text === "t" || text === "top" ? "top" : "";
}

function decodeXmlText(value) {
  return safeString(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readThemeColors(file, entries = []) {
  const colors = {};
  const themeEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/theme\/(?:theme\d+|themeOverride\d+)\.xml$/i.test(name))
    .sort((a, b) => themePriority(a) - themePriority(b));
  for (const entry of themeEntries) {
    const xml = readZipEntry(file, entry, { maxBytes: 1024 * 1024 });
    if (!xml) continue;
    Object.assign(colors, parseThemeColorsXml(xml.toString("utf8")));
  }
  return colors;
}

function readThemeFonts(file, entries = []) {
  const fonts = {};
  const themeEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/theme\/(?:theme\d+|themeOverride\d+)\.xml$/i.test(name))
    .sort((a, b) => themePriority(a) - themePriority(b));
  for (const entry of themeEntries) {
    const xml = readZipEntry(file, entry, { maxBytes: 1024 * 1024 });
    if (!xml) continue;
    Object.assign(fonts, parseThemeFontsXml(xml.toString("utf8")));
  }
  return fonts;
}

function parseThemeFontsXml(xml) {
  const source = String(xml || "");
  return {
    majorLatin: parseThemeFontFamily(source, "majorFont", "latin"),
    majorEastAsian: parseThemeFontFamily(source, "majorFont", "eastAsian"),
    minorLatin: parseThemeFontFamily(source, "minorFont", "latin"),
    minorEastAsian: parseThemeFontFamily(source, "minorFont", "eastAsian")
  };
}

function parseThemeFontFamily(xml, scheme, kind) {
  const block = firstXmlElement(String(xml || ""), `a:${scheme}`);
  if (!block) return "";
  const latin = safeString((block.match(/<a:latin\b[^>]*\btypeface="([^"]*)"/i) || [])[1]);
  if (kind === "latin") return latin;
  const eastAsian = safeString((block.match(/<a:ea\b[^>]*\btypeface="([^"]*)"/i) || [])[1]);
  const hans = safeString((block.match(/<a:font\b[^>]*\bscript="Hans"[^>]*\btypeface="([^"]*)"/i) || [])[1]);
  return eastAsian || hans || latin;
}

function resolveThemeTypeface(typeface, themeFonts = {}) {
  const raw = safeString(decodeXmlText(typeface));
  const key = raw.toLowerCase();
  const aliases = {
    "+mj-ea": themeFonts.majorEastAsian || themeFonts.majorLatin,
    "+mj-lt": themeFonts.majorLatin || themeFonts.majorEastAsian,
    "+mn-ea": themeFonts.minorEastAsian || themeFonts.minorLatin,
    "+mn-lt": themeFonts.minorLatin || themeFonts.minorEastAsian
  };
  return safeString(aliases[key] || raw);
}

function themePriority(name) {
  return /themeoverride/i.test(name) ? 1 : 0;
}

function parseThemeColorsXml(xml) {
  const colors = {};
  for (const match of String(xml || "").matchAll(/<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)\b[\s\S]*?<\/a:\1>/gi)) {
    const key = safeString(match[1]).toLowerCase();
    const color = resolveColorInBlock(match[0], colors);
    if (key && color) colors[key] = color;
  }
  if (colors.dk1) colors.tx1 = colors.dk1;
  if (colors.lt1) colors.bg1 = colors.lt1;
  if (colors.dk2) colors.tx2 = colors.dk2;
  if (colors.lt2) colors.bg2 = colors.lt2;
  return colors;
}

function parseSolidFillColor(xml, themeColors = {}) {
  const solidFill = String(xml || "").match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/i);
  if (!solidFill) return "";
  return resolveColorInBlock(solidFill[0], themeColors);
}

function hasShapeNoFill(xml) {
  const beforeLine = String(xml || "").split(/<a:ln\b/i)[0] || "";
  return /<a:noFill\s*\/?>/i.test(beforeLine);
}

function hasLineNoFill(xml) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  return Boolean(line && /<a:noFill\s*\/?>/i.test(line[0]));
}

function parseLineColor(xml, themeColors = {}) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  if (!line) return "";
  return resolveColorInBlock(line[0], themeColors);
}

function parseLineWidthPt(xml) {
  const line = String(xml || "").match(/<a:ln\b[^>]*\bw="(\d+)"/i);
  if (!line) return null;
  return Math.round((Number(line[1] || 0) / 12700) * 100) / 100;
}

function parseSolidFillOpacity(xml) {
  const solidFill = String(xml || "").match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/i);
  if (!solidFill) return null;
  const alpha = solidFill[0].match(/<a:alpha\b[^>]*\bval="(\d+)"/i);
  if (!alpha) return null;
  const value = Number(alpha[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value / 100000)) * 100) / 100;
}

function parseGradientFill(xml, themeColors = {}) {
  const gradFill = String(xml || "").match(/<a:gradFill\b[\s\S]*?<\/a:gradFill>/i);
  if (!gradFill) return null;
  const block = gradFill[0];
  const stops = [];
  for (const match of block.matchAll(/<a:gs\b[^>]*\bpos="(\d+)"[^>]*>([\s\S]*?)<\/a:gs>/gi)) {
    const pos = Number(match[1]);
    const stopXml = match[2];
    const color = resolveColorInBlock(stopXml, themeColors);
    if (!Number.isFinite(pos) || !color) continue;
    const alphaMatch = stopXml.match(/<a:alpha\b[^>]*\bval="(\d+)"/i);
    const alphaValue = Number(alphaMatch?.[1]);
    stops.push({
      position: Math.round(Math.max(0, Math.min(1, pos / 100000)) * 100) / 100,
      color,
      ...(Number.isFinite(alphaValue)
        ? { alpha: Math.round(Math.max(0, Math.min(1, alphaValue / 100000)) * 100) / 100 }
        : {})
    });
  }
  if (stops.length < 2) return null;
  const angle = (block.match(/<a:lin\b[^>]*\bang="(-?\d+)"/i) || [])[1];
  return {
    type: "linear",
    angleDeg: angle ? Math.round((Number(angle) / 60000) * 100) / 100 : 0,
    stops: stops
      .sort((a, b) => a.position - b.position)
      .slice(0, 6)
  };
}

function collectFillColors(xml, themeColors = {}) {
  const colors = [];
  for (const match of String(xml || "").matchAll(/<a:(?:solidFill|gradFill)\b[\s\S]*?<\/a:(?:solidFill|gradFill)>/gi)) {
    const color = resolveColorInBlock(match[0], themeColors);
    if (color) colors.push(color);
    for (const stop of match[0].matchAll(/<a:gs\b[^>]*>([\s\S]*?)<\/a:gs>/gi)) {
      const stopColor = resolveColorInBlock(stop[1], themeColors);
      if (stopColor) colors.push(stopColor);
    }
  }
  return colors;
}

function resolveColorInBlock(block, themeColors = {}) {
  const text = String(block || "");
  const srgb = text.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"[^>]*(?:\/>|>[\s\S]*?<\/a:srgbClr>)/i);
  if (srgb) return applyColorTransforms(`#${srgb[1].toUpperCase()}`, srgb[0]);
  const scheme = text.match(/<a:schemeClr\b[^>]*\bval="([A-Za-z0-9]+)"[^>]*(?:\/>|>[\s\S]*?<\/a:schemeClr>)/i);
  if (scheme) {
    const key = safeString(scheme[1]).toLowerCase();
    const base = themeColors[key] || defaultSchemeColor(key);
    return base ? applyColorTransforms(base, scheme[0]) : "";
  }
  return "";
}

function defaultSchemeColor(key) {
  const defaults = {
    tx1: "#000000",
    dk1: "#000000",
    bg1: "#FFFFFF",
    lt1: "#FFFFFF",
    accent1: "#4472C4",
    accent2: "#ED7D31",
    accent3: "#A5A5A5",
    accent4: "#FFC000",
    accent5: "#5B9BD5",
    accent6: "#70AD47"
  };
  return defaults[key] || "";
}

function applyColorTransforms(color, block = "") {
  const rgb = parseHexColor(color);
  if (!rgb) return "";
  let out = { ...rgb };
  const lumMod = firstTransformValue(block, "lumMod");
  const lumOff = firstTransformValue(block, "lumOff");
  const tint = firstTransformValue(block, "tint");
  const shade = firstTransformValue(block, "shade");
  if (lumMod !== null) out = mapRgb(out, (value) => value * lumMod);
  if (lumOff !== null) out = mapRgb(out, (value) => value + 255 * lumOff);
  if (tint !== null) out = mapRgb(out, (value) => value + (255 - value) * tint);
  if (shade !== null) out = mapRgb(out, (value) => value * shade);
  return rgbToHex(out);
}

function firstTransformValue(block, tag) {
  const raw = (String(block || "").match(new RegExp(`<a:${tag}\\b[^>]*\\bval="(\\d+)"`, "i")) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100000;
  return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : null;
}

function parseHexColor(color) {
  const match = safeString(color).match(/^#?([0-9A-Fa-f]{6})$/);
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function mapRgb(rgb, fn) {
  return {
    r: fn(rgb.r),
    g: fn(rgb.g),
    b: fn(rgb.b)
  };
}

function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function parseOuterShadow(xml) {
  const shadow = String(xml || "").match(/<a:outerShdw\b[^>]*>[\s\S]*?<\/a:outerShdw>|<a:outerShdw\b[^>]*\/>/i);
  if (!shadow) return null;
  const block = shadow[0];
  const color = (block.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/i) || [])[1];
  const alpha = (block.match(/<a:alpha\b[^>]*\bval="(\d+)"/i) || [])[1];
  const blur = (block.match(/\bblurRad="(\d+)"/i) || [])[1];
  const distance = (block.match(/\bdist="(\d+)"/i) || [])[1];
  const direction = (block.match(/\bdir="(\d+)"/i) || [])[1];
  return {
    color: color ? `#${color.toUpperCase()}` : "#000000",
    alpha: alpha ? Math.round(Math.max(0, Math.min(1, Number(alpha) / 100000)) * 100) / 100 : 0.18,
    blurPt: blur ? Math.round((Number(blur) / 12700) * 100) / 100 : 4,
    distancePt: distance ? Math.round((Number(distance) / 12700) * 100) / 100 : 1,
    angleDeg: direction ? Math.round((Number(direction) / 60000) * 100) / 100 : 90
  };
}

function parseLineArrows(xml) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  if (!line) return {};
  return {
    startArrow: normalizeArrowType((line[0].match(/<a:tailEnd\b[^>]*\btype="([a-zA-Z0-9_ -]+)"/i) || [])[1]),
    endArrow: normalizeArrowType((line[0].match(/<a:headEnd\b[^>]*\btype="([a-zA-Z0-9_ -]+)"/i) || [])[1])
  };
}

function parseLineDash(xml) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  if (!line) return "";
  const dash = (line[0].match(/<a:prstDash\b[^>]*\bval="([a-zA-Z0-9_ -]+)"/i) || [])[1];
  return normalizeDashType(dash);
}

function normalizeDashType(value) {
  const text = safeString(value).toLowerCase();
  // Preserve PowerPoint's compound presets instead of approximating all of
  // them as a generic dash. OfficePLUS uses these on visible card outlines.
  const presets = {
    dash: "dash",
    dashdot: "dashDot",
    dashdotdot: "dashDotDot",
    lgdash: "largeDash",
    lgdashdot: "largeDashDot",
    lgdashdotdot: "largeDashDotDot",
    sysdash: "systemDash",
    sysdashdot: "systemDashDot",
    sysdashdotdot: "systemDashDotDot"
  };
  if (presets[text]) return presets[text];
  if (text === "dot" || text === "sysdot") return "dot";
  return "";
}

function normalizeArrowType(value) {
  const text = safeString(value).toLowerCase();
  if (!text || text === "none") return "";
  if (text === "triangle" || text === "arrow" || text === "stealth") return "triangle";
  if (text === "oval") return "oval";
  if (text === "diamond") return "diamond";
  return "";
}

function parsePresetGeometry(xml) {
  const match = String(xml || "").match(/<a:prstGeom\b[^>]*\bprst="([a-zA-Z0-9_ -]+)"/i);
  return match ? safeString(match[1]).slice(0, 40) : "";
}

function parseCustomGeometryFreeform(xml) {
  const geometry = (String(xml || "").match(/<a:custGeom\b[\s\S]*?<\/a:custGeom>/i) || [])[0] || "";
  if (!geometry) return null;
  const pathBlock = (geometry.match(/<a:path\b[^>]*>[\s\S]*?<\/a:path>/i) || [])[0] || "";
  if (!pathBlock) return null;
  const segments = parseCustomGeometrySegments(pathBlock);
  const points = segments.flatMap((segment) => segment.points || []).slice(0, 80);
  if (points.length < 3) return null;
  const bounds = customGeometryPointBounds(points);
  const normalized = normalizeCustomGeometryPoints(points, bounds);
  if (normalized.length < 3) return null;
  return {
    points: normalized,
    segments: normalizeCustomGeometrySegments(segments, bounds),
    closePath: /<a:close\s*\/?>/i.test(pathBlock)
  };
}

function parseCustomGeometrySegments(pathBlock = "") {
  const segments = [];
  const commandPattern = /<a:(moveTo|lnTo|cubicBezTo|quadBezTo)\b[\s\S]*?<\/a:\1>|<a:close\s*\/?>/gi;
  for (const match of String(pathBlock || "").matchAll(commandPattern)) {
    const block = match[0] || "";
    const type = match[1] || "close";
    const points = [];
    for (const point of block.matchAll(/<a:pt\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/>/gi)) {
      points.push({ x: Number(point[1]), y: Number(point[2]) });
    }
    if (type === "close" || points.length > 0) segments.push({ type, points });
    if (segments.length >= 120) break;
  }
  return segments;
}

function customGeometryPointBounds(points = []) {
  const numeric = points
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (numeric.length === 0) return null;
  const minX = Math.min(...numeric.map((point) => point.x));
  const maxX = Math.max(...numeric.map((point) => point.x));
  const minY = Math.min(...numeric.map((point) => point.y));
  const maxY = Math.max(...numeric.map((point) => point.y));
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function normalizeCustomGeometryPoints(points = [], bounds = customGeometryPointBounds(points)) {
  if (!bounds) return [];
  const numeric = points
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (numeric.length < 3) return [];
  return numeric.map((point) => ({
    x: roundRatio((point.x - bounds.minX) / bounds.width),
    y: roundRatio((point.y - bounds.minY) / bounds.height)
  }));
}

function normalizeCustomGeometrySegments(segments = [], bounds = null) {
  if (!bounds) return [];
  return segments
    .map((segment) => ({
      type: safeCustomGeometrySegmentType(segment.type),
      points: (segment.points || []).map((point) => ({
        x: roundRatio((Number(point.x) - bounds.minX) / bounds.width),
        y: roundRatio((Number(point.y) - bounds.minY) / bounds.height)
      })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    }))
    .filter((segment) => segment.type && (segment.type === "close" || segment.points.length > 0))
    .slice(0, 120);
}

function safeCustomGeometrySegmentType(type) {
  const safe = safeString(type).toLowerCase();
  if (safe === "moveto") return "moveTo";
  if (safe === "lnto") return "lnTo";
  if (safe === "cubicbezto") return "cubicBezTo";
  if (safe === "quadbezto") return "quadBezTo";
  if (safe === "close") return "close";
  return "";
}

function roundRatio(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function parsePresetGeometryAdjustments(xml, shapeType = "") {
  const geom = String(xml || "").match(/<a:prstGeom\b[\s\S]*?<\/a:prstGeom>/i);
  if (!geom) return [];
  // DrawingML stores arc start/end guides in 1/60000 degree units, while the
  // ordinary preset guides used by radius-style shapes are percentage values.
  const isArc = String(shapeType || "").trim().toLowerCase() === "arc";
  const divisor = isArc ? 60000 : 100000;
  const values = [];
  for (const match of geom[0].matchAll(/<a:gd\b[^>]*\bfmla="val\s+(-?\d+(?:\.\d+)?)"/gi)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;
    values.push(Math.round((raw / divisor) * 10000) / 10000);
    if (values.length >= 4) break;
  }
  return values;
}

function parseFirstXfrmBounds(xml) {
  const xfrm = (String(xml || "").match(/<a:xfrm[\s\S]*?<\/a:xfrm>/) || [])[0] || "";
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

function parseXfrmRotationDeg(xml) {
  const xfrm = (String(xml || "").match(/<a:xfrm\b[^>]*>/i) || [])[0] || "";
  const raw = (xfrm.match(/\brot="(-?\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 60000;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(-360, Math.min(360, value)) * 100) / 100;
}

function readSlideRelationships(file, slideEntryName) {
  const entry = String(slideEntryName || "").replace(/\\/g, "/");
  const fileName = entry.split("/").pop();
  if (!/^slide\d+\.xml$/i.test(fileName || "")) return {};
  const relsEntry = entry.replace(/\/([^/]+)$/i, "/_rels/$1.rels");
  const rels = readZipEntry(file, relsEntry, { maxBytes: 512 * 1024 });
  if (!rels) return {};
  return parseRelationshipsXml(rels.toString("utf8"), entry);
}

function parseRelationshipsXml(xml, baseEntryName = "") {
  const relationships = {};
  const baseDir = String(baseEntryName || "").replace(/\\/g, "/").replace(/\/[^/]*$/, "");
  for (const match of String(xml || "").matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = match[0] || "";
    const id = safeRelationshipId((tag.match(/\bId="([^"]+)"/i) || [])[1]);
    const target = (tag.match(/\bTarget="([^"]+)"/i) || [])[1];
    const mode = (tag.match(/\bTargetMode="([^"]+)"/i) || [])[1];
    if (!id || safeString(mode).toLowerCase() === "external") continue;
    const mediaTarget = resolveRelationshipTarget(baseDir, target);
    if (mediaTarget) relationships[id] = mediaTarget;
  }
  return relationships;
}

function resolveRelationshipTarget(baseDir, target) {
  const raw = safeString(target).replace(/\\/g, "/");
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return "";
  const baseParts = String(baseDir || "").split("/").filter(Boolean);
  const targetParts = raw.startsWith("/") ? raw.slice(1).split("/") : [...baseParts, ...raw.split("/")];
  const out = [];
  for (const part of targetParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return "";
      out.pop();
      continue;
    }
    out.push(part);
  }
  return safeMediaTarget(out.join("/"));
}

function normalizeChildBox(box, reference) {
  return {
    x: roundRatio((box.x - reference.x) / reference.w),
    y: roundRatio((box.y - reference.y) / reference.h),
    w: roundRatio(box.w / reference.w),
    h: roundRatio(box.h / reference.h)
  };
}

function unionBounds(boxes = []) {
  const valid = boxes.filter(hasPositiveBounds);
  if (valid.length === 0) return null;
  const minX = Math.min(...valid.map((box) => box.x));
  const minY = Math.min(...valid.map((box) => box.y));
  const maxX = Math.max(...valid.map((box) => box.x + box.w));
  const maxY = Math.max(...valid.map((box) => box.y + box.h));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function hasPositiveBounds(box = {}) {
  return !!box
    && Number.isFinite(Number(box.x))
    && Number.isFinite(Number(box.y))
    && Number(box.w) > 0
    && Number(box.h) > 0;
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

function hasBranchCardFlowEvidence(children = [], nodeCenters = [], roles = {}) {
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

function emuToPt(value) {
  return Math.round((Number(value || 0) / 12700) * 100) / 100;
}

function roundRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(-2, Math.min(3, number)) * 10000) / 10000;
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
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
}

function safeRelationshipId(value) {
  const text = safeString(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(text) ? text : "";
}

function safeMediaTarget(value) {
  const text = safeString(value).replace(/\\/g, "/");
  if (!/^ppt\/media\/[^/?#]+\.(?:png|jpe?g|gif|emf|wmf|svg)$/i.test(text)) return "";
  if (text.includes("..")) return "";
  return text;
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
