"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planMeasuredSingleLineTextFit } = require("../packages/slideclone-core/measured-text-fit");

const slideSize = { widthPt: 960, heightPt: 540 };

function textBox(id, overrides = {}) {
  return {
    id, text: "可编辑正文", box: { x: 100, y: 100, w: 240, h: 24 },
    font: { family: "Microsoft YaHei", sizePt: 16, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.95 },
    ...overrides
  };
}

function measurement(id, source, rendered) { return { id, source, rendered }; }

test("high-confidence OCR admits position-only correction without changing fitted font or box dimensions", () => {
  const item = textBox("positioned-title", { source: { editable: true, confidence: 0.95, ocrProvider: "test" } });
  const before = structuredClone(item);
  const rows = [measurement(item.id, { x: 101, y: 99, w: 200, h: 20.8 }, { x: 100, y: 101, w: 200, h: 20 })];
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: rows });
  assert.equal(result.changes.length, 1);
  assert.equal(result.textBoxes[0].font.sizePt, item.font.sizePt);
  assert.equal(result.textBoxes[0].box.w, item.box.w);
  assert.equal(result.textBoxes[0].box.h, item.box.h);
  assert.equal(result.textBoxes[0].box.x, 101);
  assert.equal(result.textBoxes[0].box.y, 98);
  assert.deepEqual(item, before);
  const ordinary = { ...item, source: { editable: true, confidence: 0.95 } };
  assert.equal(planMeasuredSingleLineTextFit({ slideSize, textBoxes: [ordinary], measurements: rows }).changes.length, 0);
  const excessive = [measurement(item.id, { x: 100, y: 80, w: 200, h: 20 }, { x: 100, y: 101, w: 200, h: 20 })];
  assert.equal(planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: excessive }).changes.length, 0);
});

