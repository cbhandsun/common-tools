"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  defaultPlanOut,
  parseArgs,
  parseBuilderReport,
  runComponentReplacementApply
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-apply");

test("component replacement apply parses CLI boundary options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-apply.js",
    "--pptx",
    "deck.pptx",
    "--inventory",
    "inventory.json",
    "--out",
    "out.pptx",
    "--plan-out",
    "plan.json",
    "--report-out",
    "report.json",
    "--engine",
    "openxml",
    "--allow-missing",
    "--dry-run"
  ]);

  assert.equal(args.pptx, "deck.pptx");
  assert.equal(args.inventory, "inventory.json");
  assert.equal(args.out, "out.pptx");
  assert.equal(args.planOut, "plan.json");
  assert.equal(args.reportOut, "report.json");
  assert.equal(args.engine, "openxml");
  assert.equal(args.allowMissing, true);
  assert.equal(args.dryRun, true);
  assert.throws(() => parseArgs(["node", "script"]), /Either --plan or --pptx is required/);
  assert.throws(() => parseArgs(["node", "script", "--pptx", "deck.pptx"]), /--inventory is required/);
});

test("component replacement apply generates plan, runs builder, and writes report", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-component-apply-"));
  const pptx = path.join(tmp, "anchored.pptx");
  const inventory = path.join(tmp, "manifest.json");
  const sample = path.join(tmp, "officeplus-applied-MatlComponentContent-11189.pptx");
  const out = path.join(tmp, "out.pptx");
  const reportOut = path.join(tmp, "report.json");
  writeStoreZip(pptx, {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(sample, "PK sample");
  fs.writeFileSync(inventory, JSON.stringify({
    components: [{
      provider: "officeplus",
      path: sample,
      name: path.basename(sample),
      assetKind: "presentation-template",
      roleTags: ["applied-component"]
    }]
  }, null, 2));

  const calls = [];
  const result = await runComponentReplacementApply({
    pptx,
    inventory,
    out,
    reportOut,
    engine: "powerpoint",
    runner(command, args, options) {
      calls.push({ command, args, options });
      return Promise.resolve({
        stdout: JSON.stringify({
          provider: "powerpoint-component-replacement-apply-v1",
          summary: { appliedCount: 1, skippedCount: 0 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(fs.existsSync(defaultPlanOut(pptx)), true);
  assert.equal(fs.existsSync(reportOut), true);
  assert.equal(result.generatedPlan, true);
  assert.equal(result.report.summary.appliedCount, 1);
  assert.equal(calls[0].command, "powershell.exe");
  assert.ok(calls[0].args.includes("-PlanFile"));
  assert.ok(calls[0].args.includes("-OutFile"));
  assert.ok(calls[0].args.includes(out));
});

test("component replacement apply can run an existing plan with allow-missing", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-component-existing-plan-"));
  const plan = path.join(tmp, "plan.json");
  const out = path.join(tmp, "out.pptx");
  fs.writeFileSync(plan, JSON.stringify({ pptx: "deck.pptx", operations: [] }, null, 2));

  const calls = [];
  const result = await runComponentReplacementApply({
    plan,
    out,
    allowMissing: true,
    runner(command, args) {
      calls.push({ command, args });
      return Promise.resolve({
        stdout: JSON.stringify({
          provider: "openxml-component-replacement-apply-v1",
          operations: [],
          summary: { applied: 0, skipped: 1 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(result.generatedPlan, false);
  assert.ok(calls[0].args.includes("--apply-component-replacements-openxml"));
  assert.ok(calls[0].args.includes("--allow-missing"));
  assert.equal(result.report.summary.skipped, 1);
});

test("component replacement apply defaults to the portable OpenXML engine and rejects unknown engines", async () => {
  const parsed = parseArgs(["node", "script", "--plan", "plan.json", "--dry-run"]);
  assert.equal(parsed.engine, "openxml");
  await assert.rejects(
    runComponentReplacementApply({ plan: "plan.json", dryRun: true, engine: "unknown" }),
    /Unsupported component replacement engine/
  );
});

test("component replacement apply rejects invalid builder JSON", () => {
  assert.throws(() => parseBuilderReport("not json"), /PowerPoint component replacement returned invalid JSON/);
  assert.throws(() => parseBuilderReport(""), /PowerPoint component replacement returned empty output/);
});

test("component replacement apply preserves recommended sample group report fields", () => {
  const report = parseBuilderReport(JSON.stringify({
    provider: "powerpoint-component-replacement-apply-v1",
    operations: [{
      groupKey: "Deck_A:p1:native-flow",
      status: "ready",
      applied: true,
      removedShapeCount: 1,
      clonedShapeCount: 5,
      samplePath: "component.pptx",
      sampleGroupId: "slide1-process-group",
      sampleSelectionMode: "recommended-group"
    }],
    summary: { appliedCount: 1, skippedCount: 0 }
  }));

  assert.equal(report.operations[0].sampleGroupId, "slide1-process-group");
  assert.equal(report.operations[0].sampleSelectionMode, "recommended-group");
});

function slideXml() {
  return `
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="replacement-card" descr="slideclone:componentReplacementPlan provider=officeplus kind=component id=MatlComponentContent-11189 layer=0:0 tier=strong score=96" /></p:nvSpPr></p:sp>
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
