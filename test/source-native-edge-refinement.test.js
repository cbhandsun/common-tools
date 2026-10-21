"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { refineSourceNativeEdges, reassignSourceNativeEdgeOwners } = require("../packages/slideclone-core/source-native-edge-refinement");

test("source edge fitting admits saturated ink behind an antialiased stroke estimate, not another hue", () => {
  for (const color of [[20, 70, 225], [225, 70, 20], [80, 80, 80]]) {
    const image = imageWithFill(120, 90, [255, 255, 255]);
    for (let y = 39; y <= 41; y++) horizontalLine(image, 20, y, 60, color);
    const page = { shapes: [{ id: "line", type: "line", box: { x: 20, y: 40, w: 60, h: 0 },
      source: { nativeRebuild: true, detector: "long-axis-line" },
      style: { stroke: "#4F81E0", strokeWidthPt: 0.25 } }] };
    const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });
    assert.equal(result.evidence.linesRefined, color[2] === 225 ? 1 : 0);
    if (result.evidence.linesRefined) {
      assert.equal(result.page.shapes[0].style.strokeWidthPt, 3);
      assert.equal(result.page.shapes[0].style.stroke, "#1446e1");
    }
  }
});

test("source edge fitting bounds shape input before cloning", () => {
  const image = imageWithFill(12, 12, [255, 255, 255]);
  for (const shapes of ["secret", {}, new Array(10001)]) {
    assert.throws(() => refineSourceNativeEdges({ page: { shapes }, image, slideSize: { widthPt: 12, heightPt: 12 } }),
      error => /shapes/.test(error.message) && !error.message.includes("secret"));
  }
});

test("source edge fitting preserves signed native connector endpoints and arrow ownership", () => {
  for (const vertical of [false, true]) for (const sign of [-1, 1]) {
    const image = imageWithFill(120, 90, [255, 255, 255]);
    if (vertical) verticalLine(image, 60, 20, 60, [48, 90, 210]);
    else horizontalLine(image, 20, 40, 60, [48, 90, 210]);
    const box = vertical
      ? { x: 58, y: sign < 0 ? 60 : 20, w: 0, h: sign * 40 }
      : { x: sign < 0 ? 80 : 20, y: 38, w: sign * 60, h: 0 };
    const source = { nativeRebuild: true, editable: true, semanticNativeStructure: true, detector: "semantic-connector" };
    const shape = { id: "connector", type: "line", box, source,
      style: { stroke: "#305AD2", strokeWidthPt: 0.25, connectorType: "straight", endArrow: "triangle" } };
    const before = structuredClone(shape);
    const result = refineSourceNativeEdges({ page: { shapes: [shape] }, slideSize: { widthPt: 120, heightPt: 90 }, image });
    assert.equal(result.evidence.linesRefined, 1);
    const fitted = result.page.shapes[0];
    assert.equal(Math.sign(vertical ? fitted.box.h : fitted.box.w), sign);
    assert.equal(vertical ? fitted.box.y : fitted.box.x, vertical ? box.y : box.x);
    assert.equal(fitted.style.endArrow, "triangle");
    assert.ok(Math.abs((vertical ? fitted.box.x : fitted.box.y) - (vertical ? 60 : 40)) <= 1);
    assert.deepEqual(shape, before);
  }
});

test("source edge fitting leaves diagonal, curved, unverified and unsupported connectors intact", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  horizontalLine(image, 20, 40, 60, [48, 90, 210]);
  const base = { id: "line", type: "line", box: { x: 20, y: 38, w: 60, h: 0 },
    source: { nativeRebuild: true, editable: true, semanticNativeStructure: true },
    style: { stroke: "#305AD2", connectorType: "straight" } };
  for (const shape of [
    { ...base, box: { ...base.box, h: 30 } },
    { ...base, style: { ...base.style, connectorType: "curved" } },
    { ...base, source: { nativeRebuild: true } },
    { ...base, box: { x: 20, y: 10, w: 60, h: 0 } },
    { ...base, box: { x: 20, y: 38, w: 0, h: 0 } },
    { ...base, box: { ...base.box, w: Infinity } }
  ]) {
    const result = refineSourceNativeEdges({ page: { shapes: [shape] }, slideSize: { widthPt: 120, heightPt: 90 }, image });
    assert.equal(result.evidence.linesRefined, 0);
    assert.deepEqual(result.page.shapes[0], shape);
  }
});

