"use strict";
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
/** @typedef {{x0:number,y0:number,width:number,height:number,startX:number,startY:number,visited:Uint8Array,fill:Rgba}} FloodColorOptions */

/** @param {Rgba} color */
function brightness(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

/** @param {Rgba} color */
function saturationProxy(color) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

/** @param {Box} left @param {Box} right */
function intersectionArea(left, right) {
  return Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
}

/** @param {Map<string, {count:number,r:number,g:number,b:number}>} buckets @param {Rgba|null} color */
function addColorBucket(buckets, color) {
  if (!color || color.a < 128) return;
  const key = `${Math.round(color.r / 12)},${Math.round(color.g / 12)},${Math.round(color.b / 12)}`;
  const item = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
  item.count += 1;
  item.r += color.r;
  item.g += color.g;
  item.b += color.b;
  buckets.set(key, item);
}

/** @param {Map<string, {count:number,r:number,g:number,b:number}>} buckets */
function bucketWinner(buckets) {
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < 4) return null;
  return {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count),
    a: 255,
    count: dominant.count
  };
}

/** @param {Rgba} a @param {Rgba} b */
function colorDistance(a, b) {
  return Math.sqrt(((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2));
}

/** @param {string} id @param {Box} box @param {string} detector @param {Record<string, unknown>} style @param {Record<string, unknown>} extra */
function nativeRect(id, box, detector, style, extra) {
  const radiusPt = Number(style.radiusPt);
  const roundedDetector = /(?:badge|card|card-row|color-panel|stack-bar|swatch)$/u.test(detector);
  return {
    id,
    type: roundedDetector && Number.isFinite(radiusPt) && radiusPt > 0 ? "roundRect" : "rect",
    box: roundBox(box),
    style,
    source: {
      editable: true,
      nativeRebuild: true,
      detector,
      semanticNativeStructure: true,
      nativeComponentArchetype: "line-text-layout",
      nativeComponentRole: detector.endsWith("cell") ? "table-cell" : "section-panel",
      ...extra
    }
  };
}

/** @param {string} id @param {AxisLine} line @param {string} detector */
function nativeLine(id, line, detector) {
  return {
    id,
    type: "line",
    box: line.axis === "h"
      ? { x: round(line.start), y: round(line.a), w: round(Math.max(0.1, line.end - line.start)), h: 0 }
      : { x: round(line.a), y: round(line.start), w: 0, h: round(Math.max(0.1, line.end - line.start)) },
    style: {
      stroke: typeof line.style.stroke === "string" ? line.style.stroke : "#D7DEE8",
      strokeWidthPt: Number.isFinite(Number(line.style.strokeWidthPt)) ? Math.max(0.4, Math.min(2.4, Number(line.style.strokeWidthPt))) : 0.8,
      connectorType: "straight"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector,
      semanticNativeStructure: true,
      nativeComponentArchetype: "line-text-layout",
      nativeComponentRole: "grid-rule"
    }
  };
}

/** @param {Raster|null} image @param {Box} box @param {SlideSize} slideSize @param {string} fallback */
function sampleBoxFill(image, box, slideSize, fallback) {
  if (!image) return fallback;
  const px = ptToPxBox(box, image, slideSize, 4);
  const buckets = new Map();
  const step = Math.max(1, Math.ceil(Math.sqrt((px.w * px.h) / 900)));
  const insetX = Math.max(1, Math.floor(px.w * 0.08));
  const insetY = Math.max(1, Math.floor(px.h * 0.12));
  for (let y = px.y + insetY; y < px.y + px.h - insetY; y += step) {
    for (let x = px.x + insetX; x < px.x + px.w - insetX; x += step) {
      const color = pixel(image, x, y);
      if (!color || color.a < 128) continue;
      const key = `${Math.round(color.r / 12)},${Math.round(color.g / 12)},${Math.round(color.b / 12)}`;
      const item = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      item.count += 1;
      item.r += color.r;
      item.g += color.g;
      item.b += color.b;
      buckets.set(key, item);
    }
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < 6) return fallback;
  return rgbToHex({
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count)
  });
}

