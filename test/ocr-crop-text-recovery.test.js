"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readPng, writePng } = require("../packages/slideclone-core/png");
const { recoverMissingOcrText } = require("../packages/slideclone-core/ocr-crop-text-recovery");
const { addFinalTextGroupNativeComponents, addRecoveredLineTextNativeComponents, addSourceOcrLineTextNativeComponents, dropSolidRegionsCoveredByLineTextPanels, expandVisiblePositionedMixedColorTextSegments, promoteLineTextCropOcrText, promoteSourceOcrTextInNativeLineTextShapes, shouldOmitFullSlideResidualAfterOcrRecovery, shouldSuppressSolidRegionDueToLineTextPanel } = require("../packages/slideclone-core/team-native-rebuild");
const { dropLineTextCoveredForegroundCrops, shouldDropLineTextCoveredForegroundCrop } = require("../packages/slideclone-core/page-output-rules");
const { createRawImageNativeRebuilder } = require("../packages/slideclone-core/team-native-rebuild");

const slideSize = { widthPt: 400, heightPt: 300 };
const lines = Array.from({ length: 6 }, (_, index) => ({
  id: `ocr-${index}`, text: `Editable line ${index}`, box: { x: 20, y: 20 + index * 30, w: 80, h: 12 },
  source: { confidence: 0.96 }
}));

test("solid region native backgrounds are suppressed under semantic line text panels", () => {
  const region = { box: { x: 20, y: 40, w: 120, h: 80 } };
  const covered = shouldSuppressSolidRegionDueToLineTextPanel(region, [{
    type: "rect",
    box: { x: 10, y: 30, w: 320, h: 100 },
    source: { detector: "line-text-native-numbered-section-panel" }
  }]);
  const uncovered = shouldSuppressSolidRegionDueToLineTextPanel(region, [{
    type: "rect",
    box: { x: 10, y: 30, w: 80, h: 40 },
    source: { detector: "line-text-native-numbered-section-panel" }
  }]);
  const nonSemantic = shouldSuppressSolidRegionDueToLineTextPanel(region, [{
    type: "rect",
    box: { x: 10, y: 30, w: 320, h: 100 },
    source: { detector: "solid-region-native-background" }
  }]);
  assert.equal(covered, true);
  assert.equal(uncovered, false);
  assert.equal(nonSemantic, false);
});

test("existing solid region native backgrounds are dropped after line text panels are added", () => {
  const page = {
    shapes: [
      {
        id: "solid",
        type: "rect",
        box: { x: 20, y: 40, w: 120, h: 80 },
        source: { detector: "solid-region-native-background" }
      },
      {
        id: "panel",
        type: "rect",
        box: { x: 10, y: 30, w: 320, h: 100 },
        source: { detector: "line-text-native-numbered-section-panel" }
      }
    ]
  };
  assert.equal(dropSolidRegionsCoveredByLineTextPanels(page), 1);
  assert.deepEqual(page.shapes.map((shape) => shape.id), ["panel"]);
});

test("source OCR text is promoted inside native line text carriers without duplicating existing text", () => {
  const page = {
    shapes: [{
      id: "card",
      type: "roundRect",
      box: { x: 100, y: 80, w: 160, h: 70 },
      source: { detector: "line-text-native-card-row", editable: true }
    }],
    textBoxes: [{ id: "existing", text: "Already there", box: { x: 116, y: 96, w: 78, h: 12 } }],
    images: []
  };
  const count = promoteSourceOcrTextInNativeLineTextShapes(page, [
    { id: "inside", text: "Missing native text", box: { x: 116, y: 118, w: 92, h: 12 }, source: { confidence: 0.96 }, font: { color: "#111111" } },
    { id: "outside", text: "Outside text", box: { x: 300, y: 118, w: 76, h: 12 }, source: { confidence: 0.96 } },
    { id: "duplicate", text: "Already there", box: { x: 116, y: 96, w: 78, h: 12 }, source: { confidence: 0.96 } },
    { id: "weak", text: "Weak text", box: { x: 116, y: 136, w: 62, h: 12 }, source: { confidence: 0.4 } }
  ]);

  assert.equal(count, 1);
  const promoted = page.textBoxes.find((item) => item.id === "inside");
  assert.equal(promoted.text, "Missing native text");
  assert.equal(promoted.style.visibility, "visible");
  assert.equal(promoted.style.fit, "shrink");
  assert.equal(promoted.font.color, "#202637");
  assert.equal(promoted.source.ocrRecoveredFromNativeLineTextShape, true);
  assert.equal(page.textBoxes.some((item) => item.id === "outside"), false);
  assert.equal(page.textBoxes.some((item) => item.id === "duplicate"), false);
  assert.equal(page.textBoxes.some((item) => item.id === "weak"), false);
});

function fixture(root) {
  const file = path.join(root, "assets", "crop.png");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const rgba = Buffer.alloc(400 * 300 * 4, 255);
  for (const item of lines) {
    for (let y = item.box.y + 3; y < item.box.y + 8; y += 1) {
      for (let x = item.box.x + 5; x < item.box.x + 55; x += 1) {
        const offset = (y * 400 + x) * 4;
        rgba.fill(0, offset, offset + 3);
      }
    }
  }
  writePng(file, { width: 400, height: 300, rgba });
  const page = { images: [{ id: "crop", assetPath: "assets/crop.png", box: { x: 0, y: 0, w: 400, h: 300 }, source: { detector: "foreground-graphic-crop" } }], textBoxes: [] };
  return { file, page };
}

