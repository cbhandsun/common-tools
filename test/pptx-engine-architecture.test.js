"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

test("production packages keep one Deck IR to OpenXML writer boundary", () => {
  const rootPackage = readJson("package.json");
  const lock = readJson("package-lock.json");
  const direct = { ...rootPackage.dependencies, ...rootPackage.devDependencies, ...rootPackage.optionalDependencies };
  assert.equal(Object.hasOwn(direct, "pptxgenjs"), false);
  assert.equal(Object.hasOwn(lock.packages?.[""]?.dependencies || {}, "pptxgenjs"), false);
  assert.match(rootPackage.scripts?.["slideclone:build-openxml"] || "", /OpenXmlDeckBuilder/);
  assert.match(rootPackage.scripts?.["build:dotnet:locked"] || "", /OpenXmlDeckBuilder/);
});

test("PPTX engine ADR requires IR conformance and quality gates before a second writer", () => {
  const adr = fs.readFileSync(path.join(ROOT, "docs", "adr", "0008-editable-pptx-generation-engine.md"), "utf8");
  assert.match(adr, /Deck IR as the only presentation-generation contract/);
  assert.match(adr, /Do not add PptxGenJS/);
  assert.match(adr, /package validation/);
  assert.match(adr, /visual\/editability benchmarks/);
  assert.match(adr, /successor ADR/);
});

test("native rebuild keeps detection, residual ownership, and visual caching behind module boundaries", () => {
  const main = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"), "utf8");
  assert.match(main, /require\("\.\/lib\/residual-ownership"\)/);
  assert.match(main, /require\("\.\/lib\/visual-feature-context"\)/);
  assert.match(main, /syncCandidateResidualOwnership\(images, candidates/);
  const wrapper = /function syncObjectifiedCandidateSources[\s\S]*?\n}\n/.exec(main)?.[0] || "";
  assert.doesNotMatch(wrapper, /const objectifiedById = new Map\(\)/);
  for (const moduleName of ["detection-result", "residual-ownership", "reconstruction-quality-budget", "visual-feature-context"]) {
    const source = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", `${moduleName}.js`), "utf8");
    assert.doesNotMatch(source, /rebuild-real-pptx-native/);
  }
});

test("component template styling and package services cannot flow back into composition roots", () => {
  const component = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "component-template-native-shapes.js"), "utf8");
  const style = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "component-template-style.js"), "utf8");
  const program = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "Program.cs"), "utf8");
  const writer = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "DeckPackageWriter.cs"), "utf8");
  const scaffold = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder", "PresentationScaffoldFactory.cs"), "utf8");
  assert.match(component, /require\("\.\/component-template-style"\)/);
  assert.doesNotMatch(component, /^function mergeTemplateStyle/m);
  assert.doesNotMatch(component, /^function sanitizeTemplateFreeform/m);
  assert.doesNotMatch(style, /component-template-native-shapes/);
  assert.doesNotMatch(program, /new OpenXmlValidator/);
  assert.doesNotMatch(program, /ZipFile\.Open/);
  assert.match(program, /DeckPackageWriter\.Build/);
  assert.doesNotMatch(program, /PresentationDocument\.Create/);
  assert.match(writer, /PresentationDocument\.Create/);
  assert.match(program, /PresentationScaffoldFactory\.CreateSlideMaster/);
  assert.doesNotMatch(program, /static P\.SlideMaster CreateSlideMaster/);
  assert.match(scaffold, /public static P\.SlideMaster CreateSlideMaster/);
});

test("deck composition reporting stays outside the native rebuild entry point", () => {
  const main = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"), "utf8");
  const summary = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "deck-composition-summary.js"), "utf8");
  assert.match(main, /require\("\.\/lib\/deck-composition-summary"\)/);
  const wrapper = /function summarizeDeckComposition\(deck\)[\s\S]*?\n}/.exec(main)?.[0] || "";
  assert.match(wrapper, /summarizeDeckCompositionCore/);
  assert.doesNotMatch(wrapper, /for \(const page of pages\)/);
  assert.doesNotMatch(summary, /rebuild-real-pptx-native/);
});

test("quality budget policy stays outside the render and audit orchestrator", () => {
  const gate = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "quality-gate-real-pptx.js"), "utf8");
  const policy = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "quality-gate-policy.js"), "utf8");
  assert.match(gate, /require\("\.\/lib\/quality-gate-policy"\)/);
  const wrapper = /function summarizeQualityGateStatus\(input = \{}\)[\s\S]*?\n}/.exec(gate)?.[0] || "";
  assert.match(wrapper, /summarizeQualityGateStatusCore/);
  assert.doesNotMatch(wrapper, /failures\.push/);
  assert.doesNotMatch(policy, /quality-gate-real-pptx/);
});

test("system map policy and composition stay outside the native rebuild entry point", () => {
  const main = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"), "utf8");
  const moduleSource = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "system-map-reconstruction.js"), "utf8");
  assert.match(main, /require\("\.\/lib\/system-map-reconstruction"\)/);
  const wrapper = /function createSystemMapDiagramObjects\([\s\S]*?\n}/.exec(main)?.[0] || "";
  assert.match(wrapper, /composeSystemMapDiagram/);
  assert.doesNotMatch(wrapper, /systemMapDiagramObjectified:/);
  assert.doesNotMatch(moduleSource, /rebuild-real-pptx-native/);
});

test("quality gate stdout projection stays outside the quality orchestrator", () => {
  const gate = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "quality-gate-real-pptx.js"), "utf8");
  const output = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "quality-gate-output.js"), "utf8");
  assert.match(gate, /require\("\.\/lib\/quality-gate-output"\)/);
  assert.match(gate, /buildQualityGateOutput/);
  assert.doesNotMatch(gate, /const stdout = \{[\s\S]*editabilityProfile/);
  assert.doesNotMatch(output, /quality-gate-real-pptx\.js/);
});

test("page selection, font evidence, crop materialization, output sanitization, and system-map semantics stay outside the rebuild composition root", () => {
  const main = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"), "utf8");
  for (const moduleName of ["font-evidence", "fidelity-crop-materializer", "native-output-sanitizer"]) {
    const moduleSource = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", `${moduleName}.js`), "utf8");
    assert.match(main, new RegExp(`require\\(\"\\.\\/lib\\/${moduleName}\\"\\)`));
    assert.doesNotMatch(moduleSource, /rebuild-real-pptx-native/);
  }
  const pipeline = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "native-rebuild-deck-pipeline.js"), "utf8");
  const pageSelection = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "page-selection.js"), "utf8");
  assert.match(main, /require\("\.\/lib\/native-rebuild-deck-pipeline"\)/);
  assert.match(pipeline, /require\("\.\/page-selection"\)/);
  assert.match(pipeline, /planSelectedPages\(sourcePages, pageSelection\)/);
  assert.doesNotMatch(pageSelection, /rebuild-real-pptx-native/);
  assert.doesNotMatch(main, /^function parsePageSelection/m);
  assert.match(main, /materializeFidelityCrop\(/);
  assert.doesNotMatch(main, /^function sanitizeNative(?:Chart|Charts|Shape|Shapes)/m);
  const reconstruction = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "system-map-reconstruction.js"), "utf8");
  const semantics = fs.readFileSync(path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts", "lib", "system-map-semantics.js"), "utf8");
  assert.match(reconstruction, /annotateSystemMapSemantics/);
  assert.doesNotMatch(semantics, /rebuild-real-pptx-native/);
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}
