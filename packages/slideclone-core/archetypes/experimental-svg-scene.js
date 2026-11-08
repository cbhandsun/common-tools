"use strict";

// Bounded experimental adapter. No Worker or published editor uses this module.
function createSvgSceneModel() {
  const fail = () => { throw new TypeError("Invalid editable scene"); };
  const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const number = (v, lo = -8000, hi = 8000) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : fail();
  const string = (v, max = 512) => typeof v === "string" && v.length <= max && ![...v].some(c => { const n = c.codePointAt(0); return n < 9 || n > 10 && n < 32 || n === 127; }) ? v : fail();
  const color = (v, fallback) => v === undefined ? fallback : typeof v === "string" && /^(#[a-f\d]{6}|none)$/iu.test(v) ? v : fail();
  const list = (v, max) => Array.isArray(v) && v.length <= max ? v : fail();
  const box = (v, line = false) => {
    if (!record(v)) return fail();
    const b = { x: number(v.x), y: number(v.y), w: number(v.w), h: number(v.h) };
    if (line ? b.w === 0 && b.h === 0 : b.w <= 0 || b.h <= 0) return fail();
    return b;
  };
  const font = (v) => {
    if (!record(v)) return fail();
    const family = string(v.family || "Noto Sans SC", 120);
    if (/[;{}<>"'\\]/u.test(family)) return fail();
    return { family, sizePt: number(v.sizePt, 1, 400), color: color(v.color, "#000000"), weight: v.weight === "bold" ? "bold" : "normal",
      lineHeightMultiple: number(v.lineHeightMultiple ?? 1.15, .5, 4), align: ["left","center","right"].includes(v.align) ? v.align : "left" };
  };
  const anchor = (v) => {
    if (v === undefined) return null;
    if (!record(v) || !["left", "right", "top", "bottom"].includes(v.side)) return fail();
    return { elementId: string(v.elementId), side: v.side, position: number(v.position, 0, 1), dxPt: number(v.dxPt ?? 0), dyPt: number(v.dyPt ?? 0) };
  };
  function path(v) {
    if (typeof v === "string") { if (v.length > 32768) return fail(); v = JSON.parse(v); }
    const rows = list(v, 120);
    if (!rows.length || rows[0][0] !== 0) return fail();
    return rows.map(row => {
      if (!Array.isArray(row) || !Number.isInteger(row[0]) || row[0] < 0 || row[0] > 4 || row.length !== [3, 3, 7, 5, 1][row[0]]) return fail();
      return [row[0], ...row.slice(1).map(n => number(n, 0, 1))];
    });
  }
  function parseDeck(input, pageIndex = 0) {
    if (!record(input) || !record(input.slideSize)) return fail();
    const pages = list(input.pages, 100), p = pages[pageIndex];
    if (!record(p)) return fail();
    for (const key of ["images", "icons", "tables", "charts"]) if (p[key] !== undefined && list(p[key], 0).length) return fail();
    const scene = { version: "svg-scene-1", width: number(input.slideSize.widthPt, 72, 4000), height: number(input.slideSize.heightPt, 72, 4000), background: color(p.background?.fill, "#FFFFFF"), objects: [] };
    for (const s of list(p.shapes, 10000)) {
      if (!record(s) || !["freeform", "line"].includes(s.type) || !record(s.style)) return fail();
      const st = s.style;
      if (st.dash && !["solid", "dash"].includes(st.dash)) return fail();
      if (st.startArrow !== undefined && !["none", "triangle"].includes(st.startArrow) || st.endArrow !== undefined && !["none", "triangle"].includes(st.endArrow)
        || s.type === "line" && st.connectorType && st.connectorType !== "straight") return fail();
      const item = { id: string(s.id), kind: s.type, box: box(s.box, s.type === "line"), group: string(s.source?.nativeComponentGroupId || s.id), fill: color(st.fill, "none"), stroke: color(st.stroke, "none"), strokeWidth: number(st.strokeWidthPt ?? 0, 0, 100), dash: st.dash || "solid", startArrow: st.startArrow === "triangle", endArrow: st.endArrow === "triangle", start: anchor(st.startAnchor), end: anchor(st.endAnchor), path: s.type === "freeform" ? path(st.freeformPath) : null };
      scene.objects.push(item);
    }
    for (const t of list(p.textBoxes, 10000)) {
      if (!record(t)) return fail();
      const f = font(t.font), b = box(t.box), text = string(t.text, 4096);
      const runs = t.positionedRuns ? list(t.positionedRuns, 512).map(r => ({ text: string(r.text), box: box(r.box), font: font({ ...f, ...r.fontOverride }) }))
        : t.runs ? list(t.runs,512).map(r=>({text:string(r.text,16000),box:b,font:font({...f,...r.font})})) : [{ text, box: b, font: f }];
      if (runs.map(r => r.text).join("") !== text) return fail();
      if (t.style?.textLayout !== undefined && !["uniform-line","paragraph"].includes(t.style.textLayout)) return fail();
      scene.objects.push({ id: string(t.id), kind: "text", box: b, group: string(t.source?.nativeComponentGroupId || t.id), text, runs, fit: t.style?.textWarp === "textPlain", flow: ["uniform-line","paragraph"].includes(t.style?.textLayout), paragraph:t.style?.textLayout==="paragraph", typographyStyleId:t.style?.typographyStyleId,typographyRole:t.style?.typographyRole, rotation: number(t.rotation ?? 0, -180, 180), outline: color(t.style?.textOutlineColor, "none"), outlineWidth: number(t.style?.textOutlineWidthPt ?? 0, 0, 100) });
    }
    const ids = new Set(scene.objects.map(o => o.id));
    if (ids.size !== scene.objects.length || ids.has("")) return fail();
    for (const o of scene.objects) for (const a of [o.start, o.end]) if (a && !ids.has(a.elementId)) return fail();
    for (const o of scene.objects) arrowPaths(scene, o);
    return scene;
  }
  function point(scene, a) {
    const o = scene.objects.find(o => o.id === a.elementId);
    if (!o) return fail();
    const b = o.box;
    return { x: b.x + (a.side === "left" ? 0 : a.side === "right" ? b.w : b.w * a.position) + a.dxPt, y: b.y + (a.side === "top" ? 0 : a.side === "bottom" ? b.h : b.h * a.position) + a.dyPt };
  }
  function endpoints(scene, o) {
    return [o.start ? point(scene, o.start) : { x: o.box.x, y: o.box.y }, o.end ? point(scene, o.end) : { x: o.box.x + o.box.w, y: o.box.y + o.box.h }];
  }
  function arrowPaths(scene, o) {
    if (!o.startArrow && !o.endArrow) return [];
    const reject = () => { throw new TypeError("Arrow requires a visible nondegenerate open path"); };
    if (o.stroke === "none" || o.strokeWidth <= 0) return reject();
    let segments;
    if (o.kind === "line") segments = [endpoints(scene, o)];
    else if (o.kind === "freeform") {
      // Multiple subpaths and closed outlines have no unambiguous arrow endpoints.
      if (o.path.slice(1).some(row => row[0] === 0 || row[0] === 4)) return reject();
      let previous = { x: o.box.x + o.path[0][1] * o.box.w, y: o.box.y + o.path[0][2] * o.box.h };
      segments = o.path.slice(1).map(row => {
        const points = [previous];
        for (let i = 1; i < row.length; i += 2) points.push({ x: o.box.x + row[i] * o.box.w, y: o.box.y + row[i + 1] * o.box.h });
        previous = points.at(-1);
        return points;
      });
    } else return reject();
    const distinct = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > 1e-9;
    segments = segments.filter(points => points.some(p => distinct(p, points[0])));
    if (!segments.length) return reject();
    return ["start", "end"].filter(end => o[`${end}Arrow`]).map(end => {
      const points = end === "start" ? segments[0] : [...segments.at(-1)].reverse();
      const tip = points[0], inner = points.slice(1).find(p => distinct(p, tip));
      if (!inner) return reject();
      // Repeated controls fall back to the first nonzero derivative at that endpoint.
      const distance = Math.hypot(tip.x - inner.x, tip.y - inner.y);
      const ux = (tip.x - inner.x) / distance, uy = (tip.y - inner.y) / distance;
      const length = o.strokeWidth * 3, half = o.strokeWidth * 1.5;
      const base = { x: tip.x - ux * length, y: tip.y - uy * length };
      return { end, d: `M${tip.x} ${tip.y} L${base.x - uy * half} ${base.y + ux * half} L${base.x + uy * half} ${base.y - ux * half} Z` };
    });
  }
  function move(scene, id, dx, dy, scale = 1) {
    number(dx); number(dy); number(scale, 0.1, 10);
    const selected = scene.objects.find(o => o.id === id);
    if (!selected) return fail();
    const result = structuredClone(scene), origin = selected.box;
    const transform = b => ({ x: origin.x + (b.x - origin.x) * scale + dx, y: origin.y + (b.y - origin.y) * scale + dy, w: b.w * scale, h: b.h * scale });
    for (const o of result.objects) if (o.group === selected.group) {
      o.box = transform(o.box);
      box(o.box, o.kind === "line");
      if (o.runs) o.runs = o.runs.map(r => ({ ...r, box: transform(r.box), font: { ...r.font, sizePt: r.font.sizePt * scale } }));
    }
    for (const o of result.objects) arrowPaths(result, o);
    return result;
  }
  function editText(scene, id, value) {
    string(value, 4096);
    const result = structuredClone(scene), o = result.objects.find(o => o.id === id && o.kind === "text");
    if (!o) return fail();
    // A new string uses normal editable text flow, not frozen per-character boxes.
    o.text = value; o.fit = false; o.runs = [{ text: value, box: { ...o.box }, font: { ...o.runs[0].font } }];
    return result;
  }
  function editPoint(scene, id, rowIndex, pointIndex, x, y) {
    number(x, 0, 1); number(y, 0, 1);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(pointIndex) || pointIndex < 0) return fail();
    const result = structuredClone(scene), o = result.objects.find(o => o.id === id && o.kind === "freeform");
    const row = o?.path[rowIndex], offset = 1 + pointIndex * 2;
    if (!row || offset + 1 >= row.length) return fail();
    row[offset] = x; row[offset + 1] = y;
    arrowPaths(result, o);
    return result;
  }
  function pathData(o) {
    return o.path.map(row => ["M", "L", "C", "Q", "Z"][row[0]] + row.slice(1).map((v, i) => i % 2 ? o.box.y + v * o.box.h : o.box.x + v * o.box.w).join(" ")).join(" ");
  }
  function exportDeck(scene) {
    const shapes = [], textBoxes = [];
    for (const o of scene.objects) {
      const common = { id: o.id, box: o.box, source: { nativeComponentGroupId: o.group } };
      if (o.kind === "text") {
        textBoxes.push({ ...common, text: o.text, font: o.runs[0].font,
          ...(o.paragraph?{runs:o.runs.map(r=>({text:r.text,font:r.font})),wrap:true}:{positionedRuns:o.runs.map(r=>({text:r.text,box:r.box,fontOverride:r.font}))}),
          rotation: o.rotation, style: { textWarp: o.fit ? "textPlain" : undefined, textLayout: o.paragraph?"paragraph":o.flow ? "uniform-line" : undefined, typographyStyleId:o.typographyStyleId, typographyRole:o.typographyRole, textOutlineColor: o.outline, textOutlineWidthPt: o.outlineWidth } });
      } else {
        shapes.push({ ...common, type: o.kind, style: { fill: o.fill, stroke: o.stroke, strokeWidthPt: o.strokeWidth, dash: o.dash, startArrow: o.startArrow ? "triangle" : undefined, endArrow: o.endArrow ? "triangle" : undefined, startAnchor: o.start || undefined, endAnchor: o.end || undefined, freeformPath: o.path ? JSON.stringify(o.path) : undefined } });
      }
    }
    const result = { slideSize: { widthPt: scene.width, heightPt: scene.height }, pages: [{ background: { fill: scene.background }, shapes, textBoxes }] };
    parseDeck(result);
    return result;
  }
  return { parseDeck, endpoints, arrowPaths, move, editText, editPoint, pathData, exportDeck };
}

if (typeof module !== "undefined") module.exports = { createSvgSceneModel };
