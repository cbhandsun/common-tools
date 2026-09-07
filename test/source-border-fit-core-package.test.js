"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { includesSuite } = require("../scripts/test-suites");

test("source border fit package export executes without the historical engine", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-border-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(target, { recursive: true });
  for (const file of ["package.json", "source-border-fit.js"]) {
    fs.copyFileSync(path.resolve("packages/slideclone-core", file), path.join(target, file));
  }
  const { fitSourceBorders } = createRequire(path.join(root, "probe.cjs"))("@common-tools/slideclone-core/source-border-fit");
  const rgba = Buffer.alloc(100 * 100 * 4, 255);
  for (let y = 20; y <= 80; y += 1) for (let x = 20; x <= 80; x += 1) {
    if (x === 20 || x === 80 || y === 20 || y === 80) rgba.set([20, 115, 230, 255], (y * 100 + x) * 4);
  }
  const result = fitSourceBorders({
    image: { width: 100, height: 100, rgba }, slideSize: { widthPt: 100, heightPt: 100 },
    shapes: [{ type: "rect", box: { x: 22, y: 22, w: 56, h: 56 }, style: { stroke: "#1473E6" }, source: { nativeComponentRole: "node", semanticNativeStructure: true } }]
  });
  assert.equal(result.evidence.accepted, 1);
  assert.deepEqual(result.shapes[0].box, { x: 20, y: 20, w: 60, h: 60 });
  assert.equal(includesSuite("source-border-fit.test.js", "unit"), true);
  assert.equal(includesSuite("source-border-fit-core-package.test.js", "unit"), true);
});