test("plans distinct bounded fits for ordinary body text and a title", () => {
  const body = textBox("body", { source: { editable: true, confidence: 0.8 } });
  const title = textBox("title", { text: "动态本体：知识图谱的可生长升级", box: { x: 200, y: 40, w: 500, h: 32 }, font: { family: "Microsoft YaHei", sizePt: 32, align: "left", valign: "middle" } });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [body, title], measurements: [
    measurement("body", { x: 102, y: 102, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("title", { x: 201, y: 43, w: 325, h: 24 }, { x: 200, y: 40, w: 300, h: 22 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 2 });
  assert.equal(result.textBoxes[0].font.sizePt, 20.57);
  assert.equal(result.textBoxes[1].font.sizePt, 34.67);
  assert.equal(result.textBoxes[0].box.x, 102);
  const fittedTitle = result.textBoxes[1];
  const fittedAnchorY = fittedTitle.box.y + fittedTitle.box.h / 2;
  const originalAnchorY = title.box.y + title.box.h / 2;
  assert.ok(Math.abs(fittedAnchorY + (40 - originalAnchorY) * (fittedTitle.font.sizePt / title.font.sizePt) - 43) < 1e-9);
  assert.notEqual(result.textBoxes[0], body);
  assert.notEqual(result.textBoxes[0].font, body.font);
  assert.equal(body.font.sizePt, 16);
});

test("rejects inconsistent, shrink-fit, low-confidence, invisible, multiline, and extreme adjustments", () => {
  const entries = [
    textBox("inconsistent"), textBox("shrink", { style: { visibility: "visible", wrap: false, fit: "shrink" } }),
    textBox("confidence", { source: { editable: true, confidence: 0.79 } }), textBox("hidden", { style: { visibility: "hidden", wrap: false } }),
    textBox("transparent", { font: { family: "Microsoft YaHei", sizePt: 16, align: "left", valign: "middle", opacity: 0 } }),
    textBox("multiline", { text: "第一行\n第二行" }), textBox("extreme")
  ];
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: entries, measurements: [
    measurement("inconsistent", { x: 100, y: 100, w: 104, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("shrink", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("confidence", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("hidden", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("transparent", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("multiline", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("extreme", { x: 140, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 0 });
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.textBoxes, entries);
  for (let index = 0; index < entries.length; index += 1) assert.equal(result.textBoxes[index], entries[index]);
});

test("treats missing and ineligible measurements as no-ops", () => {
  const item = textBox("missing");
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [] });
  assert.deepEqual(result.evidence, { candidates: 0, accepted: 0 });
  assert.equal(result.textBoxes[0], item);
});

test("allows OCR evidence-fitted shrink text to receive measured render correction", () => {
  const item = textBox("fitted-title", {
    text: "企业 AI 全链路架构图",
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: {
      editable: true,
      confidence: 0.94,
      ocrEvidenceFit: {
        provider: "single-line-ocr-evidence-fit-v1",
        originalBox: { x: 100, y: 100, w: 240, h: 24 },
        originalSizePt: 20,
        fittedSizePt: 16
      }
    }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement("fitted-title", { x: 102, y: 102, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1 });
  assert.equal(result.textBoxes[0].font.sizePt, 20.57);
  assert.equal(result.textBoxes[0].style, item.style);
});

test("allows measured OCR shrink text without prior evidence-fit metadata", () => {
  const item = textBox("ocr-shrink", {
    text: "答案可回溯到原",
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: { editable: true, confidence: 0.96, ocrProvider: "team-pinned-ocr" }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement("ocr-shrink", { x: 102, y: 102, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1 });
  assert.equal(result.textBoxes[0].font.sizePt, 20.57);
});

test("caps positioned OCR segment growth and recomputes geometry from the effective font size", () => {
  const item = textBox("ocr-segment", {
    text: "持续变强",
    box: { x: 400, y: 100, w: 110, h: 12 },
    font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: {
      editable: true,
      confidence: 0.98,
      ocrProvider: "team-pinned-ocr",
      segmentedOcrLineId: "p0-ocr-002",
      mixedColorTextSegment: 3,
      evidenceBox: { x: 400, y: 100, w: 110, h: 12 }
    }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement("ocr-segment", { x: 402, y: 100, w: 132, h: 22 }, { x: 400, y: 100, w: 60, h: 10 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1 });
  assert.equal(result.textBoxes[0].font.sizePt, 8.64);
  assert.equal(result.changes[0].sizePt, 8.64);
  assert.equal(result.changes[0].measuredSizeRatio, 2.2);
  assert.equal(result.changes[0].sizeRatio, 1.08);
  assert.ok(Math.abs(result.changes[0].widthScale - (2.2 / 1.08)) < 1e-12);
});

test("keeps positioned OCR segments atomic under ranked candidate limits", () => {
  const segment = (id, x) => textBox(id, {
    text: id,
    box: { x, y: 100, w: 80, h: 12 },
    font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: {
      editable: true,
      confidence: 0.98,
      ocrProvider: "team-pinned-ocr",
      segmentedOcrLineId: "p0-ocr-002",
      evidenceBox: { x, y: 100, w: 80, h: 12 }
    }
  });
  const first = segment("segment-a", 100), second = segment("segment-b", 200);
  const measurements = [
    measurement("segment-a", { x: 101, y: 102, w: 50, h: 12 }, { x: 100, y: 102, w: 36, h: 8 }),
    measurement("segment-b", { x: 201, y: 102, w: 50, h: 12 }, { x: 200, y: 102, w: 36, h: 8 })
  ];

  const partial = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [first, second], measurements, candidateLimit: 1 });
  assert.deepEqual(partial.evidence, { candidates: 2, accepted: 0 });
  assert.equal(partial.textBoxes[0], first);
  assert.equal(partial.textBoxes[1], second);

  const complete = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [first, second], measurements, candidateLimit: 2 });
  assert.deepEqual(complete.evidence, { candidates: 2, accepted: 2 });
  assert.deepEqual(complete.changes.map((change) => change.id), ["segment-a", "segment-b"]);
});

test("shrinks oversized rendered single-line text toward measured source ink", () => {
  const item = textBox("oversized", {
    text: "System Connection",
    font: { family: "Microsoft YaHei", sizePt: 12, align: "left", valign: "middle" }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement("oversized", { x: 101, y: 102, w: 88, h: 12 }, { x: 100, y: 100, w: 110, h: 15 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1 });
  assert.equal(result.textBoxes[0].font.sizePt, 9.6);
  assert.equal(result.textBoxes[0].box.x, 101);
  assert.equal(result.textBoxes[0].box.y, 99.6);
  assert.equal(item.font.sizePt, 12);
});

test("adjusts box width for non-uniform measured text width error", () => {
  const item = textBox("wide-error", {
    text: "回写",
    box: { x: 400, y: 240, w: 80, h: 20 },
    font: { family: "Microsoft YaHei", sizePt: 10, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: { editable: true, confidence: 0.96, ocrProvider: "team-pinned-ocr" }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement("wide-error", { x: 402, y: 244, w: 42, h: 10 }, { x: 401, y: 244, w: 30, h: 10 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1 });
  assert.equal(result.textBoxes[0].font.sizePt, 10);
  assert.equal(result.textBoxes[0].box.w, 112);
  assert.equal(result.textBoxes[0].box.x, 401);
  assert.equal(result.textBoxes[0].style, item.style);
  assert.equal(item.box.w, 80);
});

test("admits high-confidence OCR height correction when measured width is already close", () => {
  const item = textBox("title-height-error", {
    text: "Editable title",
    box: { x: 100, y: 80, w: 320, h: 44 },
    font: { family: "Microsoft YaHei", sizePt: 32, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: { editable: true, confidence: 0.99, ocrProvider: "team-pinned-ocr", ocrEvidenceFit: { provider: "test" } }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement("title-height-error", { x: 105, y: 84, w: 210, h: 32 }, { x: 100, y: 88, w: 200, h: 29 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1 });
  assert.ok(result.textBoxes[0].font.sizePt > item.font.sizePt);
  assert.ok(result.textBoxes[0].box.y < item.box.y);
});

test("small coherent OCR ink growth is fitted without enlarging glyphs beyond measured width", () => {
  const item = textBox("coherent-ink", {
    box: { x: 200, y: 40, w: 530, h: 34 },
    font: { family: "Microsoft YaHei", sizePt: 34, align: "left", valign: "middle" },
    source: { editable: true, confidence: 0.96, ocrProvider: "test" }
  });
  const source = { x: 199, y: 39, w: 530, h: 36 }, rendered = { x: 200, y: 42, w: 512, h: 33 };
  const request = { slideSize, textBoxes: [item], measurements: [measurement(item.id, source, rendered)] };
  const fitted = planMeasuredSingleLineTextFit(request);
  assert.equal(fitted.changes.length, 1);
  assert.ok(Math.abs(fitted.textBoxes[0].font.sizePt - 34 * source.w / rendered.w) < 0.005);
  assert.ok(fitted.changes[0].localMismatchScore < 0.09);
  assert.equal(fitted.textBoxes[0].text, item.text);
  const ordinary = { ...item, source: { editable: true, confidence: 0.96 } };
  assert.equal(planMeasuredSingleLineTextFit({ ...request, textBoxes: [ordinary] }).changes.length, 0);
  const lowConfidence = { ...item, source: { ...item.source, confidence: 0.79 } };
  assert.equal(planMeasuredSingleLineTextFit({ ...request, textBoxes: [lowConfidence] }).changes.length, 0);
});

test("small OCR growth rejects incoherent, width-only and subpixel-size evidence", () => {
  const item = textBox("bounded-growth", { source: { editable: true, confidence: 0.96, ocrProvider: "test" } });
  for (const [widthRatio, heightRatio] of [[1.024, 1.08], [1.04, 1.059], [1.025, 1.15]]) {
    const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
      measurement(item.id, { x: 150 - 50 * widthRatio, y: 110 - 10 * heightRatio, w: 100 * widthRatio, h: 20 * heightRatio },
        { x: 100, y: 100, w: 100, h: 20 })
    ] });
    assert.equal(result.changes.length, 0);
    assert.equal(result.textBoxes[0], item);
  }
});

test("allows wider measured OCR shrink correction while keeping ordinary text conservative", () => {
  const ocr = textBox("ocr-wide-error", {
    text: "AI Agent",
    box: { x: 120, y: 220, w: 80, h: 20 },
    font: { family: "Microsoft YaHei", sizePt: 10, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false, fit: "shrink" },
    source: { editable: true, confidence: 0.96, ocrProvider: "team-pinned-ocr" }
  });
  const ordinary = textBox("ordinary-wide-error", {
    text: "AI Agent",
    box: { x: 240, y: 220, w: 80, h: 20 },
    font: { family: "Microsoft YaHei", sizePt: 10, align: "left", valign: "middle" }
  });

  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [ocr, ordinary], measurements: [
    measurement("ocr-wide-error", { x: 120, y: 224, w: 90, h: 10 }, { x: 120, y: 224, w: 45, h: 10 }),
    measurement("ordinary-wide-error", { x: 240, y: 224, w: 90, h: 10 }, { x: 240, y: 224, w: 45, h: 10 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 2 });
  assert.equal(result.textBoxes[0].box.w, 160);
  assert.equal(result.textBoxes[1].box.w, 116);
  assert.equal(result.textBoxes[0].font.sizePt, 10);
  assert.equal(result.textBoxes[1].font.sizePt, 10);
});

test("keeps center and right aligned text anchored while applying measured scale", () => {
  const centered = textBox("centered", {
    box: { x: 200, y: 100, w: 120, h: 30 },
    font: { family: "Microsoft YaHei", sizePt: 12, align: "center", valign: "middle" }
  });
  const right = textBox("right", {
    box: { x: 400, y: 100, w: 120, h: 30 },
    font: { family: "Microsoft YaHei", sizePt: 12, align: "right", valign: "middle" }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [centered, right], measurements: [
    measurement("centered", { x: 228, y: 106, w: 64, h: 16 }, { x: 235, y: 108, w: 48, h: 12 }),
    measurement("right", { x: 458, y: 106, w: 60, h: 16 }, { x: 474, y: 108, w: 45, h: 12 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 2 });
  assert.equal(result.textBoxes[0].font.sizePt, 16);
  assert.equal(result.textBoxes[1].font.sizePt, 16);
  assert.equal(result.textBoxes[0].box.x, 201.33333333333331);
  assert.equal(result.textBoxes[1].box.x, 399.3333333333333);
});

test("nonuniform frame resizing preserves center and right glyph anchors", () => {
  for (const align of ["center", "right"]) {
    const item = textBox(`anchor-${align}`, {
      box: { x: 100, y: 100, w: 140, h: 24 },
      font: { family: "Microsoft YaHei", sizePt: 16, align, valign: "middle" }
    });
    const before = structuredClone(item);
    const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
      measurement(item.id, { x: 142, y: 102, w: 90, h: 20 }, { x: 140, y: 100, w: 70, h: 20 })
    ] });
    assert.equal(result.evidence.accepted, 1);
    const fitted = result.textBoxes[0];
    const anchor = box => align === "center" ? box.x + box.w / 2 : box.x + box.w;
    assert.ok(Math.abs(anchor(fitted.box) - anchor(item.box) - 2) < 1e-9);
    assert.ok(Math.abs(fitted.box.y + fitted.box.h / 2 - (item.box.y + item.box.h / 2) - 2) < 1e-9);
    assert.equal(fitted.font.sizePt, item.font.sizePt);
    assert.deepEqual(item, before);
  }
});

test("frame bounds use the emitted top-left rather than the center alignment anchor", () => {
  const item = textBox("near-edge", {
    box: { x: 700, y: 100, w: 200, h: 30 },
    font: { family: "Microsoft YaHei", sizePt: 12, align: "center", valign: "middle" }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement(item.id, { x: 760, y: 108, w: 80, h: 16 }, { x: 770, y: 109, w: 60, h: 12 })
  ] });
  assert.equal(result.evidence.accepted, 1);
  assert.ok(result.textBoxes[0].box.x + result.textBoxes[0].box.w <= slideSize.widthPt);
});

test("alignment compensation cannot emit an out-of-slide box", () => {
  const item = textBox("right-at-left-edge", {
    box: { x: 0, y: 100, w: 140, h: 24 },
    font: { family: "Microsoft YaHei", sizePt: 16, align: "right", valign: "middle" }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement(item.id, { x: 10, y: 102, w: 90, h: 20 }, { x: 10, y: 100, w: 70, h: 20 })
  ] });
  assert.equal(result.evidence.accepted, 0);
  assert.equal(result.textBoxes[0], item);
});

test("vertical frame growth preserves measured glyph anchor after capped OCR scaling", () => {
  const item = textBox("capped-frame", {
    box: { x: 200, y: 100, w: 110, h: 12 },
    font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" },
    source: { editable: true, confidence: 0.98, ocrProvider: "test", segmentedOcrLineId: "group", evidenceBox: { h: 12 } }
  });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [
    measurement(item.id, { x: 202, y: 103, w: 132, h: 22 }, { x: 200, y: 100, w: 60, h: 10 })
  ] });
  assert.equal(result.evidence.accepted, 1);
  const fitted = result.textBoxes[0], ratio = fitted.font.sizePt / item.font.sizePt;
  const oldAnchor = item.box.y + item.box.h / 2, newAnchor = fitted.box.y + fitted.box.h / 2;
  const predictedInkTop = newAnchor + (100 - oldAnchor) * ratio;
  assert.ok(Math.abs(predictedInkTop - 103) < 1e-9);
});

test("supports bounded high-confidence growth and ranked candidate limits", () => {
  const large = textBox("large", { box: { x: 100, y: 100, w: 430, h: 18 }, font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" } });
  const small = textBox("small", { box: { x: 100, y: 140, w: 80, h: 18 }, font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" } });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [large, small], candidateLimit: 1, measurements: [
    measurement("large", { x: 100, y: 102, w: 420, h: 14 }, { x: 100, y: 103, w: 255, h: 8.5 }),
    measurement("small", { x: 100, y: 142, w: 40, h: 12 }, { x: 100, y: 143, w: 30, h: 9 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 1 });
  assert.equal(result.changes[0].id, "large");
  assert.equal(result.textBoxes[0].font.sizePt, 13.18);
  assert.equal(result.textBoxes[1], small);
});

test("ranks same-scale candidates by local source/rendered mismatch evidence", () => {
  const lowShift = textBox("low-shift", { box: { x: 100, y: 100, w: 180, h: 24 }, font: { family: "Microsoft YaHei", sizePt: 14, align: "left", valign: "middle" } });
  const highShift = textBox("high-shift", { box: { x: 100, y: 140, w: 180, h: 24 }, font: { family: "Microsoft YaHei", sizePt: 14, align: "left", valign: "middle" } });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [lowShift, highShift], candidateLimit: 1, measurements: [
    measurement("low-shift", { x: 101, y: 102, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("high-shift", { x: 105, y: 142, w: 130, h: 18 }, { x: 100, y: 140, w: 100, h: 14 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 1 });
  assert.equal(result.changes[0].id, "high-shift");
  assert.equal(result.changes[0].centerDeltaX, 20);
  assert.equal(result.changes[0].localMismatchScore > 0, true);
  assert.equal(result.textBoxes[0], lowShift);
  assert.notEqual(result.textBoxes[1], highShift);
});

test("can restrict measured text fitting to explicit target ids", () => {
  const large = textBox("large", { box: { x: 100, y: 100, w: 430, h: 18 }, font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" } });
  const small = textBox("small", { box: { x: 100, y: 140, w: 80, h: 18 }, font: { family: "Microsoft YaHei", sizePt: 8, align: "left", valign: "middle" } });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [large, small], targetIds: ["small"], measurements: [
    measurement("large", { x: 100, y: 102, w: 420, h: 14 }, { x: 100, y: 103, w: 255, h: 8.5 }),
    measurement("small", { x: 100, y: 142, w: 40, h: 12 }, { x: 100, y: 143, w: 30, h: 9 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 1 });
  assert.equal(result.changes[0].id, "small");
  assert.equal(result.textBoxes[0], large);
  assert.notEqual(result.textBoxes[1], small);
});

test("rejects malformed measured text target ids", () => {
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [], targetIds: [] }), /target ids/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [], targetIds: ["same", "same"] }), /ambiguous/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [], targetIds: [1] }), /target id/);
});

test("rejects malformed requests, out-of-slide measurement bounds, and ambiguous ids", () => {
  assert.throws(() => planMeasuredSingleLineTextFit(null), TypeError);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: Array(2001).fill(null), measurements: [] }), /text boxes are invalid/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: Array(2001).fill(null) }), /measurements are invalid/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize: { widthPt: 0, heightPt: 540 }, textBoxes: [], measurements: [] }), RangeError);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [textBox("same"), textBox("same")], measurements: [] }), /ambiguous/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [measurement("m", { x: 0, y: 0, w: 1, h: 1 }, { x: 959, y: 0, w: 2, h: 1 })] }), RangeError);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [measurement("m", { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }), measurement("m", { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 })] }), /ambiguous/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [], candidateLimit: 0 }), /candidate limit/);
});

test("rejects ratio caps and nonfinite evidence while preserving unrelated metadata", () => {
  const item = textBox("body"), original = structuredClone(item);
  const source = { x: 100, y: 100, w: 230, h: 33 }, rendered = { x: 100, y: 100, w: 100, h: 14 };
  const rejected = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [measurement("body", source, rendered)] });
  assert.equal(rejected.evidence.accepted, 0); assert.equal(rejected.textBoxes[0], item);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [measurement("body", { ...source, w: Infinity }, rendered)] }), /bounds are invalid/);
  const accepted = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [measurement("body", { ...source, w: 130, h: 18 }, rendered)] });
  assert.equal(accepted.evidence.accepted, 1);
  assert.equal(accepted.textBoxes[0].source, item.source); assert.equal(accepted.textBoxes[0].style, item.style);
  assert.deepEqual(item, original);
});
