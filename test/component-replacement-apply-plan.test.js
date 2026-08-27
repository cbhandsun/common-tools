"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildComponentReplacementApplyPlan,
  extractReplacementAnchorsFromSlideXml,
  parseReplacementDescription
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-apply-plan");

test("component replacement apply plan parses OpenXML drawing descriptions", () => {
  const description = "slideclone:componentReplacementPlan provider=officeplus kind=component id=MatlComponentContent-11189 layer=0:0 tier=strong score=96";

  assert.deepEqual(parseReplacementDescription(description), {
    provider: "officeplus",
    kind: "component",
    componentId: "MatlComponentContent-11189",
    layer: "0:0",
    tier: "strong",
    score: 96,
    title: null,
    targetMotifs: []
  });

  const anchors = extractReplacementAnchorsFromSlideXml(`
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cNvPr id="2" name="replacement-shape" descr="${description}" />
      <p:cNvPr id="3" name="plain-shape" />
    </p:sld>
  `, "ppt/slides/slide1.xml");

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].drawingName, "replacement-shape");
  assert.equal(anchors[0].slideIndex, 1);
});

test("component replacement apply plan groups anchors and matches harvested samples", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-replacement-plan-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const sample = path.join(tmp, "officeplus-applied-MatlComponentContent-11189-abcdef123456.pptx");
  const inventory = path.join(tmp, "manifest.json");
  const out = path.join(tmp, "plan.json");
  fs.writeFileSync(sample, "PK mocked harvested component");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml([
      { id: 2, name: "card-back" },
      { id: 3, name: "card-title" }
    ])
  });
  fs.writeFileSync(inventory, JSON.stringify({
    provider: "applied-ppt-component-harvest-v1",
    components: [{
      provider: "officeplus",
      path: sample,
      name: path.basename(sample),
      sha256: "a".repeat(64),
      assetKind: "presentation-template",
      roleTags: ["applied-component", "officeplus-applied-component"]
    }]
  }, null, 2));

  const plan = buildComponentReplacementApplyPlan({
    pptx,
    inventory,
    out,
    minAnchors: 2
  });

  assert.equal(plan.summary.anchorCount, 2);
  assert.equal(plan.summary.groupCount, 1);
  assert.equal(plan.summary.readyGroups, 1);
  assert.equal(plan.summary.missingSampleGroups, 0);
  assert.equal(plan.summary.canApplyWithoutManualHarvest, true);
  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].anchorCount, 2);
  assert.equal(plan.operations[0].sample.path, sample);
  assert.equal(plan.operations[0].sample.sha256, "a".repeat(64));
  assert.equal(fs.existsSync(out), true);
});

test("component replacement apply plan reports missing samples instead of pretending to replace", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-replacement-missing-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const inventory = path.join(tmp, "empty-manifest.json");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml([{ id: 2, name: "card-back" }])
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));

  const plan = buildComponentReplacementApplyPlan({ pptx, inventory });
  assert.equal(plan.summary.missingSampleGroups, 1);
  assert.equal(plan.operations[0].status, "missing_sample");
  assert.match(plan.operations[0].nextAction.harvestCommand, /harvest-active-powerpoint-component\.js --provider officeplus --label MatlComponentContent-11189/);
  assert.deepEqual(plan.operations[0].nextAction.requiredSample.searchKeywords, ["MatlComponentContent-11189"]);
  assert.throws(
    () => buildComponentReplacementApplyPlan({ pptx, inventory, failOnMissingSamples: true }),
    /Missing component samples/
  );
});

test("component replacement apply plan preserves title and motifs for plugin harvest search", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-replacement-search-hints-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const inventory = path.join(tmp, "empty-manifest.json");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml([{ id: 2, name: "card-back" }], {
      title: "渐变4项流程箭头",
      motifs: "linear-arrow-chain,branch-card-flow"
    })
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));

  const plan = buildComponentReplacementApplyPlan({ pptx, inventory });

  assert.equal(plan.groups[0].title, "渐变4项流程箭头");
  assert.deepEqual(plan.groups[0].targetMotifs, ["linear-arrow-chain", "branch-card-flow"]);
  assert.deepEqual(plan.operations[0].targetMotifs, ["linear-arrow-chain", "branch-card-flow"]);
  assert.deepEqual(plan.operations[0].nextAction.requiredSample.searchKeywords.slice(0, 4), [
    "渐变4项流程箭头",
    "流程箭头",
    "流程",
    "分支卡片"
  ]);
});

test("component replacement apply plan does not match generic samples when component id differs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-replacement-wrong-sample-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const sample = path.join(tmp, "islide-applied-generic-cycle.pptx");
  const inventory = path.join(tmp, "manifest.json");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml([{ id: 2, name: "card-back" }])
  });
  fs.writeFileSync(sample, "PK generic iSlide component");
  fs.writeFileSync(inventory, JSON.stringify({
    components: [{
      provider: "islide",
      path: sample,
      name: path.basename(sample),
      assetKind: "presentation-template",
      roleTags: ["applied-component", "openxml-inspectable"]
    }]
  }, null, 2));

  const plan = buildComponentReplacementApplyPlan({ pptx, inventory });

  assert.equal(plan.summary.readyGroups, 0);
  assert.equal(plan.summary.missingSampleGroups, 1);
  assert.equal(plan.operations[0].sample, null);
});

