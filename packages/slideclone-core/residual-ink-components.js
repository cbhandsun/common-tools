// @ts-check
"use strict";
/** Separate solid-ink components before assigning their antialias fringe.
 * Multi-source distance propagation cannot join two independent components
 * through faint compression noise. Equidistant fringe stays unassigned.
 * Inputs are internal masks produced by the validated residual raster scan.
 * @param {Uint8Array} candidates @param {Uint8Array} solid @param {number} width
 */
function residualInkComponents(candidates, solid, width) {
  const area = candidates.length;
  if (!Number.isSafeInteger(width) || width < 1 || area < 1 || area > 262144
    || area % width || solid.length !== area) throw new TypeError("Residual ink component geometry is invalid");
  const labels = new Int32Array(area), queue = new Int32Array(area);
  /** @param {number} i */
  const neighbors = i => [i % width ? i - 1 : -1, i % width < width - 1 ? i + 1 : -1,
    i >= width ? i - width : -1, i + width < area ? i + width : -1];
  let nextLabel = 0;
  for (let i = 0; i < area; i++) {
    if (!solid[i] || !candidates[i] || labels[i]) continue;
    const label = ++nextLabel; let head = 0, tail = 1; queue[0] = i; labels[i] = label;
    while (head < tail) {
      const pixel = queue[head++] ?? 0;
      for (const n of neighbors(pixel)) if (n >= 0 && solid[n] && candidates[n] && !labels[n]) {
        labels[n] = label; queue[tail++] = n;
      }
    }
  }
  const distance = new Int32Array(area).fill(-1); let head = 0, tail = 0;
  for (let i = 0; i < area; i++) if (labels[i]) { distance[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++] ?? 0, nextDistance = (distance[i] ?? 0) + 1;
    for (const n of neighbors(i)) {
      if (n < 0 || !candidates[n]) continue;
      if (distance[n] === -1) {
        distance[n] = nextDistance; labels[n] = labels[i] ?? 0; queue[tail++] = n;
      } else if (distance[n] === nextDistance && labels[n] !== labels[i]) labels[n] = 0;
    }
  }
  return labels;
}
/** Resolve fringe only after component admission. State 1 means every nearest
 * solid witness is owned; state 2 records a rejected witness. Equal-distance
 * witnesses combine before the next BFS layer, so rejection cannot disappear
 * behind an ambiguous pixel. No solid component gains ownership here.
 * @param {Uint8Array} candidates @param {Uint8Array} solid @param {number} width
 * @param {Uint8Array} owned
 */
function residualInkFringe(candidates, solid, width, owned) {
  const area = candidates.length;
  if (!Number.isSafeInteger(width) || width < 1 || area < 1 || area > 262144
    || area % width || solid.length !== area || owned.length !== area)
    throw new TypeError("Residual ink fringe geometry is invalid");
  const states = new Uint8Array(area), distance = new Int32Array(area).fill(-1), queue = new Int32Array(area);
  let head = 0, tail = 0;
  for (let i = 0; i < area; i++) if (solid[i] && candidates[i]) {
    states[i] = owned[i] ? 1 : 2; distance[i] = 0; queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++] ?? 0, nextDistance = (distance[i] ?? 0) + 1;
    for (const n of [i % width ? i - 1 : -1, i % width < width - 1 ? i + 1 : -1,
      i >= width ? i - width : -1, i + width < area ? i + width : -1]) {
      if (n < 0 || !candidates[n]) continue;
      if (distance[n] === -1) {
        distance[n] = nextDistance; states[n] = states[i] ?? 0; queue[tail++] = n;
      } else if (distance[n] === nextDistance) states[n] = (states[n] ?? 0) | (states[i] ?? 0);
    }
  }
  return states;
}
module.exports = { residualInkComponents, residualInkFringe };
