"use strict";

const { fitSourceAxisInk } = require("./source-axis-ink-fit");
const { restoreSourceNodeConnectors } = require("./source-node-connectors");

const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 16_384;
const MAX_SHAPES = 10_000;
const MAX_SAMPLES = 24_000_000;

function refineSourceNativeEdges(request) {
  if (!isRecord(request)) throw new TypeError("Invalid source native edge refinement request");
  if (request.enableSourceNodeConnectors !== undefined && typeof request.enableSourceNodeConnectors !== "boolean") throw new TypeError("Invalid source node connector mode");
  const image = parseImage(request.image);
  const slideSize = parseSlideSize(request.slideSize);
  const page = parsePage(request.page);
  const next = {
    ...page,
    shapes: Array.isArray(page.shapes) ? page.shapes.map((shape) => structuredClone(shape)) : []
  };
  const state = { samples: 0 };
  const evidence = { candidates: 0, rectsRefined: 0, partialSideLines: 0, panelsWithoutStroke: 0, linesRefined: 0, supplementalLines: 0, samples: 0 };
  const additions = [];

  for (let index = 0; index < next.shapes.length; index += 1) {
    const shape = next.shapes[index];
    if (isCardCandidate(shape)) {
      evidence.candidates += 1;
      const fit = fitPanelEdges(shape, image, slideSize, state);
      if (!fit) continue;
      if (fit.kind === "rect") {
        next.shapes[index] = mergeShape(shape, { box: fit.box, style: { ...(shape.style || {}), stroke: fit.stroke, strokeWidthPt: fit.strokeWidthPt }, source: refinementSource(shape.source, fit) });
        evidence.rectsRefined += 1;
      } else if (fit.kind === "partial") {
        next.shapes[index] = mergeShape(shape, { style: { ...(shape.style || {}), stroke: "none", strokeWidthPt: 0 }, source: refinementSource(shape.source, fit) });
        const sideLines = fit.sides
          .map((side, sideIndex) => createSideLine(shape, side, fit, sideIndex, next.shapes))
          .filter((line) => !hasEquivalentSourceEdgeLine(next.shapes, line));
        next.shapes.splice(index + 1, 0, ...sideLines);
        index += sideLines.length;
        evidence.partialSideLines += sideLines.length;
      } else if (fit.kind === "panel") {
        next.shapes[index] = mergeShape(shape, { style: { ...(shape.style || {}), fill: fit.fill || shape.style?.fill, stroke: "none", strokeWidthPt: 0 }, source: refinementSource(shape.source, fit) });
        evidence.panelsWithoutStroke += 1;
      }
    } else if (isLineCandidate(shape)) {
      evidence.candidates += 1;
      const line = fitLine(shape, image, slideSize, state);
      if (!line) continue;
      next.shapes[index] = mergeShape(shape, { box: line.box, style: { ...(shape.style || {}), stroke: line.stroke, strokeWidthPt: line.strokeWidthPt, lineCap: line.lineCap }, source: refinementSource(shape.source, line) });
      evidence.linesRefined += 1;
    }
  }
  if (request.enableSupplementalAxisLines === true) {
    const supplementalLines = detectSupplementalAxisLines({ page: next, image, slideSize, state });
    if (supplementalLines.length > 0) {
      additions.push(...supplementalLines);
      evidence.supplementalLines = supplementalLines.length;
    }
  }
  if (additions.length > 0) next.shapes.push(...additions);
  const ownerReassigned = reassignSourceNativeEdgeOwners(next);
  if (ownerReassigned > 0) evidence.ownerReassigned = ownerReassigned;
  if (request.enableSourceNodeConnectors === true) {
    const connectors = restoreSourceNodeConnectors({ page: next, image, slideSize });
    next.shapes = connectors.page.shapes;
    evidence.sourceNodeConnectors = connectors.evidence;
  }
  evidence.samples = state.samples;
  return { page: next, evidence };
}

function reassignSourceNativeEdgeOwners(page) {
  const shapes = Array.isArray(page?.shapes) ? page.shapes : [];
  if (shapes.length < 1) return 0;
  let reassigned = 0;
  for (const line of shapes) {
    if (!isRecord(line) || !isRecord(line.source) || line.source.detector !== "source-native-edge-refinement" || !isRecord(line.box)) continue;
    const side = String(line.source.supportedSide || "");
    if (!side) continue;
    let best = null;
    for (const candidate of shapes) {
      if (!isCardCandidate(candidate) || !candidate.id || !isRecord(candidate.box)) continue;
      const score = scoreSideLineOwner(line.box, side, candidate.box);
      if (score === null) continue;
      if (!best || score > best.score) best = { card: candidate, score };
    }
    const bestId = String(best?.card?.id || "");
    const currentId = String(line.source.sourceShapeId || "");
    if (!bestId || bestId === currentId) continue;
    line.source = {
      ...line.source,
      sourceShapeId: bestId,
      sourceNativeEdgeOwnerReassigned: {
        provider: "source-native-edge-owner-reassign-v1",
        previousSourceShapeId: currentId
      }
    };
    reassigned += 1;
  }
  return reassigned;
}

