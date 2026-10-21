"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writePng } = require("../packages/slideclone-core/png");
const { replaceResidualCropsWithNativeComponents, _private: { analyzeLineArt } } = require("../packages/slideclone-core/residual-crop-native-replacement");

test("native residual line-art color comes from its own crop, not neighboring visual atoms", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "residual-native-color-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, raster] of [["server", createServerOutlineImage()], ["cross", createDashedCrossImage()]]) {
    const crop = residualImage(name, writeAsset(root, `assets/${name}.png`, raster), { x: 20, y: 30, w: 90, h: 75 });
    crop.source.layer.visualAtoms = [{ color: "#7298DA" }, { color: "#202124" }];
    const page = { images: [crop], shapes: [] };
    const result = replaceResidualCropsWithNativeComponents({ page, root });
    assert.equal(result.replaced, 1);
    assert.ok(page.shapes.every(shape => shape.style.stroke === "#202124"));
    assert.ok(page.shapes.every(shape => shape.source.editable === true));
  }
});

test("line-art stroke sampling ignores transparent colors and preserves a genuine non-gray stroke", () => {
  const image = makeImage(64, 64, "#FFFFFF");
  fillRect(image, 10, 10, 20, 3, "#702010");
  const transparent = parseHex("#0000FF");
  for (let index = 0; index < 10; index++) {
    image.rgba.set([...transparent, 0], index * 4);
  }
  assert.equal(analyzeLineArt(image).strokeColor, "#702010");
  assert.equal(analyzeLineArt(makeImage(10, 10, "#FFFFFF")).strokeColor, null);
});

test("line-art sampling rejects invalid, truncated and excessive raster inputs", () => {
  for (const value of [null, {}, { width: -1, height: 10, rgba: Buffer.alloc(40) },
    { width: 10, height: 10, rgba: Buffer.alloc(399) },
    { width: 10, height: 10, rgba: Array(400).fill(0) },
    { width: 513, height: 513, rgba: Buffer.alloc(513 * 513 * 4) },
    { width: Infinity, height: 10, rgba: Buffer.alloc(40) }]) {
    assert.throws(() => analyzeLineArt(value), /safe bounds/u);
  }
});

test("residual crop native replacement converts server outline crops into editable shapes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "residual-native-server-"));
  const assetPath = writeAsset(root, "assets/page-001/server.png", createServerOutlineImage());
  const page = {
    shapes: [],
    images: [residualImage("server-crop", assetPath, { x: 198.33, y: 169.17, w: 73.33, h: 70.36 })]
  };

  const result = replaceResidualCropsWithNativeComponents({ page, root });

  assert.equal(result.replaced, 1);
  assert.equal(page.images.length, 0);
  assert.ok(page.shapes.some((shape) => shape.source?.detector === "residual-crop-native-server-stack"));
  assert.ok(page.shapes.some((shape) => shape.type === "roundRect"));
  assert.ok(page.shapes.some((shape) => shape.type === "line"));
});

test("residual crop native replacement converts dashed cross crops into editable lines", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "residual-native-cross-"));
  const assetPath = writeAsset(root, "assets/page-001/cross.png", createDashedCrossImage());
  const page = {
    shapes: [],
    images: [residualImage("cross-crop", assetPath, { x: 122.08, y: 248.69, w: 93.33, h: 77.85 })]
  };

  const result = replaceResidualCropsWithNativeComponents({ page, root });

  assert.equal(result.replaced, 1);
  assert.equal(page.images.length, 0);
  assert.equal(page.shapes.length, 2);
  assert.ok(page.shapes.every((shape) => shape.type === "line"));
  assert.ok(page.shapes.every((shape) => shape.style?.dash === "dash"));
  assert.ok(page.shapes.every((shape) => shape.source?.detector === "residual-crop-native-dashed-cross"));
  const [a, b] = page.shapes;
  assert.ok(a.box.h < 0 && b.box.h > 0);
  assert.ok(b.box.x - a.box.x > 5, "asymmetric source endpoints must not collapse onto the same crop corner");
});