test("source native edge refinement fits a light full card border from source pixels", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  strokeRect(image, 24, 20, 72, 44, [218, 225, 245]);
  const page = { shapes: [card("card", { x: 20, y: 17, w: 79, h: 51 })] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });

  assert.equal(result.evidence.rectsRefined, 1);
  assert.equal(result.evidence.partialSideLines, 0);
  assert.equal(result.page.shapes.length, 1);
  assert.ok(Math.abs(result.page.shapes[0].box.x - 24) <= 1);
  assert.ok(Math.abs(result.page.shapes[0].box.y - 20) <= 1);
  assert.ok(Math.abs(result.page.shapes[0].box.w - 72) <= 2);
  assert.equal(result.page.shapes[0].source.sourceNativeEdgeRefinement.provider, "source-native-edge-refinement-v1");
});

test("source native edge refinement turns a borderless pale panel into a native fill without stroke", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  fillRect(image, 20, 20, 70, 36, [246, 248, 252]);
  const page = { shapes: [card("panel", { x: 20, y: 20, w: 70, h: 36 })] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });

  assert.equal(result.evidence.panelsWithoutStroke, 1);
  assert.equal(result.page.shapes[0].style.fill, "#f6f8fc");
  assert.equal(result.page.shapes[0].style.stroke, "none");
  assert.equal(result.page.shapes[0].style.strokeWidthPt, 0);
});

test("source native edge refinement represents partial card sides as native lines", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  verticalLine(image, 20, 18, 60, [210, 226, 240]);
  const page = { shapes: [card("partial", { x: 18, y: 18, w: 70, h: 42 })] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });

  assert.equal(result.evidence.partialSideLines, 1);
  assert.equal(result.page.shapes[0].style.stroke, "none");
  assert.equal(result.page.shapes[1].type, "line");
  assert.equal(result.page.shapes[1].source.supportedSide, "left");
  assert.ok(Math.abs(result.page.shapes[1].box.x - 20) <= 1);
  assert.ok(result.page.shapes[1].style.strokeWidthPt <= 1.1);
});

test("source native edge refinement assigns partial side ownership by final side geometry", () => {
  const image = imageWithFill(180, 90, [255, 255, 255]);
  horizontalLine(image, 74, 26, 62, [210, 226, 240]);
  const page = {
    shapes: [
      card("previous-card", { x: 10, y: 30, w: 50, h: 36 }),
      card("matching-card", { x: 74, y: 31, w: 62, h: 34 })
    ]
  };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 180, heightPt: 90 }, image });

  const line = result.page.shapes.find((shape) => shape.source?.detector === "source-native-edge-refinement" && shape.source.supportedSide === "top");
  assert.ok(line);
  assert.equal(line.source.sourceShapeId, "matching-card");
  assert.equal(line.source.sourceNativeEdgeOwnerReassigned, undefined);
});

test("source native edge refinement reassigns side owner after object ids become unique", () => {
  const page = {
    shapes: [
      card("line-text-card-row-19", { x: 163.77, y: 448.67, w: 101.12, h: 58.89 }),
      card("line-text-card-row-19-2", { x: 272.89, y: 449.56, w: 122.67, h: 46.44 }),
      {
        id: "line-text-card-row-19-source-top-1",
        type: "line",
        box: { x: 272.89, y: 444.44, w: 122.67, h: 0 },
        style: { stroke: "#dad1f7", strokeWidthPt: 0.825, connectorType: "straight" },
        source: { editable: true, nativeRebuild: true, detector: "source-native-edge-refinement", sourceShapeId: "line-text-card-row-19", supportedSide: "top" }
      }
    ]
  };

  const changed = reassignSourceNativeEdgeOwners(page);

  assert.equal(changed, 1);
  assert.equal(page.shapes[2].source.sourceShapeId, "line-text-card-row-19-2");
  assert.equal(page.shapes[2].source.sourceNativeEdgeOwnerReassigned.previousSourceShapeId, "line-text-card-row-19");
});