function fitPanelEdges(shape, image, slideSize, state) {
  const box = parseBox(shape.box);
  if (!box) return null;
  const pixelBox = ptToPxBox(box, image, slideSize);
  if (!pixelBox || pixelBox.w < 8 || pixelBox.h < 8) return null;
  const window = Math.max(4, Math.min(28, Math.round(Math.max(pixelBox.w, pixelBox.h) * 0.1)));
  const probes = [
    scanAxisEdge({ name: "left", vertical: true, expected: pixelBox.x, start: pixelBox.y, length: pixelBox.h, window, image, state }),
    scanAxisEdge({ name: "right", vertical: true, expected: pixelBox.x + pixelBox.w, start: pixelBox.y, length: pixelBox.h, window, image, state }),
    scanAxisEdge({ name: "top", vertical: false, expected: pixelBox.y, start: pixelBox.x, length: pixelBox.w, window, image, state }),
    scanAxisEdge({ name: "bottom", vertical: false, expected: pixelBox.y + pixelBox.h, start: pixelBox.x, length: pixelBox.w, window, image, state })
  ].filter(Boolean);
  const supported = probes
    .filter((side) => side.support >= 0.62 && side.continuity >= 0.5 && !side.ambiguous)
    .map((side) => withPointUnits(side, image, slideSize, pixelBox));
  const fill = sampleDominantFill(image, pixelBox);
  if (supported.length === 4) {
    const byName = Object.fromEntries(supported.map((side) => [side.name, side]));
    const refined = {
      x: byName.left.coordinate,
      y: byName.top.coordinate,
      w: byName.right.coordinate - byName.left.coordinate,
      h: byName.bottom.coordinate - byName.top.coordinate
    };
    if (refined.w <= 2 || refined.h <= 2) return null;
    return {
      kind: "rect",
      box: pxToPtBox(refined, image, slideSize),
      stroke: rgbToHex(averageRgb(supported.flatMap((side) => side.samples))),
      strokeWidthPt: pxToPtLength(median(supported.map((side) => side.thicknessPx)), image, slideSize),
      sides: supported.map(publicSide)
    };
  }
  if (supported.length > 0) {
    if (isParallelOnlyPartialSides(supported)) {
      if (hasTextBackedCardEvidence(shape)) {
        return {
          kind: "partial",
          stroke: rgbToHex(averageRgb(supported.flatMap((side) => side.samples))),
          strokeWidthPt: boundedPartialStrokeWidth(shape, pxToPtLength(median(supported.map((side) => side.thicknessPx)), image, slideSize)),
          sides: supported.map(publicSide)
        };
      }
      if (fill && fill.coverage >= 0.82 && fill.contrast <= 18) return { kind: "panel", fill: rgbToHex(fill.color), sides: [] };
      return null;
    }
    return {
      kind: "partial",
      stroke: rgbToHex(averageRgb(supported.flatMap((side) => side.samples))),
      strokeWidthPt: boundedPartialStrokeWidth(shape, pxToPtLength(median(supported.map((side) => side.thicknessPx)), image, slideSize)),
      sides: supported.map(publicSide)
    };
  }
  if (fill && fill.coverage >= 0.82 && fill.contrast <= 18) return { kind: "panel", fill: rgbToHex(fill.color), sides: [] };
  return null;
}

