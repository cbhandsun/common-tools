"use strict";
const { sourceIconPrimitiveEvidence } = require("./source-icon-primitive-evidence");
// @ts-check

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} SlideSize */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{id?: unknown, box?: unknown, text?: unknown, font?: unknown, style?: unknown, source?: unknown}} TextBox */
/** @typedef {{id?: unknown,type?: unknown,box?: unknown,style?: unknown,source?: unknown}} Shape */
/** @typedef {{r:number,g:number,b:number,a:number}} Rgba */
/** @typedef {{axis:"h"|"v",a:number,start:number,end:number,style:Record<string, unknown>,source:Record<string, unknown>}} AxisLine */
/** @typedef {AxisLine & {members: AxisLine[]}} AxisLineCluster */
/** @typedef {{fill:Rgba,stroke:{r:number,g:number,b:number},strokeWidthPt:number,distance:number,fitBox?:Box}} PanelColorEvidence */
/** @typedef {{count:number,minX:number,minY:number,maxX:number,maxY:number,width:number,height:number}} ColorComponent */
/** @typedef {{x0:number,y0:number,width:number,height:number,startX:number,startY:number,visited:Uint8Array,fill:Rgba,tolerance:number}} FloodColorOptions */

const POSITION_TOLERANCE_PT = 7;
const {
  brightness,
  saturationProxy,
  addColorBucket,
  bucketWinner,
  colorDistance,
  nativeRect,
  insetPx,
  samplePxArea,
  sampleOutsideFrame,
  averageColor,
  dominantColor,
  lightDetailBoxes,
  broadLightDetailBoxes,
  pixel,
  ptToPxBox,
  pxToPtBox,
  overlapRatio,
  strongestStyle,
  textColor,
  parseHexColor,
  dedupeShapes,
  clampBox,
  median,
  clamp,
  round,
  rgbToHex,
  hexToRgb,
  isRecord,
  isBox
} = require("./line-text-native-primitives");

/** @param {Raster} image @param {Box} textBox @param {Box} seedPanel @param {SlideSize} slideSize @param {Rgba} fill */
function expandPanelFromColorRun(image, textBox, seedPanel, slideSize, fill) {
  const seedPx = ptToPxBox(seedPanel, image, slideSize, 0);
  const textPx = ptToPxBox(textBox, image, slideSize, 0);
  const yStart = clamp(Math.floor(textPx.y + textPx.h * 0.18), 0, image.height - 1);
  const yEnd = clamp(Math.ceil(textPx.y + textPx.h * 0.82), yStart + 1, image.height);
  const cx = clamp(Math.floor(textPx.x + textPx.w / 2), 0, image.width - 1);
  const cy = clamp(Math.floor(textPx.y + textPx.h / 2), 0, image.height - 1);
  const x1 = scanColorRunX(image, cx, yStart, yEnd, -1, fill);
  const x2 = scanColorRunX(image, cx, yStart, yEnd, 1, fill);
  if (x2 - x1 < seedPx.w * 1.05 && x2 - x1 < seedPx.w + 8) return null;
  const xPad = Math.max(1, Math.round((x2 - x1) * 0.015));
  const y1 = scanColorRunY(image, cy, Math.max(0, x1 + xPad), Math.min(image.width, x2 - xPad), -1, fill);
  const y2 = scanColorRunY(image, cy, Math.max(0, x1 + xPad), Math.min(image.width, x2 - xPad), 1, fill);
  const verticalRunOk = y2 - y1 >= seedPx.h * 0.65 && y2 - y1 <= Math.max(80, seedPx.h * 3.2);
  const expandedPx = verticalRunOk
    ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
    : { x: x1, y: seedPx.y, w: x2 - x1, h: seedPx.h };
  const expanded = pxToPtBox(expandedPx, image, slideSize, 0);
  if (expanded.w > slideSize.widthPt * 0.52 || expanded.h > slideSize.heightPt * 0.12) return null;
  return clampBox(expanded, slideSize);
}

