"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { planOwnedTextAdvanceFit, planOwnedTextWarpFit, planOwnedTextFit, textProbeRevision } = require("../packages/slideclone-core/owned-text-advance");

function fixture() {
  const text = { id: "label", text: "Editable text", box: { x: 100, y: 100, w: 200, h: 24 },
    font: { family: "Arial", sizePt: 20, weight: "regular", align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.96, ocrProvider: "test" } };
  const renderProfile = { rendererId: "render-libreoffice", version: "test-version", dpi: 144,
    pixelWidth: 1920, pixelHeight: 1080, runtimeHash: "a".repeat(64), sourceHash: "b".repeat(64) };
  return { slideSize: { widthPt: 960, heightPt: 540 }, textBoxes: [text], renderProfile, measurements: [{ id: "label",
    source: { x: 101, y: 101, w: 120, h: 20 }, rendered: { x: 100, y: 100, w: 144, h: 20 },
    sourceComplete: true, renderedComplete: true, renderedOwnership: "isolated", textRevision: textProbeRevision(text), renderProfile: { ...renderProfile } }] };
}

test("owned joint fit corrects an undersized font before warp without reusing its modified revision", () => {
  const request = fixture(), row = request.measurements[0];
  row.source = { x: 101, y: 100, w: 216, h: 30 };
  row.rendered = { x: 100, y: 102, w: 144, h: 20 };
  const result = planOwnedTextFit(request);
  assert.equal(result.changes.length, 1);
  assert.equal(result.textBoxes[0].font.sizePt, 30);
  assert.equal(result.textBoxes[0].style.textWarp, undefined);
  assert.equal(planOwnedTextFit({ ...request, textBoxes: result.textBoxes }).changes.length, 0);
});

test("owned joint fit uses native warp for width-only glyph mismatch instead of resizing an ineffective frame", () => {
  const request = fixture(), result = planOwnedTextFit(request);
  assert.equal(result.changes.length, 1);
  assert.equal(result.textBoxes[0].font.sizePt, 20);
  assert.equal(result.textBoxes[0].style.textWarp, "textPlain");
});

test("joint font fitting accepts ordinary arrow text with fresh isolated large-growth evidence", () => {
  const request = fixture(), text = request.textBoxes[0], row = request.measurements[0];
  text.text = "\u4e2d\u6587\u2192\u6d41\u7a0b\u2192\u7ed3\u679c";
  text.font.sizePt = 16.2;
  row.textRevision = textProbeRevision(text);
  row.source = { x: 100, y: 99, w: 303.19, h: 31.72 };
  row.rendered = { x: 100, y: 102, w: 200, h: 20 };
  const result = planOwnedTextFit(request);
  assert.equal(result.changes.length, 1);
  assert.equal(result.textBoxes[0].font.sizePt, 24.56);
  assert.equal(result.textBoxes[0].text, text.text);
  assert.equal(result.textBoxes[0].style.textWarp, undefined);
});

test("anisotropic text uses bounded native warp rather than ineffective compensating frame width", () => {
  const request = fixture(), row = request.measurements[0];
  row.source = { x: 100, y: 100, w: 155, h: 26 };
  row.rendered = { x: 100, y: 102, w: 144, h: 20 };
  const result = planOwnedTextFit(request);
  assert.equal(result.changes.length, 1);
  assert.equal(result.textBoxes[0].font.sizePt, 20);
  assert.equal(result.textBoxes[0].style.textWarp, "textPlain");
  assert.deepEqual(result.textBoxes[0].box, row.source);
  assert.equal(result.textBoxes[0].text, request.textBoxes[0].text);
  assert.equal(planOwnedTextFit({ ...request, textBoxes: result.textBoxes }).changes.length, 0);
});

test("joint font fitting cannot consume stale, composite or incomplete geometry evidence", () => {
  for (const patch of [{ sourceComplete: false }, { renderedComplete: false }, { renderedOwnership: "composite" },
    { textRevision: "f".repeat(64) }]) {
    const request = fixture(), row = request.measurements[0];
    row.source = { x: 101, y: 100, w: 216, h: 30 };
    row.rendered = { x: 100, y: 102, w: 144, h: 20 };
    Object.assign(row, patch);
    assert.equal(planOwnedTextFit(request).changes.length, 0);
  }
});

test("complete owned ink adjusts native advance without changing font size, frame dimensions or content", () => {
  const request = fixture(), before = structuredClone(request);
  const result = planOwnedTextAdvanceFit(request), text = result.textBoxes[0];
  assert.equal(result.changes.length, 1);
  assert.equal(text.font.characterSpacingPt, -2);
  assert.equal(text.font.sizePt, 20);
  assert.equal(text.box.w, 200); assert.equal(text.box.h, 24);
  assert.equal(text.text, request.textBoxes[0].text);
  assert.equal(144 + text.font.characterSpacingPt * (text.text.length - 1), 120);
  assert.deepEqual(request, before);
});

