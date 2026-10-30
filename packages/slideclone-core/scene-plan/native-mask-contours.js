"use strict";
// @ts-check
const {shortestContourLoop,shortestCurvedContourLoop}=require("../routing/native-contour-shortest-path");
const {fitCertifiedContourLoop}=require("../routing/native-contour-certified-curves");
const {types}=require("node:util");
/** @typedef {{x: number, y: number}} Point */
/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @typedef {{x: number, y: number, nx: number, ny: number, direction: number}} Edge */

// Directed cell edges preserve concavities and opposite winding around holes.
/** outerOnly is for independently measured background surfaces; foreground owners retain holes.
 * @param {Point[]} points @param {Box} box @param {{maxSegments?: number, tolerancePx?: number, outerOnly?: boolean, curveFallback?:boolean,minimizeSegments?:boolean,workState?:{checks:number,exhausted:boolean},fastFail?:boolean,connectDiagonal?:boolean}} [options] */
function traceNativeMaskContours(points, box, { maxSegments = 120, tolerancePx = 0.75, outerOnly = false,curveFallback=false,minimizeSegments=false,workState,fastFail=false,connectDiagonal=false } = {}) {
  if (workState !== undefined && (!workState || types.isProxy(workState)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(workState))
    || Object.values(Object.getOwnPropertyDescriptors(workState)).some(property => !("value" in property))
    || !Number.isSafeInteger(workState.checks) || workState.checks < 0 || workState.checks > 4_000_001
    || typeof workState.exhausted !== "boolean")) throw new TypeError("Invalid native contour work state");
  if (typeof fastFail !== "boolean" || typeof connectDiagonal !== "boolean") throw new TypeError("Invalid native contour mode");
  if (!Array.isArray(points) || !points.length || !box || ![box.x, box.y, box.w, box.h].every(Number.isSafeInteger)
    || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.w > 16384 || box.h > 16384 || box.w * box.h > 2_000_000
    || !Number.isSafeInteger(box.x + box.w) || !Number.isSafeInteger(box.y + box.h)
    || points.length > 1_000_000 || !Number.isInteger(maxSegments) || maxSegments < 4 || maxSegments > 120
    || !Number.isFinite(tolerancePx) || tolerancePx < 0 || tolerancePx > 2 || typeof outerOnly !== "boolean"||typeof curveFallback!=="boolean"||typeof minimizeSegments!=="boolean") throw new TypeError("Invalid native contour input");
  if (workState && (workState.exhausted || workState.checks >= 4_000_000)) return null;
  // Local integer keys avoid allocating/parsing coordinate strings for every
  // cell and neighbour. The admitted area bounds the index independently of
  // source coordinates. Set insertion order still defines the original path
  // order, including duplicates and diagonal contacts.
  const cells = new Set();
  const vertexWidth = box.w + 1;
  /** @param {number} x @param {number} y */
  const vertexKey = (x, y) => (y - box.y) * vertexWidth + (x - box.x);
  for (const p of points) {
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < box.x || p.y < box.y
      || p.x >= box.x + box.w || p.y >= box.y + box.h) throw new TypeError("Invalid native contour point");
    cells.add((p.y - box.y) * box.w + (p.x - box.x));
  }
  /** @type {Map<number, Edge[]>} */
  const edges = new Map();
  /** @param {number} x @param {number} y @param {number} nx @param {number} ny @param {number} direction */
  const add = (x, y, nx, ny, direction) => {
    const key = vertexKey(x, y);
    const list = edges.get(key) || [];
    list.push({ x, y, nx, ny, direction });
    edges.set(key, list);
  };
  for (const key of cells) {
    const cx = key % box.w, cy = Math.floor(key / box.w);
    const x = box.x + cx, y = box.y + cy;
    // Row/column boundaries are essential: adjacent numeric keys across a row
    // break are not neighbouring source pixels.
    if (cy === 0 || !cells.has(key - box.w)) add(x, y, x + 1, y, 0);
    if (cx === box.w - 1 || !cells.has(key + 1)) add(x + 1, y, x + 1, y + 1, 1);
    if (cy === box.h - 1 || !cells.has(key + box.w)) add(x + 1, y + 1, x, y + 1, 2);
    if (cx === 0 || !cells.has(key - 1)) add(x, y + 1, x, y, 3);
  }
  /** @type {Point[][]} */
  const loops = [];
  /** @type {{raw:Point[],state:{checks:number,exhausted:boolean}}[]} */const proofs=[];
  while (edges.size) {
    const startKey = /** @type {number} */ (edges.keys().next().value);
    /** @type {Point[]} */
    const loop = [];
    let key = startKey;
    /** @type {number|null} */
    let direction = null;
    do {
      const outgoing = edges.get(key);
      if (!outgoing?.length) return null;
      const currentDirection = direction;
      const preferred = /** @type {Edge} */ (currentDirection === null ? outgoing[0] : (connectDiagonal ? [3, 0, 1, 2] : [1, 0, 3, 2])
        .map((turn) => outgoing.find((edge) => edge.direction === (currentDirection + turn) % 4)).find(Boolean));
      loop.push({ x: preferred.x, y: preferred.y });
      outgoing.splice(outgoing.indexOf(preferred), 1);
      if (!outgoing.length) edges.delete(key);
      direction = preferred.direction;
      key = vertexKey(preferred.nx, preferred.ny);
    } while (key !== startKey);
    // Directed cell edges wind clockwise around the outside in image coordinates.
    // Interior glyph/pictorial holes do not define a background's silhouette.
    const signedArea = loop.reduce((sum, p, i) => {
      const next = loop[(i + 1) % loop.length];
      return sum + (next ? p.x * next.y - next.x * p.y : 0);
    }, 0);
    if (!outerOnly || signedArea > 0){const state=workState??{checks:0,exhausted:false};loops.push(simplifyLoop(loop,tolerancePx,state));proofs.push({raw:loop,state});}
  }
  if (workState?.exhausted) return null;
  if(curveFallback&&box.x+box.w<=16384&&box.y+box.h<=16384&&loops.every(loop=>loop.length>=3)&&loops.reduce((sum,loop)=>sum+loop.length+1,0)>maxSegments){
    const paths=proofs.map(proof=>proof.raw.length<=262144?fitCertifiedContourLoop(proof.raw,tolerancePx,proof.state,box,maxSegments):null);
    if(workState?.exhausted)return null;
    if(paths.every(path=>path!==null)&&paths.reduce((sum,path)=>sum+(path?.length??0),0)<=maxSegments)
      return paths.flatMap(path=>(path??[]).map(segment=>({type:segment.type,points:segment.points.map(p=>({x:(p.x-box.x)/box.w,y:(p.y-box.y)/box.h}))})));
  }
  if(fastFail&&loops.reduce((sum,loop)=>sum+loop.length+1,0)>maxSegments)return null;
  if(loops.every(loop=>loop.length>=3)&&(minimizeSegments||loops.reduce((sum,loop)=>sum+loop.length+1,0)>maxSegments)){
    for(let index=0;index<loops.length;index++){
      const proof=proofs[index],original=loops[index];if(!proof||!original)continue;
      const optimal=shortestContourLoop(proof.raw,tolerancePx,proof.state);if(optimal&&optimal.length<original.length)loops[index]=optimal;
    }
  }
  if(workState?.exhausted)return null;
  /** @param {Point} p */
  const normalize = (p) => ({ x: (p.x - box.x) / box.w, y: (p.y - box.y) / box.h });
  if(loops.every(loop=>loop.length>=3)&&loops.reduce((sum,loop)=>sum+loop.length+1,0)>maxSegments&&curveFallback){
    const paths=proofs.map(proof=>shortestCurvedContourLoop(proof.raw,tolerancePx,proof.state));
    if(workState?.exhausted)return null;
    if(paths.every(path=>path!==null)&&paths.reduce((sum,path)=>sum+(path?.length??0),0)<=maxSegments)
      return paths.flatMap(path=>(path??[]).map(segment=>({type:segment.type,points:segment.points.map(normalize)})));
  }
  if (loops.some((loop) => loop.length < 3) || loops.reduce((sum, loop) => sum + loop.length + 1, 0) > maxSegments) return null;
  return loops.flatMap((loop) => [
    { type: "moveTo", points: [normalize(/** @type {Point} */ (loop[0]))] },
    ...loop.slice(1).map((p) => ({ type: "lnTo", points: [normalize(p)] })),
    { type: "close", points: [] }
  ]);
}

