"use strict";
// @ts-check

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{widthPt:number,heightPt:number}} Slide */
/** @typedef {{r:number,g:number,b:number}} RGB */
/** @typedef {RGB & {a:number}} RGBA */
/** @typedef {Box & {kind?: "rect"}} RectMask */
/** @typedef {{kind:"line",x1:number,y1:number,x2:number,y2:number,width:number}} LineMask */
/** @typedef {RectMask | LineMask} Mask */
/** @typedef {{box:Box}} TextBox */
/** @typedef {{box:Box,area:number,density:number,color:string}} Component */
/** @typedef {{axis:"h"|"v",a:number,b1:number,b2:number,color:string}} AxisRun */
/** @typedef {AxisRun & {aValues:number[],colors:string[]}} AxisGroup */
/** @typedef {{axis:"h",x1:number,x2:number,y:number,thicknessPt:number,color:string} | {axis:"v",x:number,y1:number,y2:number,thicknessPt:number,color:string}} AxisLine */
/** @typedef {{region?:Box,predicate?:(color:RGBA)=>boolean,textBoxes?:TextBox[],minAreaPx?:number,maxAreaPx?:number,maxWPt?:number,maxHPt?:number,padPt?:number,maxCount?:number}} EntropyOptions */


/** @param {Box} box @param {Box} bounds */
function constrainPtBox(box, bounds) {
  const x1 = clamp(Number(box.x || 0), Number(bounds.x || 0), Number(bounds.x || 0) + Number(bounds.w || 0));
  const y1 = clamp(Number(box.y || 0), Number(bounds.y || 0), Number(bounds.y || 0) + Number(bounds.h || 0));
  const x2 = clamp(Number(box.x || 0) + Number(box.w || 0), x1 + 0.1, Number(bounds.x || 0) + Number(bounds.w || 0));
  const y2 = clamp(Number(box.y || 0) + Number(box.h || 0), y1 + 0.1, Number(bounds.y || 0) + Number(bounds.h || 0));
  return { x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
}


/** @param {Box|null|undefined} inner @param {Box|null|undefined} outer */
function boxCenterInside(inner, outer) {
  if (!inner || !outer) return false;
  const cx = Number(inner.x || 0) + Number(inner.w || 0) / 2;
  const cy = Number(inner.y || 0) + Number(inner.h || 0) / 2;
  return cx >= Number(outer.x || 0)
    && cx <= Number(outer.x || 0) + Number(outer.w || 0)
    && cy >= Number(outer.y || 0)
    && cy <= Number(outer.y || 0) + Number(outer.h || 0);
}


/** @param {Raster} image @param {Mask} mask */
function sampleMaskBackgroundColor(image, mask) {
  const padding = 6;
  const bounds = maskBounds(mask, image);
  const x1 = clamp(bounds.x - padding, 0, image.width - 1);
  const y1 = clamp(bounds.y - padding, 0, image.height - 1);
  const x2 = clamp(bounds.x + bounds.w + padding, x1 + 1, image.width);
  const y2 = clamp(bounds.y + bounds.h + padding, y1 + 1, image.height);
  /** @type {Map<string, {count:number,r:number,g:number,b:number}>} */
  const buckets = new Map();
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const insideMask = pointInMask(x, y, mask);
      if (insideMask) continue;
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      const key = `${Math.round(color.r / 16)},${Math.round(color.g / 16)},${Math.round(color.b / 16)}`;
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      entry.count += 1;
      entry.r += color.r;
      entry.g += color.g;
      entry.b += color.b;
      buckets.set(key, entry);
    }
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < 4) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count)
  };
}

