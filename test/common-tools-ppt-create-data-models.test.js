"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDeckIr, createLayoutPlan } = require("../packages/ppt-create-core/layout");
const { qualityFor } = require("../packages/ppt-create-core");
const { validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { buildPptx } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");

function richSpec() {
  return { version: "1.0", title: "经营复盘", theme: "technical-blue-v1", seed: "data-models", variantCount: 3, slides: [
    { id: "cover", role: "cover", title: "经营复盘" },
    { id: "media", role: "content", title: "产品体验需要一张主视觉", items: [{ id: "message", label: "以客户工作流为中心" }], visual: { kind: "media", mediaType: "illustration", alt: "客户在统一工作台完成分析与协作", caption: "媒体槽等待经过授权的资产", assetId: "hero-visual", fit: "contain" } },
    { id: "table", role: "content", priority: "metrics", title: "重点指标保持可编辑", items: [{ id: "signal", label: "企业客户增长最快" }], visual: { kind: "table", headers: ["指标", "本期", "环比"], rows: [["收入", "128", "+18%"], ["客户", "42", "+9%"]], insight: "增长由企业客户贡献" } },
    { id: "chart", role: "content", priority: "metrics", title: "季度趋势持续向上", items: [{ id: "trend", label: "第四季度达到峰值" }], visual: { kind: "chart", type: "column", categories: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "收入", values: [18, 24, 31, 43] }], insight: "连续四个季度增长" } },
    { id: "analysis", role: "content", priority: "comparison", title: "SWOT 形成统一决策画布", items: [{ id: "decision", label: "优先放大优势并补齐渠道" }], visual: { kind: "analysis", model: "swot", entries: [
      { id: "s", group: "strengths", label: "产品深度", detail: "关键流程覆盖完整" },
      { id: "w", group: "weaknesses", label: "渠道有限", detail: "区域覆盖仍不足" },
      { id: "o", group: "opportunities", label: "行业升级", detail: "客户替换窗口扩大" },
      { id: "t", group: "threats", label: "价格竞争", detail: "低价方案进入市场" }
    ] } }
  ] };
}

test("visual data models validate strictly and select only compatible layout candidates", () => {
  const spec = validatePresentationSpec(richSpec());
  const plan = createLayoutPlan(spec);
  assert.deepEqual(plan.pages.slice(1).map((page) => page.candidates.length), [2, 2, 2, 2]);
  assert.deepEqual(plan.pages.slice(1).map((page) => page.family), ["media", "data", "data", "analysis"]);
  const unsafeMedia = richSpec(); unsafeMedia.slides[1].visual.assetId = "../outside.png";
  assert.throws(() => validatePresentationSpec(unsafeMedia), /assetId is invalid/);
  const raggedTable = richSpec(); raggedTable.slides[2].visual.rows[0] = ["收入", "128"];
  assert.throws(() => validatePresentationSpec(raggedTable), /row 1 is invalid/);
  const staleChart = richSpec(); staleChart.slides[3].visual.series[0].values = [1, 2];
  assert.throws(() => validatePresentationSpec(staleChart), /values are invalid/);
  const missingGroup = richSpec(); missingGroup.slides[4].visual.entries[3].group = "strengths";
  assert.throws(() => validatePresentationSpec(missingGroup), /cover every analysis group/);
});

test("Deck IR emits native tables, verified native charts, editable analysis, and non-raster media slots", () => {
  const spec = validatePresentationSpec(richSpec()); const ir = createDeckIr(spec); const quality = qualityFor(spec, ir);
  assert.deepEqual(quality.metrics["native-tables"], 1);
  assert.deepEqual(quality.metrics["native-charts"], 1);
  assert.deepEqual(quality.metrics["media-slots"], 1);
  assert.equal(quality.checks.find((check) => check.name === "semantic-visuals-resolved").passed, true);
  assert.equal(ir.pages[2].tables[0].rows.length, 3);
  assert.equal(ir.pages[3].charts[0].nativePayload.dataVerified, true);
  assert.match(ir.pages[3].charts[0].nativePayload.fallbackSha256, /^[a-f0-9]{64}$/u);
  assert.equal(ir.pages[1].images.length, 0);
  assert.ok(ir.pages[4].shapes.length >= 4);
});

test("OpenXML output retains an editable table and workbook-backed native chart without raster media", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-create-data-"));
  try {
    const irFile = path.join(root, "deck.ir.json"); const outFile = path.join(root, "deck.pptx");
    fs.writeFileSync(irFile, `${JSON.stringify(createDeckIr(richSpec()), null, 2)}\n`, { flag: "wx", mode: 0o600 });
    buildPptx({ irFile, outFile });
    const entries = listZipEntries(outFile).map((entry) => entry.name);
    assert.ok(entries.some((name) => /^ppt\/slides\/charts\/chart\d+\.xml$/u.test(name)));
    assert.ok(entries.some((name) => /^ppt\/slides\/charts\/embeddings\/package\.bin$/u.test(name)));
    assert.equal(entries.some((name) => /^ppt\/media\//u.test(name)), false);
    const tableSlide = readZipEntry(outFile, "ppt/slides/slide3.xml").toString("utf8");
    const chartSlide = readZipEntry(outFile, "ppt/slides/slide4.xml").toString("utf8");
    assert.match(tableSlide, /<a:tbl>/u);
    assert.match(chartSlide, /<c:chart/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
