"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { traceNativeMaskContours } = require("../packages/slideclone-core/scene-plan/native-mask-contours");

test("native mask simplification fits a long continuous bent stroke within the unchanged segment and pixel-error budgets", () => {
  const pixels = [];
  for (let x = 0; x < 200; x++) {
    const y = Math.round(10 + 80 * (2 * x / 199 - 1) ** 2);
    for (let dy = 0; dy < 3; dy++) pixels.push({ x, y: y + dy });
  }
  const box = { x: 0, y: 0, w: 200, h: 100 };
  const segments = traceNativeMaskContours(pixels, box, { tolerancePx: 0.75 });
  assert.ok(segments);
  assert.ok(segments.length <= 120);
  const edges = [];
  let previous = null, first = null;
  for (const segment of segments) {
    const point = segment.points[0] ? { x: segment.points[0].x * box.w, y: segment.points[0].y * box.h } : null;
    if (segment.type === "moveTo") { first = point; previous = point; }
    else if (segment.type === "lnTo") { edges.push([previous, point]); previous = point; }
    else if (segment.type === "close") edges.push([previous, first]);
  }
  const cells = new Set(pixels.map(point => `${point.x},${point.y}`));
  const vertices = [];
  for (const p of pixels) {
    if (!cells.has(`${p.x},${p.y - 1}`)) vertices.push({ x: p.x, y: p.y }, { x: p.x + 1, y: p.y });
    if (!cells.has(`${p.x + 1},${p.y}`)) vertices.push({ x: p.x + 1, y: p.y }, { x: p.x + 1, y: p.y + 1 });
    if (!cells.has(`${p.x},${p.y + 1}`)) vertices.push({ x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 });
    if (!cells.has(`${p.x - 1},${p.y}`)) vertices.push({ x: p.x, y: p.y }, { x: p.x, y: p.y + 1 });
  }
  for (const p of vertices) {
    const distance = Math.min(...edges.map(([a, b]) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    }));
    assert.ok(distance <= 0.75001, `source boundary error ${distance} exceeds the declared tolerance`);
  }
});

function cells(width, height, include) {
  const result = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (include(x, y)) result.push({ x, y });
  return result;
}

function signedArea(segments) {
  const loops = [];
  let current = [];
  for (const segment of segments) {
    if (segment.type === "close") { loops.push(current); current = []; }
    else current.push(segment.points[0]);
  }
  return loops.map((loop) => loop.reduce((sum, p, i) => {
    const next = loop[(i + 1) % loop.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0) / 2);
}

test("optional contour minimization preserves enclosure, winding and the original error and segment ceilings",()=>{
 const pixels=cells(100,70,(x,y)=>((x-50)/40)**2+((y-35)/25)**2<=1),box={x:0,y:0,w:100,h:70};
 const original=traceNativeMaskContours(pixels,box,{tolerancePx:1.5}),compact=traceNativeMaskContours(pixels,box,{tolerancePx:1.5,minimizeSegments:true});
 assert.ok(original);assert.ok(compact);assert.ok(compact.length<=original.length);assert.ok(compact.length<=120);
 assert.equal(compact.filter(s=>s.type==="moveTo").length,1);assert.ok(signedArea(compact)[0]>0);
 const edges=[];let first,previous;for(const s of compact){const p=s.points[0]?{x:s.points[0].x*100,y:s.points[0].y*70}:null;
  if(s.type==="moveTo"){first=p;previous=p;}else if(s.type==="lnTo"){edges.push([previous,p]);previous=p;}else if(s.type==="close")edges.push([previous,first]);}
 const owned=new Set(pixels.map(p=>`${p.x},${p.y}`));
 for(const p of pixels)for(const [dx,dy,ends]of [[0,-1,[[0,0],[1,0]]],[1,0,[[1,0],[1,1]]],[0,1,[[0,1],[1,1]]],[-1,0,[[0,0],[0,1]]]]){
  if(owned.has(`${p.x+dx},${p.y+dy}`))continue;
  for(const [ex,ey]of ends){const x=p.x+ex,y=p.y+ey;const distance=Math.min(...edges.map(([a,b])=>{
   const vx=b.x-a.x,vy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/Math.max(1,vx*vx+vy*vy)));
   return Math.hypot(x-a.x-t*vx,y-a.y-t*vy);}));assert.ok(distance<=1.50001);}
 }
 assert.throws(()=>traceNativeMaskContours(pixels,box,{minimizeSegments:"yes"}),TypeError);
});