test("residual crop native replacement preserves dense pictorial icon crops", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "residual-native-pictorial-"));
  const assetPath = writeAsset(root, "assets/page-001/icon.png", createFilledBlueIconImage());
  const page = {
    shapes: [],
    images: [{
      ...residualImage("blue-icon", assetPath, { x: 560, y: 188, w: 44, h: 36 }),
      source: {
        strategy: "local-fidelity-crop",
        detector: "knowledge-graph-semantic-icon-crop",
        protectedMinimumUnit: true,
        expressionSubtype: "knowledge-graph-icon"
      }
    }]
  };

  const result = replaceResidualCropsWithNativeComponents({ page, root });

  assert.equal(result.replaced, 0);
  assert.equal(page.images.length, 1);
  assert.equal(page.shapes.length, 0);
});

function residualImage(id, assetPath, box) {
  return {
    id,
    type: "fidelity-crop",
    assetPath,
    box,
    source: {
      strategy: "local-fidelity-crop",
      detector: "mixed-diagram-semantic-atom-residual-crop",
      layer: {
        visualAtoms: [{ color: "#202124" }]
      }
    }
  };
}

function writeAsset(root, relativePath, image) {
  const file = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writePng(file, image);
  return relativePath;
}

function createServerOutlineImage() {
  const image = makeImage(176, 169, "#FFFFFF");
  drawLine(image, 52, 10, 120, 10, "#202124", 5);
  drawLine(image, 120, 10, 141, 30, "#202124", 5);
  drawLine(image, 141, 30, 141, 118, "#202124", 5);
  drawLine(image, 52, 40, 141, 40, "#202124", 5);
  drawLine(image, 52, 78, 141, 78, "#202124", 5);
  drawLine(image, 52, 118, 141, 118, "#202124", 5);
  fillRect(image, 66, 27, 18, 5, "#202124");
  fillCircle(image, 120, 60, 5, "#202124");
  fillCircle(image, 120, 98, 5, "#202124");
  return image;
}

function createDashedCrossImage() {
  const image = makeImage(224, 187, "#FFFFFF");
  drawDashedLine(image, 28, 150, 178, 34, "#202124", 5, 18, 13);
  drawDashedLine(image, 52, 34, 178, 150, "#202124", 5, 18, 13);
  return image;
}

function createFilledBlueIconImage() {
  const image = makeImage(110, 92, "#FFFFFF");
  for (let y = 8; y < 86; y += 1) {
    for (let x = 8; x < 102; x += 1) {
      const nx = (x - 55) / 48;
      const ny = (y - 46) / 38;
      if (Math.abs(nx) + Math.abs(ny) <= 1.25) setPixel(image, x, y, "#1473E6");
    }
  }
  drawLine(image, 28, 22, 54, 36, "#E8F1FF", 4);
  drawLine(image, 54, 36, 82, 20, "#E8F1FF", 4);
  return image;
}

function makeImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const [r, g, b] = parseHex(color);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setPixel(image, xx, yy, color);
  }
}

function fillCircle(image, cx, cy, radius, color) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(image, x, y, color);
    }
  }
}

function drawDashedLine(image, x1, y1, x2, y2, color, width, dashLength, gapLength) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  for (let start = 0; start < length; start += dashLength + gapLength) {
    const end = Math.min(length, start + dashLength);
    drawLine(image, x1 + ux * start, y1 + uy * start, x1 + ux * end, y1 + uy * end, color, width);
  }
}

function drawLine(image, x1, y1, x2, y2, color, width = 3) {
  const radius = Math.max(1, Math.floor(width / 2));
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    fillCircle(image, x, y, radius, color);
  }
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const [r, g, b] = parseHex(color);
  const offset = (Math.round(y) * image.width + Math.round(x)) * 4;
  image.rgba[offset] = r;
  image.rgba[offset + 1] = g;
  image.rgba[offset + 2] = b;
  image.rgba[offset + 3] = 255;
}

function parseHex(color) {
  const text = color.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(text.slice(offset, offset + 2), 16));
}
