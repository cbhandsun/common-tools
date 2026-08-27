"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const {
  finalizePrdSegmentedFlowComponents
} = require("../skills/pd-hifi-slideclone/scripts/lib/prd-segmented-flow-components");

function fixture(root) {
  const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 220) };
  const images = [
    ["input.png", { x: 44, y: 110, w: 201, h: 350 }],
    ["skill.png", { x: 368, y: 211, w: 129, h: 144 }],
    ["output.png", { x: 616, y: 110, w: 300, h: 350 }]
  ].map(([assetPath, box]) => {
    writePng(path.join(root, assetPath), { width: 2, height: 2, rgba: Buffer.alloc(16, 255) });
    return { assetPath, box, source: { prdGenerationSegmentCropPreserved: true } };
  });
  return {
    sourceImage,
    page: {
      images,
      shapes: [
        { id: "accent", box: { x: 42, y: 46, w: 3, h: 34 }, source: { detector: "title-accent" } },
        { id: "input-route-a", box: { x: 237, y: 215, w: 154, h: 48 }, source: { detector: "prd-generation-flow-native-connector" } },
        { id: "input-route-b", box: { x: 237, y: 366, w: 154, h: -60 }, source: { detector: "prd-generation-flow-native-connector" } },
        { id: "skill-route", box: { x: 479, y: 283, w: 145, h: 2 }, source: { detector: "prd-generation-flow-native-connector" } }
      ],
      textBoxes: [
        { text: "Skill 3 PRD 自动生成：融合推导与标准沉淀", box: { x: 55, y: 48, w: 540, h: 23 } },
        { text: "PRD", box: { x: 642, y: 128, w: 42, h: 18 } },
        { text: "业务背景", box: { x: 641, y: 159, w: 70, h: 23 } },
        { text: "字段规则", box: { x: 643, y: 234, w: 70, h: 22 } },
        { text: "异常场景", box: { x: 643, y: 308, w: 70, h: 22 } },
        { text: "验收口径", box: { x: 642, y: 381, w: 70, h: 22 } },
        { text: "告别重复撰写", box: { x: 53, y: 481, w: 506, h: 21 } }
      ]
    }
  };
}

test("segmented PRD flow keeps screenshots intact and emits four semantic groups", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-prd-segments-"));
  try {
    const { page, sourceImage } = fixture(root);
    finalizePrdSegmentedFlowComponents(page, {
      sourceImage,
      slideSize: { widthPt: 960, heightPt: 540 },
      irDir: root
    });
    const parts = [...page.images, ...page.shapes, ...page.textBoxes];
    const groups = [...new Set(parts.map((item) => item.source?.nativeComponentGroupId).filter(Boolean))].sort();

    assert.deepEqual(groups, ["prd-segmented-flow-input", "prd-segmented-flow-output", "prd-segmented-flow-skill", "prd-segmented-flow-title"]);
    assert.deepEqual(page.textBoxes.map((item) => item.text), ["Skill 3 PRD 自动生成：融合推导与标准沉淀", "告别重复撰写"]);
    assert.ok(page.images.every((item) => item.source.intentionalMinimumUnitCrop === true));
    assert.equal(page.images[1].source.expressionForm, "icon-or-illustration");
    assert.equal(readPng(path.join(root, "output.png")).width, 300);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("segmented PRD flow does not delete overlay text when crop restoration is unsafe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-prd-boundary-"));
  try {
    const { page, sourceImage } = fixture(root);
    page.images[2].assetPath = "../outside.png";
    finalizePrdSegmentedFlowComponents(page, { sourceImage, slideSize: { widthPt: 960, heightPt: 540 }, irDir: root });
    assert.ok(page.textBoxes.some((item) => item.text === "业务背景"));
    assert.equal(page.images[2].source.prdGenerationScreenshotTextBakedInCrop, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