/** @param {Raster|null} image @param {Box} box @param {SlideSize} slideSize @param {string} fallback */
function samplePanelBackgroundFill(image, box, slideSize, fallback) {
  if (!image) return fallback;
  const px = ptToPxBox(box, image, slideSize, 3);
  const band = Math.max(2, Math.min(10, Math.floor(Math.min(px.w, px.h) * 0.08)));
  const inset = Math.max(2, Math.min(8, Math.floor(Math.min(px.w, px.h) * 0.05)));
  /** @type {Map<string, {count:number,r:number,g:number,b:number}>} */
  const buckets = new Map();
  const step = Math.max(1, Math.ceil(Math.sqrt((px.w * px.h) / 1400)));
  const xStart = px.x + inset;
  const yStart = px.y + inset;
  const xEnd = px.x + px.w - inset;
  const yEnd = px.y + px.h - inset;
  for (let y = yStart; y < yEnd; y += step) {
    for (let x = xStart; x < xEnd; x += step) {
      const nearHorizontalEdge = y < yStart + band || y >= yEnd - band;
      const nearVerticalEdge = x < xStart + band || x >= xEnd - band;
      if (!nearHorizontalEdge && !nearVerticalEdge) continue;
      addColorBucket(buckets, pixel(image, x, y));
    }
  }
  const winner = bucketWinner(buckets);
  if (!winner || winner.count < 6) return sampleBoxFill(image, box, slideSize, fallback);
  const sampled = rgbToHex(winner);
  if (colorDistance(winner, { r: 255, g: 255, b: 255, a: 255 }) < 5) return sampleBoxFill(image, box, slideSize, fallback);
  return sampled;
}

/** @param {Raster|null} image @param {Box} box @param {SlideSize} slideSize @param {string} fill @param {number} [colorTolerance] */
function panelFillMatchesInterior(image, box, slideSize, fill, colorTolerance = 46) {
  if (!Number.isFinite(colorTolerance) || colorTolerance < 0 || colorTolerance > 46) return false;
  if (!image) return true;
  const fillColor = parseHexColor(fill);
  if (!fillColor) return true;
  const px = ptToPxBox(box, image, slideSize, 4);
  const insetX = Math.max(2, Math.floor(px.w * 0.18));
  const insetY = Math.max(2, Math.floor(px.h * 0.2));
  const xStart = px.x + insetX;
  const xEnd = px.x + px.w - insetX;
  const yStart = px.y + insetY;
  const yEnd = px.y + px.h - insetY;
  if (xEnd <= xStart || yEnd <= yStart) return true;
  const step = Math.max(1, Math.ceil(Math.sqrt((px.w * px.h) / 1200)));
  let samples = 0;
  let matches = 0;
  let brightMismatches = 0;
  for (let y = yStart; y < yEnd; y += step) {
    for (let x = xStart; x < xEnd; x += step) {
      const color = pixel(image, x, y);
      if (!color || color.a < 128) continue;
      samples += 1;
      const distance = colorDistance(color, fillColor);
      if (distance <= colorTolerance) matches += 1;
      else if (brightness(color) >= 150) brightMismatches += 1;
    }
  }
  if (samples < 8) return true;
  if (brightMismatches / samples >= 0.1) return false;
  return matches / samples >= 0.58;
}