/** @param {Point[]} input @param {number} tolerance @param {{checks:number,exhausted:boolean}} state @returns {Point[]} */
function simplifyLoop(input, tolerance,state) {
  const loop = input.filter((p, i) => {
    const before = /** @type {Point} */ (input[(i + input.length - 1) % input.length]);
    const after = /** @type {Point} */ (input[(i + 1) % input.length]);
    return (p.x - before.x) * (after.y - p.y) !== (p.y - before.y) * (after.x - p.x);
  });
  if (loop.length <= 3 || tolerance === 0) return loop;
  // Split the closed contour into two open arcs, then use bounded iterative
  // Douglas-Peucker. Adjacent greedy deletions can strand redundant vertices.
  let split = 1;
  let farthest = 0;
  for (let index = 1; index < loop.length; index++) {
    const point = /** @type {Point} */ (loop[index]), firstPoint = /** @type {Point} */ (loop[0]);
    const distance = Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y);
    if (distance > farthest) { farthest = distance; split = index; }
  }
  const first = simplifyArc(loop.slice(0, split + 1), tolerance, state);
  const second = simplifyArc([...loop.slice(split), /** @type {Point} */ (loop[0])], tolerance, state);
  if (state.exhausted) return loop;
  const result = [...first.slice(0, -1), ...second.slice(0, -1)];
  return result.length >= 3 ? result : loop;
}

