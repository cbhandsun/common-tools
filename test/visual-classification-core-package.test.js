"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { collectImports } = require("../scripts/verify-workspace-boundaries");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

test("visual classification executes its complete dependency closure without Skill sources", (t) => {
  const root = path.resolve(__dirname, "..");
  const core = path.join(root, "packages/slideclone-core");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "visual-classification-core-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const installed = path.join(directory, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  fs.copyFileSync(path.join(core, "package.json"), path.join(installed, "package.json"));
  const pending = [path.join(core, "layer-classifier.js")];
  const copied = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (copied.has(file)) continue;
    copied.add(file);
    assert.equal(path.dirname(file), core, "classification dependencies must remain in core");
    const name = path.basename(file);
    assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}`), `${name} must be shipped`);
    const source = fs.readFileSync(file, "utf8");
    fs.writeFileSync(path.join(installed, name), source);
    for (const dependency of collectImports(source, name)) {
      assert.equal(typeof dependency.specifier, "string");
      assert.ok(dependency.specifier.startsWith("./"), "classification must not require external runtime services");
      pending.push(require.resolve(path.resolve(core, dependency.specifier)));
    }
  }
  const load = createRequire(path.join(directory, "consumer.cjs"));
  const { classifyVisualLayer } = load("@common-tools/slideclone-core/layer-classifier");
  const { extractVisualAtoms } = load("@common-tools/slideclone-core/visual-atoms");
  const width = 400; const height = 240;
  const image = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  const region = { x: 0, y: 0, w: width, h: height };
  const slide = { widthPt: width, heightPt: height };
  assert.deepEqual(extractVisualAtoms(image, region, slide), []);
  for (const [x, y, w, h, rgb] of [
    [40, 80, 90, 48, [47, 128, 237]], [165, 99, 70, 8, [47, 128, 237]],
    [270, 80, 90, 48, [39, 174, 96]], [184, 150, 24, 24, [242, 153, 74]]
  ]) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
      image.rgba.set(rgb, (row * width + col) * 4);
    }
  }
  const before = Buffer.from(image.rgba);
  const atoms = extractVisualAtoms(image, region, slide);
  assert.ok(atoms.filter(atom => atom.kind === "native-rect-candidate").length >= 2);
  assert.ok(atoms.some(atom => atom.kind === "connector-line-candidate"));
  assert.ok(atoms.some(atom => atom.kind === "icon-crop-candidate"));
  assert.deepEqual(image.rgba, before);
  const layer = classifyVisualLayer({ type: "fidelity-crop", box: region, source: { detector: "workflow-chain-underlay-crop", reason: "route diagram preserved as crop" } }, { textBoxes: [] }, slide, { sourceImage: image });
  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.reconstructionPlan.residualCrop, true);
  assert.equal(fs.existsSync(path.join(directory, "skills")), false);
  for (const name of ["layer-classifier", "visual-atoms", "diagram-understanding"]) {
    assert.equal(require(path.join(root, `skills/pd-hifi-slideclone/scripts/lib/${name}`)), require(path.join(core, name)));
  }
});