/** @param {{x:number,y:number,w:number,h:number}} box @param {number} inset */
function insetPx(box, inset) {
  const safe = Math.max(0, Math.floor(inset));
  return {
    x: box.x + safe,
    y: box.y + safe,
    w: Math.max(1, box.w - safe * 2),
    h: Math.max(1, box.h - safe * 2)
  };
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} box */
function samplePxArea(image, box) {
  /** @type {Rgba[]} */
  const result = [];
  const step = Math.max(1, Math.ceil(Math.sqrt((box.w * box.h) / 360)));
  for (let y = box.y; y < box.y + box.h; y += step) {
    for (let x = box.x; x < box.x + box.w; x += step) {
      const color = pixel(image, x, y);
      if (color && color.a >= 128) result.push(color);
    }
  }
  return result;
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} box @param {number} margin */
function sampleOutsideFrame(image, box, margin) {
  const safe = Math.max(1, Math.floor(margin));
  const outer = {
    x: Math.max(0, box.x - safe),
    y: Math.max(0, box.y - safe),
    w: Math.min(image.width, box.x + box.w + safe) - Math.max(0, box.x - safe),
    h: Math.min(image.height, box.y + box.h + safe) - Math.max(0, box.y - safe)
  };
  /** @type {Rgba[]} */
  const result = [];
  const step = Math.max(1, Math.ceil(Math.sqrt((outer.w * outer.h) / 420)));
  for (let y = outer.y; y < outer.y + outer.h; y += step) {
    for (let x = outer.x; x < outer.x + outer.w; x += step) {
      if (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) continue;
      const color = pixel(image, x, y);
      if (color && color.a >= 128) result.push(color);
    }
  }
  return result;
}

/** @param {Rgba[]} colors */
function averageColor(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  const total = colors.reduce((sum, color) => ({
    r: sum.r + color.r,
    g: sum.g + color.g,
    b: sum.b + color.b,
    a: sum.a + color.a
  }), { r: 0, g: 0, b: 0, a: 0 });
  return {
    r: Math.round(total.r / colors.length),
    g: Math.round(total.g / colors.length),
    b: Math.round(total.b / colors.length),
    a: Math.round(total.a / colors.length)
  };
}

/** @param {Rgba[]} colors @param {number} bucketSize */
function dominantColor(colors, bucketSize) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  const size = Math.max(4, Math.floor(bucketSize));
  /** @type {Map<string, {count:number,r:number,g:number,b:number,a:number}>} */
  const buckets = new Map();
  for (const color of colors) {
    const key = `${Math.round(color.r / size)},${Math.round(color.g / size)},${Math.round(color.b / size)}`;
    const item = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, a: 0 };
    item.count += 1;
    item.r += color.r;
    item.g += color.g;
    item.b += color.b;
    item.a += color.a;
    buckets.set(key, item);
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!best || best.count < Math.max(3, colors.length * 0.12)) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
    a: Math.round(best.a / best.count)
  };
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} px @param {Box} swatch @param {SlideSize} slideSize @param {Rgba} fill */
function lightDetailBox(image, px, swatch, slideSize, fill) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (let y = px.y + 1; y < px.y + px.h - 1; y += 1) {
    for (let x = px.x + 1; x < px.x + px.w - 1; x += 1) {
      const color = pixel(image, x, y);
      if (!color || color.a < 128) continue;
      if (brightness(color) < 205 || colorDistance(color, fill) < 70) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }
  if (count < Math.max(4, px.w * px.h * 0.035) || !Number.isFinite(minX)) return null;
  const detailPx = { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
  if (detailPx.w > px.w * 0.74 || detailPx.h > px.h * 0.74) return null;
  const pt = pxToPtBox(detailPx, image, slideSize, 0);
  return clampBox({
    x: Math.max(swatch.x + swatch.w * 0.18, pt.x),
    y: Math.max(swatch.y + swatch.h * 0.18, pt.y),
    w: Math.min(swatch.w * 0.58, pt.w),
    h: Math.min(swatch.h * 0.58, pt.h)
  }, slideSize);
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} px @param {Box} swatch @param {SlideSize} slideSize @param {Rgba} fill @returns {Box[]} */
function lightDetailBoxes(image, px, swatch, slideSize, fill) {
  const single = lightDetailBox(image, px, swatch, slideSize, fill);
  if (single) return [single];
  const startX = Math.max(0, Math.floor(px.x + 1));
  const endX = Math.min(image.width, Math.ceil(px.x + px.w - 1));
  const startY = Math.max(0, Math.floor(px.y + 1));
  const endY = Math.min(image.height, Math.ceil(px.y + px.h - 1));
  const width = Math.max(0, endX - startX);
  const height = Math.max(0, endY - startY);
  if (width < 3 || height < 3 || width * height > 20000) return [];
  const mask = new Uint8Array(width * height);
  let lightPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let marked = false;
      for (let dy = -1; dy <= 1 && !marked; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const color = pixel(image, startX + x + dx, startY + y + dy);
          if (!color || color.a < 128) continue;
          if (brightness(color) >= 205 && colorDistance(color, fill) >= 70) {
            marked = true;
            break;
          }
        }
      }
      if (marked) {
        mask[y * width + x] = 1;
        lightPixels += 1;
      }
    }
  }
  if (lightPixels < Math.max(5, width * height * 0.018)) return [];
  const visited = new Uint8Array(width * height);
  /** @type {Array<Box & {count:number}>} */
  const components = [];
  /** @type {number[]} */
  const queue = [];
  for (let offset = 0; offset < mask.length; offset += 1) {
    if (!mask[offset] || visited[offset]) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
    queue.length = 0;
    queue.push(offset);
    visited[offset] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = /** @type {number} */ (queue[cursor]);
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    if (count < 3 || componentWidth < 1 || componentHeight < 1) continue;
    if (componentWidth > width * 0.92 || componentHeight > height * 0.98) continue;
    components.push({ x: startX + minX, y: startY + minY, w: componentWidth, h: componentHeight, count });
  }
  return components
    .sort((a, b) => b.count - a.count)
    .slice(0, 18)
    .map((component) => {
      const pt = pxToPtBox(component, image, slideSize, 0);
      return clampBox({
        x: Math.max(swatch.x + swatch.w * 0.04, pt.x),
        y: Math.max(swatch.y + swatch.h * 0.04, pt.y),
        w: Math.min(swatch.w * 0.9, Math.max(0.45, pt.w)),
        h: Math.min(swatch.h * 0.92, Math.max(0.45, pt.h))
      }, slideSize);
    })
    .filter(isBox);
}

