"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  appliedComponentStem,
  collectSourceFiles,
  discoverISlideTempSourcePptx,
  discoverOfficePlusLocalSourcePptx,
  harvestAppliedPptComponents,
  isGenericInstalledTemplate,
  officePlusDiscoveryRoots,
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/harvest-applied-ppt-components");

test("harvest applied PPT components copies supported decks and writes a manifest", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-components-"));
  const sourceDir = path.join(tmp, "source");
  const nested = path.join(sourceDir, "nested");
  const out = path.join(tmp, "islide-applied-components");
  fs.mkdirSync(nested, { recursive: true });
  const one = path.join(sourceDir, "cycle loop.pptx");
  const two = path.join(nested, "ignored.pptx");
  fs.writeFileSync(one, "PK mock iSlide applied component");
  fs.writeFileSync(two, "PK nested component");
  fs.writeFileSync(path.join(sourceDir, "notes.txt"), "ignore me");

  assert.deepEqual(collectSourceFiles([sourceDir], { recursive: false, maxFiles: 10 }), [one]);

  const manifest = harvestAppliedPptComponents({
    sources: [sourceDir],
    out,
    provider: "islide",
    recursive: true
  });

  assert.equal(manifest.provider, "applied-ppt-component-harvest-v1");
  assert.equal(manifest.copiedCount, 2);
  assert.equal(fs.existsSync(path.join(out, "manifest.json")), true);
  assert.ok(manifest.components[0].name.startsWith("islide-applied-cycle-loop-"));
  assert.ok(manifest.components[0].roleTags.includes("applied-component"));
  assert.equal(fs.existsSync(manifest.components[0].path), true);
});

test("harvest applied PPT components parses repeated source arguments", () => {
  const args = parseArgs([
    "node",
    "harvest-applied-ppt-components.js",
    "--source",
    "a.pptx",
    "--source",
    "b.pptx",
    "--out",
    "runs/islide-applied-components",
    "--provider",
    "islide",
    "--recursive",
    "--max-files",
    "2",
    "--structure-max-slides",
    "3",
    "--structure-max-component-catalog-items",
    "5"
  ]);

  assert.deepEqual(args.sources, ["a.pptx", "b.pptx"]);
  assert.equal(args.out, "runs/islide-applied-components");
  assert.equal(args.provider, "islide");
  assert.equal(args.recursive, true);
  assert.equal(args.maxFiles, 2);
  assert.equal(args.includeStructure, true);
  assert.equal(args.structureMaxSlides, 3);
  assert.equal(args.structureMaxComponentCatalogItems, 5);
});

test("harvest applied PPT components writes redacted structural summaries for reusable plugin components", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-structure-"));
  const source = path.join(tmp, "applied-process.pptx");
  const out = path.join(tmp, "out");
  writeStoredZip(source, {
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": [
      '<p:sld xmlns:p="p" xmlns:a="a">',
      '<p:cSld><p:spTree>',
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="card 1"/></p:nvSpPr><a:xfrm><a:off x="12700" y="12700"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill><a:prstGeom prst="roundRect"/></p:sp>',
      '<p:sp><p:nvSpPr><p:cNvPr id="3" name="card 2"/></p:nvSpPr><a:xfrm><a:off x="165100" y="12700"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="09BF5D"/></a:solidFill><a:prstGeom prst="roundRect"/></p:sp>',
      '<p:sp><p:nvSpPr><p:cNvPr id="4" name="card 3"/></p:nvSpPr><a:xfrm><a:off x="317500" y="12700"/><a:ext cx="127000" cy="63500"/></a:xfrm><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill><a:prstGeom prst="roundRect"/></p:sp>',
      '<p:cxnSp><a:xfrm><a:off x="139700" y="38100"/><a:ext cx="25400" cy="12700"/></a:xfrm><a:ln w="12700"><a:solidFill><a:srgbClr val="185ABD"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:cxnSp>',
      '<p:sp><a:xfrm><a:off x="12700" y="95250"/><a:ext cx="431800" cy="12700"/></a:xfrm><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1800"/><a:t>客户机密文本</a:t></a:r></a:p></p:txBody></p:sp>',
      '</p:spTree></p:cSld>',
      "</p:sld>"
    ].join("")
  });

  const manifest = harvestAppliedPptComponents({
    sources: [source],
    out,
    provider: "islide",
    structureMaxSlides: 2,
    structureMaxComponentCatalogItems: 4
  });
  const component = manifest.components[0];
  const manifestText = fs.readFileSync(path.join(out, "manifest.json"), "utf8");

  assert.equal(component.learningSummary.status, "ok");
  assert.equal(component.structureSignature.provider, "component-structure-signature-v1");
  assert.ok(component.structureSignature.motifs.includes("whole-process-template"));
  assert.equal(component.learningSummary.componentCatalog[0].structure.kind, "process-chain");
  assert.equal(component.learningSummary.componentCatalog[0].childLayout.children[4].style.text.placeholderTextRedacted, true);
  assert.doesNotMatch(manifestText, /客户机密文本/);
});