/** @param {Point[]} points @param {number} tolerance @param {{checks: number, exhausted: boolean}} state @returns {Point[]} */
function simplifyArc(points, tolerance, state) {
  const keep = new Set([0, points.length - 1]);
  /** @type {Array<[number, number]>} */
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [from, to] = /** @type {[number, number]} */ (pending.pop());
    let best = -1;
    let maximum = tolerance;
    for (let index = from + 1; index < to; index++) {
      if (++state.checks > 4_000_000) { state.exhausted = true; return points; }
      const distance = distanceToSegment(/** @type {Point} */ (points[index]), /** @type {Point} */ (points[from]), /** @type {Point} */ (points[to]));
      if (distance > maximum) { maximum = distance; best = index; }
    }
    if (best >= 0) { keep.add(best); pending.push([from, best], [best, to]); }
  }
  const partitioned = [...keep].sort((a, b) => a - b).map(index => /** @type {Point} */ (points[index]));
  const forward = [/** @type {Point} */ (points[0])];
  let from = 0;
  while (from < points.length - 1) {
    let furthest = from + 1;
    for (let to = from + 2; to < Math.min(points.length, from + 65); to++) {
      let acceptable = true;
      for (let index = from + 1; index < to; index++) {
        if (++state.checks > 4_000_000) { state.exhausted = true; return points; }
        if (distanceToSegment(/** @type {Point} */ (points[index]), /** @type {Point} */ (points[from]), /** @type {Point} */ (points[to])) > tolerance) { acceptable = false; break; }
      }
      if (acceptable) furthest = to;
    }
    forward.push(/** @type {Point} */ (points[furthest]));
    from = furthest;
  }
  return forward.length < partitioned.length ? forward : partitioned;
}

/** @param {Point} p @param {Point} a @param {Point} b */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1, dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

module.exports = { traceNativeMaskContours };
