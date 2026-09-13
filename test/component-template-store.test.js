"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createTemplateStore, sanitizeIndex } = require("../packages/slideclone-core/component-template-store");

function sampleTemplate(id = "store-kpi-01") {
  return {
    id,
    archetype: "kpi_card",
    category: "metrics",
    envelope: { w: 300, h: 150 },
    shapes: [
      { id: "s1", type: "round_rect", relX: 0, relY: 0, relW: 1, relH: 1 }
    ],
    slots: [
      { name: "val", role: "metric", defaultText: "100M", relX: 0.1, relY: 0.3, relW: 0.8, relH: 0.4 }
    ],
    palette: { fills: [], strokes: [] },
    tags: ["kpi"]
  };
}

test("ComponentTemplateStore saves, loads, lists, and deletes templates", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-store-test-"));
  try {
    const store = createTemplateStore({ root: tmpDir });

    // Initial state empty
    assert.deepEqual(store.list(), []);

    const sample = sampleTemplate();

    // Save
    const saveResult = store.save(sample);
    assert.ok(saveResult.path);
    assert.ok(/^[a-f0-9]{64}$/.test(saveResult.sha256));

    // Load
    const loaded = store.load("store-kpi-01");
    assert.deepEqual(loaded, sample);

    // List
    const list = store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "store-kpi-01");
    assert.equal(list[0].archetype, "kpi_card");

    // Load full catalog
    const catalog = store.loadCatalog();
    assert.ok(catalog.get("store-kpi-01"));
    assert.ok(catalog.get("builtin-kpi-card-v1")); // Includes builtins

    // Delete
    const deleted = store.delete("store-kpi-01");
    assert.equal(deleted, true);
    assert.equal(store.load("store-kpi-01"), null);
    assert.equal(store.list().length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ComponentTemplateStore verifies file checksum before loading indexed templates", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-store-integrity-"));
  try {
    const store = createTemplateStore({ root: tmpDir });
    store.save(sampleTemplate("integrity-kpi"));
    const file = path.join(tmpDir, "templates", "components", "integrity-kpi.json");
    const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
    tampered.slots[0].defaultText = "tampered";
    fs.writeFileSync(file, JSON.stringify(tampered, null, 2), "utf8");

    assert.throws(() => store.load("integrity-kpi"), /checksum mismatch/);
    assert.equal(store.loadCatalog({ includeBuiltins: false }).get("integrity-kpi"), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ComponentTemplateStore filters malformed index entries and removes stale records", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-store-index-"));
  try {
    const store = createTemplateStore({ root: tmpDir });
    const saved = store.save(sampleTemplate("valid-index"));
    const indexFile = path.join(tmpDir, "templates", "components", "index.json");
    fs.writeFileSync(indexFile, JSON.stringify([
      { id: "valid-index", archetype: "wrong-duplicate", category: "bad", sha256: "0".repeat(64), updatedAt: new Date().toISOString() },
      { id: "bad/id", archetype: "x", category: "x", sha256: saved.sha256, updatedAt: new Date().toISOString() },
      { id: "missing-hash", archetype: "x", category: "x", updatedAt: new Date().toISOString() },
      { id: "valid-index", archetype: "kpi_card", category: "metrics", sha256: saved.sha256, updatedAt: new Date().toISOString() }
    ], null, 2), "utf8");

    assert.equal(store.list().length, 1);
    assert.equal(store.list()[0].id, "valid-index");
    assert.equal(store.list()[0].archetype, "kpi_card");
    fs.rmSync(path.join(tmpDir, "templates", "components", "valid-index.json"));
    assert.deepEqual(store.list(), []);
    assert.equal(JSON.parse(fs.readFileSync(indexFile, "utf8")).length, 0);
    assert.equal(store.delete("valid-index"), false);
    assert.deepEqual(store.list(), []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ComponentTemplateStore list removes checksum mismatches from the index", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-store-index-integrity-"));
  try {
    const store = createTemplateStore({ root: tmpDir });
    store.save(sampleTemplate("tampered-index"));
    const file = path.join(tmpDir, "templates", "components", "tampered-index.json");
    const indexFile = path.join(tmpDir, "templates", "components", "index.json");
    const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
    tampered.tags = ["tampered"];
    fs.writeFileSync(file, JSON.stringify(tampered, null, 2), "utf8");

    assert.deepEqual(store.list(), []);
    assert.deepEqual(JSON.parse(fs.readFileSync(indexFile, "utf8")), []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("sanitizeIndex keeps only bounded, unique, well-formed records", () => {
  const updatedAt = new Date().toISOString();
  assert.deepEqual(sanitizeIndex([
    { id: "one", archetype: "a", category: "c", sha256: "a".repeat(64), updatedAt },
    { id: "one", archetype: "dup", category: "c", sha256: "b".repeat(64), updatedAt },
    { id: "bad\nid", archetype: "a", category: "c", sha256: "a".repeat(64), updatedAt },
    { id: "two", archetype: "a", category: "c", sha256: "not-a-hash", updatedAt },
    { id: "three", archetype: "a", category: "c", sha256: "c".repeat(64), updatedAt: "bad-date" }
  ]), [
    { id: "one", archetype: "a", category: "c", sha256: "a".repeat(64), updatedAt }
  ]);
});

test("ComponentTemplateStore prevents path traversal and enforces ID characters", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-store-test-"));
  try {
    const store = createTemplateStore({ root: tmpDir });

    assert.throws(() => store.templatePath("../outside"), /invalid filename characters/);
    assert.throws(() => store.templatePath("bad/id"), /invalid filename characters/);
    assert.throws(() => store.templatePath("bad\\id"), /invalid filename characters/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
