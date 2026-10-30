"use strict";

function resolveAssetOsClosedLoopLayout(visualBox = {}) {
  const x = finite(visualBox.x);
  const y = finite(visualBox.y);
  const w = Math.max(1, finite(visualBox.w));
  const h = Math.max(1, finite(visualBox.h));
  const at = (rx, ry) => ({ x: x + w * rx, y: y + h * ry });
  const nodeSize = Math.min(w * 0.10, h * 0.15);
  const nodes = {
    demand: { ...at(0.438, 0.204), size: nodeSize },
    prd: { ...at(0.882, 0.204), size: nodeSize },
    prototype: { ...at(0.438, 0.817), size: nodeSize },
    review: { ...at(0.882, 0.817), size: nodeSize }
  };
  return {
    x,
    y,
    w,
    h,
    center: at(0.659, 0.472),
    ring: { x: x + w * 0.343, y: y + h * 0.026, w: w * 0.629, h: h * 0.946 },
    nodes,
    inputCrop: { x: x + w * 0.045, y: y + h * 0.425, w: w * 0.205, h: h * 0.235 },
    pictorialRegions: [
      { key: "node-demand", box: { x: x + w * 0.378, y: y + h * 0.103, w: w * 0.120, h: h * 0.188 }, includesFrame: true },
      { key: "node-prd", box: { x: x + w * 0.826, y: y + h * 0.103, w: w * 0.120, h: h * 0.188 }, includesFrame: true },
      { key: "node-prototype", box: { x: x + w * 0.378, y: y + h * 0.730, w: w * 0.120, h: h * 0.188 }, includesFrame: true },
      { key: "node-review", box: { x: x + w * 0.826, y: y + h * 0.730, w: w * 0.120, h: h * 0.188 }, includesFrame: true },
      { key: "center-assets", box: { x: x + w * 0.574, y: y + h * 0.424, w: w * 0.171, h: h * 0.123 } },
      { key: "route-demand", box: { x: x + w * 0.492, y: y + h * 0.252, w: w * 0.056, h: h * 0.076 } },
      { key: "route-prd", box: { x: x + w * 0.768, y: y + h * 0.252, w: w * 0.058, h: h * 0.076 } },
      { key: "route-prototype", box: { x: x + w * 0.494, y: y + h * 0.668, w: w * 0.055, h: h * 0.078 } },
      { key: "route-review", box: { x: x + w * 0.772, y: y + h * 0.668, w: w * 0.056, h: h * 0.078 } }
    ]
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

module.exports = { resolveAssetOsClosedLoopLayout };