/** @param {Raster} image @param {Box} seedPanel @param {SlideSize} slideSize @param {Rgba} fill */
function fitPanelFromConnectedColorRegion(image, seedPanel, slideSize, fill) {
  const seed = ptToPxBox(seedPanel, image, slideSize, 0);
  const margin = Math.max(12, Math.ceil(Math.max(seed.w, seed.h) * 1.8));
  const x0 = clamp(seed.x - margin, 0, image.width - 1);
  const y0 = clamp(seed.y - margin, 0, image.height - 1);
  const x1 = clamp(seed.x + seed.w + margin, x0 + 1, image.width);
  const y1 = clamp(seed.y + seed.h + margin, y0 + 1, image.height);
  const width = x1 - x0;
  const height = y1 - y0;
  if (width * height > 180_000) return null;
  const outside = sampleDominantRingColor(image, pxToPtBox({ x: x0, y: y0, w: width, h: height }, image, slideSize, 0), seedPanel, slideSize);
  const separation = outside ? colorDistance(fill, outside) : 0;
  if (separation < 22) return null;
  const tolerance = Math.min(50, separation / 3);
  const visited = new Uint8Array(width * height);
  let best = null;
  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const index = localY * width + localX;
      if (visited[index]) continue;
      const absoluteX = x0 + localX;
      const absoluteY = y0 + localY;
      if (!colorMatchesPanelFill(pixel(image, absoluteX, absoluteY), fill, tolerance)) {
        visited[index] = 1;
        continue;
      }
      const component = floodColorComponent(image, { x0, y0, width, height, startX: localX, startY: localY, visited, fill, tolerance });
      if (!component || component.count < 24 || !componentIntersects(component, seed, x0, y0)) continue;
      if (component.minX === 0 || component.minY === 0 || component.maxX === width - 1 || component.maxY === height - 1) continue;
      const score = component.count - Math.abs(component.width - seed.w) * 0.25 - Math.abs(component.height - seed.h) * 0.25;
      if (!best || score > best.score) best = { ...component, score };
    }
  }
  if (!best) return null;
  const fittedPx = { x: x0 + best.minX, y: y0 + best.minY, w: best.width, h: best.height };
  if (fittedPx.w < 8 || fittedPx.h < 8) return null;
  if (fittedPx.w > image.width * 0.36 || fittedPx.h > image.height * 0.18) return null;
  const fitted = pxToPtBox(fittedPx, image, slideSize, 0);
  if (fitted.w < 8 || fitted.h < 8 || fitted.w > slideSize.widthPt * 0.36 || fitted.h > slideSize.heightPt * 0.18) return null;
  const fittedArea = Math.max(1, fittedPx.w * fittedPx.h);
  const seedArea = Math.max(1, seed.w * seed.h);
  if (fittedArea < Math.max(24, seedArea * 0.04) || fittedArea > seedArea * 4.5) return null;
  return clampBox(fitted, slideSize);
}