test("native mask contours retain concave notches without a convex hull", () => {
  const segments = traceNativeMaskContours(cells(10, 10, (x, y) => x < 4 || y >= 6), { x: 0, y: 0, w: 10, h: 10 });
  assert.equal(segments.filter((s) => s.type === "moveTo").length, 1);
  assert.ok(Math.abs(signedArea(segments)[0] - 0.64) < 1e-9);
  assert.ok(segments.some((s) => s.points.some((p) => p.x === 0.4 && p.y === 0.6)));
});

test("native mask contours retain holes with opposite winding", () => {
  const segments = traceNativeMaskContours(cells(10, 10, (x, y) => x < 2 || x >= 8 || y < 2 || y >= 8), { x: 0, y: 0, w: 10, h: 10 });
  const areas = signedArea(segments);
  assert.equal(areas.length, 2);
  assert.ok(areas[0] * areas[1] < 0);
  assert.ok(Math.abs(areas.reduce((a, b) => a + b, 0) - 0.64) < 1e-9);
});

test("native mask contours preserve diagonal touching islands and reject excessive geometry", () => {
  const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const box = { x: 0, y: 0, w: 2, h: 2 };
  assert.equal(traceNativeMaskContours(points, box).filter((s) => s.type === "close").length, 2);
  assert.equal(traceNativeMaskContours(points, box, { maxSegments: 4 }), null);
});

test("native mask contours validate empty, malformed and out of bounds inputs", () => {
  const box = { x: 0, y: 0, w: 2, h: 2 };
  for (const points of [[], null, [{ x: NaN, y: 0 }], [{ x: 2, y: 0 }], [{ x: 0.5, y: 0 }], [{ x: 0, y: -1 }]]) {
    assert.throws(() => traceNativeMaskContours(points, box), TypeError);
  }
  assert.throws(() => traceNativeMaskContours([{ x: 0, y: 0 }], box, { tolerancePx: Infinity }), TypeError);
  assert.throws(() => traceNativeMaskContours([{ x: 0, y: 0 }], { ...box, w: 1_000_001 }), TypeError);
  assert.throws(() => traceNativeMaskContours([{ x: 0, y: 0 }], { ...box, x: 1e20 }), TypeError);
});

test("outer-only background contours keep concave exteriors and exclude interior holes within the same path budget", () => {
  const pixels = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++)
    if (!(x >= 6 && x < 10 && y >= 6 && y < 10) && !(x > 12 && y > 12)) pixels.push({ x, y });
  const box = { x: 0, y: 0, w: 20, h: 20 };
  const foreground = traceNativeMaskContours(pixels, box), background = traceNativeMaskContours(pixels, box, { outerOnly: true });
  assert.equal(foreground.filter(s => s.type === "moveTo").length, 2);
  assert.equal(background.filter(s => s.type === "moveTo").length, 1);
  assert.ok(background.some(s => s.points.some(p => p.x === .65 && p.y === .65)));
  assert.ok(background.length <= 120);
  assert.throws(() => traceNativeMaskContours(pixels, box, { outerOnly: "true" }), /Invalid/);
  assert.throws(() => traceNativeMaskContours([], box, { outerOnly: true }), /Invalid/);
  assert.equal(traceNativeMaskContours(pixels, box, { outerOnly: true, maxSegments: 4 }), null);
});
