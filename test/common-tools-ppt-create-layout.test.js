"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const schema = require("../packages/ppt-create-core/presentation-spec.schema.json");
const { createDeckIr, createLayoutPlan } = require("../packages/ppt-create-core/layout");
const { LAYOUT_REGISTRY, selectLayoutCandidates, validateLayoutRegistry } = require("../packages/ppt-create-core/layout-registry");
const { THEMES, validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { THEME_REGISTRY, getTheme, validateThemeRegistry } = require("../packages/ppt-create-core/theme-registry");

function spec() {
  return {
    version: "1.0",
    title: "产品路线图",
    theme: "editorial-warm-v1",
    seed: "roadmap-2026",
    variantCount: 3,
    slides: [
      { id: "cover", role: "cover", title: "产品路线图", summary: "围绕客户结果安排下一阶段投资" },
      { id: "context", role: "content", priority: "narrative", title: "增长来自三个相互强化的动作", summary: "优先解决可验证的客户阻力", items: [
        { id: "learn", label: "学习", detail: "验证需求和成功标准" },
        { id: "build", label: "建设", detail: "形成可复用能力" },
        { id: "scale", label: "规模化", detail: "复制有效路径" }
      ] },
      { id: "metrics", role: "metrics", title: "结果由两个指标共同衡量", items: [
        { id: "quality", label: "质量", value: "98%", detail: "关键任务一次通过" },
        { id: "speed", label: "速度", value: "2×", detail: "交付周期缩短" }
      ] },
      { id: "close", role: "closing", title: "以结果验证每一项投入", summary: "下一步进入可衡量的执行周期" }
    ]
  };
}

test("theme and layout registries are bounded, unique, and synchronized with the public schema", () => {
  assert.equal(validateThemeRegistry(), true);
  assert.equal(validateLayoutRegistry(), true);
  assert.deepEqual(THEMES, THEME_REGISTRY.map((theme) => theme.id));
  assert.deepEqual(schema.properties.theme.enum, THEME_REGISTRY.map((theme) => theme.id));
  assert.deepEqual(schema.$defs.slide.properties.layout.enum, LAYOUT_REGISTRY.map((layout) => layout.id));
  assert.equal(getTheme("technical-blue-v1").background, "#071A2B");
  assert.throws(() => validateThemeRegistry([THEME_REGISTRY[0], THEME_REGISTRY[0]]), /invalid id/);
  assert.throws(() => validateLayoutRegistry([LAYOUT_REGISTRY[0], LAYOUT_REGISTRY[0]]), /invalid id/);
});

test("layout planning is deterministic, capacity-aware, and exposes bounded alternatives", () => {
  const first = createLayoutPlan(spec());
  const second = createLayoutPlan(spec());
  assert.deepEqual(first, second);
  assert.equal(first.pages.length, 4);
  for (const page of first.pages) {
    assert.ok(page.candidates.length >= 2 && page.candidates.length <= 3);
    assert.equal(page.selectedLayout, page.candidates[0].id);
    assert.equal(new Set(page.candidates.map((candidate) => candidate.id)).size, page.candidates.length);
  }
  const normalized = validatePresentationSpec(spec());
  assert.equal(selectLayoutCandidates(normalized.slides[2], { seed: normalized.seed, variantCount: 3 })[0].roles.includes("metrics"), true);
});

test("an explicit compatible layout wins while invalid and incompatible choices fail at admission", () => {
  const explicit = spec(); explicit.slides[1].layout = "content-editorial-v1";
  assert.equal(createLayoutPlan(explicit).pages[1].selectedLayout, "content-editorial-v1");
  const unknown = spec(); unknown.slides[1].layout = "unknown-layout";
  assert.throws(() => validatePresentationSpec(unknown), /layout is invalid/);
  const incompatible = spec(); incompatible.slides[1].layout = "metrics-row-v1";
  assert.throws(() => validatePresentationSpec(incompatible), /layout is incompatible/);
  const excessive = spec(); excessive.variantCount = 4;
  assert.throws(() => validatePresentationSpec(excessive), /variant count/);
});

test("generated Deck IR records resolved candidates and preserves presentation typography floors", () => {
  const ir = createDeckIr(spec());
  assert.equal(ir.pages.every((page) => page.intent.candidateLayoutIds.length >= 2 && page.intent.candidateLayoutIds.includes(page.intent.layoutId)), true);
  for (const page of ir.pages) {
    for (const item of page.textBoxes) {
      assert.ok(item.font.sizePt >= 16);
      if (item.role === "title") assert.ok(item.font.sizePt >= (page.intent.role === "cover" ? 50 : 35));
    }
  }
});
