"use strict";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function rgbToHex(r, g, b) {
  const to2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function parseHexRgb(hex) {
  const clean = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return null;
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
}

function colorDist(a, b) {
  if (!a || !b) return 999;
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function pixelAt(raster, x, y) {
  const ix = clamp(Math.round(x), 0, raster.width - 1);
  const iy = clamp(Math.round(y), 0, raster.height - 1);
  const idx = (iy * raster.width + ix) * 4;
  return {
    r: raster.data[idx],
    g: raster.data[idx + 1],
    b: raster.data[idx + 2],
    a: raster.data[idx + 3]
  };
}

/**
 * 1. Adaptive Container & Card Hierarchy Detector
 * Scans a slide raster (and optional OCR textBoxes) to discover closed rectangular /
 * rounded-rectangular containers and cards on arbitrary diagrams, estimating radiusPt,
 * dash style, fill/stroke colors, and nesting hierarchy.
 */
function detectAdaptiveCardHierarchy(raster, slideSize, textBoxes = []) {
  if (!raster || !raster.width || !raster.height || !raster.data || !slideSize) {
    return [];
  }
  const scaleX = raster.width / (Number(slideSize.widthPt) || 960);
  const scaleY = raster.height / (Number(slideSize.heightPt) || 540);
  const bg = pixelAt(raster, 2, 2);

  const visited = new Uint8Array(raster.width * raster.height);
  const step = Math.max(1, Math.round(Math.min(scaleX, scaleY) * 2));
  const maxNodes = Math.ceil(raster.width / step + 2) * Math.ceil(raster.height / step + 2);
  const stackX = new Int32Array(maxNodes);
  const stackY = new Int32Array(maxNodes);
  const rawRects = [];

  for (let y = step; y < raster.height - step; y += step) {
    for (let x = step; x < raster.width - step; x += step) {
      const idx = y * raster.width + x;
      if (visited[idx]) continue;
      const p = pixelAt(raster, x, y);
      if (colorDist(p, bg) < 14) continue;

      // Flood-fill uniform or near-uniform connected component on coarse grid
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      let top = 0;
      stackX[top] = x;
      stackY[top] = y;
      top += 1;
      visited[idx] = 1;

      const tryPush = (nx, ny) => {
        if (nx < 0 || nx >= raster.width || ny < 0 || ny >= raster.height) return;
        const nIdx = ny * raster.width + nx;
        if (visited[nIdx]) return;
        const np = pixelAt(raster, nx, ny);
        if (colorDist(np, bg) >= 14 && colorDist(np, p) <= 42) {
          visited[nIdx] = 1;
          stackX[top] = nx;
          stackY[top] = ny;
          top += 1;
        }
      };

      while (top > 0) {
        top -= 1;
        const cx = stackX[top];
        const cy = stackY[top];
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        tryPush(cx + step, cy);
        tryPush(cx - step, cy);
        tryPush(cx, cy + step);
        tryPush(cx, cy - step);
      }

      const bw = maxX - minX + step;
      const bh = maxY - minY + step;
      const wPt = bw / scaleX;
      const hPt = bh / scaleY;
      if (wPt < 28 || hPt < 18) continue;
      if (wPt > slideSize.widthPt * 0.98 && hPt > slideSize.heightPt * 0.98) continue;

      const gridArea = Math.max(1, Math.round(bw / step) * Math.round(bh / step));
      const rectangularity = count / gridArea;
      if (rectangularity < 0.45) continue;

      // Sample interior fill & border stroke
      const centerPx = pixelAt(raster, (minX + maxX) / 2, (minY + maxY) / 2);
      const borderPx = pixelAt(raster, (minX + maxX) / 2, minY);

      // Estimate dash along top border
      let transitions = 0;
      let prevOnBorder = false;
      const sampleY = minY;
      for (let sx = minX + 6; sx <= maxX - 6; sx += 2) {
        const sp = pixelAt(raster, sx, sampleY);
        const onBorder = colorDist(sp, borderPx) < 28 && colorDist(sp, centerPx) > 8;
        if (onBorder !== prevOnBorder) {
          transitions += 1;
          prevOnBorder = onBorder;
        }
      }
      const dash = transitions >= 8 ? "dash" : "solid";

      // Estimate corner radius by checking diagonal inset from top-left corner
      let cornerInsetPx = 0;
      const maxCorner = Math.min(24, Math.floor(Math.min(bw, bh) / 3));
      for (let c = 0; c < maxCorner; c += 1) {
        const cp = pixelAt(raster, minX + c, minY + c);
        if (colorDist(cp, bg) < 14) {
          cornerInsetPx += 1;
        } else {
          break;
        }
      }
      const radiusPt = cornerInsetPx > 0
        ? clamp(Math.round((cornerInsetPx * 2.4) / Math.min(scaleX, scaleY)), 4, 24)
        : 8;

      rawRects.push({
        box: {
          x: Math.round((minX / scaleX) * 10) / 10,
          y: Math.round((minY / scaleY) * 10) / 10,
          w: Math.round(wPt * 10) / 10,
          h: Math.round(hPt * 10) / 10
        },
        fill: rgbToHex(centerPx.r, centerPx.g, centerPx.b),
        stroke: rgbToHex(borderPx.r, borderPx.g, borderPx.b),
        dash,
        radiusPt
      });
    }
  }

  // Sort largest area first to build containment hierarchy
  rawRects.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const shapes = rawRects.map((item, idx) => ({
    id: `adaptive-card-${idx + 1}`,
    type: item.radiusPt > 1 ? "roundRect" : "rect",
    box: item.box,
    style: {
      fill: item.fill,
      stroke: item.stroke,
      strokeWidthPt: 1.2,
      radiusPt: item.radiusPt,
      dash: item.dash
    },
    source: {
      role: "card",
      containedTextIds: []
    }
  }));

  for (let i = 0; i < shapes.length; i += 1) {
    const child = shapes[i];
    let bestParent = null;
    for (let j = 0; j < i; j += 1) {
      const parent = shapes[j];
      if (
        child.box.x >= parent.box.x - 2
        && child.box.y >= parent.box.y - 2
        && child.box.x + child.box.w <= parent.box.x + parent.box.w + 2
        && child.box.y + child.box.h <= parent.box.y + parent.box.h + 2
      ) {
        bestParent = parent;
      }
    }
    if (bestParent) {
      child.source.parentContainerId = bestParent.id;
      bestParent.source.role = "container";
    }
    if (child.box.w <= 120 && child.box.h <= 34 && child.source.role !== "container") {
      child.source.role = "badge";
    }
  }

  for (const tb of textBoxes || []) {
    if (!tb || !tb.box) continue;
    const cx = tb.box.x + tb.box.w / 2;
    const cy = tb.box.y + tb.box.h / 2;
    // Attach to smallest containing shape
    for (let i = shapes.length - 1; i >= 0; i -= 1) {
      const s = shapes[i];
      if (cx >= s.box.x && cx <= s.box.x + s.box.w && cy >= s.box.y && cy <= s.box.y + s.box.h) {
        s.source.containedTextIds.push(tb.id);
        break;
      }
    }
  }

  return shapes;
}

function segmentEndpoints(seg) {
  const b = seg.box || { x: 0, y: 0, w: 0, h: 0 };
  const flipH = Boolean(seg.style?.flipH);
  const flipV = Boolean(seg.style?.flipV);
  const x1 = flipH ? b.x + b.w : b.x;
  const y1 = flipV ? b.y + b.h : b.y;
  const x2 = flipH ? b.x : b.x + b.w;
  const y2 = flipV ? b.y : b.y + b.h;
  return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/**
 * 2. Single Native Elbow Connectors (bentConnector2 / bentConnector3)
 * Merges consecutive orthogonal line segments (`*-seg-1`, `*-seg-2`, `*-seg-3`)
 * into a single native PowerPoint elbow connector with `<a:gd name="adj1" .../>`
 * and preserves startConnection / endConnection anchors.
 */
function mergePolylineSegmentsToBentConnectors(shapes = []) {
  if (!Array.isArray(shapes) || shapes.length === 0) return [];
  const groups = new Map();
  const groupOrder = [];

  for (const shape of shapes) {
    const id = String(shape?.id || "");
    const match = id.match(/^(.*)-seg-(\d+)$/);
    const isLine = shape?.type === "line" || shape?.type === "connector";
    if (match && isLine) {
      const baseId = match[1];
      const segNum = Number(match[2]);
      if (!groups.has(baseId)) {
        groups.set(baseId, []);
        groupOrder.push({ kind: "chain", baseId });
      }
      groups.get(baseId).push({ segNum, shape });
    } else {
      groupOrder.push({ kind: "single", shape });
    }
  }

  const result = [];
  for (const entry of groupOrder) {
    if (entry.kind === "single") {
      result.push(entry.shape);
      continue;
    }
    const items = groups.get(entry.baseId) || [];
    items.sort((a, b) => a.segNum - b.segNum);
    const segs = items.map((i) => i.shape);
    if (segs.length < 2 || segs.length > 3) {
      result.push(...segs);
      continue;
    }

    // Reconstruct ordered polyline points from segments
    const ends = segs.map(segmentEndpoints);
    const pts = [ends[0].p1, ends[0].p2];
    let connected = true;
    for (let i = 1; i < ends.length; i += 1) {
      const prev = pts[pts.length - 1];
      const d1 = Math.hypot(ends[i].p1.x - prev.x, ends[i].p1.y - prev.y);
      const d2 = Math.hypot(ends[i].p2.x - prev.x, ends[i].p2.y - prev.y);
      if (d1 <= 6) {
        pts.push(ends[i].p2);
      } else if (d2 <= 6) {
        pts.push(ends[i].p1);
      } else {
        connected = false;
        break;
      }
    }

    if (!connected) {
      result.push(...segs);
      continue;
    }

    const startPt = pts[0];
    const endPt = pts[pts.length - 1];
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const w = Math.max(1, Math.round((maxX - minX) * 10) / 10);
    const h = Math.max(1, Math.round((maxY - minY) * 10) / 10);

    const flipH = endPt.x < startPt.x;
    const flipV = endPt.y < startPt.y;
    const firstSeg = segs[0];
    const lastSeg = segs[segs.length - 1];

    const connectorType = segs.length === 2 ? "bentConnector2" : "bentConnector3";
    const adjustments = {};
    if (connectorType === "bentConnector3" && pts.length === 4) {
      // Middle segment ratio along primary span
      const dx1 = Math.abs(pts[1].x - pts[0].x);
      const dy1 = Math.abs(pts[1].y - pts[0].y);
      if (dx1 >= dy1) {
        const span = Math.max(1, Math.abs(endPt.x - startPt.x));
        const ratio = Math.abs(pts[1].x - startPt.x) / span;
        adjustments.adj1 = clamp(Math.round(ratio * 100000), 10000, 90000);
      } else {
        const span = Math.max(1, Math.abs(endPt.y - startPt.y));
        const ratio = Math.abs(pts[1].y - startPt.y) / span;
        adjustments.adj1 = clamp(Math.round(ratio * 100000), 10000, 90000);
      }
    }

    const startConnection = firstSeg.source?.startConnection || firstSeg.style?.startAnchor;
    const endConnection = lastSeg.source?.endConnection || lastSeg.style?.endAnchor;

    result.push({
      id: entry.baseId,
      type: "connector",
      box: {
        x: Math.round(minX * 10) / 10,
        y: Math.round(minY * 10) / 10,
        w,
        h
      },
      style: {
        ...(firstSeg.style || {}),
        connectorType,
        adjustments,
        flipH,
        flipV,
        startArrow: firstSeg.style?.startArrow || "none",
        endArrow: lastSeg.style?.endArrow || "none",
        ...(startConnection ? { startAnchor: startConnection } : {}),
        ...(endConnection ? { endAnchor: endConnection } : {})
      },
      source: {
        ...(firstSeg.source || {}),
        mergedSegmentIds: segs.map((s) => s.id),
        ...(startConnection ? { startConnection } : {}),
        ...(endConnection ? { endConnection } : {})
      }
    });
  }

  return result;
}

/**
 * 3. Native Tables (<p:graphicFrame><a:tbl>) & Grid Matrix Reconstruction
 * Detects aligned rectangular cell grids (>= 2 rows x >= 2 cols) and their
 * interior textBoxes, converting them into native table definitions.
 */
function extractGridTablesFromShapesAndText(shapes = [], textBoxes = []) {
  if (!Array.isArray(shapes) || shapes.length < 4) {
    return { tables: [], remainingShapes: shapes, remainingTextBoxes: textBoxes };
  }
  const tol = 6;
  const candidates = shapes.filter(
    (s) =>
      (s.type === "rect" || s.type === "roundRect")
      && s.box
      && s.box.w >= 36
      && s.box.w <= 360
      && s.box.h >= 16
      && s.box.h <= 140
  );

  // Cluster by Y into potential rows
  const rowClusters = [];
  for (const s of candidates) {
    let cluster = rowClusters.find(
      (c) => Math.abs(c.y - s.box.y) <= tol && Math.abs(c.h - s.box.h) <= tol
    );
    if (!cluster) {
      cluster = { y: s.box.y, h: s.box.h, items: [] };
      rowClusters.push(cluster);
    }
    cluster.items.push(s);
  }

  const validRowClusters = rowClusters
    .filter((c) => c.items.length >= 2)
    .sort((a, b) => a.y - b.y);

  for (const rc of validRowClusters) {
    rc.items.sort((a, b) => a.box.x - b.box.x);
  }

  // Group consecutive rowClusters that have identical column count & aligned X positions
  const usedShapeIds = new Set();
  const usedTextIds = new Set();
  const tables = [];

  let i = 0;
  while (i < validRowClusters.length) {
    const baseRow = validRowClusters[i];
    const colCount = baseRow.items.length;
    const gridRows = [baseRow];
    let j = i + 1;
    while (j < validRowClusters.length) {
      const nextRow = validRowClusters[j];
      const prevRow = gridRows[gridRows.length - 1];
      const verticalGap = nextRow.y - (prevRow.y + prevRow.h);
      const colsAligned =
        nextRow.items.length === colCount
        && nextRow.items.every(
          (cell, cIdx) =>
            Math.abs(cell.box.x - baseRow.items[cIdx].box.x) <= tol
            && Math.abs(cell.box.w - baseRow.items[cIdx].box.w) <= tol
        );
      if (colsAligned && verticalGap >= -tol && verticalGap <= 20) {
        gridRows.push(nextRow);
        j += 1;
      } else {
        break;
      }
    }

    if (gridRows.length >= 2 && colCount >= 2) {
      const minX = Math.min(...gridRows.flatMap((r) => r.items.map((c) => c.box.x)));
      const minY = Math.min(...gridRows.flatMap((r) => r.items.map((c) => c.box.y)));
      const maxX = Math.max(...gridRows.flatMap((r) => r.items.map((c) => c.box.x + c.box.w)));
      const maxY = Math.max(...gridRows.flatMap((r) => r.items.map((c) => c.box.y + c.box.h)));

      const columnWidthsPt = baseRow.items.map((c) => Math.round(c.box.w * 10) / 10);
      const rowHeightsPt = gridRows.map((r) => Math.round(r.h * 10) / 10);
      const rows = [];
      const cellStyles = [];

      for (const r of gridRows) {
        const rowCells = [];
        const rowStyleCells = [];
        for (const cellShape of r.items) {
          usedShapeIds.add(cellShape.id);
          const matchingTexts = (textBoxes || []).filter((tb) => {
            if (!tb || !tb.box || usedTextIds.has(tb.id)) return false;
            const cx = tb.box.x + tb.box.w / 2;
            const cy = tb.box.y + tb.box.h / 2;
            return (
              cx >= cellShape.box.x - 2
              && cx <= cellShape.box.x + cellShape.box.w + 2
              && cy >= cellShape.box.y - 2
              && cy <= cellShape.box.y + cellShape.box.h + 2
            );
          });
          matchingTexts.forEach((tb) => usedTextIds.add(tb.id));
          const cellText = matchingTexts.map((tb) => String(tb.text || "").trim()).filter(Boolean).join("\n");
          rowCells.push(cellText);
          rowStyleCells.push({
            fill: cellShape.style?.fill || "#FFFFFF",
            stroke: cellShape.style?.stroke || "#CBD5E1",
            color: matchingTexts[0]?.font?.color || "#0F172A",
            weight: matchingTexts[0]?.font?.weight || "normal",
            align: matchingTexts[0]?.font?.align || "center",
            sizePt: matchingTexts[0]?.font?.sizePt || 11
          });
        }
        rows.push(rowCells);
        cellStyles.push(rowStyleCells);
      }

      tables.push({
        id: `table-grid-${tables.length + 1}`,
        box: {
          x: Math.round(minX * 10) / 10,
          y: Math.round(minY * 10) / 10,
          w: Math.round((maxX - minX) * 10) / 10,
          h: Math.round((maxY - minY) * 10) / 10
        },
        rows,
        columnWidthsPt,
        rowHeightsPt,
        cellStyles,
        style: {
          fill: cellStyles[0]?.[0]?.fill || "#FFFFFF",
          stroke: cellStyles[0]?.[0]?.stroke || "#CBD5E1",
          opacity: 1
        }
      });
      i = j;
    } else {
      i += 1;
    }
  }

  return {
    tables,
    remainingShapes: shapes.filter((s) => !usedShapeIds.has(s.id)),
    remainingTextBoxes: (textBoxes || []).filter((tb) => !usedTextIds.has(tb.id))
  };
}

/**
 * 4. PowerPoint Theme Color Scheme (<a:clrScheme>) Extraction & <a:schemeClr> Mapping
 * Clusters slide colors into dk1, lt1, dk2, lt2, and accent1..accent6 so slides
 * respond to PowerPoint "Design -> Variants/Colors" theme switching.
 */
function extractAdaptiveThemePalette(ir) {
  const defaults = {
    dk1: "0F172A",
    lt1: "FFFFFF",
    dk2: "1E293B",
    lt2: "F8FAFC",
    accent1: "3B82F6",
    accent2: "10B981",
    accent3: "8B5CF6",
    accent4: "F59E0B",
    accent5: "EC4899",
    accent6: "06B6D4",
    hlink: "2563EB",
    folHlink: "7C3AED"
  };
  if (!ir || !Array.isArray(ir.pages)) return defaults;

  const colorCounts = new Map();
  const addColor = (hex, weight = 1) => {
    const rgb = parseHexRgb(hex);
    if (!rgb) return;
    const key = rgbToHex(rgb.r, rgb.g, rgb.b).slice(1);
    colorCounts.set(key, (colorCounts.get(key) || 0) + weight);
  };

  for (const page of ir.pages) {
    if (page.background?.fill) addColor(page.background.fill, 3);
    for (const s of page.shapes || []) {
      if (s.style?.fill && s.style.fill !== "none") addColor(s.style.fill, 2);
      if (s.style?.stroke && s.style.stroke !== "none") addColor(s.style.stroke, 2);
    }
    for (const tb of page.textBoxes || []) {
      if (tb.font?.color) addColor(tb.font.color, 1);
    }
  }

  const ranked = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => {
      const rgb = parseHexRgb(hex);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      return { hex, rgb, hsl };
    });

  const darks = ranked.filter((c) => c.hsl.l < 0.25);
  const lights = ranked.filter((c) => c.hsl.l > 0.9);
  const chromatics = ranked.filter((c) => c.hsl.s >= 0.22 && c.hsl.l >= 0.2 && c.hsl.l <= 0.85);

  // Pick distinct accents (hue separation >= 22 deg or RGB distance >= 45)
  const chosenAccents = [];
  for (const cand of chromatics) {
    const tooClose = chosenAccents.some(
      (existing) => colorDist(existing.rgb, cand.rgb) < 42
    );
    if (!tooClose) {
      chosenAccents.push(cand);
      if (chosenAccents.length >= 6) break;
    }
  }

  const fallbackAccents = [
    defaults.accent1,
    defaults.accent2,
    defaults.accent3,
    defaults.accent4,
    defaults.accent5,
    defaults.accent6
  ];

  return {
    dk1: darks[0]?.hex || defaults.dk1,
    lt1: lights[0]?.hex || defaults.lt1,
    dk2: darks[1]?.hex || defaults.dk2,
    lt2: lights[1]?.hex || defaults.lt2,
    accent1: chosenAccents[0]?.hex || fallbackAccents[0],
    accent2: chosenAccents[1]?.hex || fallbackAccents[1],
    accent3: chosenAccents[2]?.hex || fallbackAccents[2],
    accent4: chosenAccents[3]?.hex || fallbackAccents[3],
    accent5: chosenAccents[4]?.hex || fallbackAccents[4],
    accent6: chosenAccents[5]?.hex || fallbackAccents[5],
    hlink: chosenAccents[0]?.hex || defaults.hlink,
    folHlink: chosenAccents[2]?.hex || defaults.folHlink
  };
}

function mapColorToSchemeSlot(hexColor, palette) {
  const rgb = parseHexRgb(hexColor);
  if (!rgb || !palette) return null;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const slots = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "dk1", "lt1", "dk2", "lt2"];

  let bestSlot = "accent1";
  let bestScore = Infinity;
  let bestSlotHsl = null;

  for (const slot of slots) {
    const slotRgb = parseHexRgb(palette[slot]);
    if (!slotRgb) continue;
    const slotHsl = rgbToHsl(slotRgb.r, slotRgb.g, slotRgb.b);
    const hueDiff = Math.min(Math.abs(hsl.h - slotHsl.h), 360 - Math.abs(hsl.h - slotHsl.h));
    const score = hsl.s >= 0.15 && slot.startsWith("accent")
      ? hueDiff * 1.5 + Math.abs(hsl.s - slotHsl.s) * 40
      : colorDist(rgb, slotRgb);
    if (score < bestScore) {
      bestScore = score;
      bestSlot = slot;
      bestSlotHsl = slotHsl;
    }
  }

  let lumMod = 100000;
  let lumOff = 0;
  if (bestSlotHsl && Math.abs(hsl.l - bestSlotHsl.l) > 0.04) {
    if (hsl.l > bestSlotHsl.l) {
      // Tint towards white: lumMod + lumOff = 100000
      const tintRatio = clamp((1 - hsl.l) / Math.max(0.05, 1 - bestSlotHsl.l), 0.15, 0.98);
      lumMod = Math.round(tintRatio * 100000);
      lumOff = 100000 - lumMod;
    } else {
      // Shade towards black
      const shadeRatio = clamp(hsl.l / Math.max(0.05, bestSlotHsl.l), 0.15, 0.98);
      lumMod = Math.round(shadeRatio * 100000);
      lumOff = 0;
    }
  }

  return { val: bestSlot, lumMod, lumOff };
}

function bindShapesToThemePalette(shapes = [], palette) {
  if (!Array.isArray(shapes) || !palette) return shapes;
  return shapes.map((shape) => {
    const style = { ...(shape.style || {}) };
    if (style.fill && style.fill !== "none" && style.fill !== "transparent") {
      const mapped = mapColorToSchemeSlot(style.fill, palette);
      if (mapped) style.schemeColor = mapped;
    }
    if (style.stroke && style.stroke !== "none" && style.stroke !== "transparent") {
      const mappedStroke = mapColorToSchemeSlot(style.stroke, palette);
      if (mappedStroke) style.strokeSchemeColor = mappedStroke;
    }
    return {
      ...shape,
      style
    };
  });
}

module.exports = {
  bindShapesToThemePalette,
  detectAdaptiveCardHierarchy,
  extractAdaptiveThemePalette,
  extractGridTablesFromShapesAndText,
  mapColorToSchemeSlot,
  mergePolylineSegmentsToBentConnectors
};
