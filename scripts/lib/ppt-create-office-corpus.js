"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

function item(id, label, detail = `${label} detail`) { return { id, label, detail }; }
function baseSlide(id, role, title, layout, items = []) { return { id, role, title, layout, items }; }
function sourceBacked(slide) {
  return {
    ...slide,
    speakerNotes: "Confirm the stated boundary before presenting this slide.",
    citations: [{ id: `${slide.id}-source`, title: "Controlled corpus evidence", locator: "https://example.com/common-tools/corpus", accessedAt: "2026-08-30", license: "authorized test reference" }]
  };
}
function media(id, title, layout, assetId, language) {
  return { ...baseSlide(id, "content", title, layout, [item(`${id}-context`, language === "en-US" ? "Licensed source image" : "已授权素材")]), visual: { kind: "media", mediaType: "image", alt: language === "en-US" ? "A controlled corpus illustration" : "受控语料插图", caption: "Common Tools corpus asset", assetId, fit: layout === "media-frame-v1" ? "cover" : "contain" } };
}
function table(id, title, layout, language) {
  const english = language === "en-US";
  return { ...baseSlide(id, "content", title, layout, [item(`${id}-insight`, english ? "Comparable evidence" : "可比较证据")]), visual: { kind: "table", headers: english ? ["Stage", "Owner", "Result"] : ["阶段", "负责人", "结果"], rows: english ? [["Discover", "Product", "Validated"], ["Build", "Engineering", "Ready"]] : [["发现", "产品", "已验证"], ["建设", "工程", "可交付"]], insight: english ? "Every row remains editable." : "每个单元格均保持可编辑。" } };
}
function chart(id, title, layout, language) {
  const english = language === "en-US";
  return { ...baseSlide(id, "content", title, layout, [item(`${id}-insight`, english ? "Measured progression" : "可度量进展")]), visual: { kind: "chart", type: layout === "chart-focus-v1" ? "column" : "line", categories: english ? ["Plan", "Build", "Verify"] : ["规划", "建设", "验证"], series: [{ name: english ? "Completion" : "完成度", values: [32, 68, 94] }], insight: english ? "Verification closes the remaining gap." : "验证阶段收敛剩余差距。" } };
}
function analysis(id, title, layout, language) {
  const english = language === "en-US";
  const labels = english ? ["Invest", "Test", "Maintain", "Exit"] : ["投入", "试验", "保持", "退出"];
  return { ...baseSlide(id, "content", title, layout, [item(`${id}-insight`, english ? "Bounded decisions" : "有界决策")]), visual: { kind: "analysis", model: "quadrant", entries: labels.map((label, index) => ({ id: `${id}-q${index + 1}`, label, detail: english ? "Evidence-led action" : "依据证据行动", group: `q${index + 1}` })), insight: english ? "Use the same evidence threshold in every quadrant." : "所有象限使用同一证据阈值。" } };
}
function assetRecord(assetFile) {
  const bytes = fs.readFileSync(assetFile);
  return {
    id: "corpus-image",
    path: "assets/corpus-image.png",
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    source: { kind: "original", locator: "common-tools:test-fixture", license: "company-owned original", author: "Common Tools", attributionRequired: false }
  };
}
function deck({ id, title, language, theme, slides, asset }) {
  return { id, spec: { version: "1.0", title, language, theme, seed: `${id}-seed`, variantCount: 2, ...(slides.some((slide) => slide.visual?.kind === "media") ? { assets: [asset] } : {}), slides } };
}