/** @param {Raster} image @param {FloodColorOptions} options @returns {ColorComponent|null} */
function floodColorComponent(image, options) {
  const { x0, y0, width, height, startX, startY, visited, fill, tolerance } = options;
  /** @type {Array<[number, number]>} */
  const stack = [[startX, startY]];
  let count = 0;
  let minX = startX; let maxX = startX; let minY = startY; let maxY = startY;
  while (stack.length > 0) {
    const point = stack.pop();
    if (!point) continue;
    const [x, y] = point;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const index = y * width + x;
    if (visited[index]) continue;
    visited[index] = 1;
    if (!colorMatchesPanelFill(pixel(image, x0 + x, y0 + y), fill, tolerance)) continue;
    count += 1;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  if (count < 1) return null;
  return { count, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** @param {ColorComponent} component @param {Box} seed @param {number} x0 @param {number} y0 */
function componentIntersects(component, seed, x0, y0) {
  const left = x0 + component.minX;
  const top = y0 + component.minY;
  const right = x0 + component.maxX + 1;
  const bottom = y0 + component.maxY + 1;
  const overlap = Math.max(0, Math.min(right, seed.x + seed.w) - Math.max(left, seed.x))
    * Math.max(0, Math.min(bottom, seed.y + seed.h) - Math.max(top, seed.y));
  return overlap >= Math.max(1, Math.min(seed.w * seed.h, component.width * component.height) * 0.02);
}

/** @param {Rgba|null} color @param {Rgba} fill @param {number} [tolerance] */
function colorMatchesPanelFill(color, fill, tolerance = 50) {
  return Boolean(color && color.a >= 128 && colorDistance(color, fill) <= tolerance);
}

/** @param {Raster} image @param {Box} panel @param {SlideSize} slideSize @param {Rgba} fill */
/** @param {Raster} image @param {number} startX @param {number} yStart @param {number} yEnd @param {-1|1} direction @param {Rgba} fill */
function scanColorRunX(image, startX, yStart, yEnd, direction, fill) {
  let x = startX;
  let edge = startX;
  let misses = 0;
  while (x >= 0 && x < image.width) {
    if (colorBandMatches(image, x, yStart, yEnd, fill)) {
      edge = x;
      misses = 0;
    } else {
      misses += 1;
      if (misses > 3) break;
    }
    x += direction;
  }
  return direction < 0 ? Math.max(0, edge) : Math.min(image.width, edge + 1);
}

/** @param {Raster} image @param {number} startY @param {number} xStart @param {number} xEnd @param {-1|1} direction @param {Rgba} fill */
function scanColorRunY(image, startY, xStart, xEnd, direction, fill) {
  let y = startY;
  let edge = startY;
  let misses = 0;
  while (y >= 0 && y < image.height) {
    if (colorRowMatches(image, y, xStart, xEnd, fill)) {
      edge = y;
      misses = 0;
    } else {
      misses += 1;
      if (misses > 3) break;
    }
    y += direction;
  }
  return direction < 0 ? Math.max(0, edge) : Math.min(image.height, edge + 1);
}

/** @param {Raster} image @param {number} x @param {number} yStart @param {number} yEnd @param {Rgba} fill */
function colorBandMatches(image, x, yStart, yEnd, fill) {
  let hits = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor((yEnd - yStart) / 5));
  for (let y = yStart; y < yEnd; y += step) {
    samples += 1;
    const color = pixel(image, x, y);
    if (color && colorDistance(color, fill) <= 42) hits += 1;
  }
  return samples > 0 && hits / samples >= 0.46;
}

/** @param {Raster} image @param {number} y @param {number} xStart @param {number} xEnd @param {Rgba} fill */
function colorRowMatches(image, y, xStart, xEnd, fill) {
  let hits = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor((xEnd - xStart) / 18));
  for (let x = xStart; x < xEnd; x += step) {
    samples += 1;
    const color = pixel(image, x, y);
    if (color && colorDistance(color, fill) <= 42) hits += 1;
  }
  return samples > 0 && hits / samples >= 0.38;
}

/** @param {Raster} image @param {Box} box @param {SlideSize} slideSize @returns {PanelColorEvidence|null} */
function samplePanelColorEvidence(image, box, slideSize) {
  const inner = sampleDominantColor(image, box, slideSize, 3, 0.18, 0.18);
  if (!inner || inner.count < 8) return null;
  if (!isDistinctPanelColor(inner)) return null;
  const outerBox = {
    x: box.x - Math.max(4, box.w * 0.08),
    y: box.y - Math.max(3, box.h * 0.16),
    w: box.w + Math.max(8, box.w * 0.16),
    h: box.h + Math.max(6, box.h * 0.32)
  };
  const outer = sampleDominantRingColor(image, outerBox, box, slideSize);
  if (outer && colorDistance(inner, outer) < 22) return null;
  return {
    fill: inner,
    stroke: darken(inner, 0.88),
    strokeWidthPt: colorDistance(inner, { r: 255, g: 255, b: 255, a: 255 }) < 42 ? 0.6 : 0,
    distance: outer ? colorDistance(inner, outer) : 99
  };
}

/** @param {Raster} image @param {Box} box @param {SlideSize} slideSize @returns {PanelColorEvidence|null} */
function sampleNearbyPanelColorEvidence(image, box, slideSize) {
  const search = {
    x: box.x - Math.max(8, box.w * 0.45),
    y: box.y - Math.max(8, box.h * 1.8),
    w: box.w + Math.max(16, box.w * 0.9),
    h: box.h + Math.max(16, box.h * 5.2)
  };
  const color = sampleDominantSaturatedColor(image, search, slideSize);
  if (!color || !isDistinctPanelColor(color)) return null;
  const outer = sampleDominantRingColor(image, search, box, slideSize);
  if (outer && colorDistance(color, outer) < 22) return null;
  const fitBox = fitNearbyColorBox(image, search, slideSize, color);
  if (!fitBox) return null;
  const seedArea = Math.max(1, box.w * box.h);
  const fitArea = Math.max(1, fitBox.w * fitBox.h);
  if (fitArea > seedArea * 0.75) return null;
  if (fitBox.w > box.w * 0.8 && fitBox.h > box.h * 0.8) return null;
  return {
    fill: color,
    stroke: darken(color, 0.88),
    strokeWidthPt: colorDistance(color, { r: 255, g: 255, b: 255, a: 255 }) < 42 ? 0.6 : 0,
    distance: outer ? colorDistance(color, outer) : 99,
    fitBox
  };
}

/** @param {Raster} image @param {Box} search @param {SlideSize} slideSize @param {Rgba} fill */
function fitNearbyColorBox(image, search, slideSize, fill) {
  const px = ptToPxBox(search, image, slideSize, 0);
  let count = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let y = px.y; y < px.y + px.h; y += 1) {
    for (let x = px.x; x < px.x + px.w; x += 1) {
      if (!colorMatchesPanelFill(pixel(image, x, y), fill)) continue;
      count += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (count < 24 || !Number.isFinite(minX)) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (count / Math.max(1, width * height) < 0.52) return null;
  const box = pxToPtBox({ x: minX, y: minY, w: width, h: height }, image, slideSize, 0);
  if (box.w < 8 || box.h < 8 || box.w > slideSize.widthPt * 0.36 || box.h > slideSize.heightPt * 0.18) return null;
  return clampBox(box, slideSize);
}

/** @param {Raster} image @param {Box} box @param {SlideSize} slideSize */
function sampleDominantSaturatedColor(image, box, slideSize) {
  const px = ptToPxBox(box, image, slideSize, 0);
  const buckets = new Map();
  const step = Math.max(1, Math.ceil(Math.sqrt((px.w * px.h) / 1400)));
  for (let y = px.y; y < px.y + px.h; y += step) {
    for (let x = px.x; x < px.x + px.w; x += step) {
      const color = pixel(image, x, y);
      if (!color || color.a < 128 || saturationProxy(color) < 48 || brightness(color) < 36 || brightness(color) > 238) continue;
      addColorBucket(buckets, color);
    }
  }
  const winner = bucketWinner(buckets);
  if (!winner || winner.count < 4) return null;
  return winner;
}

/** @param {Raster} image @param {Box} box @param {SlideSize} slideSize @param {number} pad @param {number} insetXRatio @param {number} insetYRatio */
function sampleDominantColor(image, box, slideSize, pad, insetXRatio, insetYRatio) {
  const px = ptToPxBox(box, image, slideSize, pad);
  const insetX = Math.max(1, Math.floor(px.w * insetXRatio));
  const insetY = Math.max(1, Math.floor(px.h * insetYRatio));
  return dominantSample(image, px.x + insetX, px.y + insetY, Math.max(1, px.w - insetX * 2), Math.max(1, px.h - insetY * 2));
}

/** @param {Raster} image @param {Box} outer @param {Box} inner @param {SlideSize} slideSize */
function sampleDominantRingColor(image, outer, inner, slideSize) {
  const pxOuter = ptToPxBox(outer, image, slideSize, 0);
  const pxInner = ptToPxBox(inner, image, slideSize, 0);
  const buckets = new Map();
  const step = Math.max(1, Math.ceil(Math.sqrt((pxOuter.w * pxOuter.h) / 1200)));
  for (let y = pxOuter.y; y < pxOuter.y + pxOuter.h; y += step) {
    for (let x = pxOuter.x; x < pxOuter.x + pxOuter.w; x += step) {
      if (x >= pxInner.x && x <= pxInner.x + pxInner.w && y >= pxInner.y && y <= pxInner.y + pxInner.h) continue;
      addColorBucket(buckets, pixel(image, x, y));
    }
  }
  return bucketWinner(buckets);
}

/** @param {Raster} image @param {number} x0 @param {number} y0 @param {number} width @param {number} height */
function dominantSample(image, x0, y0, width, height) {
  const buckets = new Map();
  const step = Math.max(1, Math.ceil(Math.sqrt((width * height) / 900)));
  for (let y = y0; y < y0 + height; y += step) {
    for (let x = x0; x < x0 + width; x += step) addColorBucket(buckets, pixel(image, x, y));
  }
  return bucketWinner(buckets);
}


/** @param {Rgba & {count?: number}} color */
function isDistinctPanelColor(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const saturationProxy = max - min;
  const brightness = (color.r * 0.299) + (color.g * 0.587) + (color.b * 0.114);
  if (brightness > 253 || brightness < 24) return false;
  return saturationProxy >= 24 || (brightness < 215 && brightness > 40);
}


/** @param {Rgba} color @param {number} factor */
function darken(color, factor) {
  return {
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor)
  };
}

/** @param {unknown} line @returns {AxisLine | null} */
function normalizeLine(line) {
  if (!isRecord(line) || !isBox(line.box)) return null;
  const box = line.box;
  if (Math.abs(box.h) <= 0.5 && box.w >= 24) {
    return {
      axis: "h",
      a: round(box.y),
      start: round(Math.min(box.x, box.x + box.w)),
      end: round(Math.max(box.x, box.x + box.w)),
      style: isRecord(line.style) ? line.style : {},
      source: isRecord(line.source) ? line.source : {}
    };
  }
  if (Math.abs(box.w) <= 0.5 && box.h >= 24) {
    return {
      axis: "v",
      a: round(box.x),
      start: round(Math.min(box.y, box.y + box.h)),
      end: round(Math.max(box.y, box.y + box.h)),
      style: isRecord(line.style) ? line.style : {},
      source: isRecord(line.source) ? line.source : {}
    };
  }
  return null;
}

/** @param {AxisLine[]} lines @returns {AxisLineCluster[]} */
function clusterAxisLines(lines) {
  const sorted = lines.slice().sort((a, b) => a.a - b.a);
  /** @type {AxisLineCluster[]} */
  const clusters = [];
  for (const line of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(last.a - line.a) > POSITION_TOLERANCE_PT) {
      clusters.push({ ...line, members: [line] });
    } else {
      last.members.push(line);
      last.a = round(median(last.members.map((item) => item.a)));
      last.start = round(Math.min(...last.members.map((item) => item.start)));
      last.end = round(Math.max(...last.members.map((item) => item.end)));
      last.style = strongestStyle(last.members);
    }
  }
  return clusters;
}

