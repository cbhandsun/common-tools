"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPptCreateJob, runPptCreateJob } = require("../packages/ppt-create-core");
const { inspectTemplate } = require("../packages/ppt-create-core/template");
const { validatePresentationSpec } = require("../packages/ppt-create-core/spec");
const { crc32 } = require("../packages/ppt-quality-core");

function storedZip(entries) {
  const local = []; const central = []; let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name); const content = Buffer.from(value); const checksum = crc32(content); const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([header, nameBytes, content]); local.push(localEntry); const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(content.length, 20); record.writeUInt32LE(content.length, 24); record.writeUInt16LE(nameBytes.length, 28); record.writeUInt32LE(offset, 42); central.push(Buffer.concat([record, nameBytes])); offset += localEntry.length;
  }
  const directory = Buffer.concat(central); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(offset, 16); return Buffer.concat([...local, directory, eocd]);
}

function templateFixture(extraEntries = [], rootRelationships = '<Relationships><Relationship Id="rId1" Target="ppt/presentation.xml"/></Relationships>') {
  const types = '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>';
  const rels = (items) => `<Relationships>${items.map(([id, target]) => `<Relationship Id="${id}" Target="${target}"/>`).join("")}</Relationships>`;
  return storedZip([
    ["[Content_Types].xml", types], ["_rels/.rels", rootRelationships],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"><p:sldIdLst><p:sldId id="256" r:id="rId1" xmlns:r="urn:r"/></p:sldIdLst></p:presentation>'],
    ["ppt/_rels/presentation.xml.rels", rels([["rId1", "slides/slide1.xml"], ["rId2", "slideMasters/slideMaster1.xml"]])],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p"><p:cSld><p:spTree><p:sp/></p:spTree></p:cSld></p:sld>'],
    ["ppt/slides/_rels/slide1.xml.rels", rels([["rId1", "../slideLayouts/slideLayout1.xml"]])],
    ["ppt/slideMasters/slideMaster1.xml", '<p:sldMaster xmlns:p="urn:p"/>'],
    ["ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([["rId1", "../slideLayouts/slideLayout1.xml"]])],
    ["ppt/slideLayouts/slideLayout1.xml", '<p:sldLayout xmlns:p="urn:p"><p:cSld name="标题与内容"><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr></p:sp></p:spTree></p:cSld></p:sldLayout>'],
    ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "../slideMasters/slideMaster1.xml"]])],
    ...extraEntries
  ]);
}

function baseSpec(template) {
  return { version: "1.0", title: "用户模板方案", audience: "经营团队", theme: "clean-light-v1", ...(template ? { template } : {}), slides: [{ id: "cover", role: "cover", title: "用户模板方案" }, { id: "content", role: "content", title: "核心内容", items: [{ id: "fact", label: "事实", detail: "由语义内容生成" }] }] };
}
function source() { return { kind: "customer-provided", locator: "workspace upload", license: "owned-or-authorized" }; }
function fakePdfBuilder({ outFile, sourceFingerprint, pageCount }) { const pages = Array.from({ length: pageCount }, (_, index) => `${index + 1} 0 obj << /Type /Page >> endobj`).join("\n"); fs.writeFileSync(outFile, `%PDF-1.4\n${pages}\n/Count ${pageCount}\n%%EOF`, { flag: "wx" }); return { sourceFingerprint }; }

test("user PPTX template is hash-bound, admitted, passed to the builder, and reported without its local path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-template-"));
  try {
    const bytes = templateFixture(); const templateFile = path.join(root, "brand.pptx"); fs.writeFileSync(templateFile, bytes); const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const input = path.join(root, "spec.json"); fs.writeFileSync(input, JSON.stringify(baseSpec({ path: "brand.pptx", sha256, source: source(), mode: "master-and-theme" })));
    const stateRoot = path.join(root, "state"); const output = path.join(root, "out"); const job = createPptCreateJob({ workspaceRoot: root, stateRoot, ownerId: "owner", input, output }); let received;
    const completed = runPptCreateJob({ stateRoot, ownerId: "owner", id: job.id, buildPptx: ({ outFile, templatePptx }) => { received = templatePptx; fs.writeFileSync(outFile, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64)]), { flag: "wx" }); }, buildPdf: fakePdfBuilder });
    assert.equal(completed.status, "succeeded"); assert.equal(path.basename(received), ".template-input.pptx"); assert.equal(fs.existsSync(received), false); assert.ok(completed.artifacts.some((artifact) => artifact.name === "template-manifest.json"));
    const manifest = fs.readFileSync(path.join(output, "template-manifest.json"), "utf8"); assert.match(manifest, /owned-or-authorized/); assert.match(manifest, /semanticLayouts/); assert.match(manifest, /标题与内容/); assert.doesNotMatch(manifest, /brand[.]pptx|common-tools-template/);
    const ir = JSON.parse(fs.readFileSync(path.join(output, "deck.ir.json"), "utf8")); assert.equal(ir.pages[1].intent.templateLayoutId, "slideLayout1");
    const report = JSON.parse(fs.readFileSync(path.join(output, "ppt-create-report.json"))); assert.equal(report.result.template.sha256, sha256); assert.equal(report.quality.checks.find((check) => check.name === "template-admission").passed, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("template contract rejects traversal, drift, executable content, external relationships, and unsupported rights", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-template-invalid-"));
  try {
    assert.throws(() => validatePresentationSpec(baseSpec({ path: "../brand.pptx", sha256: "a".repeat(64), source: source() })), /path/);
    assert.throws(() => validatePresentationSpec(baseSpec({ path: "brand.pptx", sha256: "a".repeat(64), source: { ...source(), kind: "generated" } })), /source kind/);
    const macro = path.join(root, "macro.pptx"); fs.writeFileSync(macro, templateFixture([["ppt/vbaProject.bin", "unsafe"]])); assert.throws(() => inspectTemplate(macro), /executable or embedded/);
    const external = path.join(root, "external.pptx"); fs.writeFileSync(external, templateFixture([], '<Relationships><Relationship Id="rId1" Target="https://example.com/template" TargetMode="External"/></Relationships>')); assert.throws(() => inspectTemplate(external), /external relationships/);
    const valid = templateFixture(); const templateFile = path.join(root, "brand.pptx"); fs.writeFileSync(templateFile, valid); const input = path.join(root, "spec.json"); fs.writeFileSync(input, JSON.stringify(baseSpec({ path: "brand.pptx", sha256: "0".repeat(64), source: source() })));
    assert.throws(() => createPptCreateJob({ workspaceRoot: root, stateRoot: path.join(root, "state"), ownerId: "owner", input, output: path.join(root, "out") }), /hash/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
