"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { repairDuplicateDrawingIds, repairObjectNames, repairRunLanguages } = require("../packages/ppt-improve-core/repair-profiles");

test("layout-safe repairs only duplicate non-visual drawing ids", () => {
  const source = '<p:sp><p:cNvPr id="2" name="A"/></p:sp><p:pic><p:cNvPr id="2" name="B"/></p:pic><p:sp><p:cNvPr id="7" name="C"/></p:sp>';
  const result = repairDuplicateDrawingIds(source);
  assert.equal(result.changes, 1);
  assert.deepEqual([...result.xml.matchAll(/\bid="(\d+)"/gu)].map((match) => match[1]), ["2", "8", "7"]);
  assert.match(result.xml, /name="B"/u);
});

test("editability-safe gives unnamed objects stable names without changing existing names", () => {
  const source = '<p:cNvPr id="2"/><p:cNvPr id="3" name=""/><p:cNvPr id="4" name="Keep" descr="metadata"></p:cNvPr>';
  const result = repairObjectNames(source);
  assert.equal(result.changes, 2);
  assert.match(result.xml, /id="2" name="Object 2"\/>/u);
  assert.match(result.xml, /id="3" name="Object 3"\/>/u);
  assert.match(result.xml, /id="4" name="Keep" descr="metadata"/u);
});

test("typography-safe adds script-aware language metadata and preserves explicit language", () => {
  const source = '<a:r><a:rPr sz="1800"/><a:t>中文</a:t></a:r><a:r><a:t>Hello</a:t></a:r><a:r><a:rPr lang="fr-FR"/><a:t>Bonjour</a:t></a:r><a:r><a:t>123</a:t></a:r>';
  const result = repairRunLanguages(source);
  assert.equal(result.changes, 2);
  assert.match(result.xml, /<a:rPr sz="1800" lang="zh-CN"\/>/u);
  assert.match(result.xml, /<a:rPr lang="en-US"\/><a:t>Hello/u);
  assert.match(result.xml, /<a:rPr lang="fr-FR"\/><a:t>Bonjour/u);
  assert.match(result.xml, /<a:r><a:t>123/u);
});