/** @param {Mask} mask @param {Raster} image */
function maskBounds(mask, image) {
  if (mask?.kind === "line") {
    const half = Math.max(1, Number(mask.width || 1) / 2);
    const x1 = Math.min(mask.x1, mask.x2) - half;
    const y1 = Math.min(mask.y1, mask.y2) - half;
    const x2 = Math.max(mask.x1, mask.x2) + half;
    const y2 = Math.max(mask.y1, mask.y2) + half;
    const x = clamp(Math.floor(x1), 0, image.width - 1);
    const y = clamp(Math.floor(y1), 0, image.height - 1);
    return {
      x,
      y,
      w: clamp(Math.ceil(x2) - x, 1, image.width - x),
      h: clamp(Math.ceil(y2) - y, 1, image.height - y)
    };
  }
  const x = clamp(Math.floor(mask.x), 0, image.width - 1);
  const y = clamp(Math.floor(mask.y), 0, image.height - 1);
  return {
    x,
    y,
    w: clamp(Math.ceil(mask.w), 1, image.width - x),
    h: clamp(Math.ceil(mask.h), 1, image.height - y)
  };
}

/** @param {number} x @param {number} y @param {Mask} mask */
function pointInMask(x, y, mask) {
  if (mask?.kind === "line") {
    return distanceToSegment(x, y, mask.x1, mask.y1, mask.x2, mask.y2) <= Math.max(1, Number(mask.width || 1) / 2);
  }
  return x >= mask.x && x < mask.x + mask.w && y >= mask.y && y < mask.y + mask.h;
}

/** @param {number} px @param {number} py @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}


/** @param {Raster} image @param {Box} ptBox @param {Slide} slideSize @param {string} fallback */
function sampleInkColor(image, ptBox, slideSize, fallback = "#111111") {
  const box = ptToPxBox(ptBox, image, slideSize, 2);
  const samples = [];
  const sampleStep = Math.max(1, Math.ceil(Math.sqrt((box.w * box.h) / 9000)));
  for (let y = box.y; y < box.y + box.h; y += sampleStep) {
    for (let x = box.x; x < box.x + box.w; x += sampleStep) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      samples.push(color);
    }
  }
  if (samples.length < 8) return normalizeHex(fallback, "#111111");
  const background = sampleMaskBackgroundColor(image, box);
  const contrastSorted = samples
    .map((color) => ({ color, distance: colorDistance(color, background) }))
    .sort((a, b) => b.distance - a.distance);
  const topDistance = contrastSorted[0]?.distance || 0;
  const highContrast = contrastSorted
    .filter((item) => item.distance >= Math.max(32, topDistance * 0.65))
    .map((item) => item.color);
  const chosen = highContrast.length >= 8
    ? highContrast
    : samples.slice().sort((a, b) => luma(a) - luma(b)).slice(0, Math.max(8, Math.floor(samples.length * 0.45)));
  const averaged = averageColor(chosen);
  if (luma(background) < 205 && saturation(background) > 0.18 && luma(averaged) > 190) {
    return "#FFFFFF";
  }
  const lightNeutralRatio = samples.filter((color) => luma(color) > 235 && saturation(color) < 0.12).length / samples.length;
  if (luma(averaged) > 220 && lightNeutralRatio > 0.45) {
    const darkInk = samples
      .filter((color) => luma(color) < 190)
      .sort((a, b) => luma(a) - luma(b))
      .slice(0, Math.max(8, Math.floor(samples.length * 0.22)));
    if (darkInk.length >= 8) return rgbToHex(averageColor(darkInk));
  }
  return rgbToHex(averaged);
}

/** @param {Raster} image @param {Slide} slideSize */
function detectLongLines(image, slideSize) {
  const horizontal = detectAxisLines(image, slideSize, "h");
  const vertical = detectAxisLines(image, slideSize, "v");
  return [...horizontal, ...vertical].map((line, index) => ({
    id: `native-line-${line.axis}-${index}`,
    type: "line",
    box: line.axis === "h"
      ? { x: line.x1, y: line.y, w: Math.max(0.1, line.x2 - line.x1), h: 0 }
      : { x: line.x, y: line.y1, w: 0, h: Math.max(0.1, line.y2 - line.y1) },
    style: {
      stroke: line.color,
      strokeWidthPt: Math.max(0.5, line.thicknessPt),
      connectorType: "straight"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "long-axis-line"
    }
  }));
}

