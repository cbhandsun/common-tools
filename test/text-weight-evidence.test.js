"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { measureTextWeightEvidence, planEvidenceTextWeightFit } = require("../packages/slideclone-core/typography/text-weight-evidence");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { tryBuildFinalWorstTextWeightCandidate } = require("../packages/slideclone-worker-adapter/team-worker");

const slideSize = { widthPt: 100, heightPt: 100 };
function text() {
  return { id: "body", text: "Editable", box: { x: 10, y: 10, w: 70, h: 40 },
    font: { sizePt: 18, color: "#000000", weight: "bold", align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.95, ocrProvider: "test" } };
}
function raster(stroke, scale = 1) {
  const width = 100 * scale, rgba = Buffer.alloc(width * width * 4, 255);
  for (let y = 20 * scale; y < 40 * scale; y++) for (let x = 20 * scale; x < 40 * scale; x++) {
    if (x >= (20 + stroke) * scale && x < (40 - stroke) * scale && y >= (20 + stroke) * scale && y < (40 - stroke) * scale) continue;
    const o = (y * width + x) * 4; rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0;
  }
  return { width, height: width, rgba };
}
const evidence = () => [{ id: "body", coverageRatio: 0.6, source: { x: 20, y: 20, w: 40, h: 18 }, rendered: { x: 20, y: 20, w: 40, h: 14 } }];

test("ink density evidence is normalized across image resolution and never edits text", () => {
  const entry = text(), before = structuredClone(entry);
  const rows = measureTextWeightEvidence({ slideSize, textBoxes: [entry], sourceImage: raster(2, 2), renderedImage: raster(4) });
  assert.equal(rows.length, 1);
  assert.ok(Math.abs(rows[0].coverageRatio - 0.5625) < 0.001);
  assert.deepEqual(entry, before);
});

test("weight planning creates separate weight-only and geometry-backed native candidates", () => {
  const entry = text(), before = structuredClone(entry);
  const simple = planEvidenceTextWeightFit({ slideSize, textBoxes: [entry], evidence: evidence() });
  assert.equal(simple.changedTextBoxes, 1);
  assert.equal(simple.textBoxes[0].font.weight, "regular");
  assert.deepEqual(simple.textBoxes[0].box, entry.box);
  const joint = planEvidenceTextWeightFit({ slideSize, textBoxes: [entry], evidence: evidence(), fitGeometry: true });
  assert.ok(joint.textBoxes[0].font.sizePt > entry.font.sizePt);
  assert.equal(joint.textBoxes[0].font.weight, "regular");
  assert.equal(joint.textBoxes[0].text, entry.text);
  assert.deepEqual(entry, before);
});

test("source-denser regular OCR can propose bold with the reciprocal existing density bounds", () => {
  for (const weight of [undefined, "regular", "normal", "400", 400]) {
    const entry = text(); entry.font.weight = weight;
    const before = structuredClone(entry);
    const plan = planEvidenceTextWeightFit({ slideSize, textBoxes: [entry],
      evidence: [{ ...evidence()[0], coverageRatio: 1 / 0.6 }] });
    assert.equal(plan.changedTextBoxes, 1);
    assert.equal(plan.textBoxes[0].font.weight, "bold");
    assert.deepEqual(plan.textBoxes[0].box, entry.box);
    assert.equal(plan.textBoxes[0].text, entry.text);
    assert.deepEqual(entry, before);
  }
  const regular = { ...text(), font: { ...text().font, weight: "regular" } };
  for (const ratio of [0.6, 1, 1 / .75 - .001, 1 / .35 + .001, 4]) {
    assert.equal(planEvidenceTextWeightFit({ slideSize, textBoxes: [regular],
      evidence: [{ ...evidence()[0], coverageRatio: ratio }] }).changedTextBoxes, 0);
  }
  for (const entry of [{ ...regular, source: { editable: true, confidence: .5 } },
    { ...regular, runs: [{ text: "Mixed" }] }, { ...regular, style: { visibility: "hidden", wrap: false } },
    { ...regular, font: { ...regular.font, weight: "300" } }]) {
    assert.equal(planEvidenceTextWeightFit({ slideSize, textBoxes: [entry],
      evidence: [{ ...evidence()[0], coverageRatio: 1 / .6 }] }).changedTextBoxes, 0);
  }
});

test("weight planning ignores matching density, low confidence, hidden, multiline and mixed runs", () => {
  for (const ratio of [0.2, 0.8, 1, 2]) assert.equal(planEvidenceTextWeightFit({ slideSize, textBoxes: [text()],
    evidence: [{ ...evidence()[0], coverageRatio: ratio }] }).changedTextBoxes, 0);
  for (const entry of [{ ...text(), source: { editable: false, confidence: 0.95 } },
    { ...text(), source: { editable: true, confidence: NaN } }, { ...text(), source: { editable: true, confidence: 0.5 } },
    { ...text(), style: { visibility: "hidden", wrap: false } }, { ...text(), runs: [{ text: "Editable" }] },
    { ...text(), text: "two\nlines" }]) {
    assert.equal(planEvidenceTextWeightFit({ slideSize, textBoxes: [entry], evidence: evidence() }).changedTextBoxes, 0);
  }
});