function fitLine(shape, image, slideSize, state) {
  const box = parseLineBox(shape.box);
  if (!box) return null;
  const vertical = Math.abs(box.h) >= Math.abs(box.w);
  const px = ptToPxBox(lineSearchBox(box, vertical), image, slideSize);
  if (!px) return null;
  const style = isRecord(shape.style) ? shape.style : {};
  const expectedColor = parseHexColor(style.stroke);
  const expected = vertical ? (box.x * image.width / slideSize.widthPt) : (box.y * image.height / slideSize.heightPt);
  const start = vertical ? px.y : px.x;
  const length = vertical ? px.h : px.w;
  const side = scanAxisEdge({ name: vertical ? "vertical-line" : "horizontal-line", vertical, expected, start, length, window: 18, image, state, allowSolidStroke: true, expectedColor });
  if (!side || side.support < 0.55 || side.continuity < 0.45 || side.ambiguous) {
    if (!expectedColor || shape.source?.semanticNativeStructure !== true) return null;
    const result = fitSourceAxisInk({ image, color: expectedColor, vertical, expected, start, length,
      window: Math.min(64, Math.max(18, Math.round(Math.max(image.width, image.height) * 0.025))) });
    state.samples += result.samples;
    if (state.samples > MAX_SAMPLES) throw new RangeError("Source native edge refinement sampling limit exceeded");
    if (!result.fit) return null;
    const fit = result.fit;
    const pt = vertical
      ? { x: fit.coordinate * slideSize.widthPt / image.width, y: fit.start * slideSize.heightPt / image.height, w: 0, h: fit.length * slideSize.heightPt / image.height }
      : { x: fit.start * slideSize.widthPt / image.width, y: fit.coordinate * slideSize.heightPt / image.height, w: fit.length * slideSize.widthPt / image.width, h: 0 };
    if (vertical && box.h < 0) { pt.y += pt.h; pt.h = -pt.h; }
    if (!vertical && box.w < 0) { pt.x += pt.w; pt.w = -pt.w; }
    return { kind: "line", box: pt, stroke: rgbToHex(fit.color), strokeWidthPt: pxToPtLength(fit.thicknessPx, image, slideSize), lineCap: "round", sides: [] };
  }
  const pt = vertical
    ? { x: side.coordinate * slideSize.widthPt / image.width, y: start * slideSize.heightPt / image.height, w: 0, h: length * slideSize.heightPt / image.height }
    : { x: start * slideSize.widthPt / image.width, y: side.coordinate * slideSize.heightPt / image.height, w: length * slideSize.widthPt / image.width, h: 0 };
  // Signed extents encode endpoint direction, including which end owns an arrow.
  if (vertical && box.h < 0) { pt.y += pt.h; pt.h = -pt.h; }
  if (!vertical && box.w < 0) { pt.x += pt.w; pt.w = -pt.w; }
  return { kind: "line", box: pt, stroke: rgbToHex(averageRgb(side.samples)), strokeWidthPt: pxToPtLength(side.thicknessPx, image, slideSize), lineCap: "round", sides: [publicSide(withPointUnits(side, image, slideSize, px))] };
}

function detectSupplementalAxisLines({ page, image, slideSize, state }) {
  const existing = Array.isArray(page.shapes) ? page.shapes : [];
  const images = Array.isArray(page.images) ? page.images : [];
  const occupied = [
    ...existing.map((shape) => shapePixelBounds(shape, image, slideSize)),
    ...images.map((item) => imagePixelBounds(item, image, slideSize))
  ].filter(Boolean);
  const lines = [];
  const maxLines = 32;
  const horizontalRuns = detectAxisRuns({ image, state, vertical: false });
  const verticalRuns = detectAxisRuns({ image, state, vertical: true });
  for (const run of [...horizontalRuns, ...verticalRuns].sort((a, b) => b.length - a.length)) {
    if (lines.length >= maxLines) break;
    if (axisRunCovered(run, occupied, image, slideSize) || lines.some((line) => sameSupplementalAxisLine(line, run, image, slideSize))) continue;
    lines.push(createSupplementalAxisLine(run, image, slideSize, lines.length));
  }
  return lines;
}

function detectAxisRuns({ image, state, vertical }) {
  const rows = vertical ? image.width : image.height;
  const cols = vertical ? image.height : image.width;
  const minLength = Math.max(54, Math.round(cols * 0.18));
  const raw = [];
  for (let row = 1; row < rows - 1; row += 1) {
    let start = -1;
    const colors = [];
    for (let col = 1; col < cols - 1; col += 1) {
      if (++state.samples > MAX_SAMPLES) throw new RangeError("Source native edge refinement sampling limit exceeded");
      const x = vertical ? row : col;
      const y = vertical ? col : row;
      const color = supplementalAxisPixel(image, x, y, vertical);
      if (color) {
        if (start < 0) start = col;
        if (colors.length < 256) colors.push(color);
      } else if (start >= 0) {
        pushSupplementalRun(raw, { vertical, axis: row, start, end: col - 1, colors, image, minLength });
        start = -1;
        colors.length = 0;
      }
    }
    if (start >= 0) pushSupplementalRun(raw, { vertical, axis: row, start, end: cols - 2, colors, image, minLength });
  }
  return mergeAxisRuns(raw, vertical);
}

function pushSupplementalRun(target, { vertical, axis, start, end, colors, image, minLength }) {
  const length = end - start + 1;
  if (length < minLength || colors.length < 8) return;
  const samples = colors.slice(0, 256);
  const color = averageRgb(samples);
  const contrast = supplementalNormalContrastAtMidpoint(image, vertical, axis, Math.round((start + end) / 2));
  const brightness = (color.r + color.g + color.b) / 3;
  if (contrast < 8 || contrast > 118 || brightness > 245) return;
  target.push({ vertical, axis, start, end, length, colors: samples, color, contrast });
}

