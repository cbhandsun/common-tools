"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { collectImports } = require("../scripts/verify-workspace-boundaries");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

test("native chart shell shapes execute their complete core closure and generate bar shapes", (t) => {
  const root = path.resolve(__dirname, "..");
  const core = path.join(root, "packages/slideclone-core");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-chart-shell-core-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const installed = path.join(directory, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  fs.copyFileSync(path.join(core, "package.json"), path.join(installed, "package.json"));

  const pending = [path.join(core, "native-chart-shell-shapes.js")];
  const copied = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (copied.has(file)) continue;
    copied.add(file);
    assert.equal(path.dirname(file), core, "chart dependencies must remain in core");
    const name = path.basename(file);
    assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}`), `${name} must be shipped`);
    const source = fs.readFileSync(file, "utf8");
    fs.writeFileSync(path.join(installed, name), source);
    for (const dependency of collectImports(source, name)) {
      assert.equal(typeof dependency.specifier, "string");
      assert.ok(dependency.specifier.startsWith("./"), "chart module must not require external runtime services");
      pending.push(require.resolve(path.resolve(core, dependency.specifier)));
    }
  }

  const load = createRequire(path.join(directory, "consumer.cjs"));
  const { createChartZoneNativeShellShapes } = load("@common-tools/slideclone-core/native-chart-shell-shapes");
  const image = { id: "chart", source: { layer: { layerType: "chart-zone" } } };
  const atoms = [
    { id: "axis", kind: "grid-line-candidate", box: { x: 10, y: 120, w: 240, h: 1 }, axis: "h", color: "#94A3B8" },
    { id: "bar-a", kind: "native-rect-candidate", box: { x: 30, y: 80, w: 28, h: 40 }, color: "#2F80ED" },
    { id: "bar-b", kind: "native-rect-candidate", box: { x: 80, y: 55, w: 28, h: 65 }, color: "#27AE60" },
    { id: "bar-c", kind: "native-rect-candidate", box: { x: 130, y: 35, w: 28, h: 85 }, color: "#F2994A" }
  ];
  const shapes = createChartZoneNativeShellShapes(image, atoms, { layerType: "chart-zone" }, { archetype: "bar-chart", confidence: 0.9, visualAtoms: atoms });

  assert.equal(shapes.length, 4);
  assert.equal(shapes.filter((shape) => shape.type === "line").length, 1);
  assert.equal(shapes.filter((shape) => shape.type === "rect").length, 3);
  assert.ok(shapes.every((shape) => shape.source?.nativeRebuild === true));
  assert.equal(fs.existsSync(path.join(directory, "skills")), false);
});
