"use strict";
// @ts-check

const { round } = require("./raster-native-detection");

/** @param {unknown} value @param {string} fallback */
function safeIdentifier(value, fallback) {
  const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  return safe || fallback;
}

/** @param {{x:number,y:number}} start @param {{x:number,y:number}} end */
function lineBox(start, end) {
  return {
    x: round(start.x),
    y: round(start.y),
    w: round(end.x - start.x),
    h: round(end.y - start.y)
  };
}

module.exports = { lineBox, safeIdentifier };