/** @param {AxisLineCluster[]} lines @param {SlideSize} slideSize @returns {AxisLineCluster[][]} */
function groupLinesBySpan(lines, slideSize) {
  /** @type {AxisLineCluster[][]} */
  const groups = [];
  for (const line of lines.filter((item) => item.end - item.start >= slideSize.widthPt * 0.18).sort((a, b) => a.start - b.start)) {
    const match = groups.find((group) => {
      const span = mergeSpan(group);
      return Math.abs(span.x - line.start) <= 16 && Math.abs(span.x + span.w - line.end) <= 24;
    });
    if (match) match.push(line);
    else groups.push([line]);
  }
  return groups;
}

/** @param {TextBox[]} textBoxes @param {number} tolerance */
function clusterTextRows(textBoxes, tolerance) {
  /** @type {TextBox[][]} */
  const rows = [];
  for (const textBox of textBoxes) {
    const box = /** @type {Box} */ (textBox.box);
    const cy = box.y + box.h / 2;
    const row = rows.find((items) => {
      const centers = items.map((item) => {
        const itemBox = /** @type {Box} */ (item.box);
        return itemBox.y + itemBox.h / 2;
      });
      return Math.abs(median(centers) - cy) <= tolerance;
    });
    if (row) row.push(textBox);
    else rows.push([textBox]);
  }
  return rows;
}

