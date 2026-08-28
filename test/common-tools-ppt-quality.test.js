"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { crc32, createPptQualityJob, pptQualitySummary, runPptQualityJob } = require("../packages/ppt-quality-core");
const { createPptImproveJob, pptImproveSummary, runPptImproveJob } = require("../packages/ppt-improve-core");
const { callTool, enabledTools } = require("../packages/mcp-server/core");
const { setCapabilityEnabled } = require("../packages/capability-runtime");

function storedZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const content = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
    const checksum = crc32(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([header, nameBytes, content]);
    local.push(localEntry);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(content.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([record, nameBytes]));
    offset += localEntry.length;
  }
  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, eocd]);
}

function writeFixture(root, name = "source.pptx") {
  const file = path.join(root, name);
  fs.writeFileSync(file, storedZip([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:sp/><p:pic/><a:tbl/></p:sld>'],
    ["ppt/slides/slide2.xml", '<p:sld xmlns:p="urn:p"/>'],
    ["ppt/media/image1.png", Buffer.from([137, 80, 78, 71])]
  ]));
  return file;
}

function writeCleanFixture(root, name = "clean.pptx") {
  const file = path.join(root, name);
  fs.writeFileSync(file, storedZip([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p"><p:pic/></p:sld>'],
    ["ppt/slides/_rels/slide1.xml.rels", '<Relationships><Relationship Id="rId1" Type="urn:test" Target="../media/image1.png"/></Relationships>'],
    ["ppt/media/image1.png", Buffer.from([137, 80, 78, 71])]
  ]));
  return file;
}

