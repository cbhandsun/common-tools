"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dropLineTextCoveredForegroundCrops,
  shouldDropLineTextCoveredForegroundCrop
} = require("../packages/slideclone-core/scene-plan/page-output-rules");

function foregroundImage(reason = "complex-graphic-preserved-as-movable-crop") {
  return {
    id: "foreground-large",
    box: { x: 40, y: 80, w: 600, h: 220 },
    source: { detector: "foreground-graphic-crop", reason }
  };
}

function documentForegroundImage() {
  return {
    ...foregroundImage("screenshot preserved as movable crop"),
    source: {
      detector: "foreground-graphic-crop",
      reason: "screenshot preserved as movable crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "screenshot-or-document-region"
    }
  };
}

function recoveredDocumentForegroundImage() {
  const image = documentForegroundImage();
  image.source = { ...image.source, textErasedFromCrop: true, recoveredOcrLines: 8 };
  return image;
}

function shape(id, x, y, w, h, detector = "line-text-native-card-row") {
  return {
    id,
    type: "rect",
    box: { x, y, w, h },
    style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidthPt: 1 },
    source: { detector, editable: true, nativeRebuild: true }
  };
}

function text(id, x, y) {
  return { id, text: id, box: { x, y, w: 40, h: 12 } };
}

test("line-text covered foreground crops are dropped only after strong native coverage", () => {
  const image = foregroundImage();
  const page = {
    images: [
      { id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} },
      image
    ],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      shape("card-a", 70, 112, 120, 44),
      shape("card-b", 210, 112, 120, 44),
      shape("card-c", 350, 112, 120, 44),
      shape("card-d", 490, 112, 120, 44)
    ],
    textBoxes: [
      text("a", 80, 120),
      text("b", 220, 120),
      text("c", 360, 120),
      text("d", 500, 120),
      text("e", 80, 190),
      text("f", 220, 190)
    ]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
  dropLineTextCoveredForegroundCrops(page);

  assert.deepEqual(page.images.map((item) => item.id), ["full"]);
  assert.equal(image.source.lineTextResidualDropped, true);
});

test("line-text coverage keeps protected or weakly covered foreground crops", () => {
  const protectedImage = foregroundImage("screenshot preserved as movable crop");
  const weakImage = foregroundImage();
  const weakPage = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, weakImage],
    shapes: [shape("only-card", 70, 112, 120, 44)],
    textBoxes: [text("a", 80, 120), text("b", 220, 120)]
  };
  const protectedPage = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, protectedImage],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      shape("card-a", 70, 112, 120, 44),
      shape("card-b", 210, 112, 120, 44),
      shape("card-c", 350, 112, 120, 44),
      shape("card-d", 490, 112, 120, 44)
    ],
    textBoxes: [text("a", 80, 120), text("b", 220, 120), text("c", 360, 120), text("d", 500, 120), text("e", 80, 190), text("f", 220, 190)]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(weakImage, weakPage), false);
  assert.equal(shouldDropLineTextCoveredForegroundCrop(protectedImage, protectedPage), false);
});