function mergeAxisRuns(runs, vertical) {
  const merged = [];
  for (const run of runs.sort((a, b) => a.axis - b.axis || a.start - b.start)) {
    const previous = merged[merged.length - 1];
    const overlap = previous ? Math.min(previous.end, run.end) - Math.max(previous.start, run.start) : 0;
    const minLength = previous ? Math.min(previous.length, run.length) : 1;
    if (previous && run.axis - previous.axis <= 3 && overlap / Math.max(1, minLength) >= 0.72) {
      previous.axis = Math.round((previous.axis + run.axis) / 2);
      previous.start = Math.min(previous.start, run.start);
      previous.end = Math.max(previous.end, run.end);
      previous.length = previous.end - previous.start + 1;
      previous.colors = previous.colors.concat(run.colors).slice(0, 256);
      previous.color = averageRgb(previous.colors);
      previous.contrast = Math.max(previous.contrast, run.contrast);
    } else {
      merged.push({ ...run, vertical });
    }
  }
  return merged.filter((run) => run.length >= 42);
}

function supplementalAxisPixel(image, x, y, vertical) {
  const here = colorAt(image, x, y);
  if (!here) return null;
  const max = Math.max(here.r, here.g, here.b);
  const min = Math.min(here.r, here.g, here.b);
  const saturation = max - min;
  const brightness = (here.r + here.g + here.b) / 3;
  if (brightness < 165 || brightness > 245 || saturation > 58) return null;
  const before = colorAt(image, x + (vertical ? -2 : 0), y + (vertical ? 0 : -2));
  const after = colorAt(image, x + (vertical ? 2 : 0), y + (vertical ? 0 : 2));
  if (!before || !after) return null;
  const contrast = Math.max(colorDistance(here, before), colorDistance(here, after));
  if (contrast < 8 || contrast > 118) return null;
  const alongBefore = colorAt(image, x + (vertical ? 0 : -1), y + (vertical ? -1 : 0));
  const alongAfter = colorAt(image, x + (vertical ? 0 : 1), y + (vertical ? 1 : 0));
  if (alongBefore && alongAfter && Math.max(colorDistance(here, alongBefore), colorDistance(here, alongAfter)) > 42) return null;
  return here;
}

function supplementalNormalContrastAtMidpoint(image, vertical, axis, along) {
  const x = vertical ? axis : along;
  const y = vertical ? along : axis;
  const here = colorAt(image, x, y);
  const before = colorAt(image, x + (vertical ? -2 : 0), y + (vertical ? 0 : -2));
  const after = colorAt(image, x + (vertical ? 2 : 0), y + (vertical ? 0 : 2));
  if (!here || !before || !after) return 0;
  return Math.max(colorDistance(here, before), colorDistance(here, after));
}

function shapePixelBounds(shape, image, slideSize) {
  const box = parseLineBox(shape?.box) || parseBox(shape?.box);
  if (!box) return null;
  const pad = shape?.type === "line" ? 5 : 8;
  const px = ptToPxBox({
    x: box.x - pad,
    y: box.y - pad,
    w: Math.max(1, box.w + pad * 2),
    h: Math.max(1, box.h + pad * 2)
  }, image, slideSize);
  return px ? { ...px, type: shape?.type } : null;
}

function imagePixelBounds(item, image, slideSize) {
  const box = parseBox(item?.box);
  if (!box) return null;
  const px = ptToPxBox(box, image, slideSize);
  return px ? { ...px, type: "image" } : null;
}

function axisRunCovered(run, occupied, image, slideSize) {
  const lineBox = run.vertical
    ? { x: run.axis, y: run.start, w: 1, h: run.length }
    : { x: run.start, y: run.axis, w: run.length, h: 1 };
  for (const box of occupied) {
    if (!box) continue;
    const overlap = intersectionArea(lineBox, box);
    if (overlap / Math.max(1, lineBox.w * lineBox.h) >= (box.type === "line" ? 0.45 : 0.72)) return true;
  }
  const pt = runToPointBox(run, image, slideSize);
  return !pt || pt.w + pt.h < 24;
}

function sameSupplementalAxisLine(line, run, image, slideSize) {
  const existing = parseLineBox(line.box);
  const current = runToPointBox(run, image, slideSize);
  if (!existing || !current) return false;
  const existingVertical = Math.abs(existing.h) >= Math.abs(existing.w);
  if (existingVertical !== run.vertical) return false;
  const axisDistance = run.vertical ? Math.abs(existing.x - current.x) : Math.abs(existing.y - current.y);
  const a1 = run.vertical ? existing.y : existing.x;
  const a2 = run.vertical ? existing.y + existing.h : existing.x + existing.w;
  const b1 = run.vertical ? current.y : current.x;
  const b2 = run.vertical ? current.y + current.h : current.x + current.w;
  const overlap = Math.min(a2, b2) - Math.max(a1, b1);
  return axisDistance <= 1.2 && overlap / Math.max(1, Math.min(a2 - a1, b2 - b1)) >= 0.72;
}