test("harvest applied PPT components preserves native Office chart templates", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-chart-template-"));
  const source = path.join(tmp, "business-pie.crtx");
  const out = path.join(tmp, "out");
  writeStoredZip(source, {
    "[Content_Types].xml": "<Types/>",
    "chart/chart.xml": '<c:chartSpace xmlns:c="c"><c:chart><c:plotArea><c:pieChart><c:ser/></c:pieChart></c:plotArea></c:chart></c:chartSpace>',
    "chart/charts/style1.xml": "<c:style xmlns:c=\"c\"/>"
  });

  const manifest = harvestAppliedPptComponents({ sources: [source], out, provider: "officeplus" });
  const component = manifest.components[0];

  assert.equal(manifest.copiedCount, 1);
  assert.match(component.name, /^officeplus-applied-business-pie-[0-9a-f]{12}\.crtx$/);
  assert.equal(component.assetKind, "chart-template");
  assert.ok(component.roleTags.includes("native-chart-template"));
  assert.equal(component.learningSummary.chartType, "pie-chart");
  assert.ok(component.structureSignature.motifs.includes("pie-share-chart"));
});

test("harvest applied PPT components discovers recent iSlide temp source decks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-islide-temp-"));
  const root = path.join(tmp, "iSlide Tools", "site", "content", "file", "2026-03-10", "142556");
  const out = path.join(tmp, "out");
  fs.mkdirSync(root, { recursive: true });
  const downloaded = path.join(root, "09d45b35-3740-400e-9150-25942b5e93fb.source.default.zh-Hans.pptx");
  const ignored = path.join(root, "thumbnail.pptx");
  fs.writeFileSync(downloaded, "PK source deck");
  fs.writeFileSync(ignored, "PK thumbnail deck");

  assert.deepEqual(discoverISlideTempSourcePptx({ root: tmp, limit: 5 }), [downloaded]);

  const args = parseArgs([
    "node",
    "harvest-applied-ppt-components.js",
    "--discover-islide-temp",
    "--discover-root",
    tmp,
    "--discover-limit",
    "3"
  ]);
  assert.equal(args.discoverISlideTemp, true);
  assert.equal(args.discoverRoot, tmp);
  assert.equal(args.discoverLimit, 3);

  const manifest = harvestAppliedPptComponents({
    discoverISlideTemp: true,
    discoverRoot: tmp,
    out,
    provider: "islide"
  });

  assert.equal(manifest.discoveredCount, 1);
  assert.equal(manifest.copiedCount, 1);
  assert.ok(manifest.components[0].name.startsWith("islide-applied-09d45b35-"));
});

