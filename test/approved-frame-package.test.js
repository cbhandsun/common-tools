"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { spawnSync } = require("node:child_process");
const { IMAGE_EDITABLE_RELEASE_FILES, REQUIRED_FILES } = require("../scripts/verify-runtime-package");
const root = path.resolve(__dirname, "..");

test("isolated consumers run as external processes in unified contract and CI suites", () => {
  const { classifyTestFile, classifyTestResource } = require("../scripts/test-suites");
  const { discoverTestFiles } = require("../scripts/test-sharded");
  assert.equal(classifyTestFile(__filename), "contract");
  assert.equal(classifyTestResource(__filename), "external-process");
  for (const suite of ["contract", "all"]) {
    assert.ok(discoverTestFiles(root, suite).some(row => path.resolve(root, row.file) === __filename));
  }
});
const modules = [...["reconstruction", "erasure-replay", "fit", "draw", "mask", "background", "approximation", "bytes", "bounds", "application", "application-input", "application-files", "application-lifecycle", "completion"].map(name => `scene-plan/approved-frame-${name}.js`),
  "scene-plan/approved-card-backdrop.js", "scene-plan/approved-card-backdrop-input.js",
  "scene-plan/approved-route-approximation.js", "scene-plan/approved-route-approximation-input.js",
  "scene-plan/approved-route-materialization.js", "scene-plan/source-scene-inventory-codec.js",
  ...["budget", "pixel-input", "pixel-patch", "pixel-application", "pixel-replay"].map(name => `scene-plan/approved-backdrop-${name}.js`),
  ...["source-word-ink-components", "source-word-retry-frame", "source-word-window-retry"].map(name => `typography/${name}.js`),
  "scene-plan/source-scene-route-representation.js", "scene-plan/source-scene-group-containment.js", "scene-plan/source-scene-band-geometry.js",
  "quality/native-relationship-path.js", "routing/source-route-polyline.js", "routing/source-route-native-elbow.js", "routing/source-shared-route-output-snapshot.js",
  "scene-plan/native-freeform-path.js", "routing/source-route-corner-mode.js", "png.js"];

function isolatedPackage(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approved-frame-package-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith("approved-frame-package-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.copyFileSync(path.join(root, "packages/slideclone-core/package.json"), path.join(directory, "package.json"));
  // Source-measured ancestry now imports the real compiler measurement
  // closure. Exercise the declared release files, rather than an obsolete
  // hand-maintained partial copy that never represented the installed API.
  for (const required of IMAGE_EDITABLE_RELEASE_FILES) {
    if (!required.startsWith("packages/slideclone-core/") || !required.endsWith(".js")) continue;
    const file = required.slice("packages/slideclone-core/".length), target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, required), target);
  }
  return directory;
}
function probe(directory) {
  return spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const load = require('node:module').createRequire(require('node:path').join(process.argv[1], 'package.json'));
    const api = load('@common-tools/slideclone-core/scene-plan/approved-frame-reconstruction');
    assert.equal(api.fitApproximateFrame(null).status, 'unavailable');
    for (const name of ['createApprovedApproxFrameDrawSession','buildApproximateBackgroundPlan','applyApproximateBackgroundPlan','applyApprovedFrameErasureReplay','createApprovedFrameAssetApplication','createApprovedBackdropPixelApplication','createApprovedBackdropPixelReplay','composeApprovedAssetApplications']) assert.throws(() => api[name](null), TypeError);
    process.stdout.write('ready');
  `, directory], { cwd: directory, encoding: "utf8", timeout: 10000, windowsHide: true });
}

test("the release gate requires the full approved-frame module closure", () => {
  for (const file of modules) {
    const required = `packages/slideclone-core/${file}`;
    assert(IMAGE_EDITABLE_RELEASE_FILES.includes(required), file);
    assert(REQUIRED_FILES.includes(required), file);
  }
});

test("the exported API cold-loads in an isolated package with only its declared closure", t => {
  const result = probe(isolatedPackage(t));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "ready");
});

test("each missing closure member is detected by a fresh isolated consumer", t => {
  const directory = isolatedPackage(t);
  for (const file of modules) {
    const target = path.join(directory, file);
    fs.unlinkSync(target);
    const result = probe(directory);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, file);
    assert.match(result.stderr, /MODULE_NOT_FOUND/u);
    assert.equal(result.stdout, "");
    fs.copyFileSync(path.join(root, "packages/slideclone-core", file), target);
  }
});