/** @param {Raster} image @param {{x:number,y:number,w:number,h:number}} px @param {Box} swatch @param {SlideSize} slideSize @param {Rgba} fill */
function broadLightDetailBoxes(image, px, swatch, slideSize, fill) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
  const startX = Math.max(0, Math.floor(px.x));
  const endX = Math.min(image.width, Math.ceil(px.x + px.w));
  const startY = Math.max(0, Math.floor(px.y));
  const endY = Math.min(image.height, Math.ceil(px.y + px.h));
  const area = Math.max(1, (endX - startX) * (endY - startY));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const color = pixel(image, x, y);
      if (!color || color.a < 128) continue;
      if (brightness(color) < 205 || colorDistance(color, fill) < 70) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1;
    }
  }
  if (count < Math.max(12, area * 0.18) || !Number.isFinite(minX)) return [];
  const detailPx = { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
  if (detailPx.w > (endX - startX) * 0.94 || detailPx.h > (endY - startY) * 1.02) return [];
  const pt = pxToPtBox(detailPx, image, slideSize, 0);
  const detail = clampBox({
    x: Math.max(swatch.x, pt.x),
    y: Math.max(swatch.y, pt.y),
    w: Math.min(swatch.w, Math.max(0.7, pt.w)),
    h: Math.min(swatch.h, Math.max(0.7, pt.h))
  }, slideSize);
  return detail ? [detail] : [];
}

/** @param {Raster} image @param {number} x @param {number} y @returns {Rgba | null} */
function pixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  return { r: image.rgba[offset] ?? 0, g: image.rgba[offset + 1] ?? 0, b: image.rgba[offset + 2] ?? 0, a: image.rgba[offset + 3] ?? 0 };
}