test("recovers source-backed OCR text and erases its pixels from a flat local crop", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-recovery-"));
  try {
    const { file, page } = fixture(root);
    const result = recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: true });
    assert.deepEqual(result, { recovered: 6, cropsErased: 1 });
    assert.equal(page.textBoxes.length, 6);
    assert.ok(page.textBoxes.every((item) => item.source.ocrRecoveredFromCrop === true));
    assert.ok(page.textBoxes.every((item) => item.style.visibility === "visible" && item.font.opacity === 1));
    assert.equal(page.textBoxes[0].font.color, "#000000");
    assert.equal(page.images[0].source.textErasedFromCrop, true);
    const bitmap = readPng(file);
    const offset = (25 * bitmap.width + 30) * 4;
    assert.deepEqual([...bitmap.rgba.subarray(offset, offset + 3)], [255, 255, 255]);
    assert.deepEqual(recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: true }), { recovered: 0, cropsErased: 0 });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("crop scope leaves unselected image bytes and native text unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-recovery-"));
  try {
    const { file, page } = fixture(root);
    const original = fs.readFileSync(file);
    assert.deepEqual(recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root,
      preserveLocalFidelityImages: true, allowedCropIds: ["another-crop"] }), { recovered: 0, cropsErased: 0 });
    assert.deepEqual(fs.readFileSync(file), original);
    assert.equal(page.textBoxes.length, 0);
    assert.throws(() => recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root,
      preserveLocalFidelityImages: true, allowedCropIds: ["bad", 12] }), /input is invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("recovers crop OCR when a non-target full-slide residual also covers the text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-recovery-"));
  try {
    const { page } = fixture(root);
    page.images.unshift({
      id: "full-slide-residual",
      assetPath: "assets/crop.png",
      box: { x: 0, y: 0, w: 400, h: 300 },
      source: { residualCrop: true, fullSlideResidual: true }
    });
    const result = recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: true });
    assert.deepEqual(result, { recovered: 6, cropsErased: 1 });
    assert.equal(page.textBoxes.length, 6);
    assert.equal(page.images[1].source.textErasedFromCrop, true);
    assert.equal(page.images[0].source.textErasedFromCrop, undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("keeps uncertain, already native, and ambiguous overlapping text out of recovery", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-recovery-"));
  try {
    const { page } = fixture(root);
    page.textBoxes.push({ id: "native", text: "Already native", box: lines[0].box });
    const sources = lines.map((item, index) => index === 1 ? { ...item, source: { confidence: 0.2 } } : item);
    page.images.push({ id: "overlay", assetPath: "assets/crop.png", box: { x: 15, y: 75, w: 90, h: 30 }, source: { detector: "photo" } });
    const result = recoverMissingOcrText({ page, sourceTextBoxes: sources, slideSize, root, preserveLocalFidelityImages: true });
    assert.equal(result.recovered, 0);
    assert.equal(page.textBoxes.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("does not promote text when its crop is not retained or the background is textured", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-recovery-"));
  try {
    const { file, page } = fixture(root);
    assert.deepEqual(recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: false }), { recovered: 0, cropsErased: 0 });
    const bitmap = readPng(file);
    for (let y = 15; y < 205; y += 1) {
      for (let x = 15; x < 110; x += 1) {
        const offset = (y * bitmap.width + x) * 4;
        bitmap.rgba[offset] = x % 4 < 2 ? 80 : 220;
      }
    }
    writePng(file, bitmap);
    assert.deepEqual(recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: true }), { recovered: 0, cropsErased: 0 });
    assert.equal(page.textBoxes.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("full-slide residual can be omitted after bounded OCR crop recovery", () => {
  const slideSize = { widthPt: 960, heightPt: 1280 };
  const page = {
    images: [
      { id: "crop-a", box: { x: 120, y: 80, w: 500, h: 180 }, source: { detector: "foreground-graphic-crop" } },
      { id: "crop-b", box: { x: 20, y: 320, w: 650, h: 190 }, source: { detector: "foreground-graphic-crop" } },
      { id: "small", box: { x: 700, y: 900, w: 80, h: 60 }, source: { detector: "foreground-graphic-crop" } }
    ]
  };

  assert.equal(shouldOmitFullSlideResidualAfterOcrRecovery(page, slideSize, { recovered: 8, cropsErased: 2 }), true);
  assert.equal(shouldOmitFullSlideResidualAfterOcrRecovery(page, slideSize, { recovered: 4, cropsErased: 2 }), false);
  assert.equal(shouldOmitFullSlideResidualAfterOcrRecovery({
    images: [{ id: "large", box: { x: 0, y: 0, w: 900, h: 700 }, source: { detector: "foreground-graphic-crop" } }]
  }, slideSize, { recovered: 8, cropsErased: 1 }), false);
});

test("recovered OCR text can add line-text native band panels", () => {
  const page = {
    shapes: [
      { id: "guide-a", type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, style: {}, source: { detector: "long-axis-line" } },
      { id: "guide-b", type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, style: {}, source: { detector: "long-axis-line" } }
    ],
    textBoxes: [
      { text: "5", box: { x: 32, y: 226, w: 13, h: 14 }, source: { ocrRecoveredFromCrop: true } },
      { text: "检索与上下文", box: { x: 64, y: 222, w: 100, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { text: "理解问题", box: { x: 190, y: 232, w: 58, h: 12 }, source: { ocrRecoveredFromCrop: true } },
      { text: "定位范围", box: { x: 310, y: 232, w: 58, h: 12 }, source: { ocrRecoveredFromCrop: true } },
      { text: "6", box: { x: 32, y: 326, w: 13, h: 14 }, source: { ocrRecoveredFromCrop: true } },
      { text: "岗位能力层", box: { x: 64, y: 322, w: 90, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { text: "查", box: { x: 190, y: 332, w: 20, h: 12 }, source: { ocrRecoveredFromCrop: true } },
      { text: "写", box: { x: 310, y: 332, w: 20, h: 12 }, source: { ocrRecoveredFromCrop: true } },
      { text: "7", box: { x: 32, y: 426, w: 13, h: 14 }, source: { ocrRecoveredFromCrop: true } },
      { text: "AI 员工层", box: { x: 64, y: 422, w: 80, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { text: "销售作战", box: { x: 190, y: 432, w: 58, h: 12 }, source: { ocrRecoveredFromCrop: true } },
      { text: "智能客服", box: { x: 310, y: 432, w: 58, h: 12 }, source: { ocrRecoveredFromCrop: true } }
    ]
  };

  const added = addRecoveredLineTextNativeComponents(page, { widthPt: 960, heightPt: 720 }, "");

  assert.ok(added >= 3);
  assert.equal(page.shapes.filter((shape) => shape.source?.detector === "line-text-native-numbered-band-panel").length, 3);
  assert.equal(page.shapes[0].source?.detector, "line-text-native-numbered-band-panel");
  assert.equal(addRecoveredLineTextNativeComponents(page, { widthPt: 960, heightPt: 720 }, ""), 0);
});

test("recovered line-text native components skip containing duplicate card rows", () => {
  const page = {
    shapes: [
      { id: "guide-a", type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, source: { detector: "long-axis-line" } },
      { id: "guide-b", type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, source: { detector: "long-axis-line" } },
      {
        id: "existing-card",
        type: "rect",
        box: { x: 160, y: 100, w: 92, h: 44 },
        style: { fill: "#0E9C9C", stroke: "#0E9C9C" },
        source: { detector: "line-text-native-card-row" }
      }
    ],
    textBoxes: [
      { id: "a", text: "接口对接", box: { x: 178, y: 110, w: 48, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { id: "b", text: "有开放 API 的系统", box: { x: 178, y: 130, w: 76, h: 11 }, source: { ocrRecoveredFromCrop: true } },
      { id: "c", text: "数据库只读视图", box: { x: 292, y: 110, w: 72, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { id: "d", text: "不动原系统", box: { x: 292, y: 130, w: 58, h: 11 }, source: { ocrRecoveredFromCrop: true } },
      { id: "e", text: "文件定时同步", box: { x: 430, y: 110, w: 70, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { id: "f", text: "导出表格类", box: { x: 430, y: 130, w: 58, h: 11 }, source: { ocrRecoveredFromCrop: true } },
      { id: "g", text: "钉钉生态直连", box: { x: 560, y: 110, w: 70, h: 16 }, source: { ocrRecoveredFromCrop: true } },
      { id: "h", text: "审批日志", box: { x: 560, y: 130, w: 58, h: 11 }, source: { ocrRecoveredFromCrop: true } }
    ]
  };

  addRecoveredLineTextNativeComponents(page, { widthPt: 960, heightPt: 540 }, "");

  const overlapping = page.shapes.filter((shape) => shape.source?.detector === "line-text-native-card-row"
    && shape.id !== "existing-card"
    && shape.box.x <= 162
    && shape.box.x + shape.box.w >= 250
    && shape.box.y <= 102
    && shape.box.y + shape.box.h >= 140);
  assert.equal(overlapping.length, 0);
});

test("final text groups add only missing native side panels after rebuild", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-text-group-native-"));
  try {
    const sourceFile = path.join(root, "source.png");
    const rgba = Buffer.alloc(960 * 720 * 4, 255);
    for (let y = 80; y < 380; y += 1) {
      for (let x = 704; x < 918; x += 1) {
        const offset = (y * 960 + x) * 4;
        rgba[offset] = 248;
        rgba[offset + 1] = 250;
        rgba[offset + 2] = 255;
        rgba[offset + 3] = 255;
      }
    }
    writePng(sourceFile, { width: 960, height: 720, rgba });
    const page = {
      shapes: [
        { id: "guide-a", type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, source: { detector: "long-axis-line" } },
        { id: "guide-b", type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, source: { detector: "long-axis-line" } }
      ],
      textBoxes: []
    };
    for (let index = 0; index < 10; index += 1) {
      page.textBoxes.push(
        { id: `left-${index}`, text: `能力${index + 1}`, box: { x: 724, y: 100 + index * 28, w: 38, h: 12 }, font: { color: "#475569" } },
        { id: `middle-${index}`, text: `通用${index + 1}`, box: { x: 794, y: 100 + index * 28, w: 38, h: 12 }, font: { color: "#64748B" } },
        { id: `right-${index}`, text: `开沿${index + 1}`, box: { x: 862, y: 100 + index * 28, w: 38, h: 12 }, font: { color: "#334155" } }
      );
    }
    assert.equal(addFinalTextGroupNativeComponents(page, { widthPt: 960, heightPt: 720 }, sourceFile), 1);
    assert.equal(page.shapes[0].source.detector, "line-text-native-group-panel");
    assert.equal(page.shapes[0].source.tallSidePanel, true);
    assert.equal(addFinalTextGroupNativeComponents(page, { widthPt: 960, heightPt: 720 }, sourceFile), 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("source OCR inside large foreground crops can seed missing line-text native components", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-ocr-native-components-"));
  try {
    const sourceFile = path.join(root, "source.png");
    const rgba = Buffer.alloc(960 * 540 * 4, 255);
    writePng(sourceFile, { width: 960, height: 540, rgba });
    const page = {
      images: [{ id: "crop", assetPath: "assets/crop.png", box: { x: 120, y: 80, w: 620, h: 180 }, source: { detector: "foreground-graphic-crop" } }],
      shapes: [
        { id: "guide-a", type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, source: { detector: "long-axis-line" } },
        { id: "guide-b", type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, source: { detector: "long-axis-line" } }
      ],
      textBoxes: [{ id: "visible", text: "Visible anchor", box: { x: 24, y: 24, w: 70, h: 12 } }]
    };
    const sourceTextBoxes = [
      { id: "ocr-a", text: "业务系统数据", box: { x: 150, y: 110, w: 72, h: 12 }, source: { confidence: 0.96 } },
      { id: "ocr-b", text: "文档与表格", box: { x: 290, y: 110, w: 66, h: 12 }, source: { confidence: 0.96 } },
      { id: "ocr-c", text: "沟通与流程", box: { x: 430, y: 110, w: 70, h: 12 }, source: { confidence: 0.96 } },
      { id: "ocr-d", text: "经验沉淀", box: { x: 570, y: 110, w: 58, h: 12 }, source: { confidence: 0.96 } },
      { id: "ocr-e", text: "ERP / CRM", box: { x: 150, y: 130, w: 76, h: 11 }, source: { confidence: 0.96 } },
      { id: "ocr-f", text: "制度合同", box: { x: 290, y: 130, w: 60, h: 11 }, source: { confidence: 0.96 } },
      { id: "ocr-g", text: "审批日志", box: { x: 430, y: 130, w: 60, h: 11 }, source: { confidence: 0.96 } },
      { id: "ocr-h", text: "例外处理", box: { x: 570, y: 130, w: 60, h: 11 }, source: { confidence: 0.96 } }
    ];

    const added = addSourceOcrLineTextNativeComponents(page, { widthPt: 960, heightPt: 540 }, sourceFile, sourceTextBoxes);

    assert.ok(added >= 4);
    assert.ok(page.shapes.some((shape) => shape.source?.detector === "line-text-native-card-row"));
    assert.equal(page.textBoxes.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("segmented source OCR text does not seed line-text native component structure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "segmented-source-ocr-native-components-"));
  try {
    const sourceFile = path.join(root, "source.png");
    const rgba = Buffer.alloc(960 * 540 * 4, 255);
    writePng(sourceFile, { width: 960, height: 540, rgba });
    const page = {
      images: [{ id: "crop", assetPath: "assets/crop.png", box: { x: 120, y: 80, w: 620, h: 180 }, source: { detector: "foreground-graphic-crop" } }],
      shapes: [
        { id: "guide-a", type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, source: { detector: "long-axis-line" } },
        { id: "guide-b", type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, source: { detector: "long-axis-line" } }
      ],
      textBoxes: [{ id: "visible", text: "Visible anchor", box: { x: 24, y: 24, w: 70, h: 12 } }]
    };
    const sourceTextBoxes = Array.from({ length: 8 }, (_, index) => ({
      id: `ocr-seg-${index + 1}`,
      text: `段${index + 1}`,
      box: { x: 150 + (index % 4) * 140, y: 110 + Math.floor(index / 4) * 20, w: 54, h: 12 },
      source: { confidence: 0.96, segmentedOcrLineId: `p0-ocr-${Math.floor(index / 2) + 1}` }
    }));

    const added = addSourceOcrLineTextNativeComponents(page, { widthPt: 960, heightPt: 540 }, sourceFile, sourceTextBoxes);

    assert.equal(added, 0);
    assert.equal(page.shapes.some((shape) => shape.source?.detector === "line-text-native-card-row"), false);
    assert.equal(page.textBoxes.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("segmented recovered OCR text does not seed line-text native component structure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "segmented-recovered-ocr-native-components-"));
  try {
    const sourceFile = path.join(root, "source.png");
    const rgba = Buffer.alloc(960 * 540 * 4, 255);
    writePng(sourceFile, { width: 960, height: 540, rgba });
    const page = {
      images: [],
      shapes: [
        { id: "guide-a", type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, source: { detector: "long-axis-line" } },
        { id: "guide-b", type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, source: { detector: "long-axis-line" } }
      ],
      textBoxes: Array.from({ length: 8 }, (_, index) => ({
        id: `recovered-seg-${index + 1}`,
        text: `段${index + 1}`,
        box: { x: 150 + (index % 4) * 140, y: 110 + Math.floor(index / 4) * 20, w: 54, h: 12 },
        source: { ocrRecoveredFromCrop: true, segmentedOcrLineId: `p0-ocr-${Math.floor(index / 2) + 1}` }
      }))
    };

    const added = addRecoveredLineTextNativeComponents(page, { widthPt: 960, heightPt: 540 }, sourceFile);

    assert.equal(added, 0);
    assert.equal(page.shapes.some((shape) => shape.source?.detector === "line-text-native-card-row"), false);
    assert.equal(page.textBoxes.length, 8);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("visible positioned mixed-color OCR text expands into native segment text boxes", () => {
  const page = {
    textBoxes: [{
      id: "p0-ocr-002",
      text: "ABCD1234EF",
      box: { x: 100, y: 40, w: 120, h: 12 },
      font: { color: "#111111", opacity: 1 },
      style: { visibility: "visible", opacity: 1 },
      source: {
        ocrProvider: "team-pinned-ocr",
        confidence: 0.97,
        overlayVisibility: "visible",
        positionedMixedColorTextSegments: [
          { text: "ABCD", box: { x: 100, y: 40, w: 40, h: 12 }, color: "#666666", segmentIndex: 1 },
          { text: "1234", box: { x: 145, y: 40, w: 44, h: 12 }, color: "#3052BA", segmentIndex: 2 },
          { text: "EF", box: { x: 194, y: 40, w: 26, h: 12 }, color: "#666666", segmentIndex: 3 }
        ]
      }
    }]
  };

  const changed = expandVisiblePositionedMixedColorTextSegments(page);

  assert.equal(changed, 3);
  assert.deepEqual(page.textBoxes.map((textBox) => textBox.id), ["p0-ocr-002-seg-1", "p0-ocr-002-seg-2", "p0-ocr-002-seg-3"]);
  assert.equal(page.textBoxes.map((textBox) => textBox.text).join(""), "ABCD1234EF");
  assert.deepEqual(page.textBoxes.map((textBox) => textBox.font.color), ["#666666", "#3052BA", "#666666"]);
  assert.equal(page.textBoxes.every((textBox) => textBox.source.segmentedOcrLineId === "p0-ocr-002"), true);
  assert.equal(page.textBoxes.every((textBox) => textBox.source.positionedMixedColorTextSegments === undefined), true);
});

test("rejects invalid paths and inputs without editing the deck", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-recovery-"));
  try {
    const { page } = fixture(root);
    page.images[0].assetPath = "assets/../secret.png";
    assert.throws(() => recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: true }), /path is invalid/);
    assert.equal(page.textBoxes.length, 0);
    assert.throws(() => recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize: { widthPt: Infinity, heightPt: 300 }, root, preserveLocalFidelityImages: false }), /input is invalid/);
    page.images[0].assetPath = "assets/missing.png";
    assert.throws(() => recoverMissingOcrText({ page, sourceTextBoxes: lines, slideSize, root, preserveLocalFidelityImages: true }), /asset is invalid/);
    assert.equal(page.textBoxes.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("raw-image rebuilder promotes recovered OCR before full-slide residual erasure", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-rebuilder-"));
  try {
    const { file } = fixture(root);
    const source = path.join(root, "source.png");
    fs.copyFileSync(file, source);
    let erasedText = [];
    const rebuild = createRawImageNativeRebuilder({
      preserveLocalFidelityImages: true,
      rebuildDeckFromWorkDir: (workDir) => {
        const deck = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
        deck.pages[0].textBoxes = [];
        deck.pages[0].shapes.push({ id: "native-border", type: "rect", box: { x: 0, y: 0, w: 400, h: 300 }, source: { editable: true } });
        deck.pages[0].images.push({ id: "crop", assetPath: "assets/crop.png", box: { x: 0, y: 0, w: deck.slideSize.widthPt, h: deck.slideSize.heightPt }, source: { detector: "foreground-graphic-crop" } });
        return deck;
      },
      createFullSlideResidual: async ({ sourceFile, outputFile, objects }) => {
        erasedText = objects.filter((item) => item.source?.ocrRecoveredFromCrop);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.copyFileSync(sourceFile, outputFile);
        return { erasedObjects: objects.length };
      }
    });
    const result = await rebuild({
      root, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 400, heightPx: 300 } },
      ocr: { lines: lines.map((item) => ({ text: item.text, confidence: item.source.confidence, box: item.box })) },
      isCancellationRequested: async () => false
    });
    assert.equal(result.deck.pages[0].textBoxes.filter((item) => item.source?.ocrRecoveredFromCrop).length, 6);
    assert.equal(erasedText.length, 6);
    assert.equal(result.deck.meta.ocrCropRecovery.recovered, 6);
    assert.deepEqual(result.ocrCropRecovery, { sourceLines: 6, recovered: 6, cropsErased: 1 });
    assert.equal(result.deck.pages[0].images.find((item) => item.id === "crop").source.textErasedFromCrop, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("raw-image rebuilder normalizes duplicate object ids before delivery", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-crop-rebuilder-ids-"));
  try {
    const { file } = fixture(root);
    const source = path.join(root, "source.png");
    fs.copyFileSync(file, source);
    const rebuild = createRawImageNativeRebuilder({
      preserveLocalFidelityImages: true,
      rebuildDeckFromWorkDir: (workDir) => {
        const deck = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
        deck.pages[0].shapes.push(
          { id: "duplicate-shape", type: "rect", box: { x: 10, y: 10, w: 20, h: 20 }, source: { editable: true } },
          { id: "duplicate-shape", type: "rect", box: { x: 40, y: 10, w: 20, h: 20 }, source: { editable: true } }
        );
        return deck;
      }
    });
    const result = await rebuild({
      root, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 400, heightPx: 300 } },
      ocr: { lines: [] },
      isCancellationRequested: async () => false
    });
    const ids = result.deck.pages[0].shapes.map((shape) => shape.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, ["duplicate-shape", "duplicate-shape-2"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("raw-image rebuilder vectorizes low-contrast footer marks as native shapes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "footer-native-marks-"));
  try {
    const source = path.join(root, "source.png");
    const image = blankPng(240, 180, [252, 247, 241, 255]);
    fillRect(image, 92, 168, 22, 8, [186, 186, 186, 255]);
    fillRect(image, 120, 168, 58, 8, [178, 178, 178, 255]);
    writePng(source, image);
    const rebuild = createRawImageNativeRebuilder({
      rebuildDeckFromWorkDir: (workDir) => JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"))
    });
    const result = await rebuild({
      root,
      metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 240, heightPx: 180 } },
      ocr: { lines: [{ text: "Header", confidence: 0.99, box: { x: 12, y: 16, w: 44, h: 12 } }] },
      isCancellationRequested: async () => false
    });
    const marks = result.deck.pages[0].shapes.filter((shape) => shape.source?.detector === "low-contrast-footer-native-mark");
    assert.ok(marks.length >= 1);
    assert.equal(result.deck.meta.lowContrastFooterNativeMarks, marks.length);
    assert.equal(result.deck.pages[0].images.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("raw-image rebuilder expands visible mixed-color OCR into native segment text boxes before delivery", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "visible-rich-runs-"));
  try {
    const source = path.join(root, "source.png");
    const image = blankPng(240, 48, [255, 255, 255, 255]);
    fillRect(image, 16, 18, 42, 10, [84, 91, 110, 255]);
    fillRect(image, 68, 18, 70, 10, [48, 82, 186, 255]);
    fillRect(image, 148, 18, 36, 10, [84, 91, 110, 255]);
    writePng(source, image);
    const rebuild = createRawImageNativeRebuilder({
      rebuildDeckFromWorkDir: (workDir) => {
        const deck = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
        const textBox = deck.pages[0].textBoxes[0];
        textBox.font.opacity = 1;
        textBox.style.visibility = "visible";
        textBox.style.opacity = 1;
        textBox.source.overlayVisibility = "visible";
        return deck;
      }
    });
    const result = await rebuild({
      root,
      metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 240, heightPx: 48 } },
      ocr: { lines: [{ text: "ABCDE123456789尾缀", confidence: 0.99, box: { x: 16, y: 14, w: 180, h: 18 } }] },
      isCancellationRequested: async () => false
    });
    const textBoxes = result.deck.pages[0].textBoxes;

    assert.equal(textBoxes.length, 3);
    assert.equal(textBoxes.map((textBox) => textBox.text).join(""), "ABCDE123456789尾缀");
    assert.equal(textBoxes.every((textBox) => textBox.runs === undefined), true);
    assert.equal(textBoxes.every((textBox) => textBox.style.visibility === "visible"), true);
    assert.equal(textBoxes.every((textBox) => (textBox.font.opacity ?? 1) === 1), true);
    assert.equal(textBoxes.every((textBox) => textBox.source.segmentedOcrLineId === "p0-ocr-001"), true);
    assert.equal(result.deck.meta.visiblePositionedMixedColorTextSegmentsExpanded, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("promotes OCR text inside foreground crops that are covered by line-text native shapes", () => {
  const page = {
    images: [
      { id: "full", box: { x: 0, y: 0, w: 960, h: 540 }, source: {} },
      { id: "covered-crop", assetPath: "assets/crop.png", box: { x: 40, y: 80, w: 600, h: 220 }, source: { detector: "foreground-graphic-crop", reason: "complex-graphic-preserved-as-movable-crop" } }
    ],
    shapes: [
      lineTextShape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      lineTextShape("card-a", 70, 112, 120, 44),
      lineTextShape("card-b", 210, 112, 120, 44),
      lineTextShape("card-c", 350, 112, 120, 44),
      lineTextShape("card-d", 490, 112, 120, 44),
      lineTextShape("card-e", 70, 190, 120, 44),
      lineTextShape("card-f", 210, 190, 120, 44),
      lineTextShape("card-g", 350, 190, 120, 44)
    ],
    textBoxes: [{ id: "existing", text: "existing", box: { x: 70, y: 100, w: 40, h: 12 } }]
  };
  const promoted = promoteLineTextCropOcrText(page, [
    { id: "ocr-a", text: "card title", box: { x: 220, y: 126, w: 72, h: 12 }, source: { confidence: 0.96 } },
    { id: "ocr-low", text: "low confidence", box: { x: 360, y: 126, w: 82, h: 12 }, source: { confidence: 0.5 } },
    { id: "ocr-outside", text: "outside", box: { x: 800, y: 126, w: 52, h: 12 }, source: { confidence: 0.96 } }
  ]);

  assert.equal(promoted, 1);
  assert.equal(page.textBoxes.length, 2);
  assert.equal(page.textBoxes[1].text, "card title");
  assert.equal(page.textBoxes[1].source.ocrRecoveredFromLineTextCrop, true);
  assert.deepEqual(page.textBoxes[1].source.lineTextCropIds, ["covered-crop"]);
});

test("promoted OCR rich text runs become visible and inconsistent inherited runs are dropped", () => {
  const basePage = () => ({
    images: [
      { id: "covered-crop", assetPath: "assets/crop.png", box: { x: 40, y: 80, w: 600, h: 220 }, source: { detector: "foreground-graphic-crop", reason: "complex-graphic-preserved-as-movable-crop" } }
    ],
    shapes: [
      lineTextShape("panel", 40, 80, 600, 220, "line-text-native-numbered-section-panel"),
      lineTextShape("card", 210, 112, 180, 44),
      lineTextShape("card-a", 70, 112, 120, 44),
      lineTextShape("card-b", 350, 112, 120, 44),
      lineTextShape("card-c", 490, 112, 120, 44),
      lineTextShape("card-d", 70, 190, 120, 44),
      lineTextShape("card-e", 210, 190, 120, 44),
      lineTextShape("card-f", 350, 190, 120, 44),
      lineTextShape("card-g", 490, 190, 120, 44)
    ],
    textBoxes: []
  });
  const richPage = basePage();
  const richPromoted = promoteLineTextCropOcrText(richPage, [{
    id: "ocr-rich",
    text: "ABCD",
    box: { x: 220, y: 126, w: 72, h: 12 },
    font: { color: "#111111", opacity: 0 },
    runs: [
      { text: "AB", font: { color: "#666666", opacity: 0 } },
      { text: "CD", font: { color: "#3052BA", opacity: 0 } }
    ],
    source: { confidence: 0.96, mixedColorTextRuns: 2 }
  }]);

  assert.equal(richPromoted, 1);
  assert.deepEqual(richPage.textBoxes[0].runs.map((run) => run.font.opacity), [1, 1]);
  assert.deepEqual(richPage.textBoxes[0].runs.map((run) => run.font.color), ["#666666", "#3052BA"]);

  const mismatchPage = basePage();
  const mismatchPromoted = promoteLineTextCropOcrText(mismatchPage, [{
    id: "ocr-mismatch",
    text: "Label",
    box: { x: 220, y: 126, w: 72, h: 12 },
    font: { color: "#111111", opacity: 0 },
    runs: [
      { text: "√", font: { color: "#75C29D", opacity: 0 } },
      { text: "Label", font: { color: "#9097A4", opacity: 0 } }
    ],
    source: { confidence: 0.96, mixedColorTextRuns: 2 }
  }]);

  assert.equal(mismatchPromoted, 1);
  assert.equal(mismatchPage.textBoxes[0].runs, undefined);
});

test("source OCR promoted inside native line-text carriers keeps rich text runs visible", () => {
  const page = {
    images: [],
    shapes: [lineTextShape("carrier", 100, 100, 220, 48)],
    textBoxes: []
  };
  const promoted = promoteSourceOcrTextInNativeLineTextShapes(page, [{
    id: "ocr-native-rich",
    text: "ABCD",
    box: { x: 120, y: 118, w: 80, h: 12 },
    font: { color: "#111111", opacity: 0 },
    runs: [
      { text: "AB", font: { color: "#56606F", opacity: 0 } },
      { text: "CD", font: { color: "#3152BC", opacity: 0 } }
    ],
    source: { confidence: 0.96, mixedColorTextRuns: 2 }
  }]);

  assert.equal(promoted, 1);
  assert.deepEqual(page.textBoxes[0].runs.map((run) => run.font.opacity), [1, 1]);
  assert.deepEqual(page.textBoxes[0].runs.map((run) => run.font.color), ["#56606F", "#3152BC"]);
});

test("promoted line-text crop OCR uses contrast text on nearby saturated host cards without changing host geometry", () => {
  const page = {
    images: [
      { id: "covered-crop", assetPath: "assets/crop.png", box: { x: 40, y: 80, w: 620, h: 220 }, source: { detector: "foreground-graphic-crop", reason: "complex-graphic-preserved-as-movable-crop" } }
    ],
    shapes: [
      lineTextShape("panel", 40, 80, 620, 220, "line-text-native-numbered-section-panel"),
      lineTextShape("host", 214, 120, 90, 32),
      lineTextShape("peer-a", 324, 120, 90, 32),
      lineTextShape("peer-b", 434, 120, 90, 32),
      lineTextShape("peer-c", 544, 120, 90, 32),
      lineTextShape("peer-d", 104, 170, 90, 32),
      lineTextShape("peer-e", 214, 170, 90, 32),
      lineTextShape("peer-f", 324, 170, 90, 32),
      lineTextShape("peer-g", 434, 170, 90, 32)
    ],
    textBoxes: []
  };
  const host = page.shapes.find((shape) => shape.id === "host");
  host.style.fill = "#D6456B";
  host.style.stroke = "#D6456B";

  const promoted = promoteLineTextCropOcrText(page, [
    { id: "ocr-a", text: "回写", box: { x: 198, y: 124, w: 34, h: 14 }, font: { color: "#111111" }, source: { confidence: 0.98 } }
  ]);

  assert.equal(promoted, 1);
  assert.equal(page.textBoxes[0].font.color, "#FFFFFF");
  assert.equal(page.textBoxes[0].font.align, "center");
  assert.equal(host.source.expandedForRecoveredLineText, undefined);
  assert.deepEqual(host.box, { x: 214, y: 120, w: 90, h: 32 });
});

test("promoted line-text crop OCR prefers direct light host over nearby saturated host", () => {
  const page = {
    images: [
      { id: "covered-crop", assetPath: "assets/crop.png", box: { x: 40, y: 80, w: 660, h: 240 }, source: { detector: "foreground-graphic-crop", reason: "complex-graphic-preserved-as-movable-crop" } }
    ],
    shapes: [
      lineTextShape("panel", 40, 80, 660, 240, "line-text-native-numbered-section-panel"),
      lineTextShape("light-host", 214, 120, 128, 46),
      lineTextShape("dark-neighbor", 356, 120, 150, 38),
      lineTextShape("peer-a", 526, 120, 90, 38),
      lineTextShape("peer-b", 104, 190, 90, 38),
      lineTextShape("peer-c", 214, 190, 90, 38),
      lineTextShape("peer-d", 324, 190, 90, 38),
      lineTextShape("peer-e", 434, 190, 90, 38)
    ],
    textBoxes: []
  };
  const darkNeighbor = page.shapes.find((shape) => shape.id === "dark-neighbor");
  darkNeighbor.style.fill = "#1E3A8A";
  darkNeighbor.style.stroke = "#1E3A8A";

  const promoted = promoteLineTextCropOcrText(page, [
    { id: "ocr-a", text: "资料更新与过期提醒", box: { x: 236, y: 137, w: 92, h: 14 }, font: { color: "#111111" }, source: { confidence: 0.98 } }
  ]);

  assert.equal(promoted, 1);
  assert.equal(page.textBoxes[0].font.color, "#202637");
  assert.notEqual(page.textBoxes[0].font.color, "#FFFFFF");
  assert.equal(page.textBoxes[0].font.align, undefined);
});

test("promoted line-text crop OCR does not use edge-touching saturated card as host", () => {
  const page = {
    images: [
      { id: "covered-crop", assetPath: "assets/crop.png", box: { x: 40, y: 80, w: 700, h: 240 }, source: { detector: "foreground-graphic-crop", reason: "complex-graphic-preserved-as-movable-crop" } }
    ],
    shapes: [
      lineTextShape("light-panel", 40, 80, 700, 240, "line-text-native-title-band-panel"),
      lineTextShape("edge-neighbor", 214, 112, 96, 34),
      lineTextShape("peer-a", 330, 112, 96, 34),
      lineTextShape("peer-b", 446, 112, 96, 34),
      lineTextShape("peer-c", 562, 112, 96, 34),
      lineTextShape("peer-d", 98, 178, 96, 34),
      lineTextShape("peer-e", 214, 178, 96, 34),
      lineTextShape("peer-f", 330, 178, 96, 34)
    ],
    textBoxes: []
  };
  const neighbor = page.shapes.find((shape) => shape.id === "edge-neighbor");
  neighbor.style.fill = "#D6456B";
  neighbor.style.stroke = "#D6456B";

  const promoted = promoteLineTextCropOcrText(page, [
    { id: "ocr-a", text: "回写", box: { x: 196, y: 122, w: 28, h: 14 }, font: { color: "#111111" }, source: { confidence: 0.98 } }
  ]);

  assert.equal(promoted, 1);
  assert.equal(page.textBoxes[0].font.color, "#202637");
  assert.equal(page.textBoxes[0].font.align, undefined);
});

test("line-text crop OCR is retried after source OCR makes crop coverage sufficient", () => {
  const page = {
    images: [
      { id: "covered-crop", assetPath: "assets/crop.png", box: { x: 40, y: 80, w: 620, h: 220 }, source: { detector: "foreground-graphic-crop", reason: "complex-graphic-preserved-as-movable-crop" } }
    ],
    shapes: [
      lineTextShape("panel", 40, 80, 620, 220, "line-text-native-numbered-section-panel"),
      lineTextShape("card-a", 70, 112, 120, 44),
      lineTextShape("card-b", 210, 112, 120, 44),
      lineTextShape("card-c", 350, 112, 120, 44),
      lineTextShape("card-d", 490, 112, 120, 44)
    ],
    textBoxes: []
  };
  const carrierText = Array.from({ length: 6 }, (_, index) => ({
    id: `carrier-${index}`,
    text: `native ${index}`,
    box: { x: 78 + (index % 3) * 140, y: 126 + Math.floor(index / 3) * 18, w: 52, h: 10 },
    font: { color: "#111111", opacity: 0 },
    source: { confidence: 0.96 }
  }));
  const missingCropText = {
    id: "missing-line",
    text: "ERP / CRM / MES",
    box: { x: 84, y: 184, w: 112, h: 12 },
    font: { color: "#111111", opacity: 0 },
    source: { confidence: 0.97 }
  };

  assert.equal(shouldDropLineTextCoveredForegroundCrop(page.images[0], page), false);
  assert.equal(promoteLineTextCropOcrText(page, [missingCropText]), 0);
  assert.equal(promoteSourceOcrTextInNativeLineTextShapes(page, carrierText), 6);
  assert.equal(shouldDropLineTextCoveredForegroundCrop(page.images[0], page), true);

  const promotedAfterCoverage = promoteLineTextCropOcrText(page, [missingCropText]);
  dropLineTextCoveredForegroundCrops(page);

  assert.equal(promotedAfterCoverage, 1);
  assert.equal(page.textBoxes.some((textBox) => textBox.id === "line-text-crop-missing-line"), true);
  assert.equal(page.images.length, 0);
});

function lineTextShape(id, x, y, w, h, detector = "line-text-native-card-row") {
  return {
    id,
    type: "rect",
    box: { x, y, w, h },
    style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidthPt: 1 },
    source: { detector, editable: true, nativeRebuild: true }
  };
}

function blankPng(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = color[3];
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      const offset = (row * image.width + col) * 4;
      image.rgba[offset] = color[0];
      image.rgba[offset + 1] = color[1];
      image.rgba[offset + 2] = color[2];
      image.rgba[offset + 3] = color[3];
    }
  }
}