function createSupplementalAxisLine(run, image, slideSize, index) {
  return {
    id: `source-native-axis-line-${index + 1}`,
    type: "line",
    box: runToPointBox(run, image, slideSize),
    style: {
      stroke: rgbToHex(run.color),
      strokeWidthPt: pxToPtLength(1, image, slideSize),
      connectorType: "straight",
      lineCap: "round"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "source-native-axis-line",
      sourceNativeEdgeRefinement: {
        provider: "source-native-edge-refinement-v1",
        kind: "supplemental-line",
        axis: run.vertical ? "vertical" : "horizontal",
        support: round(run.length / (run.vertical ? image.height : image.width)),
        contrast: round(run.contrast)
      }
    }
  };
}

function runToPointBox(run, image, slideSize) {
  if (run.vertical) {
    return {
      x: run.axis * slideSize.widthPt / image.width,
      y: run.start * slideSize.heightPt / image.height,
      w: 0,
      h: Math.max(0.1, run.length * slideSize.heightPt / image.height)
    };
  }
  return {
    x: run.start * slideSize.widthPt / image.width,
    y: run.axis * slideSize.heightPt / image.height,
    w: Math.max(0.1, run.length * slideSize.widthPt / image.width),
    h: 0
  };
}

function scanAxisEdge({ name, vertical, expected, start, length, window, image, state, allowSolidStroke = false, expectedColor = null }) {
  if (![expected, start, length].every(Number.isFinite) || length < 6) return null;
  const from = Math.max(0, Math.round(start + length * 0.08));
  const to = Math.min(vertical ? image.height - 1 : image.width - 1, Math.round(start + length * 0.92));
  if (to <= from || to - from > 100_000) return null;
  const candidates = [];
  for (let at = Math.round(expected) - window; at <= Math.round(expected) + window; at += 1) {
    let hits = 0;
    let run = 0;
    let misses = 0;
    let longest = 0;
    const samples = [];
    for (let along = from; along <= to; along += 1) {
      if (++state.samples > MAX_SAMPLES) throw new RangeError("Source native edge refinement sampling limit exceeded");
      const x = vertical ? at : along;
      const y = vertical ? along : at;
      const edge = edgePixel(image, x, y, vertical, allowSolidStroke, expectedColor);
      if (edge) {
        hits += 1;
        run += misses + 1;
        misses = 0;
        longest = Math.max(longest, run);
        if (samples.length < 256) samples.push(edge.color);
      } else {
        misses += 1;
        if (misses > 2) {
          run = 0;
          misses = 0;
        }
      }
    }
    const total = Math.max(1, to - from + 1);
    const support = hits / total;
    const continuity = longest / total;
    if (support >= 0.18 && continuity >= 0.28) candidates.push({ name, coordinate: at, support, continuity, samples, thicknessPx: estimateThickness(image, at, vertical, from, to, allowSolidStroke, expectedColor) });
  }
  if (candidates.length < 1) return null;
  candidates.sort((a, b) => b.support - a.support || b.continuity - a.continuity || Math.abs(a.coordinate - expected) - Math.abs(b.coordinate - expected));
  const [best, second] = candidates;
  return { ...best, ambiguous: Boolean(second && Math.abs(second.coordinate - best.coordinate) > 2 && second.support > best.support * 0.92) };
}

function edgePixel(image, x, y, vertical, allowSolidStroke, expectedColor = null) {
  const here = colorAt(image, x, y);
  if (!here) return null;
  const before = colorAt(image, x + (vertical ? -3 : 0), y + (vertical ? 0 : -3));
  const after = colorAt(image, x + (vertical ? 3 : 0), y + (vertical ? 0 : 3));
  if (!before || !after) return null;
  const normalContrast = Math.max(colorDistance(here, before), colorDistance(here, after));
  const twoSided = colorDistance(here, before) >= 14 && colorDistance(here, after) >= 14;
  if (!allowSolidStroke && !twoSided) return null;
  if (allowSolidStroke && normalContrast < 14) return null;
  if (allowSolidStroke && expectedColor && !matchesStrokeColor(here, expectedColor)) return null;
  if (allowSolidStroke && !expectedColor && !twoSided) return null;
  return { color: here };
}

function matchesStrokeColor(actual, expected) {
  if (colorDistance(actual, expected) <= 42) return true;
  const a = [actual.r, actual.g, actual.b];
  const e = [expected.r, expected.g, expected.b];
  const aMin = Math.min(...a), eMin = Math.min(...e);
  const aRange = Math.max(...a) - aMin, eRange = Math.max(...e) - eMin;
  // Antialiasing moves ink toward the background without changing its hue.
  // Require chromatic evidence on both sides; gray text is not a blue stroke.
  if (aRange < 40 || eRange < 40 || aRange < eRange) return false;
  return a.every((channel, index) => Math.abs((channel - aMin) / aRange - (e[index] - eMin) / eRange) <= 0.12);
}

