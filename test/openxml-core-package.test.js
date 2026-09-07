"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

const modules = ["pptx-openxml-dotnet", "chart-native-payload", "restricted-svg", "openxml-build-cache", "pptx-zip", "cache-budget", "openxml-build-jobs"];
const repository = path.resolve(__dirname, "..");

function copyCore(destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ["package.json", ...modules.map((name) => `${name}.js`)]) {
    fs.copyFileSync(path.join(repository, "packages/slideclone-core", name), path.join(destination, name));
  }
}

test("OpenXML preparation, graphics, ZIP and cache run from the isolated core package", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-core-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  copyCore(path.join(root, "node_modules/@common-tools/slideclone-core"));
  const load = createRequire(path.join(root, "consumer.cjs"));
  const api = Object.fromEntries(modules.map((name) => [name, load(`@common-tools/slideclone-core/${name}`)]));
  const chart = { type: "column", categories: ["Q1"], series: [{ name: "Revenue", values: [12] }], box: { x: 0, y: 0, w: 400, h: 240 } };
  api["pptx-openxml-dotnet"].prepareNativeCharts({ pages: [{ charts: [chart] }] });
  assert.equal(api["chart-native-payload"].validateNativeChartPayload(chart).ok, true);
  const svg = api["restricted-svg"].parseRestrictedSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="1" y="2" width="10" height="20" fill="#112233"/></svg>');
  assert.equal(svg.elements.length, 1);
  assert.equal(svg.elements[0].type, "rect");
  assert.deepEqual(svg.elements[0].normalizedBox, { x: 0.01, y: 0.02, w: 0.1, h: 0.2 });
  const irFile = path.join(root, "deck.json");
  const outFile = path.join(root, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({ pages: [] }));
  const jobs = api["pptx-openxml-dotnet"].normalizeBuildJobs([{ irFile, outFile }]);
  const artifacts = api["pptx-openxml-dotnet"].createOpenXmlBuildArtifacts(jobs);
  try { assert.equal(artifacts.safeJobs.length, 1); }
  finally { api["pptx-openxml-dotnet"].cleanupOpenXmlBuildArtifacts(artifacts); }
  const cache = api["openxml-build-cache"];
  const key = cache.createOpenXmlBuildCacheIdentity(jobs[0], { command: "dotnet", args: [] }, root);
  api["pptx-zip"].writeStoredZipAtomic(outFile, [
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/presentation.xml", data: Buffer.from("<p:presentation/>") }
  ]);
  const cacheDir = path.join(root, "cache");
  assert.equal(cache.writeOpenXmlBuildCache(cacheDir, key, outFile).stored, true);
  const restored = path.join(root, "restored.pptx");
  assert.equal(cache.readOpenXmlBuildCache(cacheDir, key, restored).hit, true);
  assert.deepEqual(fs.readFileSync(restored), fs.readFileSync(outFile));
  assert.equal(fs.existsSync(path.join(root, "skills")), false);
  for (const name of modules) assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}.js`));
});

test("legacy OpenXML entry points share the core implementation without workspace package links", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-unlinked-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const core = path.join(root, "packages/slideclone-core");
  copyCore(core);
  for (const name of modules) {
    if (name === "openxml-build-jobs") continue;
    const relative = `skills/pd-hifi-slideclone/scripts/${name === "pptx-openxml-dotnet" ? "adapters" : "lib"}/${name}.js`;
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repository, relative), target);
    assert.equal(require(target), require(path.join(core, name)));
  }
  const { legacyEdges } = require("../scripts/verify-workspace-boundaries").verifyWorkspaceBoundaries();
  assert.equal(legacyEdges.some((edge) => edge.target.endsWith("/pptx-openxml-dotnet.js")), false);
});