test("source native edge refinement keeps partial side lines adjacent to their source card", () => {
  const image = imageWithFill(180, 90, [255, 255, 255]);
  verticalLine(image, 20, 18, 60, [210, 226, 240]);
  verticalLine(image, 142, 18, 60, [210, 226, 240]);
  const page = {
    shapes: [
      card("first", { x: 18, y: 18, w: 70, h: 42 }),
      card("second", { x: 140, y: 18, w: 32, h: 42 })
    ]
  };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 180, heightPt: 90 }, image });

  assert.equal(result.page.shapes[0].id, "first");
  assert.equal(result.page.shapes[1].source.sourceShapeId, "first");
  assert.equal(result.page.shapes[2].id, "second");
  assert.equal(result.page.shapes[3].source.sourceShapeId, "second");
});

test("source native edge refinement rejects parallel-only partial card sides", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  horizontalLine(image, 20, 18, 70, [210, 226, 240]);
  horizontalLine(image, 20, 60, 70, [210, 226, 240]);
  const page = { shapes: [card("parallel-only", { x: 20, y: 18, w: 70, h: 42 })] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });

  assert.equal(result.evidence.partialSideLines, 0);
  assert.equal(result.evidence.panelsWithoutStroke, 1);
  assert.equal(result.page.shapes.length, 1);
  assert.equal(result.page.shapes[0].source.sourceNativeEdgeRefinement.kind, "panel");
  assert.equal(result.page.shapes[0].style.stroke, "none");
});

test("source native edge refinement preserves parallel edges for text-backed card rows", () => {
  const image = imageWithFill(140, 90, [255, 255, 255]);
  horizontalLine(image, 22, 20, 82, [186, 205, 249]);
  horizontalLine(image, 22, 60, 82, [186, 205, 249]);
  const page = { shapes: [card("text-card", { x: 20, y: 18, w: 88, h: 44 }, { textCount: 3, rowSize: 4 })] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 140, heightPt: 90 }, image });

  assert.equal(result.evidence.partialSideLines, 2);
  assert.equal(result.page.shapes[0].style.stroke, "none");
  const sideLines = result.page.shapes.filter((shape) => shape.source?.detector === "source-native-edge-refinement");
  assert.equal(sideLines.length, 2);
  assert.deepEqual(sideLines.map((shape) => shape.source.supportedSide).sort(), ["bottom", "top"]);
  assert.ok(sideLines.every((shape) => shape.source.sourceShapeId === "text-card"));
});

test("source native edge refinement does not duplicate source edge lines on repeated runs", () => {
  const image = imageWithFill(140, 90, [255, 255, 255]);
  horizontalLine(image, 22, 20, 82, [186, 205, 249]);
  horizontalLine(image, 22, 60, 82, [186, 205, 249]);
  const page = { shapes: [card("text-card", { x: 20, y: 18, w: 88, h: 44 }, { textCount: 3, rowSize: 4 })] };

  const first = refineSourceNativeEdges({ page, slideSize: { widthPt: 140, heightPt: 90 }, image });
  const second = refineSourceNativeEdges({ page: first.page, slideSize: { widthPt: 140, heightPt: 90 }, image });

  assert.equal(first.evidence.partialSideLines, 2);
  assert.equal(second.evidence.partialSideLines, 0);
  assert.equal(second.page.shapes.filter((shape) => shape.source?.detector === "source-native-edge-refinement").length, 2);
});

test("source native edge refinement adjusts offset native long-axis lines", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  verticalLine(image, 80, 12, 74, [181, 223, 202]);
  const page = {
    shapes: [{
      id: "line",
      type: "line",
      box: { x: 76, y: 12, w: 0, h: 74 },
      style: { stroke: "#B5DFCA", strokeWidthPt: 0.9 },
      source: { nativeRebuild: true, detector: "long-axis-line" }
    }]
  };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });

  assert.equal(result.evidence.linesRefined, 1);
  assert.ok(Math.abs(result.page.shapes[0].box.x - 80) <= 1);
  assert.equal(result.page.shapes[0].style.lineCap, "round");
});

test("source native edge refinement promotes uncovered pale axis lines", () => {
  const image = imageWithFill(160, 90, [255, 255, 255]);
  horizontalLine(image, 20, 44, 104, [224, 232, 242]);
  const page = { shapes: [] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 160, heightPt: 90 }, image, enableSupplementalAxisLines: true });

  assert.equal(result.evidence.supplementalLines, 1);
  assert.equal(result.page.shapes.length, 1);
  assert.equal(result.page.shapes[0].type, "line");
  assert.equal(result.page.shapes[0].source.detector, "source-native-axis-line");
  assert.ok(Math.abs(result.page.shapes[0].box.y - 44) <= 1);
  assert.ok(result.page.shapes[0].box.w >= 100);
});