for (const field of ["rendererId", "version", "dpi", "pixelWidth", "pixelHeight", "runtimeHash", "sourceHash"]) {
  test(`rejects evidence from a different ${field}`, () => {
    const request = fixture();
    const other = request.measurements[0].renderProfile;
    if (field === "rendererId") other[field] = "render-powerpoint-com";
    else if (["dpi", "pixelWidth", "pixelHeight"].includes(field)) other[field] += 1;
    else if (field.endsWith("Hash")) other[field] = "c".repeat(64);
    else other[field] = "other";
    assert.equal(planOwnedTextAdvanceFit(request).changes.length, 0);
  });
}

for (const field of ["font", "style", "source", "text", "box", "role", "wrap", "rotation", "runs"]) {
  test(`invalidates isolated evidence after ${field} revision`, () => {
    const request = fixture();
    const text = request.textBoxes[0];
    if (field === "font") text.font.weight = "bold";
    else if (field === "style") text.style.marginTopPt = 1;
    else if (field === "source") text.source.ocrProvider = "changed";
    else if (field === "text") text.text += "x";
    else if (field === "box") text.box.x += 1;
    else text[field] = field === "runs" ? [] : "changed";
    assert.equal(planOwnedTextAdvanceFit(request).changes.length, 0);
  });
}

test("refuses incomplete, composite, autofit, complex or low-confidence evidence", () => {
  for (const change of [
    { evidence: { sourceComplete: false } }, { evidence: { renderedComplete: false } },
    { evidence: { renderedOwnership: "composite" } }, { style: { fit: "SHRINK" } }, { style: { wrap: true } },
    { font: { sizePt: 0 } }, { font: { characterSpacingPt: Infinity } }, { source: { confidence: 0.89 } },
    { source: { editable: false } }, { source: { ocrProvider: "" } }, { source: { segmentedOcrLineId: "line" } },
    { text: "A" }, { text: "combining e\u0301" }, { text: "emoji \u{1F600}" }
  ]) {
    const request = fixture(), text = request.textBoxes[0];
    for (const key of ["font", "style", "source"]) if (change[key]) Object.assign(text[key], change[key]);
    if (change.text) text.text = change.text;
    Object.assign(request.measurements[0], change.evidence);
    request.measurements[0].textRevision = textProbeRevision(text);
    assert.equal(planOwnedTextAdvanceFit(request).changes.length, 0);
  }
});

test("retains existing per-character, total-spacing, height and displacement limits", () => {
  for (const mode of ["gap", "total", "height", "displacement", "matched", "edge"]) {
    const request = fixture(), row = request.measurements[0], text = request.textBoxes[0];
    if (mode === "gap") row.source.w = 80;
    if (mode === "total") text.font.characterSpacingPt = -11;
    if (mode === "height") row.source.h = 23;
    if (mode === "displacement") row.source.x = 109;
    if (mode === "matched") row.source.w = row.rendered.w;
    if (mode === "edge") { text.box.x = 0; row.source.x = 0; }
    row.textRevision = textProbeRevision(text);
    assert.equal(planOwnedTextAdvanceFit(request).changes.length, 0, mode);
  }
});

test("preserves advance anchors for center and right alignment without resizing the frame", () => {
  for (const align of ["center", "right"]) {
    const request = fixture(), text = request.textBoxes[0], row = request.measurements[0];
    text.font.align = align;
    row.source.x = row.rendered.x + (align === "center" ? 12 : 24);
    row.source.y = row.rendered.y;
    row.textRevision = textProbeRevision(text);
    const result = planOwnedTextAdvanceFit(request);
    assert.equal(result.changes.length, 1);
    assert.deepEqual(result.textBoxes[0].box, text.box);
  }
});

test("validates empty, malformed, ambiguous, unsafe and extreme boundary inputs", () => {
  const request = fixture();
  assert.deepEqual(planOwnedTextAdvanceFit({ ...request, textBoxes: [], measurements: [] }), { textBoxes: [], changes: [] });
  assert.throws(() => planOwnedTextAdvanceFit(null), /request is invalid/u);
  assert.throws(() => planOwnedTextAdvanceFit({ ...request, renderProfile: {} }), /profile is invalid/u);
  assert.throws(() => planOwnedTextAdvanceFit({ ...request, textBoxes: Array(2001).fill(null) }), /request is invalid/u);
  assert.throws(() => planOwnedTextAdvanceFit({ ...request, measurements: [null] }), /evidence is invalid/u);
  assert.throws(() => planOwnedTextAdvanceFit({ ...request, measurements: [request.measurements[0], request.measurements[0]] }), /ambiguous/u);
  assert.throws(() => planOwnedTextAdvanceFit({ ...request, measurements: [{ ...request.measurements[0], source: { x: -1, y: 1, w: 20, h: 20 } }] }), /bounds are invalid/u);
  assert.throws(() => planOwnedTextAdvanceFit({ ...request, renderProfile: { ...request.renderProfile, pixelWidth: 100 } }), /aspect ratio/u);
  assert.throws(() => textProbeRevision(null), /revision is invalid/u);
  assert.throws(() => textProbeRevision({ source: { payload: "x".repeat(131072) } }), /processing boundary/u);
});