/** @param {TextBox[]} row @param {number} gapThreshold */
function splitTextRowByHorizontalGaps(row, gapThreshold) {
  /** @type {TextBox[][]} */
  const groups = [];
  for (const textBox of row) {
    if (!isBox(textBox.box)) continue;
    const lastGroup = groups[groups.length - 1];
    const previous = lastGroup ? lastGroup[lastGroup.length - 1] : undefined;
    if (!previous || !isBox(previous.box)) {
      groups.push([textBox]);
      continue;
    }
    const gap = textBox.box.x - (previous.box.x + previous.box.w);
    if (gap > gapThreshold) groups.push([textBox]);
    else if (lastGroup) lastGroup.push(textBox);
  }
  return groups;
}

/** @param {TextBox[]} textBoxes */
function clusterCenteredStacks(textBoxes) {
  /** @type {TextBox[][]} */
  const stacks = [];
  for (const textBox of textBoxes) {
    if (!isBox(textBox.box)) continue;
    const box = textBox.box;
    const cx = box.x + box.w / 2;
    const stack = stacks.find((items) => {
      const centers = items.map((item) => {
        const itemBox = /** @type {Box} */ (item.box);
        return itemBox.x + itemBox.w / 2;
      });
      const last = items[items.length - 1];
      if (!last || !isBox(last.box)) return false;
      const yGap = box.y - (last.box.y + last.box.h);
      return Math.abs(median(centers) - cx) <= 22 && yGap >= 8 && yGap <= 48;
    });
    if (stack) stack.push(textBox);
    else stacks.push([textBox]);
  }
  return stacks;
}

