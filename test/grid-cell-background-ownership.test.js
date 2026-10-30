"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createLineTextNativeComponents } = require("../packages/slideclone-core/typography/line-text-native-components");
const { eraseObjectMask } = require("../packages/slideclone-core/archetypes/full-slide-native-residual");
const { eraseMasks } = require("../packages/slideclone-core/scene-plan/residual-primitive-erasure");
const { auditResidualPixelOwnership } = require("../packages/slideclone-core/scene-plan/residual-pixel-ownership");

function fixture({ rows = 1, scale = 1, shift = 0, fill = [240, 246, 254] } = {}) {
  const image = { width: 400 * scale, height: 300 * scale, rgba: Buffer.alloc(400 * 300 * scale * scale * 4) };
  for (let i = 0; i < image.rgba.length; i += 4) image.rgba.set([...fill, 255], i);
  const lines = [], textBoxes = [], x = 80 + shift, y = 50, w = 180, step = 80;
  for (let row = 0; row <= rows; row++) lines.push({ type: "line", box: { x, y: y + row * step, w, h: 0 }, style: { stroke: "#234567", strokeWidthPt: 1 } });
  for (const edge of [x, x + w]) lines.push({ type: "line", box: { x: edge, y, w: 0, h: rows * step }, style: { stroke: "#234567", strokeWidthPt: 1 } });
  for (let row = 0; row < rows; row++) for (let col = 0; col < 4; col++) textBoxes.push({ id: `r${row}c${col}`,
    text: `changed-${row}-${col}`, box: { x: x + 10 + col * 40, y: y + row * step + 15, w: 25, h: 12 } });
  return { image, lines, textBoxes, slideSize: { widthPt: 400, heightPt: 300 }, x, y };
}

test("one outlined region containing many texts is not evidence of a repeated table grid", () => {
  for (const shift of [0, 23]) {
    const f = fixture({ shift });
    f.textBoxes.push(...Array.from({ length: 12 }, (_, index) => ({ id: `extra-${index}`, text: `changed-${index}`,
      box: { x: f.x + 10 + index * 5, y: f.y + 40, w: 20, h: 12 } })));
    const shapes = createLineTextNativeComponents(f);
    assert.equal(shapes.filter(s => s.source.detector === "line-text-native-grid-cell").length, 0);
    assert.equal(shapes.filter(s => s.source.detector === "line-text-native-grid-rule").length, 0);
  }
});

test("measured repeated cells own their fill and preserve unrelated inner foreground", () => {
  for (const scale of [1, 2]) for (const fill of [[240, 246, 254], [245, 225, 190]]) {
    const f = fixture({ rows: 2, scale, fill }), iconX = Math.round((f.x + 30) * scale), iconY = Math.round((f.y + 50) * scale);
    for (let y = iconY; y < iconY + 8; y++) for (let x = iconX; x < iconX + 8; x++) f.image.rgba.set([35, 70, 140, 255], (y * f.image.width + x) * 4);
    const shapes = createLineTextNativeComponents(f), cells = shapes.filter(s => s.source.detector === "line-text-native-grid-cell");
    assert.equal(cells.length, 2);
    const cell = cells[0];
    assert.equal(cell.source.preserveResidualInterior, true); assert.equal(cell.source.residualBackgroundFill, true);
    const mask = eraseObjectMask(cell, f.image, { w: 400, h: 300 }), residual = eraseMasks(f.image, [mask], { transparent: true });
    const offset = (iconY * f.image.width + iconX) * 4;
    assert.deepEqual(residual.rgba.subarray(offset, offset + 4), f.image.rgba.subarray(offset, offset + 4));
    assert.equal(auditResidualPixelOwnership({ source: f.image, residual, masks: [mask] }).passed, true);
    assert.equal(residual.rgba[(Math.round((f.y + 5) * scale) * f.image.width + Math.round((f.x + 5) * scale)) * 4 + 3], 0);
  }
});