test("owned native warp changes only frame geometry and an explicit editable preset", () => {
  const request = fixture(), before = structuredClone(request);
  const result = planOwnedTextWarpFit(request), fitted = result.textBoxes[0];
  assert.equal(result.changes.length, 1);
  assert.deepEqual(fitted.box, request.measurements[0].source);
  assert.equal(fitted.style.textWarp, "textPlain");
  assert.deepEqual(fitted.font, request.textBoxes[0].font);
  assert.deepEqual(fitted.source, request.textBoxes[0].source);
  assert.equal(fitted.text, request.textBoxes[0].text);
  assert.deepEqual(request, before);
});

test("native warp refuses incomplete, stale, cross-engine and already warped evidence", () => {
  for (const mode of ["incomplete", "composite", "stale", "renderer", "already-warped", "spacing", "mixed", "wrapped", "complex", "scaled", "position", "matched", "confidence"]) {
    const request = fixture(), text = request.textBoxes[0], row = request.measurements[0];
    if (mode === "incomplete") row.sourceComplete = false;
    if (mode === "composite") row.renderedOwnership = "composite";
    if (mode === "renderer") row.renderProfile.rendererId = "render-powerpoint-com";
    if (mode === "already-warped") text.style.textWarp = "textPlain";
    if (mode === "spacing") text.font.characterSpacingPt = 1;
    if (mode === "mixed") text.runs = [];
    if (mode === "wrapped") text.wrap = true;
    if (mode === "complex") text.text = "emoji \u{1F600}";
    if (mode === "scaled") row.source.w = 40;
    if (mode === "position") row.source.x = 120;
    if (mode === "matched") row.source.w = row.rendered.w;
    if (mode === "confidence") text.source.confidence = 0.89;
    if (mode !== "stale") row.textRevision = textProbeRevision(text);
    else text.font.weight = "bold";
    assert.equal(planOwnedTextWarpFit(request).changes.length, 0, mode);
  }
});

test("native warp and advance planners share fail-closed request and profile boundaries", () => {
  const request = fixture();
  assert.deepEqual(planOwnedTextWarpFit({ ...request, textBoxes: [], measurements: [] }), { textBoxes: [], changes: [] });
  assert.throws(() => planOwnedTextWarpFit(null), /request is invalid/u);
  assert.throws(() => planOwnedTextWarpFit({ ...request, renderProfile: {} }), /profile is invalid/u);
  assert.throws(() => planOwnedTextWarpFit({ ...request, measurements: [request.measurements[0], request.measurements[0]] }), /ambiguous/u);
});
test("extent-matched native text gets a source-ink warp proposal only with fresh significant internal residual", () => {
  const request = fixture(), row = request.measurements[0];
  row.source = { ...row.rendered };
  const residual = { id: row.id, textRevision: row.textRevision, sourceHash: request.renderProfile.sourceHash,
    pixelDiffRatio: 0.4, foregroundMissingRatio: 0.2 };
  assert.equal(planOwnedTextWarpFit(request).changes.length, 0);
  request.residualEvidence = [residual];
  const before = structuredClone(request), plan = planOwnedTextFit(request);
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.textBoxes[0].box, row.source);
  assert.equal(plan.textBoxes[0].style.textWarp, "textPlain");
  assert.deepEqual(plan.textBoxes[0].font, request.textBoxes[0].font);
  assert.equal(plan.textBoxes[0].text, request.textBoxes[0].text);
  assert.deepEqual(request, before);
  for (const overrides of [{ textRevision: "c".repeat(64) }, { sourceHash: "c".repeat(64) },
    { pixelDiffRatio: 0.01, foregroundMissingRatio: 0.01 }]) {
    assert.equal(planOwnedTextFit({ ...request, residualEvidence: [{ ...residual, ...overrides }] }).changes.length, 0);
  }
  for (const overrides of [{ sourceComplete: false }, { renderedComplete: false }, { renderedOwnership: "composite" }]) {
    assert.equal(planOwnedTextFit({ ...request, measurements: [{ ...row, ...overrides }] }).changes.length, 0);
  }
});
test("residual request getters and proxies cannot execute while authorizing a new proposal", () => {
  const request = fixture(); let executed = false;
  assert.throws(() => planOwnedTextFit({ ...request, get residualEvidence() { executed = true; return []; } }));
  assert.throws(() => planOwnedTextFit(new Proxy(request, { get() { executed = true; return undefined; } })));
  assert.equal(executed, false);
});