test("component replacement apply plan accepts high-confidence semantic component fallbacks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-replacement-semantic-fallback-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const sample = path.join(tmp, "islide-applied-cycle-arrow.pptx");
  const inventory = path.join(tmp, "manifest.json");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml([{ id: 2, name: "cycle-arrow" }], {
      title: "简约渐变3项向上箭头循环",
      motifs: "arc-arrow,ring-node,whole-process-template"
    })
  });
  fs.writeFileSync(sample, "PK semantic iSlide cycle component");
  fs.writeFileSync(inventory, JSON.stringify({
    components: [{
      provider: "islide",
      path: sample,
      name: path.basename(sample),
      assetKind: "presentation-template",
      roleTags: ["applied-component", "openxml-inspectable"],
      learningSummary: {
        structureSignature: {
          primaryKind: "cycle-loop",
          primaryMotif: "arc-arrow",
          motifs: ["arc-arrow"]
        },
        componentCatalog: [{
          structure: {
            kind: "cycle-loop",
            motifs: ["arc-arrow"]
          },
          reuseReadiness: {
            level: "high",
            score: 86
          }
        }]
      }
    }]
  }, null, 2));

  const plan = buildComponentReplacementApplyPlan({ pptx, inventory });

  assert.equal(plan.summary.readyGroups, 1);
  assert.equal(plan.summary.missingSampleGroups, 0);
  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].sample.path, sample);
  assert.equal(plan.operations[0].sample.semanticFallback, true);
  assert.equal(plan.operations[0].sample.structureSignature.primaryKind, "cycle-loop");
});

test("component replacement apply plan rejects medium-confidence semantic fallbacks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-replacement-medium-fallback-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const sample = path.join(tmp, "islide-applied-medium-cycle-arrow.pptx");
  const inventory = path.join(tmp, "manifest.json");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml([{ id: 2, name: "cycle-arrow" }], {
      title: "简约渐变3项向上箭头循环",
      motifs: "arc-arrow,ring-node,whole-process-template"
    })
  });
  fs.writeFileSync(sample, "PK medium semantic iSlide cycle component");
  fs.writeFileSync(inventory, JSON.stringify({
    components: [{
      provider: "islide",
      path: sample,
      name: path.basename(sample),
      assetKind: "presentation-template",
      roleTags: ["applied-component", "openxml-inspectable"],
      learningSummary: {
        structureSignature: {
          primaryKind: "cycle-loop",
          primaryMotif: "arc-arrow",
          motifs: ["arc-arrow"]
        },
        componentCatalog: [{
          structure: {
            kind: "cycle-loop",
            motifs: ["arc-arrow"]
          },
          reuseReadiness: {
            level: "medium",
            score: 65
          }
        }]
      }
    }]
  }, null, 2));

  const plan = buildComponentReplacementApplyPlan({ pptx, inventory });

  assert.equal(plan.summary.readyGroups, 0);
  assert.equal(plan.summary.missingSampleGroups, 1);
  assert.equal(plan.operations[0].sample, null);
});

function slideXml(drawings, extras = {}) {
  const suffix = [
    extras.title ? `title=${extras.title}` : "",
    extras.motifs ? `motifs=${extras.motifs}` : ""
  ].filter(Boolean).join(" ");
  const descr = `slideclone:componentReplacementPlan provider=officeplus kind=component id=MatlComponentContent-11189 layer=0:0 tier=strong score=96${suffix ? ` ${suffix}` : ""}`;
  return `
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        ${drawings.map((drawing) => `<p:sp><p:nvSpPr><p:cNvPr id="${drawing.id}" name="${drawing.name}" descr="${descr}" /></p:nvSpPr></p:sp>`).join("")}
      </p:spTree></p:cSld>
    </p:sld>
  `;
}

function writeStoreZip(file, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, data);

    const item = Buffer.alloc(46);
    item.writeUInt32LE(0x02014b50, 0);
    item.writeUInt16LE(20, 4);
    item.writeUInt16LE(20, 6);
    item.writeUInt16LE(0, 8);
    item.writeUInt16LE(0, 10);
    item.writeUInt32LE(0, 12);
    item.writeUInt32LE(0, 16);
    item.writeUInt32LE(data.length, 20);
    item.writeUInt32LE(data.length, 24);
    item.writeUInt16LE(nameBuffer.length, 28);
    item.writeUInt16LE(0, 30);
    item.writeUInt16LE(0, 32);
    item.writeUInt32LE(0, 34);
    item.writeUInt32LE(0, 38);
    item.writeUInt32LE(offset, 42);
    central.push(item, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralStart = offset;
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(file, Buffer.concat([...chunks, centralBuffer, end]));
}