/** @param {Box} box @param {Raster} image @param {SlideSize} slideSize @param {number} pad */
function ptToPxBox(box, image, slideSize, pad) {
  const sx = image.width / slideSize.widthPt;
  const sy = image.height / slideSize.heightPt;
  const x = clamp(Math.floor(box.x * sx) + pad, 0, image.width - 1);
  const y = clamp(Math.floor(box.y * sy) + pad, 0, image.height - 1);
  const x2 = clamp(Math.ceil((box.x + box.w) * sx) - pad, x + 1, image.width);
  const y2 = clamp(Math.ceil((box.y + box.h) * sy) - pad, y + 1, image.height);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** @param {Box} box @param {Raster} image @param {SlideSize} slideSize @param {number} pad */
function pxToPtBox(box, image, slideSize, pad) {
  const sx = slideSize.widthPt / image.width;
  const sy = slideSize.heightPt / image.height;
  return {
    x: (box.x + pad) * sx,
    y: (box.y + pad) * sy,
    w: Math.max(1, box.w - pad * 2) * sx,
    h: Math.max(1, box.h - pad * 2) * sy
  };
}

/** @param {unknown} box @param {Box} outer */
function centerInside(box, outer) {
  if (!isBox(box)) return false;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

/** @param {Box|unknown} a @param {Box} b */
function overlapRatio(a, b) {
  if (!isBox(a)) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return area / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

/** @param {Box|unknown} a @param {Box|unknown} b @param {number} overlapThreshold @param {number} areaThreshold */
function similarBoxOverlap(a, b, overlapThreshold, areaThreshold) {
  if (!isBox(a) || !isBox(b)) return false;
  const minArea = Math.min(boxArea(a), boxArea(b));
  const maxArea = Math.max(boxArea(a), boxArea(b));
  return overlapRatio(a, b) >= overlapThreshold && minArea / Math.max(1, maxArea) >= areaThreshold;
}

/** @param {Box} box */
function boxArea(box) {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

/** @param {number[]} values @param {number} tolerance */
function uniquePositions(values, tolerance) {
  /** @type {number[]} */
  const positions = [];
  for (const value of values.slice().sort((a, b) => a - b)) {
    const previous = positions[positions.length - 1];
    if (previous === undefined || Math.abs(previous - value) > tolerance) positions.push(round(value));
  }
  return positions;
}

/** @param {AxisLine[]} lines */
function strongestStyle(lines) {
  return lines.slice().sort((a, b) => Number(b.style.strokeWidthPt || 0) - Number(a.style.strokeWidthPt || 0))[0]?.style || {};
}

/** @param {AxisLine[]} lines */
function cardStrokeColor(lines) {
  const style = strongestStyle(lines);
  return typeof style.stroke === "string" ? style.stroke : "#D7DEE8";
}

/** @param {AxisLine[]} lines */
function cardStrokeWidth(lines) {
  const width = Number(strongestStyle(lines).strokeWidthPt);
  return Number.isFinite(width) ? Math.max(0.4, Math.min(2.5, width)) : 0.8;
}

/** @param {TextBox} textBox */
function textColor(textBox) {
  const font = isRecord(textBox.font) ? textBox.font : {};
  const style = isRecord(textBox.style) ? textBox.style : {};
  for (const value of [font.color, style.color, style.stroke]) {
    if (typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)) return value.toUpperCase();
  }
  return "";
}

/** @param {string} color */
function isBlueLikeHex(color) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color);
  if (!match) return false;
  const [, red = "00", green = "00", blue = "00"] = match;
  const r = Number.parseInt(red, 16);
  const g = Number.parseInt(green, 16);
  const b = Number.parseInt(blue, 16);
  return b >= 150 && b > r + 40 && b >= g + 8;
}

/** @param {string} color @returns {Rgba | null} */
function parseHexColor(color) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color);
  if (!match) return null;
  const [, red = "00", green = "00", blue = "00"] = match;
  return {
    r: Number.parseInt(red, 16),
    g: Number.parseInt(green, 16),
    b: Number.parseInt(blue, 16),
    a: 255
  };
}