/** @param {TextBox[]} lines @param {TextBox[]} textBoxes */
function keepStructuralLines(lines, textBoxes) {
  const horizontal = lines.filter((line) => Math.abs(line.box.h || 0) < 0.01);
  const vertical = lines.filter((line) => Math.abs(line.box.w || 0) < 0.01);
  const tableLike = textBoxes.length >= 10 && horizontal.length >= 2 && vertical.length >= 2;
  if (tableLike) {
    return [...horizontal.slice(0, 16), ...vertical.slice(0, 16)];
  }
  if (lines.length <= 8) return lines;
  return [];
}

/** @param {Raster} image @param {Slide} slideSize @param {"h"|"v"} axis */
function detectAxisLines(image, slideSize, axis) {
  const raw = [];
  const outer = axis === "h" ? image.height : image.width;
  const inner = axis === "h" ? image.width : image.height;
  const minRun = axis === "h" ? image.width * 0.18 : image.height * 0.16;
  for (let a = 0; a < outer; a += 1) {
    let start = null;
    /** @type {RGBA[]} */
    let colors = [];
    for (let b = 0; b <= inner; b += 1) {
      const color = b < inner ? (axis === "h" ? pixel(image, b, a) : pixel(image, a, b)) : null;
      const on = color && isLinePixel(color);
      if (on && start === null) {
        start = b;
        colors = [color];
      } else if (on) {
        if (colors.length < 200) colors.push(color);
      } else if (start !== null) {
        const len = b - start;
        if (len >= minRun) raw.push({ axis, a, b1: start, b2: b, color: rgbToHex(averageColor(colors)) });
        start = null;
      }
    }
  }
  return mergeAxisRuns(raw, image, slideSize, axis);
}

/** @param {AxisRun[]} raw @param {Raster} image @param {Slide} slideSize @param {"h"|"v"} axis */
function mergeAxisRuns(raw, image, slideSize, axis) {
  /** @type {AxisGroup[]} */
  const groups = [];
  for (const run of raw) {
    const existing = groups.find((group) =>
      Math.abs(group.a - run.a) <= 4
      && overlapRatio(group.b1, group.b2, run.b1, run.b2) >= 0.7
    );
    if (existing) {
      existing.aValues.push(run.a);
      existing.a = /** @type {number} */ (median(existing.aValues)); // The run was just appended.
      existing.b1 = Math.min(existing.b1, run.b1);
      existing.b2 = Math.max(existing.b2, run.b2);
      existing.colors.push(run.color);
    } else {
      groups.push({ ...run, aValues: [run.a], colors: [run.color] });
    }
  }
  const sx = slideSize.widthPt / image.width;
  const sy = slideSize.heightPt / image.height;
  return groups
    .filter((group) => group.aValues.length <= 12)
    .map(/** @returns {AxisLine} */ (group) => {
      const thicknessPx = Math.max(1, group.aValues.length);
      if (axis === "h") {
        return {
          axis,
          x1: round(group.b1 * sx),
          x2: round(group.b2 * sx),
          y: round(group.a * sy),
          thicknessPt: round(thicknessPx * sy),
          color: dominantHex(group.colors)
        };
      }
      return {
        axis,
        x: round(group.a * sx),
        y1: round(group.b1 * sy),
        y2: round(group.b2 * sy),
        thicknessPt: round(thicknessPx * sx),
        color: dominantHex(group.colors)
      };
    })
    .filter((line) => {
      if (line.axis === "h") return line.x2 - line.x1 >= 120;
      return line.y2 - line.y1 >= 80;
    });
}

