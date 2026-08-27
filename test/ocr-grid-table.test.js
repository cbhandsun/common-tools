"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createOcrGridTableModel,
  materializeOcrGridIcon,
  normalizeCellText
} = require("../skills/pd-hifi-slideclone/scripts/lib/ocr-grid-table");

function image() {
  return { width: 96, height: 54, rgba: Buffer.alloc(96 * 54 * 4, 240) };
}

function box(id, text, column, row, yOffset = 0) {
  const xLines = [40, 170, 420, 670, 920];
  const anchors = [120, 176, 249, 322, 394];
  return {
    id,
    text,
    box: { x: xLines[column] + 12, y: anchors[row] - 9 + yOffset, w: Math.min(90, xLines[column + 1] - xLines[column] - 24), h: 18 },
    font: { sizePt: row === 0 ? 15 : 14 }
  };
}

function inferGrid() {
  return {
    provider: "fixture",
    rows: 5,
    columns: 4,
    xLines: [40, 170, 420, 670, 920],
    yLines: [120, 213, 286, 359, 390, 432],
    bounds: { x: 40, y: 120, w: 880, h: 312 },
    stroke: "#D0D8DE"
  };
}

test("OCR grid table creates one editable table from complete row and column evidence", () => {
  const textBoxes = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      textBoxes.push(box(`r${row}c${column}`, `R${row}C${column}`, column, row));
    }
  }
  textBoxes.push(box("r1c1-line2", "second", 1, 1, 13));
  const model = createOcrGridTableModel({ pageIndex: 2, textBoxes, images: [{ id: "underlay" }] }, image(),
    { widthPt: 960, heightPt: 540 }, { inferGrid });

  assert.equal(model.matched, true);
  assert.equal(model.table.rows.length, 5);
  assert.equal(model.table.rows[0].length, 4);
  assert.equal(model.table.rows[1][1], "R1C1\nsecond");
  assert.deepEqual(model.table.style.columnWidthsPt, [130, 250, 250, 250]);
  assert.equal(model.table.source.detector, "ocr-grid-native-table");
  assert.equal(model.table.source.preserveTypography, true);
  assert.equal(model.consumedIds.length, 21);
  assert.deepEqual(model.outsideTextBoxes, []);
});

test("OCR grid table fails closed for missing cells and malformed boundaries", () => {
  const textBoxes = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) textBoxes.push(box(`r${row}c${column}`, "x", column, row));
  }
  assert.equal(createOcrGridTableModel({ textBoxes: textBoxes.slice(1) }, image(), { widthPt: 960, heightPt: 540 }, { inferGrid }).matched, false);
  assert.equal(createOcrGridTableModel({ textBoxes }, null, { widthPt: 960, heightPt: 540 }, { inferGrid }).matched, false);
  assert.equal(createOcrGridTableModel({ textBoxes }, image(), { widthPt: -1, heightPt: 540 }, { inferGrid }).matched, false);
});

test("OCR grid table removes icon placeholders and restores Latin word boundaries", () => {
  assert.equal(normalizeCellText("?PMPortalPlatform"), "PM Portal Platform");
  assert.equal(normalizeCellText("普通AI大模型工具"), "普通 AI 大模型工具");
  assert.equal(normalizeCellText("链式Skills引擎"), "链式 Skills 引擎");
  assert.equal(normalizeCellText("→生成→评审一→原型"), "→生成→评审→原型");
});

test("OCR grid table renders a preserved header icon above its native table", () => {
  const textBoxes = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const text = row === 0 && column === 0 ? "?PMPortalPlatform" : `R${row}C${column}`;
      textBoxes.push(box(`r${row}c${column}`, text, column, row));
    }
  }
  const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255) };
  const model = createOcrGridTableModel({ pageIndex: 2, textBoxes }, sourceImage,
    { widthPt: 960, heightPt: 540 }, { inferGrid });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-grid-icon-"));

  try {
    const icon = materializeOcrGridIcon(model, sourceImage, {
      assetDir: path.join(temp, "assets"),
      irDir: temp,
      deckName: "matrix",
      pageIndex: 2,
      slideSize: { widthPt: 960, heightPt: 540 }
    });

    assert.equal(icon.source.tableOverlay, true);
    assert.equal(icon.source.nativeComponentGroupId, model.table.source.nativeComponentGroupId);
    assert.equal(fs.existsSync(path.resolve(temp, icon.assetPath)), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