function estimateThickness(image, coordinate, vertical, from, to, allowSolidStroke, expectedColor = null) {
  const along = Math.round((from + to) / 2);
  let thickness = 1;
  for (const direction of [-1, 1]) {
    for (let offset = 1; offset <= 8; offset += 1) {
      const x = vertical ? coordinate + offset * direction : along;
      const y = vertical ? along : coordinate + offset * direction;
      if (!edgePixel(image, x, y, vertical, allowSolidStroke, expectedColor)) break;
      thickness += 1;
    }
  }
  return Math.max(1, thickness);
}

function isParallelOnlyPartialSides(sides) {
  if (!Array.isArray(sides) || sides.length !== 2) return false;
  const orientations = sides.map((side) => side.name === "left" || side.name === "right" || side.name === "vertical-line" ? "vertical" : "horizontal");
  return orientations[0] === orientations[1];
}

function hasTextBackedCardEvidence(shape) {
  const source = isRecord(shape?.source) ? shape.source : {};
  const textCount = numberField(source, "textCount");
  const rowSize = numberField(source, "rowSize");
  return shape?.source?.detector === "line-text-native-card-row"
    && Number.isFinite(textCount)
    && textCount >= 2
    && (!Number.isFinite(rowSize) || rowSize >= 2);
}

function boundedPartialStrokeWidth(shape, sampledWidthPt) {
  const fallback = Number.isFinite(sampledWidthPt) ? sampledWidthPt : 0.75;
  const current = Number(shape?.style?.strokeWidthPt);
  if (!Number.isFinite(current) || current <= 0) return Math.max(0.25, Math.min(1.1, fallback));
  return Math.max(0.25, Math.min(Math.max(0.75, current * 1.5), fallback));
}

function createSideLine(shape, side, fit, index, shapes = []) {
  const owner = bestSideLineOwner(shape, side, shapes);
  const ownerId = String(owner?.id || shape.id || "");
  const id = `${String(shape.id || "source-edge")}-source-${side.name}-${index + 1}`;
  const box = side.vertical
    ? { x: side.coordinatePt, y: side.startPt, w: 0, h: side.lengthPt }
    : { x: side.startPt, y: side.coordinatePt, w: side.lengthPt, h: 0 };
  const previousOwnerId = String(shape.id || "");
  const ownerSource = ownerId && ownerId !== previousOwnerId
    ? { sourceNativeEdgeOwnerReassigned: { provider: "source-native-edge-owner-reassign-v1", previousSourceShapeId: previousOwnerId } }
    : {};
  return {
    id,
    type: "line",
    box,
    style: { stroke: fit.stroke, strokeWidthPt: fit.strokeWidthPt, connectorType: "straight", lineCap: "round" },
    source: { editable: true, nativeRebuild: true, detector: "source-native-edge-refinement", sourceShapeId: ownerId, supportedSide: side.name, ...ownerSource }
  };
}

function hasEquivalentSourceEdgeLine(shapes, line) {
  if (!Array.isArray(shapes) || !isRecord(line) || !isRecord(line.source) || !isRecord(line.box)) return false;
  const side = String(line.source.supportedSide || "");
  const ownerId = String(line.source.sourceShapeId || "");
  if (!side || !ownerId) return false;
  return shapes.some((shape) => {
    if (!isRecord(shape) || !isRecord(shape.source) || !isRecord(shape.box)) return false;
    if (shape.source.detector !== "source-native-edge-refinement") return false;
    if (String(shape.source.supportedSide || "") !== side || String(shape.source.sourceShapeId || "") !== ownerId) return false;
    return sourceEdgeLineGeometryMatches(shape.box, line.box, side);
  });
}

function sourceEdgeLineGeometryMatches(left, right, side) {
  const leftBox = parseLineBox(left);
  const rightBox = parseLineBox(right);
  if (!leftBox || !rightBox) return false;
  const vertical = side === "left" || side === "right";
  const axisDistance = vertical ? Math.abs(leftBox.x - rightBox.x) : Math.abs(leftBox.y - rightBox.y);
  const leftStart = vertical ? leftBox.y : leftBox.x;
  const leftEnd = leftStart + (vertical ? leftBox.h : leftBox.w);
  const rightStart = vertical ? rightBox.y : rightBox.x;
  const rightEnd = rightStart + (vertical ? rightBox.h : rightBox.w);
  const overlap = Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart);
  const shortest = Math.min(Math.abs(leftEnd - leftStart), Math.abs(rightEnd - rightStart));
  return axisDistance <= 1.2 && overlap / Math.max(1, shortest) >= 0.72;
}