test("source native edge refinement does not duplicate covered pale axis lines", () => {
  const image = imageWithFill(160, 90, [255, 255, 255]);
  horizontalLine(image, 20, 44, 104, [224, 232, 242]);
  const page = {
    shapes: [{
      id: "existing-line",
      type: "line",
      box: { x: 20, y: 44, w: 104, h: 0 },
      style: { stroke: "#E0E8F2", strokeWidthPt: 0.7 },
      source: { nativeRebuild: true, detector: "long-axis-line" }
    }]
  };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 160, heightPt: 90 }, image, enableSupplementalAxisLines: true });

  assert.equal(result.evidence.supplementalLines, 0);
  assert.equal(result.page.shapes.length, 1);
});

test("source native edge refinement does not add supplemental lines inside preserved image crops", () => {
  const image = imageWithFill(160, 90, [255, 255, 255]);
  horizontalLine(image, 20, 44, 104, [224, 232, 242]);
  const page = {
    shapes: [],
    images: [{
      id: "crop",
      type: "fidelity-crop",
      box: { x: 16, y: 30, w: 112, h: 30 },
      assetPath: "assets/crop.png",
      source: { residualCrop: true }
    }]
  };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 160, heightPt: 90 }, image, enableSupplementalAxisLines: true });

  assert.equal(result.evidence.supplementalLines, 0);
  assert.equal(result.page.shapes.length, 0);
});

test("source native edge refinement fails closed on ambiguous parallel edges", () => {
  const image = imageWithFill(120, 90, [255, 255, 255]);
  verticalLine(image, 20, 18, 60, [210, 226, 240]);
  verticalLine(image, 24, 18, 60, [210, 226, 240]);
  const page = { shapes: [card("ambiguous", { x: 22, y: 18, w: 70, h: 42 })] };

  const result = refineSourceNativeEdges({ page, slideSize: { widthPt: 120, heightPt: 90 }, image });

  assert.equal(result.evidence.rectsRefined, 0);
  assert.equal(result.evidence.partialSideLines, 0);
  assert.equal(result.page.shapes.length, 1);
});

test("source native edge refinement validates input", () => {
  assert.throws(() => refineSourceNativeEdges({}), /Invalid source native edge refinement image/);
  assert.throws(() => refineSourceNativeEdges({ image: { width: 1, height: 1, rgba: new Uint8Array(3) }, slideSize: { widthPt: 1, heightPt: 1 }, page: {} }), /Invalid source native edge refinement image/);
});

function card(id, box, extraSource = {}) {
  return {
    id,
    type: "roundRect",
    box,
    style: { fill: "#FFFFFF", stroke: "#F2EFFD", strokeWidthPt: 0.55 },
    source: { nativeRebuild: true, detector: "line-text-native-card-row", semanticNativeStructure: true, ...extraSource }
  };
}

function imageWithFill(width, height, rgb) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setPixel({ width, height, rgba }, x, y, rgb);
  }
  return { width, height, rgba };
}

function strokeRect(image, x, y, w, h, rgb) {
  for (let at = x; at <= x + w; at += 1) {
    setPixel(image, at, y, rgb);
    setPixel(image, at, y + h, rgb);
  }
  for (let at = y; at <= y + h; at += 1) {
    setPixel(image, x, at, rgb);
    setPixel(image, x + w, at, rgb);
  }
}

function fillRect(image, x, y, w, h, rgb) {
  for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) setPixel(image, xx, yy, rgb);
}

function verticalLine(image, x, y, h, rgb) {
  for (let yy = y; yy <= y + h; yy += 1) setPixel(image, x, yy, rgb);
}

function horizontalLine(image, x, y, w, rgb) {
  for (let xx = x; xx <= x + w; xx += 1) setPixel(image, xx, y, rgb);
}

function setPixel(image, x, y, rgb) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = rgb[0];
  image.rgba[offset + 1] = rgb[1];
  image.rgba[offset + 2] = rgb[2];
  image.rgba[offset + 3] = 255;
}