test("weight evidence rejects malformed, unsafe, duplicated and excessive inputs", () => {
  for (const value of [null, {}, { slideSize, textBoxes: [], evidence: new Array(2001) },
    { slideSize, textBoxes: [text()], evidence: [...evidence(), ...evidence()] },
    { slideSize, textBoxes: [text()], evidence: [{ ...evidence()[0], id: "unsafe\0" }] },
    { slideSize, textBoxes: [text()], evidence: [{ ...evidence()[0], coverageRatio: Infinity }] },
    { slideSize, textBoxes: [text()], evidence: [{ ...evidence()[0], source: { x: -1, y: 0, w: 1, h: 1 } }] },
    { slideSize, textBoxes: [text()], evidence: evidence(), fitGeometry: "true" }]) assert.throws(() => planEvidenceTextWeightFit(value));
  assert.throws(() => measureTextWeightEvidence({ slideSize, textBoxes: [text()], sourceImage: {}, renderedImage: raster(2) }));
  assert.deepEqual(planEvidenceTextWeightFit({ slideSize, textBoxes: [], evidence: [] }).targetIds, []);
  const transparent = raster(2); transparent.rgba.fill(0);
  assert.deepEqual(measureTextWeightEvidence({ slideSize, textBoxes: [text()], sourceImage: transparent, renderedImage: raster(4) }), []);
});

test("worker weight candidates use full measured evidence even when truncated worst rows omit the text", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weight-evidence-worker-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = { slideSize, pages: [{ textBoxes: [text()] }] };
  const quality = { passed: false, checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08, "mean-absolute-delta": 14
  }, componentWorst: [], textWeightEvidence: evidence().map(item => ({ ...item, pageIndex: 0 })) };
  let calls = 0;
  const result = await tryBuildFinalWorstTextWeightCandidate({ root, metadata: { generatedDeck: deck }, sourceImages: [], visualQuality: quality,
    isCancellationRequested: async () => false, runBuild: async () => {}, rawImageQualityVerifier: async input => {
      assert.equal(input.referenceQuality, quality);
      assert.equal(input.deck.pages[0].textBoxes[0].font.weight, "regular");
      calls++;
      return { ...quality, metrics: { ...quality.metrics, "pixel-diff-ratio": 0.10, "foreground-missing-ratio": 0.07, "mean-absolute-delta": 13 } };
    } });
  assert.ok(calls >= 1);
  assert.equal(result.accepted, true);
  assert.equal(deck.pages[0].textBoxes[0].font.weight, "bold");
});

test("worker rebuilds and rechecks a partial text rollback rather than accepting the old report", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "weight-partial-rollback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const texts = ["good", "bad"].map(id => ({ ...text(), id }));
  const local = badSeverity => texts.map(entry => ({ id: entry.id, pageIndex: 0, kind: "text", role: "text", severity: entry.id === "bad" ? badSeverity : 0.8 }));
  const quality = { passed: false, checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08, "mean-absolute-delta": 14
  }, componentWorst: local(0.8), componentLocalMetrics: local(0.8),
    textWeightEvidence: texts.map(entry => ({ ...evidence()[0], id: entry.id, pageIndex: 0 })) };
  let builds = 0, correctedReports = 0;
  const result = await tryBuildFinalWorstTextWeightCandidate({ root, metadata: { generatedDeck: { slideSize, pages: [{ textBoxes: texts }] } },
    sourceImages: [], visualQuality: quality, isCancellationRequested: async () => false,
    runBuild: async () => { builds++; }, rawImageQualityVerifier: async input => {
      const candidate = input.deck.pages[0].textBoxes;
      const good = candidate[0].font.weight === "regular", bad = candidate[1].font.weight === "regular";
      if (good && !bad) correctedReports++;
      return { ...quality, textWeightEvidence: undefined, componentWorst: local(bad ? 1.5 : 0.8), componentLocalMetrics: local(bad ? 1.5 : 0.8),
        metrics: { ...quality.metrics, "pixel-diff-ratio": good ? 0.10 : 0.12, "foreground-missing-ratio": good ? 0.07 : 0.09,
          "mean-absolute-delta": good ? 13 : 15 } };
    } });
  assert.equal(result.accepted, true);
  assert.equal(result.changedTextBoxes, 1);
  assert.ok(correctedReports >= 1);
  assert.ok(builds > correctedReports);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "regular");
  assert.deepEqual(result.deck.pages[0].textBoxes[1], texts[1]);
});