function bestSideLineOwner(shape, side, shapes) {
  const lineBox = side.vertical
    ? { x: side.coordinatePt, y: side.startPt, w: 0, h: side.lengthPt }
    : { x: side.startPt, y: side.coordinatePt, w: side.lengthPt, h: 0 };
  const fallback = isCardCandidate(shape) ? shape : null;
  let best = null;
  for (const candidate of Array.isArray(shapes) ? shapes : []) {
    if (!isCardCandidate(candidate) || !candidate.id || !isRecord(candidate.box)) continue;
    const score = scoreSideLineOwner(lineBox, side.name, candidate.box);
    if (score === null) continue;
    if (!best || score > best.score) best = { card: candidate, score };
  }
  return best?.card || fallback;
}

function scoreSideLineOwner(lineBox, side, cardBox) {
  const axisDistance = side === "left" || side === "right"
    ? Math.abs(Number(lineBox.x || 0) - (side === "left" ? Number(cardBox.x || 0) : Number(cardBox.x || 0) + Number(cardBox.w || 0)))
    : Math.abs(Number(lineBox.y || 0) - (side === "top" ? Number(cardBox.y || 0) : Number(cardBox.y || 0) + Number(cardBox.h || 0)));
  const tolerance = Math.max(2, Math.min(9, Math.max(Number(cardBox.w || 0), Number(cardBox.h || 0)) * 0.075));
  if (axisDistance > tolerance) return null;
  const overlap = side === "left" || side === "right"
    ? Math.min(Number(lineBox.y || 0) + Number(lineBox.h || 0), Number(cardBox.y || 0) + Number(cardBox.h || 0)) - Math.max(Number(lineBox.y || 0), Number(cardBox.y || 0))
    : Math.min(Number(lineBox.x || 0) + Number(lineBox.w || 0), Number(cardBox.x || 0) + Number(cardBox.w || 0)) - Math.max(Number(lineBox.x || 0), Number(cardBox.x || 0));
  const lineLength = side === "left" || side === "right" ? Math.max(0, Number(lineBox.h || 0)) : Math.max(0, Number(lineBox.w || 0));
  const cardLength = side === "left" || side === "right" ? Math.max(0, Number(cardBox.h || 0)) : Math.max(0, Number(cardBox.w || 0));
  if (overlap < Math.max(1, Math.min(lineLength, cardLength) * 0.42)) return null;
  return overlap - axisDistance * 2;
}

function publicSide(side) {
  const vertical = side.name === "left" || side.name === "right" || side.name === "vertical-line";
  return { name: side.name, vertical, coordinate: side.coordinate, coordinatePt: side.coordinatePt, startPt: side.startPt, lengthPt: side.lengthPt, support: round(side.support), continuity: round(side.continuity) };
}

function withPointUnits(side, image, slideSize, pixelBox) {
  const vertical = side.name === "left" || side.name === "right" || side.name === "vertical-line";
  return {
    ...side,
    coordinatePt: vertical ? side.coordinate * slideSize.widthPt / image.width : side.coordinate * slideSize.heightPt / image.height,
    startPt: vertical ? pixelBox.y * slideSize.heightPt / image.height : pixelBox.x * slideSize.widthPt / image.width,
    lengthPt: vertical ? pixelBox.h * slideSize.heightPt / image.height : pixelBox.w * slideSize.widthPt / image.width
  };
}

function sampleDominantFill(image, box) {
  const insetX = Math.max(2, Math.round(box.w * 0.18));
  const insetY = Math.max(2, Math.round(box.h * 0.18));
  const colors = [];
  for (let y = Math.round(box.y + insetY); y < Math.round(box.y + box.h - insetY); y += Math.max(1, Math.floor(box.h / 24))) {
    for (let x = Math.round(box.x + insetX); x < Math.round(box.x + box.w - insetX); x += Math.max(1, Math.floor(box.w / 24))) {
      const color = colorAt(image, x, y);
      if (color) colors.push(color);
    }
  }
  if (colors.length < 12) return null;
  const color = averageRgb(colors);
  const near = colors.filter((item) => colorDistance(item, color) <= 18).length;
  return { color, coverage: near / colors.length, contrast: colors.reduce((max, item) => Math.max(max, colorDistance(item, color)), 0) };
}

function lineSearchBox(box, vertical) {
  return vertical
    ? { x: box.x - 12, y: Math.min(box.y, box.y + box.h), w: 24, h: Math.abs(box.h) }
    : { x: Math.min(box.x, box.x + box.w), y: box.y - 12, w: Math.abs(box.w), h: 24 };
}

