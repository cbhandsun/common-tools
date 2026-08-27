"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyRoleFontOption,
  collectTextRoleStats,
  getRoleFitPlan,
  normalizeFontTargetRole,
  normalizeTextRole
} = require("../skills/pd-hifi-slideclone/scripts/lib/font-fit");

test("normalizeTextRole respects explicit role and useful id fallbacks", () => {
  assert.equal(normalizeTextRole({ role: "Title", id: "ignored" }), "title");
  assert.equal(normalizeTextRole({ source: { textRole: "percent-value" }, id: "plain-body" }), "percent-value");
  assert.equal(normalizeTextRole({ id: "banner-text" }), "banner");
  assert.equal(normalizeTextRole({ id: "ui-card-title" }), "card-title");
  assert.equal(normalizeTextRole({ id: "portal-text" }), "button");
  assert.equal(normalizeTextRole({ id: "portal-caption" }), "caption");
  assert.equal(normalizeTextRole({ id: "plain-body" }), "body");
});

test("collectTextRoleStats groups boxes by role", () => {
  const stats = collectTextRoleStats(sampleIr());
  const title = stats.find((entry) => entry.role === "title");
  const caption = stats.find((entry) => entry.role === "caption");
  const table = stats.find((entry) => entry.role === "table");
  assert.equal(title.count, 1);
  assert.equal(caption.count, 1);
  assert.equal(table.count, 1);
  assert.deepEqual(title.families, ["SimHei"]);
  assert.deepEqual(table.families, ["Microsoft YaHei"]);
});

test("getRoleFitPlan merges configured role candidates with existing fonts", () => {
  const plan = getRoleFitPlan(sampleIr(), {
    candidates: ["DengXian"],
    roleOrder: ["title", "caption"],
    roleCandidates: {
      title: { families: ["Microsoft YaHei"], weights: ["bold"], sizeAdjustPt: [-1, 0, 1] }
    }
  });
  const title = plan.find((entry) => entry.role === "title");
  assert.deepEqual(title.families, ["Microsoft YaHei", "SimHei", "DengXian"]);
  assert.deepEqual(title.weights, ["bold"]);
  assert.deepEqual(title.sizeAdjustPt, [-1, 0, 1]);
});

test("applyRoleFontOption only changes matching role boxes", () => {
  const ir = sampleIr();
  const result = applyRoleFontOption(ir, "title", {
    family: "Microsoft YaHei",
    weight: "bold",
    sizeAdjustPt: -1
  });
  const title = result.ir.pages[0].textBoxes.find((box) => box.id === "title");
  const caption = result.ir.pages[0].textBoxes.find((box) => box.id === "caption");
  assert.equal(result.changed, true);
  assert.equal(title.font.family, "Microsoft YaHei");
  assert.equal(title.font.sizePt, 31);
  assert.equal(caption.font.family, "SimHei");
  assert.equal(ir.pages[0].textBoxes[0].font.family, "SimHei");
});

test("normalizeFontTargetRole treats tables as table role", () => {
  assert.equal(normalizeFontTargetRole({ id: "p0-table" }, "table"), "table");
});

test("applyRoleFontOption updates matching table styles", () => {
  const ir = sampleIr();
  ir.pages[0].tables[0].style.cellStyles = [[
    { fontFamily: "SimHei", fontSizePt: 12, fontWeight: "bold" },
    { fontFamily: "SimHei", fontSizePt: 10, fontWeight: "regular" }
  ]];
  const result = applyRoleFontOption(ir, "table", {
    family: "Aptos",
    weight: "semibold",
    sizeAdjustPt: -1
  });
  const table = result.ir.pages[0].tables[0];
  assert.equal(result.changed, true);
  assert.equal(table.style.fontFamily, "Aptos");
  assert.equal(table.style.fontSizePt, 10.5);
  assert.equal(table.style.headerFontSizePt, 10.5);
  assert.deepEqual(table.style.cellStyles, [[
    { fontFamily: "Aptos", fontSizePt: 11, fontWeight: "semibold" },
    { fontFamily: "Aptos", fontSizePt: 9, fontWeight: "semibold" }
  ]]);
});

test("font fit preserves source-calibrated typography while updating ordinary peers", () => {
  const ir = sampleIr();
  ir.pages[0].textBoxes[0].source = { preserveTypography: true };
  ir.pages[0].textBoxes.push({
    id: "secondary-title",
    role: "title",
    text: "Editable peer",
    font: { family: "SimHei", sizePt: 24, weight: "regular" }
  });
  ir.pages[0].tables[0].source = { preserveTypography: true };

  const result = applyRoleFontOption(ir, "title", {
    family: "Aptos",
    weight: "bold",
    sizeAdjustPt: 1
  });
  const [preserved, ordinary] = result.ir.pages[0].textBoxes.filter((box) => box.role === "title");

  assert.deepEqual(preserved.font, { family: "SimHei", sizePt: 32, weight: "bold" });
  assert.deepEqual(ordinary.font, { family: "Aptos", sizePt: 25, weight: "bold" });
  assert.equal(result.ir.pages[0].tables[0].style.fontFamily, "Microsoft YaHei");
});

test("font fit planning excludes source-calibrated typography", () => {
  const ir = sampleIr();
  ir.pages[0].textBoxes[0].source = { preserveTypography: true };
  ir.pages[0].tables[0].source = { preserveTypography: true };

  const stats = collectTextRoleStats(ir);

  assert.equal(stats.some((entry) => entry.role === "title"), false);
  assert.equal(stats.some((entry) => entry.role === "table"), false);
  assert.equal(stats.some((entry) => entry.role === "caption"), true);
});

function sampleIr() {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [
        {
          id: "title",
          role: "title",
          text: "OCR Smoke 123",
          box: { x: 112, y: 94, w: 248, h: 38 },
          font: { family: "SimHei", sizePt: 32, weight: "bold" }
        },
        {
          id: "caption",
          role: "caption",
          text: "Caption line",
          box: { x: 140, y: 210, w: 220, h: 28 },
          font: { family: "SimHei", sizePt: 22, weight: "regular" }
        }
      ],
      tables: [{
        id: "p0-table",
        type: "table",
        box: { x: 80, y: 190, w: 420, h: 120 },
        rows: [["阶段", "产物", "状态"]],
        style: {
          fontFamily: "Microsoft YaHei",
          fontSizePt: 11.5,
          headerFontSizePt: 11.5
        }
      }]
    }]
  };
}