test("line-text coverage can objectify OCR-recovered document-like screenshot crops", () => {
  const image = recoveredDocumentForegroundImage();
  const page = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, image],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      shape("card-a", 70, 112, 120, 44),
      shape("card-b", 210, 112, 120, 44),
      shape("card-c", 350, 112, 120, 44),
      shape("card-d", 490, 112, 120, 44)
    ],
    textBoxes: [text("a", 80, 120), text("b", 220, 120), text("c", 360, 120), text("d", 500, 120), text("e", 80, 190), text("f", 220, 190)]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage keeps document-like screenshot crops before OCR recovery", () => {
  const image = documentForegroundImage();
  const page = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, image],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      shape("card-a", 70, 112, 120, 44),
      shape("card-b", 210, 112, 120, 44),
      shape("card-c", 350, 112, 120, 44),
      shape("card-d", 490, 112, 120, 44)
    ],
    textBoxes: [text("a", 80, 120), text("b", 220, 120), text("c", 360, 120), text("d", 500, 120), text("e", 80, 190), text("f", 220, 190)]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage drops document crops with strong native structure and dense text", () => {
  const image = documentForegroundImage();
  const page = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, image],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      ...Array.from({ length: 10 }, (_, index) => shape(`card-${index}`, 60 + (index % 5) * 110, 108 + Math.floor(index / 5) * 70, 96, 46))
    ],
    textBoxes: Array.from({ length: 14 }, (_, index) => text(`t-${index}`, 70 + (index % 7) * 78, 120 + Math.floor(index / 7) * 72))
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage keeps strongly structured document crops until text is preserved", () => {
  const image = documentForegroundImage();
  const page = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, image],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      ...Array.from({ length: 12 }, (_, index) => shape(`card-${index}`, 50 + (index % 6) * 92, 104 + Math.floor(index / 6) * 72, 82, 48))
    ],
    textBoxes: []
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage can drop foreground crops when native shape coverage is strong without text boxes", () => {
  const image = foregroundImage();
  const page = {
    images: [{ id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} }, image],
    shapes: [
      shape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      shape("card-a", 70, 112, 120, 44),
      shape("card-b", 210, 112, 120, 44),
      shape("card-c", 350, 112, 120, 44),
      shape("card-d", 490, 112, 120, 44),
      shape("card-e", 70, 190, 120, 44),
      shape("card-f", 210, 190, 120, 44),
      shape("card-g", 350, 190, 120, 44)
    ],
    textBoxes: []
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage can objectify document-like stack bar crops with native bars and text evidence", () => {
  const image = {
    ...documentForegroundImage(),
    id: "stack-crop",
    box: { x: 320, y: 220, w: 150, h: 160 }
  };
  const page = {
    images: [{ id: "peer", box: { x: 520, y: 220, w: 150, h: 160 }, source: {} }, image],
    shapes: Array.from({ length: 5 }, (_, index) =>
      shape(`stack-${index}`, 326, 226 + index * 28, 138, 24, "line-text-native-stack-bar")),
    textBoxes: Array.from({ length: 5 }, (_, index) => ({
      id: `label-${index}`,
      text: `label-${index}`,
      box: { x: 376, y: 235 + index * 26, w: 48, h: 10 }
    }))
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage can objectify sliced document stack bar crops with crossing text evidence", () => {
  const image = {
    ...documentForegroundImage(),
    id: "stack-slice",
    box: { x: 320, y: 220, w: 124, h: 144 }
  };
  const page = {
    images: [{ id: "peer", box: { x: 496, y: 220, w: 128, h: 144 }, source: {} }, image],
    shapes: Array.from({ length: 4 }, (_, index) =>
      shape(`stack-${index}`, 366 + index * 4, 226 + index * 34, 190 - index * 8, 32, "line-text-native-stack-bar")),
    textBoxes: Array.from({ length: 4 }, (_, index) => ({
      id: `crossing-label-${index}`,
      text: `crossing label ${index}`,
      box: { x: 426, y: 235 + index * 34, w: 96, h: 13 }
    }))
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage keeps sliced document stack bar crops without enough crossing text", () => {
  const image = {
    ...documentForegroundImage(),
    id: "stack-slice",
    box: { x: 320, y: 220, w: 124, h: 144 }
  };
  const page = {
    images: [{ id: "peer", box: { x: 496, y: 220, w: 128, h: 144 }, source: {} }, image],
    shapes: Array.from({ length: 4 }, (_, index) =>
      shape(`stack-${index}`, 366 + index * 4, 226 + index * 34, 190 - index * 8, 32, "line-text-native-stack-bar")),
    textBoxes: [
      { id: "crossing-label-0", text: "crossing label", box: { x: 430, y: 235, w: 86, h: 12 } }
    ]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage keeps document-like stack bar crops without text evidence", () => {
  const image = {
    ...documentForegroundImage(),
    id: "stack-crop",
    box: { x: 320, y: 220, w: 150, h: 160 }
  };
  const page = {
    images: [{ id: "peer", box: { x: 520, y: 220, w: 150, h: 160 }, source: {} }, image],
    shapes: Array.from({ length: 5 }, (_, index) =>
      shape(`stack-${index}`, 326, 226 + index * 28, 138, 24, "line-text-native-stack-bar")),
    textBoxes: []
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage can objectify protected narrow native table columns", () => {
  const image = {
    id: "narrow-column",
    box: { x: 900, y: 80, w: 48, h: 350 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      protectedMinimumUnit: true
    }
  };
  const page = {
    images: [image],
    shapes: [
      ...Array.from({ length: 7 }, (_, index) =>
        shape(`cell-${index}`, 898, 84 + index * 46, 52, 40, "line-text-native-matrix-cell")),
      shape("grid", 948, 80, 0, 350, "line-text-native-grid-rule")
    ],
    textBoxes: Array.from({ length: 7 }, (_, index) => ({
      id: `status-${index}`,
      text: `状态${index}`,
      box: { x: 908, y: 96 + index * 46, w: 32, h: 12 }
    }))
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage keeps protected narrow columns without native text coverage", () => {
  const image = {
    id: "narrow-column",
    box: { x: 900, y: 80, w: 48, h: 350 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      protectedMinimumUnit: true
    }
  };
  const page = {
    images: [image],
    shapes: Array.from({ length: 7 }, (_, index) =>
      shape(`cell-${index}`, 898, 84 + index * 46, 52, 40, "line-text-native-matrix-cell")),
    textBoxes: []
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage can objectify narrow slices crossed by native text boxes", () => {
  const image = {
    id: "narrow-slice",
    box: { x: 864, y: 80, w: 84, h: 350 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      protectedMinimumUnit: true
    }
  };
  const page = {
    images: [image],
    shapes: Array.from({ length: 7 }, (_, index) =>
      shape(`cell-${index}`, 864, 84 + index * 46, 84, 40, "line-text-native-matrix-cell")),
    textBoxes: Array.from({ length: 7 }, (_, index) => ({
      id: `slice-text-${index}`,
      text: `说明${index}`,
      box: { x: 780, y: 96 + index * 46, w: 160, h: 12 }
    }))
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage keeps narrow slices without enough crossed text area", () => {
  const image = {
    id: "narrow-slice",
    box: { x: 864, y: 80, w: 84, h: 350 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      protectedMinimumUnit: true
    }
  };
  const page = {
    images: [image],
    shapes: Array.from({ length: 7 }, (_, index) =>
      shape(`cell-${index}`, 864, 84 + index * 46, 84, 40, "line-text-native-matrix-cell")),
    textBoxes: Array.from({ length: 3 }, (_, index) => ({
      id: `slice-text-${index}`,
      text: `说明${index}`,
      box: { x: 780, y: 96 + index * 46, w: 160, h: 12 }
    }))
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage drops tiny footer brand crops when neighboring footer text is native", () => {
  const image = {
    id: "footer-brand",
    box: { x: 690, y: 1226, w: 84, h: 29 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "screenshot-or-document-region"
    }
  };
  const page = {
    images: [image],
    shapes: [
      shape("footer-band", 20, 1210, 920, 56, "solid-region-native-background")
    ],
    textBoxes: [
      { id: "footer-a", text: "Company", box: { x: 778, y: 1220, w: 80, h: 12 } },
      { id: "footer-b", text: "Product services", box: { x: 778, y: 1242, w: 120, h: 12 } }
    ]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), true);
});

test("line-text coverage keeps tiny footer crops without neighboring footer text", () => {
  const image = {
    id: "footer-brand",
    box: { x: 690, y: 1226, w: 84, h: 29 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "screenshot-or-document-region"
    }
  };
  const page = {
    images: [image],
    shapes: [shape("footer-band", 20, 1210, 920, 56, "solid-region-native-background")],
    textBoxes: [{ id: "distant", text: "Footer", box: { x: 40, y: 1220, w: 80, h: 12 } }]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage keeps tiny brand-like crops outside the footer band", () => {
  const image = {
    id: "middle-brand",
    box: { x: 690, y: 626, w: 84, h: 29 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "screenshot-or-document-region"
    }
  };
  const page = {
    images: [image],
    shapes: [
      shape("footer-band", 20, 1210, 920, 56, "solid-region-native-background")
    ],
    textBoxes: [
      { id: "near-a", text: "Company", box: { x: 778, y: 620, w: 80, h: 12 } },
      { id: "near-b", text: "Product services", box: { x: 778, y: 642, w: 120, h: 12 } },
      { id: "footer", text: "Footer", box: { x: 40, y: 1240, w: 80, h: 12 } }
    ]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});

test("line-text coverage keeps large footer crops even with neighboring footer text", () => {
  const image = {
    id: "large-footer-visual",
    box: { x: 620, y: 1190, w: 160, h: 60 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "screenshot-or-document-region"
    }
  };
  const page = {
    images: [image],
    textBoxes: [
      { id: "footer-a", text: "Company", box: { x: 790, y: 1202, w: 80, h: 12 } },
      { id: "footer-b", text: "Product services", box: { x: 790, y: 1224, w: 120, h: 12 } }
    ]
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(image, page), false);
});