/** @param {TextBox[][]} rows @param {SlideSize} slideSize */
function clusterTextPanelRows(rows, slideSize) {
  /** @type {TextBox[][][]} */
  const groups = [];
  for (const row of rows) {
    const span = rowSpan(row);
    if (!span || span.w < slideSize.widthPt * 0.08 || span.w > slideSize.widthPt * 0.42) continue;
    const rowCenter = span.y + span.h / 2;
    const match = groups.find((group) => {
      const groupSpan = rowSpan(group.flat());
      if (!groupSpan) return false;
      const lastRow = group[group.length - 1];
      const lastSpan = lastRow ? rowSpan(lastRow) : null;
      if (!lastSpan) return false;
      const lastCenter = lastSpan.y + lastSpan.h / 2;
      const verticalGap = rowCenter - lastCenter;
      const startsNewColoredHeader = group.length >= 3 && verticalGap >= 24 && rowHasLightHeaderText(row);
      const leftAligned = Math.abs(span.x - groupSpan.x) <= Math.max(24, groupSpan.w * 0.18);
      const rightAligned = Math.abs((span.x + span.w) - (groupSpan.x + groupSpan.w)) <= Math.max(32, groupSpan.w * 0.24);
      const centerAligned = Math.abs((span.x + span.w / 2) - (groupSpan.x + groupSpan.w / 2)) <= Math.max(26, groupSpan.w * 0.18);
      return !startsNewColoredHeader && verticalGap >= 8 && verticalGap <= 48 && (leftAligned || rightAligned || centerAligned);
    });
    if (match) match.push(row);
    else groups.push([row]);
  }
  return groups.filter((group) => {
    if (group.length < 3) return false;
    const span = rowSpan(group.flat());
    if (!span) return false;
    const rowSpans = group.map((row) => rowSpan(row)).filter(Boolean).map((box) => /** @type {Box} */ (box));
    const centers = rowSpans.map((box) => box.x + box.w / 2);
    const medianCenter = median(centers);
    const alignedRows = rowSpans.filter((box) => Math.abs((box.x + box.w / 2) - medianCenter) <= Math.max(28, span.w * 0.22)).length;
    return alignedRows >= Math.ceil(group.length * 0.72);
  });
}

/** @param {TextBox[][]} rows @param {SlideSize} slideSize */
function clusterMatrixRows(rows, slideSize) {
  /** @type {TextBox[][][]} */
  const groups = [];
  for (const row of rows) {
    const span = rowSpan(row);
    if (!span || span.w < slideSize.widthPt * 0.12 || span.w > slideSize.widthPt * 0.55) continue;
    const rowCenter = span.y + span.h / 2;
    const match = groups.find((group) => {
      const groupSpan = rowSpan(group.flat());
      if (!groupSpan) return false;
      const groupRows = group.map((items) => rowSpan(items)).filter(Boolean);
      const centers = groupRows.map((box) => /** @type {Box} */ (box).y + /** @type {Box} */ (box).h / 2);
      const lastCenter = centers[centers.length - 1];
      if (lastCenter === undefined) return false;
      const xAligned = Math.abs(groupSpan.x - span.x) <= Math.max(22, groupSpan.w * 0.18)
        && Math.abs((groupSpan.x + groupSpan.w) - (span.x + span.w)) <= Math.max(28, groupSpan.w * 0.22);
      return xAligned && rowCenter > lastCenter && rowCenter - lastCenter >= 12 && rowCenter - lastCenter <= 86;
    });
    if (match) match.push(row);
    else groups.push([row]);
  }
  return groups.filter((group) => group.length >= 5 && stableMatrixColumnCount(group));
}