test("harvest applied PPT components discovers OfficePLUS local component decks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-officeplus-local-"));
  const root = path.join(tmp, "OfficePLUS", "Temp", "component-download");
  const out = path.join(tmp, "out");
  fs.mkdirSync(root, { recursive: true });
  const downloaded = path.join(root, "MatlComponentContent-11189.pptx");
  const oldIgnored = path.join(root, "notes.txt");
  fs.writeFileSync(downloaded, "PK officeplus component deck");
  fs.writeFileSync(oldIgnored, "ignore");

  assert.deepEqual(discoverOfficePlusLocalSourcePptx({ root: tmp, limit: 5 }), [downloaded]);
  assert.ok(officePlusDiscoveryRoots().some((candidate) => candidate.includes("OfficePLUS")));

  const args = parseArgs([
    "node",
    "harvest-applied-ppt-components.js",
    "--discover-officeplus-local",
    "--discover-root",
    tmp,
    "--provider",
    "officeplus",
    "--discover-limit",
    "3"
  ]);
  assert.equal(args.discoverOfficePlusLocal, true);
  assert.equal(args.provider, "officeplus");

  const manifest = harvestAppliedPptComponents({
    discoverOfficePlusLocal: true,
    discoverRoot: tmp,
    out,
    provider: "officeplus"
  });

  assert.equal(manifest.discoveredCount, 1);
  assert.equal(manifest.copiedCount, 1);
  assert.ok(manifest.components[0].name.startsWith("officeplus-applied-MatlComponentContent-11189-"));
  assert.ok(manifest.components[0].roleTags.includes("officeplus-applied-component"));
});

test("harvest applied PPT components excludes the OfficePLUS promotional install deck by default", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-officeplus-generic-"));
  const source = path.join(tmp, "Microsoft OfficePLUS", "4.0.0.61410", "addin", "officeplus.pptx");
  const out = path.join(tmp, "out");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "PK promotional deck");

  assert.equal(isGenericInstalledTemplate(source, "officeplus"), true);
  assert.equal(isGenericInstalledTemplate(source, "islide"), false);

  const manifest = harvestAppliedPptComponents({
    sources: [source],
    out,
    provider: "officeplus"
  });

  assert.equal(manifest.copiedCount, 0);
  assert.deepEqual(manifest.skippedSources, [{ source, reason: "generic-installed-template" }]);

  const allowed = harvestAppliedPptComponents({
    sources: [source],
    out: path.join(tmp, "out-allowed"),
    provider: "officeplus",
    includeGenericInstalled: true
  });
  assert.equal(allowed.copiedCount, 1);
});

test("harvest applied PPT components keeps names idempotent and deduplicates repeated content", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-harvest-idempotent-"));
  const sourceDir = path.join(tmp, "source");
  const out = path.join(tmp, "islide-applied-components");
  fs.mkdirSync(sourceDir, { recursive: true });
  const one = path.join(sourceDir, "islide-applied-cycle-loop-abcdef123456.pptx");
  const two = path.join(sourceDir, "copy.pptx");
  fs.writeFileSync(one, "PK duplicate content");
  fs.writeFileSync(two, "PK duplicate content");

  assert.equal(appliedComponentStem("islide-applied-cycle-loop-abcdef123456", "islide"), "cycle-loop");
  assert.equal(appliedComponentStem("applied-cycle-loop", "islide"), "cycle-loop");
  assert.equal(appliedComponentStem("islide-applied-applied-cycle-loop-abcdef123456", "islide"), "cycle-loop");

  const manifest = harvestAppliedPptComponents({
    sources: [sourceDir],
    out,
    provider: "islide",
    recursive: false
  });

  assert.equal(manifest.copiedCount, 1);
  assert.match(manifest.components[0].name, /^islide-applied-(?:cycle-loop|copy)-[0-9a-f]{12}\.pptx$/);
  assert.doesNotMatch(manifest.components[0].name, /islide-applied-islide-applied/);
});

function writeStoredZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, eocd]));
}
