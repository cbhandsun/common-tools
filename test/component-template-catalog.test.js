"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ComponentTemplateCatalog,
  createTemplateCatalog,
  validateComponentTemplate
} = require("../packages/slideclone-core/component-template-catalog");
const { instantiateComponentTemplate } = require("../packages/slideclone-core/component-template-harvester");

test("ComponentTemplateCatalog initializes with builtins and lists by category", () => {
  const catalog = createTemplateCatalog();
  const all = catalog.list();
  assert.ok(all.length >= 3);

  const kpiTemplates = catalog.list({ category: "metrics" });
  assert.equal(kpiTemplates.length, 1);
  assert.equal(kpiTemplates[0].id, "builtin-kpi-card-v1");

  const processTemplates = catalog.list({ archetype: "process_step" });
  assert.equal(processTemplates.length, 1);
  assert.equal(processTemplates[0].id, "builtin-process-step-v1");
});

test("ComponentTemplateCatalog registers custom template and gets by id", () => {
  const catalog = createTemplateCatalog({ includeBuiltins: false });
  assert.equal(catalog.list().length, 0);

  const custom = {
    id: "custom-matrix-2x2",
    archetype: "quadrant_matrix",
    category: "matrix",
    envelope: { w: 400, h: 400 },
    shapes: [{ id: "grid", type: "rectangle", relX: 0, relY: 0, relW: 1, relH: 1 }],
    slots: [
      { name: "q1", role: "title", defaultText: "Q1", relX: 0, relY: 0, relW: 0.5, relH: 0.5 },
      { name: "q2", role: "title", defaultText: "Q2", relX: 0.5, relY: 0, relW: 0.5, relH: 0.5 },
      { name: "q3", role: "title", defaultText: "Q3", relX: 0, relY: 0.5, relW: 0.5, relH: 0.5 },
      { name: "q4", role: "title", defaultText: "Q4", relX: 0.5, relY: 0.5, relW: 0.5, relH: 0.5 }
    ],
    palette: { fills: [], strokes: [] },
    tags: ["matrix", "swot", "quadrant"]
  };

  catalog.register(custom);
  assert.equal(catalog.list().length, 1);
  assert.deepEqual(catalog.get("custom-matrix-2x2"), custom);

  // Duplicate registration rejects
  assert.throws(() => catalog.register(custom), /already registered/);
});

test("ComponentTemplateCatalog matchBest scores candidates by archetype, tags, and slots", () => {
  const catalog = createTemplateCatalog();

  // Match KPI card by archetype
  const bestKpi = catalog.matchBest({ archetype: "kpi_card" });
  assert.ok(bestKpi);
  assert.equal(bestKpi.id, "builtin-kpi-card-v1");

  // Match process step by tags and slotCount
  const bestStep = catalog.matchBest({ category: "process", tags: ["step", "process"], slotCount: 3 });
  assert.ok(bestStep);
  assert.equal(bestStep.id, "builtin-process-step-v1");
});

test("ComponentTemplateCatalog exportJson and importJson roundtrip correctly", () => {
  const catalogA = createTemplateCatalog();
  const exported = catalogA.exportJson();

  const catalogB = createTemplateCatalog({ includeBuiltins: false });
  assert.equal(catalogB.list().length, 0);

  const count = catalogB.importJson(exported);
  assert.equal(count, catalogA.list().length);
  assert.equal(catalogB.list().length, catalogA.list().length);
});

test("validateComponentTemplate enforces complete schema and rejects invalid entries", () => {
  const validBase = {
    id: "t1",
    archetype: "a",
    category: "c",
    envelope: { w: 10, h: 10 },
    shapes: [],
    slots: [],
    palette: { fills: [], strokes: [] },
    tags: []
  };
  assert.throws(() => validateComponentTemplate(null), /must be an object/);
  assert.throws(() => validateComponentTemplate({}), /id must be a non-empty string/);
  assert.throws(() => validateComponentTemplate({ id: "t1" }), /archetype must be a non-empty string/);
  assert.throws(() => validateComponentTemplate({ id: "t1", archetype: "a" }), /category must be a non-empty string/);
  assert.throws(() => validateComponentTemplate({ id: "t1", archetype: "a", category: "c" }), /envelope must be an object/);
  assert.throws(() => validateComponentTemplate({ id: "t1", archetype: "a", category: "c", envelope: { w: -5, h: 10 } }), /dimensions must be positive finite numbers/);
  assert.throws(() => validateComponentTemplate({ id: "t1", archetype: "a", category: "c", envelope: { w: 10, h: 10 } }), /shapes must be an array/);
  assert.throws(() => validateComponentTemplate({ id: "t1", archetype: "a", category: "c", envelope: { w: 10, h: 10 }, shapes: [] }), /slots must be an array/);
  assert.throws(() => validateComponentTemplate({
    ...validBase,
    shapes: [{ id: "s1", type: "rectangle", relX: 0, relY: 0, relW: 0, relH: 1 }],
  }), /relW and relH must be positive/);
  assert.throws(() => validateComponentTemplate({
    ...validBase,
    shapes: [{ id: "s1", type: "rectangle", relX: 0.9, relY: 0, relW: 0.2, relH: 1 }]
  }), /relative box must stay within/);
  assert.throws(() => validateComponentTemplate({
    ...validBase,
    shapes: [
      { id: "dup", type: "rectangle", relX: 0, relY: 0, relW: 0.4, relH: 1 },
      { id: "dup", type: "rectangle", relX: 0.5, relY: 0, relW: 0.4, relH: 1 }
    ]
  }), /id must be unique/);
  assert.throws(() => validateComponentTemplate({
    ...validBase,
    shapes: [],
    slots: [{ name: "", role: "body", defaultText: "", relX: 0, relY: 0, relW: 1, relH: 1 }]
  }), /name must be a non-empty string/);
  assert.throws(() => validateComponentTemplate({
    ...validBase,
    slots: [
      { name: "dup", role: "body", defaultText: "", relX: 0, relY: 0, relW: 0.5, relH: 1 },
      { name: "dup", role: "body", defaultText: "", relX: 0.5, relY: 0, relW: 0.5, relH: 1 }
    ]
  }), /name must be unique/);
  assert.throws(() => validateComponentTemplate({ ...validBase, palette: null }), /palette must be an object/);
  assert.throws(() => validateComponentTemplate({ ...validBase, palette: { fills: ["#fff"], strokes: [null] } }), /palette\.strokes\[0\]/);
  assert.throws(() => validateComponentTemplate({ ...validBase, tags: ["bad\nline"] }), /tags\[0\]/);
});