function mergeShape(shape, patch) {
  return { ...shape, ...patch, style: patch.style || shape.style, source: patch.source || shape.source };
}

function refinementSource(source, fit) {
  return { ...(isRecord(source) ? source : {}), sourceNativeEdgeRefinement: { provider: "source-native-edge-refinement-v1", kind: fit.kind, sides: fit.sides.length } };
}

function ptToPxBox(box, image, slideSize) {
  const x = box.x * image.width / slideSize.widthPt;
  const y = box.y * image.height / slideSize.heightPt;
  const w = box.w * image.width / slideSize.widthPt;
  const h = box.h * image.height / slideSize.heightPt;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function pxToPtBox(box, image, slideSize) {
  return { x: box.x * slideSize.widthPt / image.width, y: box.y * slideSize.heightPt / image.height, w: box.w * slideSize.widthPt / image.width, h: box.h * slideSize.heightPt / image.height };
}

function pxToPtLength(value, image, slideSize) {
  const scale = (slideSize.widthPt / image.width + slideSize.heightPt / image.height) / 2;
  return Math.max(0.25, Math.min(6, round(value * scale)));
}

function colorAt(image, x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height) return null;
  const offset = (iy * image.width + ix) * 4;
  if ((image.rgba[offset + 3] ?? 0) < 64) return null;
  return { r: image.rgba[offset] ?? 0, g: image.rgba[offset + 1] ?? 0, b: image.rgba[offset + 2] ?? 0 };
}

function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

function intersectionArea(left, right) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.w, right.x + right.w);
  const y2 = Math.min(left.y + left.h, right.y + right.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function averageRgb(colors) {
  const total = colors.reduce((sum, color) => ({ r: sum.r + color.r, g: sum.g + color.g, b: sum.b + color.b }), { r: 0, g: 0, b: 0 });
  const count = Math.max(1, colors.length);
  return { r: total.r / count, g: total.g / count, b: total.b / count };
}

function rgbToHex(color) {
  return `#${[color.r, color.g, color.b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function parseHexColor(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return null;
  return { r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 1) return 1;
  return sorted[Math.floor(sorted.length / 2)];
}

function parsePage(value) {
  if (!isRecord(value)) throw new TypeError("Invalid source native edge refinement page");
  if (value.shapes !== undefined && (!Array.isArray(value.shapes) || value.shapes.length > MAX_SHAPES)) {
    throw new TypeError("Invalid source native edge refinement shapes");
  }
  return value;
}

function parseImage(value) {
  if (!isRecord(value)) throw new TypeError("Invalid source native edge refinement image");
  const { width, height, rgba } = value;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
    throw new TypeError("Invalid source native edge refinement image");
  }
  return { width, height, rgba };
}

function parseSlideSize(value) {
  if (!isRecord(value)) throw new TypeError("Invalid source native edge refinement slide size");
  const widthPt = numberField(value, "widthPt") ?? numberField(value, "width");
  const heightPt = numberField(value, "heightPt") ?? numberField(value, "height");
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) throw new TypeError("Invalid source native edge refinement slide size");
  return { widthPt, heightPt };
}

function parseBox(value) {
  if (!isRecord(value)) return null;
  const x = numberField(value, "x");
  const y = numberField(value, "y");
  const w = numberField(value, "w");
  const h = numberField(value, "h");
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function parseLineBox(value) {
  if (!isRecord(value)) return null;
  const x = numberField(value, "x");
  const y = numberField(value, "y");
  const w = numberField(value, "w");
  const h = numberField(value, "h");
  if (![x, y, w, h].every(Number.isFinite) || (w === 0 && h === 0)) return null;
  return { x, y, w, h };
}

function isCardCandidate(shape) {
  return isRecord(shape) && (shape.type === "roundRect" || shape.type === "rect") && isRecord(shape.source) && shape.source.nativeRebuild === true && shape.source.detector === "line-text-native-card-row";
}

function isLineCandidate(shape) {
  if (!isRecord(shape) || shape.type !== "line" || !isRecord(shape.source) || shape.source.nativeRebuild !== true) return false;
  const box = parseLineBox(shape.box);
  if (!box) return false;
  const minor = Math.min(Math.abs(box.w), Math.abs(box.h));
  const major = Math.max(Math.abs(box.w), Math.abs(box.h));
  if (minor > Math.min(1, major * 0.02)) return false;
  if (shape.source.detector === "long-axis-line" || shape.source.detector === "source-vertical-line") return true;
  return shape.source.semanticNativeStructure === true && shape.source.editable === true
    && isRecord(shape.style) && shape.style.connectorType === "straight";
}

function numberField(value, key) {
  const result = value[key];
  return typeof result === "number" && Number.isFinite(result) ? result : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

module.exports = { refineSourceNativeEdges, reassignSourceNativeEdgeOwners };