/** @param {Shape[]} shapes */
function dedupeShapes(shapes) {
  const seen = new Set();
  /** @type {Shape[]} */
  const kept = [];
  for (const shape of shapes) {
    const box = isBox(shape.box) ? shape.box : null;
    const detector = shape.source && isRecord(shape.source) ? String(shape.source.detector || "") : "";
    const key = `${shape.type}:${detector}:${box ? [box.x, box.y, box.w, box.h].map((value) => Math.round(value * 10) / 10).join(",") : ""}`;
    if (seen.has(key)) continue;
    if (detector === "line-text-native-card-row" && box && kept.some((item) => isDuplicateCardRowShape(item, box))) continue;
    seen.add(key);
    kept.push(shape);
  }
  return kept;
}

/** @param {Shape} existing @param {Box} candidate */
function isDuplicateCardRowShape(existing, candidate) {
  const detector = existing.source && isRecord(existing.source) ? String(existing.source.detector || "") : "";
  if (detector !== "line-text-native-card-row" || !isBox(existing.box)) return false;
  const overlap = intersectionArea(existing.box, candidate);
  const minArea = Math.min(boxArea(existing.box), boxArea(candidate));
  const maxArea = Math.max(boxArea(existing.box), boxArea(candidate));
  return overlap / Math.max(1, minArea) >= 0.88 && minArea / Math.max(1, maxArea) >= 0.55;
}

/** @param {Box} box @param {SlideSize} slideSize */
function clampBox(box, slideSize) {
  const x = clamp(box.x, 0, slideSize.widthPt);
  const y = clamp(box.y, 0, slideSize.heightPt);
  const x2 = clamp(box.x + box.w, x + 1, slideSize.widthPt);
  const y2 = clamp(box.y + box.h, y + 1, slideSize.heightPt);
  const result = { x, y, w: x2 - x, h: y2 - y };
  return result.w >= 1 && result.h >= 1 ? result : null;
}

/** @param {Box} box */
function roundBox(box) {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

/** @param {number[]} values */
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {number} value */
function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

/** @param {{r:number,g:number,b:number}} color */
function rgbToHex(color) {
  /** @param {number} value */
  const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

/** @param {string} color */
function hexToRgb(color) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(color);
  if (!match) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: Number.parseInt(match[1] || "00", 16),
    g: Number.parseInt(match[2] || "00", 16),
    b: Number.parseInt(match[3] || "00", 16),
    a: 255
  };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is Box} */
function isBox(value) {
  if (!isRecord(value)) return false;
  return ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])));
}

/** @param {unknown} value @returns {value is TextBox} */
function isTextBox(value) {
  return isRecord(value) && isBox(value.box);
}

/** @param {AxisLine | null} value @returns {value is AxisLine} */
function isAxisLine(value) {
  return value !== null;
}

/** @param {unknown} value @returns {value is Raster} */
function isRaster(value) {
  if (!isRecord(value)) return false;
  const width = Number(value.width);
  const height = Number(value.height);
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && value.rgba instanceof Uint8Array;
}

/** @param {unknown} value @returns {SlideSize|null} */
function parseSlideSize(value) {
  if (!isRecord(value)) return null;
  const widthPt = Number(value.widthPt);
  const heightPt = Number(value.heightPt);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt < 100 || heightPt < 100) return null;
  return { widthPt, heightPt };
}

module.exports = {
  brightness,
  saturationProxy,
  intersectionArea,
  addColorBucket,
  bucketWinner,
  colorDistance,
  nativeRect,
  nativeLine,
  sampleBoxFill,
  samplePanelBackgroundFill,
  panelFillMatchesInterior,
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
  centerInside,
  overlapRatio,
  similarBoxOverlap,
  boxArea,
  uniquePositions,
  strongestStyle,
  cardStrokeColor,
  cardStrokeWidth,
  textColor,
  isBlueLikeHex,
  parseHexColor,
  dedupeShapes,
  clampBox,
  roundBox,
  median,
  clamp,
  round,
  rgbToHex,
  hexToRgb,
  isRecord,
  isBox,
  isTextBox,
  isAxisLine,
  isRaster,
  parseSlideSize
};