function buildPptCreateOfficeCorpus(assetFile) {
  if (typeof assetFile !== "string" || !fs.statSync(assetFile, { throwIfNoEntry: false })?.isFile()) throw new TypeError("PPT creation corpus asset is unavailable");
  const asset = assetRecord(assetFile);
  const zh = "zh-CN"; const en = "en-US"; const mixed = "zh-Hans";
  const primary = deck({ id: "zh-layouts", title: "新建演示文稿独立语料", language: zh, theme: "clean-light-v1", asset, slides: [
    { ...baseSlide("zh-cover", "cover", "从证据到可编辑交付", "cover-signal-v1"), summary: "覆盖关键布局与原生对象" },
    { ...baseSlide("zh-section", "section", "理解业务边界", "section-band-v1", [item("scope", "范围"), item("evidence", "证据")]), summary: "先明确约束，再选择表达" },
    { ...baseSlide("zh-content", "content", "三个动作形成闭环", "content-cards-v1", [item("learn", "学习"), item("build", "建设"), item("verify", "验证")]), summary: "每一步都留下可重复证据" },
    { ...baseSlide("zh-metrics", "metrics", "指标共同约束结果", "metrics-row-v1", [{ id: "quality", label: "质量", value: "98%", detail: "一次通过" }, { id: "speed", label: "速度", value: "2×", detail: "周期缩短" }]) },
    { ...baseSlide("zh-comparison", "comparison", "方案在同一边界比较", "comparison-split-v1", [item("option-a", "方案 A"), item("option-b", "方案 B")]) },
    { ...baseSlide("zh-process", "process", "交付按顺序推进", "process-linear-v1", [item("plan", "规划"), item("implement", "实现"), item("gate", "门禁")]) },
    media("zh-media", "素材具备来源与许可", "media-frame-v1", asset.id, zh),
    table("zh-table", "表格保留原生编辑能力", "table-focus-v1", zh),
    chart("zh-chart", "图表绑定可验证数据", "chart-focus-v1", zh),
    sourceBacked(analysis("zh-analysis", "四象限支持明确决策", "analysis-canvas-v1", zh)),
    { ...baseSlide("zh-close", "closing", "以验证结束每次交付", "closing-centered-v1", [item("next", "下一步")]), summary: "产物、证据与回滚路径同时就绪" }
  ] });
  const secondary = deck({ id: "en-layouts", title: "Independent presentation corpus", language: en, theme: "executive-dark-v1", asset, slides: [
    { ...baseSlide("en-cover", "cover", "Editable delivery at every layer", "cover-band-v1"), summary: "A bounded English-language corpus" },
    { ...baseSlide("en-section", "section", "Frame the operating context", "section-index-v1", [item("intent", "Intent"), item("boundary", "Boundary")]), summary: "Evidence precedes implementation" },
    { ...baseSlide("en-content", "content", "Narrative and evidence stay together", "content-editorial-v1", [item("claim", "Claim"), item("proof", "Proof"), item("decision", "Decision")]), summary: "Keep the takeaway visible" },
    { ...baseSlide("en-metrics", "metrics", "One metric leads the story", "metrics-focus-v1", [{ id: "lead", label: "Verified", value: "94%", detail: "Current result" }, { id: "guardrail", label: "Failures", value: "0", detail: "Required guardrail" }]) },
    { ...baseSlide("en-comparison", "comparison", "Alternatives share one axis", "comparison-axis-v1", [item("current", "Current"), item("target", "Target")]) },
    { ...baseSlide("en-process", "process", "Stages expose ownership", "process-stages-v1", [item("discover", "Discover"), item("deliver", "Deliver"), item("observe", "Observe")]) },
    media("en-media", "A source-controlled visual", "media-caption-v1", asset.id, en),
    table("en-table", "Compact evidence table", "table-compact-v1", en),
    chart("en-chart", "Trend with a bounded insight", "chart-insight-v1", en),
    sourceBacked(analysis("en-analysis", "Decision quadrants remain editable", "analysis-steps-v1", en)),
    { ...baseSlide("en-close", "closing", "Commit to the next verified action", "closing-actions-v1", [item("owner", "Assign owner"), item("date", "Set date")]), summary: "Close with an accountable action" }
  ] });
  const warm = deck({ id: "mixed-warm", title: "中英混排 · Delivery Review", language: mixed, theme: "editorial-warm-v1", asset, slides: [
    { ...baseSlide("warm-cover", "cover", "交付复盘 Delivery Review", "cover-signal-v1"), summary: "同一页面验证中文、English 与数字 2026" },
    { ...baseSlide("warm-content", "content", "Evidence 驱动下一步", "content-editorial-v1", [item("signal", "关键信号 Signal"), item("response", "响应动作 Action")]), summary: "Keep context 与 decision 一致" },
    table("warm-table", "跨团队 Cross-team evidence", "table-compact-v1", mixed),
    { ...baseSlide("warm-close", "closing", "确认 Owner 与 Deadline", "closing-actions-v1", [item("owner", "负责人 Owner"), item("date", "日期 Date")]) }
  ] });
  const technical = deck({ id: "mixed-technical", title: "Architecture 验证语料", language: mixed, theme: "technical-blue-v1", asset, slides: [
    { ...baseSlide("tech-cover", "cover", "Architecture 可编辑验证", "cover-band-v1"), summary: "Native shapes, charts 与 notes" },
    chart("tech-chart", "吞吐 Throughput trend", "chart-focus-v1", mixed),
    sourceBacked(analysis("tech-analysis", "决策 Decision matrix", "analysis-canvas-v1", mixed)),
    { ...baseSlide("tech-close", "closing", "进入 verified rollout", "closing-centered-v1", [item("gate", "通过 Gate")]) }
  ] });
  return Object.freeze([primary, secondary, warm, technical]);
}

function buildPptCreateBoundaryCases(validSpec) {
  if (!validSpec || typeof validSpec !== "object") throw new TypeError("PPT creation boundary case source is invalid");
  const clone = () => JSON.parse(JSON.stringify(validSpec));
  const maximumCapacity = clone();
  maximumCapacity.slides[2].items = Array.from({ length: 6 }, (_, index) => item(`capacity-${index + 1}`, `Capacity ${index + 1}`));
  const maximumText = clone();
  maximumText.slides[1].title = "界".repeat(120); maximumText.slides[1].summary = "文".repeat(500); maximumText.slides[1].items[0].detail = "内".repeat(240); maximumText.slides[1].speakerNotes = "注".repeat(4000);
  const emptyTitle = clone(); emptyTitle.slides[1].title = "";
  const invalidRole = clone(); invalidRole.slides[1].role = "unknown";
  const excessiveTitle = clone(); excessiveTitle.slides[1].title = "界".repeat(121);
  const excessiveCapacity = clone(); excessiveCapacity.slides[2].items = Array.from({ length: 7 }, (_, index) => item(`overflow-${index + 1}`, `Overflow ${index + 1}`));
  const unsafeControl = clone(); unsafeControl.slides[1].summary = "unsafe\u0001content";
  const placeholder = clone(); placeholder.slides[1].summary = "TODO";
  return Object.freeze([
    Object.freeze({ id: "maximum-capacity", spec: maximumCapacity, accepted: true }),
    Object.freeze({ id: "maximum-bounded-text", spec: maximumText, accepted: true }),
    Object.freeze({ id: "empty-title", spec: emptyTitle, accepted: false }),
    Object.freeze({ id: "invalid-role", spec: invalidRole, accepted: false }),
    Object.freeze({ id: "excessive-title", spec: excessiveTitle, accepted: false }),
    Object.freeze({ id: "excessive-capacity", spec: excessiveCapacity, accepted: false }),
    Object.freeze({ id: "unsafe-control-character", spec: unsafeControl, accepted: false }),
    Object.freeze({ id: "placeholder-content", spec: placeholder, accepted: false })
  ]);
}

module.exports = { buildPptCreateBoundaryCases, buildPptCreateOfficeCorpus };