/** @param {TextBox[][]} group */
function stableMatrixColumnCount(group) {
  const counts = group.map((row) => row.length).sort((a, b) => a - b);
  const medianCount = counts[Math.floor(counts.length / 2)] || 0;
  return medianCount >= 3 && group.filter((row) => Math.abs(row.length - medianCount) <= 1).length >= Math.ceil(group.length * 0.72);
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createLeadingIconSwatches(textBoxes, slideSize, image, existing) {
  if (!image) return [];
  /** @type {Shape[]} */
  const shapes = [];
  const sorted = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const text = String(textBox.text || "").trim();
      const box = /** @type {Box} */ (textBox.box);
      return text.length >= 2
        && text.length <= 32
        && box.x >= slideSize.widthPt * 0.08
        && box.x <= slideSize.widthPt * 0.92
        && box.h >= 7
        && box.h <= 28;
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  for (const textBox of sorted) {
    const box = /** @type {Box} */ (textBox.box);
    const size = Math.max(12, Math.min(26, box.h * 1.65));
    const swatch = clampBox({
      x: box.x - size - Math.max(5, Math.min(12, box.h * 0.65)),
      y: box.y + box.h / 2 - size / 2,
      w: size,
      h: size
    }, slideSize);
    if (!swatch || swatch.x <= 2 || swatch.w < 10 || swatch.h < 10) continue;
    if (existing.some((shape) => blocksLeadingIconSwatch(shape) && overlapRatio(shape.box, swatch) > 0.32)
      || shapes.some((shape) => overlapRatio(shape.box, swatch) > 0.32)) continue;
    const evidence = iconSwatchEvidence(image, swatch, slideSize);
    if (!evidence) continue;
    const evidenceSwatch = evidence.box || swatch;
    const primitive = sourceIconPrimitiveEvidence({ image, fill: evidence.fill, pixelBox: ptToPxBox(evidenceSwatch, image, slideSize, 0) });
    if (!primitive) continue;
    const primitiveBox = pxToPtBox(primitive.pixelBox, image, slideSize, 0);
    const base = nativeRect(`line-text-leading-icon-swatch-${shapes.length + 1}`, primitiveBox, "line-text-native-leading-icon-swatch", {
      fill: evidence.fill,
      stroke: evidence.stroke,
      strokeWidthPt: 0.25,
      radiusPt: 0,
      opacity: 1
    }, { textCount: 1, fittedToColorBounds: evidenceSwatch !== swatch, sourcePrimitiveEvidence: primitive });
    base.type = primitive.type;
    shapes.push(base);
    for (const lightDetail of evidence.lightDetails || []) {
      shapes.push(nativeRect(`line-text-leading-icon-swatch-mark-${shapes.length + 1}`, lightDetail, "line-text-native-leading-icon-swatch", {
        fill: "#FFFFFF",
        stroke: "#FFFFFF",
        strokeWidthPt: 0,
        radiusPt: Math.max(0.4, Math.min(1.4, lightDetail.h * 0.18)),
        opacity: 0.92
      }, { textCount: 0, iconDetail: true }));
    }
    if (shapes.length >= 48) return dedupeShapes(shapes);
  }
  return dedupeShapes(shapes);
}

/** @param {Shape} shape */
function blocksLeadingIconSwatch(shape) {
  const detector = String(isRecord(shape.source) ? shape.source.detector || "" : "");
  return detector !== "line-text-native-color-panel";
}

/** @param {Raster} image @param {Box} swatch @param {SlideSize} slideSize */
function iconSwatchEvidence(image, swatch, slideSize) {
  const px = ptToPxBox(swatch, image, slideSize, 0);
  const colors = samplePxArea(image, insetPx(px, 1));
  const saturated = colors.filter((color) => saturationProxy(color) >= 58 && brightness(color) >= 42 && brightness(color) <= 230);
  if (saturated.length < colors.length * 0.28) return null;
  const dominant = dominantColor(saturated, 18);
  if (!dominant) return null;
  const outside = averageColor(sampleOutsideFrame(image, px, 2));
  if (outside && colorDistance(dominant, outside) < 32) return null;
  const colorBounds = saturatedColorBounds(image, px, dominant);
  const fittedBox = colorBounds ? pxToPtBox(colorBounds, image, slideSize, 0) : null;
  const boundedBox = fittedBox
    && fittedBox.w >= Math.max(8, swatch.w * 0.45)
    && fittedBox.h >= Math.max(8, swatch.h * 0.45)
    && fittedBox.w <= swatch.w * 1.18
    && fittedBox.h <= swatch.h * 1.18
    ? clampBox(fittedBox, slideSize)
    : null;
  const detailSwatch = boundedBox || swatch;
  const detailPx = boundedBox ? ptToPxBox(boundedBox, image, slideSize, 0) : px;
  const details = lightDetailBoxes(image, detailPx, detailSwatch, slideSize, dominant);
  const fallbackDetails = details.length > 0 || detailSwatch === swatch ? details : lightDetailBoxes(image, px, swatch, slideSize, dominant);
  const broadLightDetails = fallbackDetails.length > 0 ? fallbackDetails : broadLightDetailBoxes(image, detailPx, detailSwatch, slideSize, dominant);
  return {
    fill: rgbToHex(dominant),
    stroke: rgbToHex(dominant),
    box: boundedBox,
    lightDetails: broadLightDetails
  };
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} px @param {Rgba} dominant */
function saturatedColorBounds(image, px, dominant) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, count = 0;
  const startX = clamp(Math.floor(px.x), 0, image.width);
  const endX = clamp(Math.ceil(px.x + px.w), startX, image.width);
  const startY = clamp(Math.floor(px.y), 0, image.height);
  const endY = clamp(Math.ceil(px.y + px.h), startY, image.height);
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      const color = {
        r: image.rgba[offset] ?? 0,
        g: image.rgba[offset + 1] ?? 0,
        b: image.rgba[offset + 2] ?? 0,
        a: image.rgba[offset + 3] ?? 0
      };
      if (color.a < 64 || saturationProxy(color) < 50 || brightness(color) < 36 || brightness(color) > 238 || colorDistance(color, dominant) > 54) continue;
      x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + 1); y2 = Math.max(y2, y + 1); count += 1;
    }
  }
  if (count < Math.max(24, px.w * px.h * 0.16) || !Number.isFinite(x1) || !Number.isFinite(y1)) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** @param {TextBox[][]} group @param {SlideSize} slideSize */
