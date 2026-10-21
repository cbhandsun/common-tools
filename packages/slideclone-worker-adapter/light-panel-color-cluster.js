// @ts-check
"use strict";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @typedef {{r:number,g:number,b:number,count:number,x:number,y:number,z:number}} Bin */

/** Adjacent quantization bins may describe one textured pale fill, not distinct colors.
 * @param {unknown} input
 * @returns {{r:number,g:number,b:number} | null}
 */
function clusterLightPanelBins(input) {
  if (!record(input) || !Array.isArray(input.bins) || input.bins.length < 1 || input.bins.length > 4096
    || typeof input.sampled !== "number" || !Number.isSafeInteger(input.sampled) || input.sampled < 80 || input.sampled > 2_000_000) return null;
  /** @type {Map<string, Bin>} */
  const bins = new Map();
  let total = 0;
  for (const item of input.bins) {
    if (!record(item) || typeof item.count !== "number" || !Number.isSafeInteger(item.count) || item.count < 1 || item.count > input.sampled
      || typeof item.r !== "number" || typeof item.g !== "number" || typeof item.b !== "number"
      || ![item.r, item.g, item.b].every(Number.isFinite)) return null;
    const r = item.r / item.count, g = item.g / item.count, b = item.b / item.count;
    if (Math.min(r, g, b) < 0 || Math.max(r, g, b) > 255 || (r + g + b) / 3 < 160
      || (r + g + b) / 3 > 253 || Math.max(r, g, b) - Math.min(r, g, b) > 70) return null;
    const x = Math.floor(r / 8), y = Math.floor(g / 8), z = Math.floor(b / 8), key = `${x},${y},${z}`;
    if (bins.has(key)) return null;
    bins.set(key, { r: item.r, g: item.g, b: item.b, count: item.count, x, y, z });
    total += item.count;
    if (total > input.sampled) return null;
  }
  if (total !== input.sampled) return null;
  let best = { count: 0, r: 0, g: 0, b: 0 };
  for (const center of bins.values()) {
    const cluster = { count: 0, r: 0, g: 0, b: 0 };
    for (let x = center.x - 1; x <= center.x + 1; x++) for (let y = center.y - 1; y <= center.y + 1; y++) for (let z = center.z - 1; z <= center.z + 1; z++) {
      const bin = bins.get(`${x},${y},${z}`);
      if (!bin) continue;
      cluster.count += bin.count; cluster.r += bin.r; cluster.g += bin.g; cluster.b += bin.b;
    }
    if (cluster.count > best.count) best = cluster;
  }
  if (best.count < Math.max(80, input.sampled * 0.65)) return null;
  return { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count };
}

module.exports = { clusterLightPanelBins };