/** @param {Raster} image @param {Slide} slideSize @param {TextBox[]} existingTextBoxes */
function detectSimpleStatusIcons(image, slideSize, existingTextBoxes = []) {
  const components = connectedColorComponents(image);
  const shapes = [];
  const iconTextBoxes = [];
  let index = 0;
  for (const component of components) {
    const kind = classifyIconComponent(component);
    if (!kind) continue;
    const box = pxToPtBox(component.box, image, slideSize, 1.5);
    if (overlapsAnyTextBox(box, existingTextBoxes)) continue;
    const id = `native-icon-${index++}`;
    shapes.push({
      id,
      type: kind.shape,
      box,
      style: { fill: component.color, stroke: component.color, strokeWidthPt: 0 },
      source: { editable: true, nativeRebuild: true, detector: "simple-status-icon", component: kind.name }
    });
    if (kind.mark) {
      iconTextBoxes.push({
        id: `${id}-mark`,
        text: kind.mark,
        box: insetBox(box, kind.shape === "triangle" ? 0.22 : 0.12),
        font: {
          family: "Arial",
          sizePt: kind.shape === "triangle" ? Math.max(12, box.h * 0.56) : Math.max(14, box.h * 0.72),
          weight: "bold",
          color: "#FFFFFF",
          align: "center",
          valign: "middle"
        },
        style: { marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
        source: { editable: true, nativeRebuild: true, detector: "simple-status-icon-mark" }
      });
    }
  }
  return { shapes, textBoxes: iconTextBoxes };
}

/** @param {Box} box @param {TextBox[]} textBoxes */
function overlapsAnyTextBox(box, textBoxes) {
  return textBoxes.some((textBox) => boxOverlapRatio(box, textBox.box || {}) > 0.08);
}

/** @param {Box} a @param {Box} b */
function boxOverlapRatio(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(Number(a.x), Number(b.x));
  const y1 = Math.max(Number(a.y), Number(b.y));
  const x2 = Math.min(Number(a.x) + Number(a.w), Number(b.x) + Number(b.w));
  const y2 = Math.min(Number(a.y) + Number(a.h), Number(b.y) + Number(b.h));
  const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return area / Math.max(1, Number(a.w) * Number(a.h));
}

/** @param {Raster} image @param {Slide} slideSize @param {EntropyOptions} options */
function detectEntropyMicroComponents(image, slideSize, options = {}) {
  if (!image?.rgba || !options.region || typeof options.predicate !== "function") return [];
  const crop = ptToPxBox(options.region, image, slideSize, 0);
  const visited = new Uint8Array(crop.w * crop.h);
  const textBoxes = (options.textBoxes || [])
    .filter((item) => item?.box && Number.isFinite(Number(item.box.x)) && Number.isFinite(Number(item.box.y)))
    .map((item) => expandPtBox(item.box, slideSize, 3, 3));
  const components = [];
  for (let localY = 0; localY < crop.h; localY += 1) {
    for (let localX = 0; localX < crop.w; localX += 1) {
      const start = localY * crop.w + localX;
      if (visited[start]) continue;
      const x = crop.x + localX;
      const y = crop.y + localY;
      const seed = pixel(image, x, y);
      if (!options.predicate(seed)) {
        visited[start] = 1;
        continue;
      }
      /** @type {[number, number][]} */
      const queue = [[localX, localY]];
      visited[start] = 1;
      let qi = 0;
      let count = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const colors = [];
      while (qi < queue.length) {
        const [cx, cy] = /** @type {[number, number]} */ (queue[qi++]);
        const px = crop.x + cx;
        const py = crop.y + cy;
        const color = pixel(image, px, py);
        count += 1;
        if (colors.length < 60) colors.push(color);
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        for (const [nx, ny] of /** @type {[number, number][]} */ ([[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]])) {
          if (nx < 0 || ny < 0 || nx >= crop.w || ny >= crop.h) continue;
          const next = ny * crop.w + nx;
          if (visited[next]) continue;
          const nextColor = pixel(image, crop.x + nx, crop.y + ny);
          if (!options.predicate(nextColor)) {
            visited[next] = 1;
            continue;
          }
          visited[next] = 1;
          queue.push([nx, ny]);
        }
      }
      const pxBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      const ptBox = pxToPtBox(pxBox, image, slideSize, 0);
      const minAreaPx = options.minAreaPx ?? 4;
      const maxAreaPx = options.maxAreaPx ?? 150;
      if (count < minAreaPx || count > maxAreaPx) continue;
      if (ptBox.w > (options.maxWPt ?? 14) || ptBox.h > (options.maxHPt ?? 12)) continue;
      if (textBoxes.some((box) => boxCenterInside(ptBox, box) || boxOverlapRatio(ptBox, box) > 0.12)) continue;
      const pad = options.padPt ?? 1.2;
      components.push({
        box: constrainPtBox(expandPtBox(ptBox, slideSize, pad, pad), { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
        fill: rgbToHex(averageColor(colors)),
        areaPx: count,
        imageEvidence: true
      });
    }
  }
  return components
    .sort((a, b) => b.areaPx - a.areaPx)
    .slice(0, options.maxCount ?? 10);
}

/** @param {RGBA|null|undefined} color */
function isEntropyOrangePixel(color) {
  if (!color || color.a < 64) return false;
  const hsl = rgbToHsl(color);
  return hsl.h >= 8 && hsl.h <= 48 && hsl.s >= 0.35 && hsl.l >= 0.30 && hsl.l <= 0.78;
}

/** @param {RGBA|null|undefined} color */
function isEntropyIslandMicroPixel(color) {
  if (!color || color.a < 64) return false;
  const hsl = rgbToHsl(color);
  if (hsl.l > 0.86 || hsl.l < 0.20 || hsl.s < 0.22) return false;
  return (hsl.h >= 8 && hsl.h <= 48) || (hsl.h >= 190 && hsl.h <= 220);
}

/** @param {Raster} image */
function connectedColorComponents(image) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  const maxPixels = image.width * image.height;
  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const seedIndex = y * image.width + x;
      if (visited[seedIndex]) continue;
      const seed = pixel(image, x, y);
      if (!isIconSeed(seed)) continue;
      /** @type {[number, number][]} */
      const queue = [[x, y]];
      visited[seedIndex] = 1;
      let qi = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const colors = [];
      let count = 0;
      while (qi < queue.length && count < maxPixels) {
        const [cx, cy] = /** @type {[number, number]} */ (queue[qi++]);
        const color = pixel(image, cx, cy);
        colors.push(color);
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of /** @type {[number, number][]} */ ([[cx + 2, cy], [cx - 2, cy], [cx, cy + 2], [cx, cy - 2]])) {
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const idx = ny * image.width + nx;
          if (visited[idx]) continue;
          const next = pixel(image, nx, ny);
          if (!isSimilarIconPixel(seed, next)) continue;
          visited[idx] = 1;
          queue.push([nx, ny]);
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      if (count >= 120 && width >= 35 && height >= 35 && width <= 160 && height <= 160) {
        components.push({
          box: { x: minX, y: minY, w: width, h: height },
          area: count * 4,
          density: (count * 4) / Math.max(1, width * height),
          color: rgbToHex(averageColor(colors))
        });
      }
    }
  }
  return components;
}

/** @param {Component} component */
function classifyIconComponent(component) {
  const color = parseHex(component.color);
  const hsl = rgbToHsl(color);
  const ratio = component.box.w / Math.max(1, component.box.h);
  if (ratio < 0.55 || ratio > 1.65) return null;
  if (component.density < 0.28) return null;
  if (hsl.h >= 18 && hsl.h <= 48 && hsl.s > 0.55) {
    return { name: "warning", shape: "triangle", mark: "!" };
  }
  if (hsl.s < 0.16 && hsl.l < 0.65) {
    return { name: "negative", shape: "ellipse", mark: "×" };
  }
  if ((hsl.h >= 95 && hsl.h <= 170 && hsl.s > 0.35) || (hsl.h >= 190 && hsl.h <= 220 && hsl.s > 0.35)) {
    return { name: "positive", shape: "ellipse", mark: "✓" };
  }
  return null;
}

/** @param {RGBA} color */
function isLinePixel(color) {
  if (color.a < 64) return false;
  if (luma(color) > 238 && saturation(color) < 0.16) return false;
  if (luma(color) < 45) return false;
  return true;
}

/** @param {RGBA} color */
function isIconSeed(color) {
  if (color.a < 64) return false;
  const hsl = rgbToHsl(color);
  if (hsl.l > 0.82 || hsl.l < 0.18) return false;
  return hsl.s > 0.22 || hsl.l < 0.58;
}

/** @param {RGBA} seed @param {RGBA} next */
function isSimilarIconPixel(seed, next) {
  if (!isIconSeed(next)) return false;
  return colorDistance(seed, next) <= 55;
}

/** @param {Box} box @param {Raster} image @param {Slide} slideSize @param {number} paddingPt */
function ptToPxBox(box, image, slideSize, paddingPt = 0) {
  const sx = image.width / slideSize.widthPt;
  const sy = image.height / slideSize.heightPt;
  const x = clamp(Math.floor((box.x - paddingPt) * sx), 0, image.width - 1);
  const y = clamp(Math.floor((box.y - paddingPt) * sy), 0, image.height - 1);
  const w = clamp(Math.ceil((box.w + paddingPt * 2) * sx), 1, image.width - x);
  const h = clamp(Math.ceil((box.h + paddingPt * 2) * sy), 1, image.height - y);
  return { x, y, w, h };
}

/** @param {Box} box @param {Raster} image @param {Slide} slideSize @param {number} widthPt @returns {LineMask} */
function ptLineToPxMask(box, image, slideSize, widthPt = 4) {
  const sx = image.width / slideSize.widthPt;
  const sy = image.height / slideSize.heightPt;
  return {
    kind: "line",
    x1: clamp(Math.round(box.x * sx), 0, image.width - 1),
    y1: clamp(Math.round(box.y * sy), 0, image.height - 1),
    x2: clamp(Math.round((box.x + box.w) * sx), 0, image.width - 1),
    y2: clamp(Math.round((box.y + box.h) * sy), 0, image.height - 1),
    width: Math.max(1, Math.round(widthPt * (sx + sy) / 2))
  };
}

/** @param {Box} box @param {Raster} image @param {Slide} slideSize @param {number} paddingPt */
function pxToPtBox(box, image, slideSize, paddingPt = 0) {
  const sx = slideSize.widthPt / image.width;
  const sy = slideSize.heightPt / image.height;
  return {
    x: round(box.x * sx - paddingPt),
    y: round(box.y * sy - paddingPt),
    w: round(box.w * sx + paddingPt * 2),
    h: round(box.h * sy + paddingPt * 2)
  };
}

/** @param {Box} box @param {number} ratio */
function insetBox(box, ratio) {
  const dx = box.w * ratio;
  const dy = box.h * ratio;
  return {
    x: round(box.x + dx),
    y: round(box.y + dy * 0.8),
    w: round(Math.max(1, box.w - dx * 2)),
    h: round(Math.max(1, box.h - dy * 1.6))
  };
}

/** @param {Box} box @param {Raster} image @param {number} inset */
function trimPxBox(box, image, inset) {
  const x = clamp(box.x + inset, 0, image.width - 1);
  const y = clamp(box.y + inset, 0, image.height - 1);
  const x2 = clamp(box.x + box.w - inset, x + 1, image.width);
  const y2 = clamp(box.y + box.h - inset, y + 1, image.height);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** @param {Box} a @param {Box} b */
function unionPtBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** @param {Box} box @param {Slide} slideSize @param {number} padX @param {number} padY */
function expandPtBox(box, slideSize, padX, padY) {
  const x = clamp(box.x - padX, 0, slideSize.widthPt);
  const y = clamp(box.y - padY, 0, slideSize.heightPt);
  const x2 = clamp(box.x + box.w + padX, x + 1, slideSize.widthPt);
  const y2 = clamp(box.y + box.h + padY, y + 1, slideSize.heightPt);
  return { x: round(x), y: round(y), w: round(x2 - x), h: round(y2 - y) };
}

/** @param {Box} a @param {Box} b @param {number} distance */
function boxesNearPt(a, b, distance) {
  return !(a.x + a.w + distance < b.x
    || b.x + b.w + distance < a.x
    || a.y + a.h + distance < b.y
    || b.y + b.h + distance < a.y);
}

/** @param {Raster} image @param {number} x @param {number} y */
function pixel(image, x, y) {
  // Callers use decoded RGBA storage and coordinates clipped to image bounds.
  const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  return {
    r: /** @type {number} */ (image.rgba[offset]),
    g: /** @type {number} */ (image.rgba[offset + 1]),
    b: /** @type {number} */ (image.rgba[offset + 2]),
    a: /** @type {number} */ (image.rgba[offset + 3])
  };
}

/** @param {RGB[]} colors */
function averageColor(colors) {
  const total = colors.reduce((acc, color) => ({
    r: acc.r + color.r,
    g: acc.g + color.g,
    b: acc.b + color.b
  }), { r: 0, g: 0, b: 0 });
  const count = Math.max(1, colors.length);
  return {
    r: Math.round(total.r / count),
    g: Math.round(total.g / count),
    b: Math.round(total.b / count)
  };
}

/** @param {RGB} color */
function luma(color) {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

/** @param {RGB} color */
function saturation(color) {
  const max = Math.max(color.r, color.g, color.b) / 255;
  const min = Math.min(color.r, color.g, color.b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}

/** @param {RGB} color */
function rgbToHsl(color) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

/** @param {RGB} a @param {RGB} b */
function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** @param {RGB} color */
function rgbToHex(color) {
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** @param {unknown} value */
function parseHex(value) {
  const normalized = normalizeHex(value, "#000000").slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

/** @param {unknown} value @param {number} ratio */
function darkerHex(value, ratio = 0.45) {
  const color = parseHex(normalizeHex(value, "#000000"));
  const factor = clamp(1 - Number(ratio || 0), 0, 1);
  return rgbToHex({
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor)
  });
}

/** @param {unknown} value @param {string} fallback */
function normalizeHex(value, fallback) {
  const raw = String(value || "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : fallback;
}

/** @param {string[]} values */
function dominantHex(values) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "#666666";
}

/** @param {number} a1 @param {number} a2 @param {number} b1 @param {number} b2 */
function overlapRatio(a1, a2, b1, b2) {
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  return overlap / Math.max(1, Math.min(a2 - a1, b2 - b1));
}

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** @param {Partial<Box>} box */
function centerOfBox(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

/** @param {number} value */
function toHex(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {number} value */
function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

/** @param {number} value */
function roundRatio(value) {
  return Math.round(Number(value) * 10000) / 10000;
}


module.exports = {
  constrainPtBox,
  boxCenterInside,
  sampleMaskBackgroundColor,
  maskBounds,
  pointInMask,
  distanceToSegment,
  sampleInkColor,
  detectLongLines,
  keepStructuralLines,
  detectAxisLines,
  mergeAxisRuns,
  detectSimpleStatusIcons,
  overlapsAnyTextBox,
  boxOverlapRatio,
  detectEntropyMicroComponents,
  isEntropyOrangePixel,
  isEntropyIslandMicroPixel,
  connectedColorComponents,
  classifyIconComponent,
  isLinePixel,
  isIconSeed,
  isSimilarIconPixel,
  ptToPxBox,
  ptLineToPxMask,
  pxToPtBox,
  insetBox,
  trimPxBox,
  unionPtBox,
  expandPtBox,
  boxesNearPt,
  pixel,
  averageColor,
  luma,
  saturation,
  rgbToHsl,
  colorDistance,
  rgbToHex,
  parseHex,
  darkerHex,
  normalizeHex,
  dominantHex,
  overlapRatio,
  median,
  centerOfBox,
  toHex,
  clamp,
  round,
  roundRatio
};