function inferMatrixColumns(group, slideSize) {
  const centers = group.flat().map((textBox) => {
    const box = /** @type {Box} */ (textBox.box);
    return box.x + box.w / 2;
  }).sort((a, b) => a - b);
  /** @type {number[]} */
  const clustered = [];
  for (const center of centers) {
    const last = clustered[clustered.length - 1];
    if (last === undefined || Math.abs(last - center) > 42) clustered.push(center);
    else clustered[clustered.length - 1] = (last + center) / 2;
  }
  if (clustered.length < 3 || clustered.length > 5) return [];
  const all = rowSpan(group.flat());
  if (!all) return [];
  const left = Math.max(0, all.x - 12);
  const right = Math.min(slideSize.widthPt, all.x + all.w + 12);
  /** @type {Box[]} */
  const columns = [];
  for (let index = 0; index < clustered.length; index += 1) {
    const center = clustered[index];
    if (center === undefined) continue;
    const previous = clustered[index - 1];
    const next = clustered[index + 1];
    const x1 = previous === undefined ? left : (previous + center) / 2;
    const x2 = next === undefined ? right : (center + next) / 2;
    const box = clampBox({ x: x1, y: all.y, w: x2 - x1, h: all.h }, slideSize);
    if (box) columns.push(box);
  }
  return columns.filter((column) => column.w >= 24);
}

/** @param {TextBox[][]} group @param {SlideSize} slideSize */
function inferRowBounds(group, slideSize) {
  const spans = group.map((row) => rowSpan(row)).filter(Boolean).map((box) => /** @type {Box} */ (box));
  /** @type {Box[]} */
  const rows = [];
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (!span) continue;
    const previous = spans[index - 1];
    const next = spans[index + 1];
    const center = span.y + span.h / 2;
    const previousCenter = previous ? previous.y + previous.h / 2 : center - Math.max(18, span.h * 1.7);
    const nextCenter = next ? next.y + next.h / 2 : center + Math.max(18, span.h * 1.7);
    const y1 = (previousCenter + center) / 2;
    const y2 = (center + nextCenter) / 2;
    const row = clampBox({ x: span.x, y: y1, w: span.w, h: y2 - y1 }, slideSize);
    if (row) rows.push(row);
  }
  return rows;
}

/** @param {TextBox[]} row @param {number} columnIndex */
function matrixStrokeColor(row, columnIndex) {
  const item = row[columnIndex] || row[0];
  const color = item ? textColor(item) : "";
  if (!color) return "#D7DEE8";
  const parsed = parseHexColor(color);
  if (!parsed) return "#D7DEE8";
  if (brightness(parsed) >= 190 && saturationProxy(parsed) <= 34) return color;
  return "#D7DEE8";
}

/** @param {TextBox[]} textBoxes */
function dominantTextColor(textBoxes) {
  const counts = new Map();
  for (const item of textBoxes) {
    const color = textColor(item);
    if (!color) continue;
    if (colorDistance(hexToRgb(color), { r: 255, g: 255, b: 255, a: 255 }) < 18) continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

/** @param {TextBox[]} textBoxes */
function rowHasLightHeaderText(textBoxes) {
  if (textBoxes.length === 0) return false;
  const light = textBoxes.filter((item) => {
    const color = textColor(item);
    return color && colorDistance(hexToRgb(color), { r: 255, g: 255, b: 255, a: 255 }) <= 36;
  }).length;
  return light >= Math.max(1, Math.ceil(textBoxes.length * 0.5));
}

/** @param {TextBox[]} textBoxes */
function rowSpan(textBoxes) {
  if (textBoxes.length === 0) return null;
  const boxes = textBoxes.map((item) => /** @type {Box} */ (item.box));
  const x1 = Math.min(...boxes.map((box) => box.x));
  const x2 = Math.max(...boxes.map((box) => box.x + box.w));
  const y1 = Math.min(...boxes.map((box) => box.y));
  const y2 = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** @param {AxisLine[]} lines */
function mergeSpan(lines) {
  const start = median(lines.map((line) => line.start));
  const end = median(lines.map((line) => line.end));
  return { x: round(start), w: round(Math.max(0, end - start)) };
}

module.exports = {
  expandPanelFromColorRun,
  fitPanelFromConnectedColorRegion,
  samplePanelColorEvidence,
  sampleNearbyPanelColorEvidence,
  sampleDominantColor,
  sampleDominantRingColor,
  isDistinctPanelColor,
  darken,
  normalizeLine,
  clusterAxisLines,
  groupLinesBySpan,
  clusterTextRows,
  splitTextRowByHorizontalGaps,
  clusterCenteredStacks,
  clusterTextPanelRows,
  clusterMatrixRows,
  createLeadingIconSwatches,
  inferMatrixColumns,
  inferRowBounds,
  matrixStrokeColor,
  dominantTextColor,
  rowSpan,
  mergeSpan
};
