"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  detectStaticTextOverflow,
  estimateSingleLineWidth
} = require("../packages/slideclone-core/static-text-overflow-detector");

test("estimateSingleLineWidth handles CJK and Latin proportions", () => {
  // 4 CJK chars * 16pt * 1.0 = 64pt
  const cjkWidth = estimateSingleLineWidth("需求设计", 16);
  assert.equal(cjkWidth, 64);

  // 4 Latin chars * 16pt * 0.55 = 35.2pt
  const latinWidth = estimateSingleLineWidth("TEST", 16);
  assert.equal(latinWidth, 35.2);

  // Empty string
  assert.equal(estimateSingleLineWidth("", 16), 0);
});

test("detectStaticTextOverflow detects non-overflowing text", () => {
  const text = "核心指标";
  const box = { w: 100, h: 40 }; // fits 4 CJK chars (48pt) easily
  const report = detectStaticTextOverflow(text, 12, box);

  assert.equal(report.overflows, false);
  assert.equal(report.severity, "none");
  assert.equal(report.estimatedLines, 1);
  assert.equal(report.suggestedFontSizePt, 12);
});

test("detectStaticTextOverflow applies safe defaults for omitted optional inputs", () => {
  const report = detectStaticTextOverflow(null, undefined, { w: 100, h: 40 }, {
    padding: { left: 4, right: 4 }
  });

  assert.equal(report.overflows, false);
  assert.equal(report.maxAllowedLines, null);
  assert.equal(report.suggestedFontSizePt, 12);
  assert.equal(report.availableWidth, 92);
});

test("detectStaticTextOverflow detects single-line overflow and recommends scaled font", () => {
  const text = "供应链全链路智能运营管控中枢平台"; // 16 CJK chars * 18pt = 288pt
  const box = { w: 150, h: 30 }; // available width ~146pt
  const report = detectStaticTextOverflow(text, 18, box, { maxLines: 1 });

  assert.equal(report.overflows, true);
  assert.ok(["warning", "critical"].includes(report.severity));
  assert.ok(report.suggestedFontSizePt < 18);
  assert.ok(report.suggestedFontSizePt >= 8);
});

test("detectStaticTextOverflow handles multiline wrapping within bounds", () => {
  const text = "第一阶段需求调研第二阶段架构设计第三阶段系统实施"; // 24 CJK chars * 12pt = 288pt
  const box = { w: 100, h: 120 }; // available w ~96pt -> ~3 lines -> h ~45pt
  const report = detectStaticTextOverflow(text, 12, box, { maxLines: 4 });

  assert.equal(report.overflows, false);
  assert.equal(report.severity, "none");
  assert.equal(report.estimatedLines, 3);
});

test("detectStaticTextOverflow catches overflow exceeding maxLines", () => {
  const text = "第一阶段第二阶段第三阶段第四阶段第五阶段第六阶段"; // 24 CJK chars
  const box = { w: 80, h: 40 }; // only fits ~2 lines
  const report = detectStaticTextOverflow(text, 14, box, { maxLines: 2 });

  assert.equal(report.overflows, true);
  assert.ok(report.estimatedLines > 2);
  assert.ok(["warning", "critical"].includes(report.severity));
});

test("detectStaticTextOverflow handles defensive error paths", () => {
  assert.throws(() => detectStaticTextOverflow("text", 12, null), /box must be an object/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: -10, h: 20 }), /positive finite numbers/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: NaN }), /box\.h must be a finite number/);
});

test("detectStaticTextOverflow rejects invalid boundary options", () => {
  assert.throws(() => estimateSingleLineWidth("text", Infinity), /fontSizePt must be a finite number/);
  assert.throws(() => detectStaticTextOverflow({}, 12, { w: 10, h: 20 }), /text must be a string/);
  assert.throws(() => detectStaticTextOverflow("text", "12", { w: 10, h: 20 }), /fontSizePt must be a finite number/);
  assert.throws(() => detectStaticTextOverflow("text", 0, { w: 10, h: 20 }), /fontSizePt must be a positive finite number/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: "10", h: 20 }), /box\.w must be a finite number/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: 20 }, []), /options must be an object/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: 20 }, { padding: -1 }), /padding must be a number between 0/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: 20 }, { padding: { top: Infinity } }), /padding\.top must be a finite number/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: 20 }, { lineHeight: 0.5 }), /lineHeight must be a number between 1/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: 20 }, { allowWrap: "false" }), /allowWrap must be a boolean/);
  assert.throws(() => detectStaticTextOverflow("text", 12, { w: 10, h: 20 }, { maxLines: 1.5 }), /maxLines must be an integer/);
});