function temporaryWorkspace() { return fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-quality-")); }

function writeBrokenRelationshipFixture(root, name = "broken.pptx") {
  const file = path.join(root, name);
  fs.writeFileSync(file, storedZip([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p"><p:sp/></p:sld>'],
    ["ppt/slides/_rels/slide1.xml.rels", '<Relationships><Relationship Id="rId1" Type="urn:test" Target="../media/missing.png"/></Relationships>']
  ]));
  return file;
}

test("PPT quality creates separate verified reports without modifying the source", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const before = fs.readFileSync(input);
    const stateRoot = path.join(root, ".state");
    const output = path.join(root, "reports");
    const created = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output });
    const completed = runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: created.id });
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.quality.passed, true);
    assert.deepEqual(completed.artifacts.map((item) => item.name), ["ppt-quality-report.json", "ppt-quality-report.md"]);
    assert.deepEqual(fs.readFileSync(input), before);
    const report = JSON.parse(fs.readFileSync(path.join(output, "ppt-quality-report.json"), "utf8"));
    assert.equal(report.summary.slideCount, 2);
    assert.equal(report.summary.emptySlideCount, 1);
    assert.equal(report.summary.textShapeCount, 1);
    assert.equal(report.summary.pictureCount, 1);
    assert.equal(report.summary.tableCount, 1);
    assert.equal(report.summary.unusedMediaCount, 1);
    assert.equal(report.source.path, undefined);
    assert.equal(pptQualitySummary(completed, root)?.summary.mediaCount, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT improve requires the matching audit report and removes only orphaned media into a new PPTX", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const before = fs.readFileSync(input);
    const stateRoot = path.join(root, ".state");
    const qualityOutput = path.join(root, "quality-report");
    const qualityJob = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: qualityOutput });
    assert.equal(runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: qualityJob.id }).status, "succeeded");
    const report = path.join(qualityOutput, "ppt-quality-report.json");
    const improveOutput = path.join(root, "improved-report");
    const improveJob = createPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, report, output: improveOutput });
    const completed = runPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: improveJob.id });
    assert.equal(completed.status, "succeeded");
    assert.deepEqual(completed.artifacts.map((item) => item.name), ["improved.pptx", "improved-ppt-quality-report.json", "improved-ppt-quality-report.md", "ppt-improve-report.json", "ppt-improve-report.md"]);
    assert.deepEqual(fs.readFileSync(input), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(improveOutput, "ppt-improve-report.json"), "utf8")).result.removedMediaCount, 1);
    const postAudit = JSON.parse(fs.readFileSync(path.join(improveOutput, "improved-ppt-quality-report.json"), "utf8"));
    assert.equal(postAudit.source.sha256, completed.artifacts.find((artifact) => artifact.name === "improved.pptx").sha256);
    assert.equal(postAudit.summary.unusedMediaCount, 0);
    assert.equal(pptImproveSummary(completed, root)?.postAudit.unusedMediaCount, 0);
    const rerunQuality = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input: path.join(improveOutput, "improved.pptx"), output: path.join(root, "post-quality") });
    const reaudited = runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: rerunQuality.id });
    assert.equal(reaudited.status, "succeeded");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "post-quality", "ppt-quality-report.json"), "utf8")).summary.unusedMediaCount, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT improve does not fabricate an output or post-audit when no safe repair applies", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeCleanFixture(root);
    const stateRoot = path.join(root, ".state");
    const qualityOutput = path.join(root, "quality-report");
    const qualityJob = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: qualityOutput });
    assert.equal(runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: qualityJob.id }).status, "succeeded");
    const improveOutput = path.join(root, "improved-report");
    const improveJob = createPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, report: path.join(qualityOutput, "ppt-quality-report.json"), output: improveOutput });
    const completed = runPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: improveJob.id });
    assert.equal(completed.status, "succeeded");
    assert.deepEqual(completed.artifacts.map((item) => item.name), ["ppt-improve-report.json", "ppt-improve-report.md"]);
    assert.equal(fs.existsSync(path.join(improveOutput, "improved.pptx")), false);
    assert.equal(fs.existsSync(path.join(improveOutput, "improved-ppt-quality-report.json")), false);
    assert.equal(pptImproveSummary(completed, root)?.postAudit, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT improve audit-only profile identifies safe work without creating a deck", () => {
  const root = temporaryWorkspace();
  try { const input = writeFixture(root); const stateRoot = path.join(root, ".state"); const qualityOutput = path.join(root, "quality"); const qualityJob = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: qualityOutput }); runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: qualityJob.id }); const output = path.join(root, "audit-only"); const job = createPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, report: path.join(qualityOutput, "ppt-quality-report.json"), output, profile: "audit-only" }); const completed = runPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: job.id }); assert.equal(completed.status, "succeeded"); assert.equal(fs.existsSync(path.join(output, "improved.pptx")), false); const report = JSON.parse(fs.readFileSync(path.join(output, "ppt-improve-report.json"))); assert.equal(report.repairProfile, "audit-only"); assert.equal(report.result.eligibleUnusedMediaCount, 1); assert.equal(report.result.removedMediaCount, 0); assert.throws(() => createPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, report: path.join(qualityOutput, "ppt-quality-report.json"), output: path.join(root, "bad"), profile: "unsafe" }), /profile/); } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT improve never overwrites an existing report and rolls back this attempt's output", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const stateRoot = path.join(root, ".state");
    const qualityOutput = path.join(root, "quality-report");
    const qualityJob = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: qualityOutput });
    assert.equal(runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: qualityJob.id }).status, "succeeded");
    const improveOutput = path.join(root, "improved-report");
    fs.mkdirSync(improveOutput);
    const existingReport = path.join(improveOutput, "ppt-improve-report.json");
    fs.writeFileSync(existingReport, "keep-existing-report", "utf8");
    const improveJob = createPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, report: path.join(qualityOutput, "ppt-quality-report.json"), output: improveOutput });
    const completed = runPptImproveJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: improveJob.id });
    assert.equal(completed.status, "failed");
    assert.match(completed.error.message, /output already exists/);
    assert.equal(fs.readFileSync(existingReport, "utf8"), "keep-existing-report");
    for (const name of ["improved.pptx", "improved-ppt-quality-report.json", "improved-ppt-quality-report.md", "ppt-improve-report.md"]) assert.equal(fs.existsSync(path.join(improveOutput, name)), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT quality detects source changes and MCP report access requires separate enablement", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const stateRoot = path.join(root, ".state");
    const output = path.join(root, "reports");
    assert.throws(() => callTool("create_ppt_quality_job", { input, output }, { workspaceRoot: root, stateRoot, ownerId: "owner" }), /not enabled/);
    setCapabilityEnabled(stateRoot, "ppt-quality", true);
    const created = callTool("create_ppt_quality_job", { input, output }, { workspaceRoot: root, stateRoot, ownerId: "owner" });
    fs.appendFileSync(input, "changed");
    const failed = runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: created.id });
    assert.equal(failed.status, "failed");
    assert.match(failed.error.message, /changed/);
    assert.equal(callTool("get_ppt_quality_report", { id: failed.id }, { workspaceRoot: root, stateRoot, ownerId: "owner" }).audit, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT quality fails closed when a ZIP entry no longer matches its CRC-32 directory record", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const bytes = fs.readFileSync(input);
    const offset = bytes.indexOf(Buffer.from("urn:p", "utf8"));
    assert.ok(offset > 0);
    bytes[offset] ^= 1;
    fs.writeFileSync(input, bytes);
    const stateRoot = path.join(root, ".state");
    const output = path.join(root, "reports");
    const created = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output });
    const completed = runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: created.id });
    assert.equal(completed.status, "failed");
    assert.match(completed.error.message, /checksum|directory/);
    assert.equal(fs.existsSync(path.join(output, "ppt-quality-report.json")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT quality fails closed when a local ZIP entry name disagrees with its central directory", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const bytes = fs.readFileSync(input);
    const name = Buffer.from("[Content_Types].xml", "utf8");
    const offset = bytes.indexOf(name);
    assert.ok(offset > 0);
    bytes[offset] = "X".charCodeAt(0);
    fs.writeFileSync(input, bytes);
    const stateRoot = path.join(root, ".state");
    const created = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output: path.join(root, "reports") });
    const completed = runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: created.id });
    assert.equal(completed.status, "failed");
    assert.match(completed.error.message, /local entry does not match/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT quality reports unresolved internal relationships as a failed structural gate without exposing target paths", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeBrokenRelationshipFixture(root);
    const stateRoot = path.join(root, ".state");
    const output = path.join(root, "reports");
    const created = createPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output });
    const completed = runPptQualityJob({ workspaceRoot: root, stateRoot, ownerId: "owner", id: created.id });
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.quality.passed, false);
    const report = JSON.parse(fs.readFileSync(path.join(output, "ppt-quality-report.json"), "utf8"));
    assert.equal(report.summary.relationshipCount, 1);
    assert.equal(report.summary.unresolvedRelationshipCount, 1);
    assert.equal(report.summary.invalidRelationshipCount, 0);
    assert.deepEqual(report.findings.find((finding) => finding.id === "broken-relationships"), { id: "broken-relationships", severity: "error", count: 1, message: "One or more internal OOXML relationships do not resolve safely inside the package." });
    assert.equal(JSON.stringify(report).includes("missing.png"), false);
    assert.equal(pptQualitySummary(completed, root)?.summary.unresolvedRelationshipCount, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP Apps expose verified PPT audit and improvement report tools only after independent enablement", () => {
  const root = temporaryWorkspace();
  try {
    const stateRoot = path.join(root, ".state");
    const context = { workspaceRoot: root, stateRoot, ownerId: "owner" };
    const request = { params: { _meta: { "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } } } };
    assert.equal(enabledTools(context, request).some((tool) => tool.name === "get_ppt_quality_report"), false);
    setCapabilityEnabled(stateRoot, "ppt-quality", true);
    setCapabilityEnabled(stateRoot, "ppt-improve", true);
    const tools = enabledTools(context, request);
    for (const name of ["get_ppt_quality_report", "get_ppt_improve_report"]) assert.deepEqual(tools.find((tool) => tool.name === name)?._meta, { ui: { resourceUri: "ui://common-tools/quality-report.html", visibility: ["model"] } });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PPT quality CLI creates jobs and supports direct local execution", () => {
  const root = temporaryWorkspace();
  try {
    const input = writeFixture(root);
    const stateRoot = path.join(root, ".state");
    const output = path.join(root, "reports");
    const cli = path.resolve(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
    const disabled = spawnSync(process.execPath, [cli, "ppt-quality", "create", "--workspace", root, "--state", stateRoot, "--input", input, "--out", output], { encoding: "utf8", windowsHide: true });
    assert.equal(disabled.status, 1);
    assert.match(disabled.stderr, /capability is not enabled: ppt-quality/);
    setCapabilityEnabled(stateRoot, "ppt-quality", true);
    const pipelineBlockedByDependency = spawnSync(process.execPath, [cli, "ppt-improve", "pipeline", "--workspace", root, "--state", stateRoot, "--input", input, "--out", path.join(root, "blocked-pipeline")], { encoding: "utf8", windowsHide: true });
    assert.equal(pipelineBlockedByDependency.status, 1);
    assert.match(pipelineBlockedByDependency.stderr, /capability is not enabled: ppt-improve/);
    assert.equal(fs.existsSync(path.join(root, "blocked-pipeline")), false);
    setCapabilityEnabled(stateRoot, "ppt-improve", true);
    const created = spawnSync(process.execPath, [cli, "ppt-quality", "create", "--workspace", root, "--state", stateRoot, "--input", input, "--out", output], { encoding: "utf8", windowsHide: true });
    assert.equal(created.status, 0, created.stderr);
    const job = JSON.parse(created.stdout);
    const completed = spawnSync(process.execPath, [cli, "job", "run", "--workspace", root, "--state", stateRoot, "--id", job.id], { encoding: "utf8", windowsHide: true });
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(JSON.parse(completed.stdout).status, "succeeded");
    const direct = spawnSync(process.execPath, [cli, "ppt-quality", "run", "--workspace", root, "--state", stateRoot, "--input", input, "--out", path.join(root, "direct-reports")], { encoding: "utf8", windowsHide: true });
    assert.equal(direct.status, 0, direct.stderr);
    assert.equal(JSON.parse(direct.stdout).status, "succeeded");
    const directImprove = spawnSync(process.execPath, [cli, "ppt-improve", "run", "--workspace", root, "--state", stateRoot, "--input", input, "--report", path.join(root, "direct-reports", "ppt-quality-report.json"), "--out", path.join(root, "direct-improve")], { encoding: "utf8", windowsHide: true });
    assert.equal(directImprove.status, 0, directImprove.stderr);
    assert.equal(JSON.parse(directImprove.stdout).status, "succeeded");
    const pipelineOutput = path.join(root, "pipeline");
    const pipeline = spawnSync(process.execPath, [cli, "ppt-improve", "pipeline", "--workspace", root, "--state", stateRoot, "--input", input, "--out", pipelineOutput], { encoding: "utf8", windowsHide: true });
    assert.equal(pipeline.status, 0, pipeline.stderr);
    const pipelineResult = JSON.parse(pipeline.stdout);
    assert.equal(pipelineResult.quality.status, "succeeded");
    assert.equal(pipelineResult.improvement.status, "succeeded");
    assert.equal(fs.existsSync(path.join(pipelineOutput, "quality", "ppt-quality-report.json")), true);
    assert.equal(fs.existsSync(path.join(pipelineOutput, "improve", "improved.pptx")), true);
    const repeatedPipeline = spawnSync(process.execPath, [cli, "ppt-improve", "pipeline", "--workspace", root, "--state", stateRoot, "--input", input, "--out", pipelineOutput], { encoding: "utf8", windowsHide: true });
    assert.equal(repeatedPipeline.status, 1);
    assert.match(repeatedPipeline.stderr, /output already exists/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
