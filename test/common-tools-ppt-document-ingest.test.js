"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { crc32 } = require("../packages/ppt-quality-core");
const { documentToPresentation, extractDocxOutline, persistDocumentPlan } = require("../packages/ppt-create-core/document-ingest");
const { parsePdfBboxLayout, resolvePdftotext } = require("../packages/ppt-create-core/pdf-text");
const { setCapabilityEnabled } = require("../packages/capability-runtime");

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
function docxFixture() {
  const types = '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const document = '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>年度经营复盘</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>增长与效率</w:t></w:r></w:p><w:p><w:r><w:t>收入同比增长 18%，交付周期缩短 12%。</w:t></w:r></w:p><w:p><w:r><w:t>下一阶段聚焦高价值客户与标准化交付。</w:t></w:r></w:p></w:body></w:document>';
  return storedZip([["[Content_Types].xml", types], ["word/document.xml", document]]);
}
function docxTableFixture() {
  const types = '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const cell = (value) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
  const document = `<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>经营数据</w:t></w:r></w:p><w:tbl><w:tr>${cell("指标")}${cell("本期")}</w:tr><w:tr>${cell("收入")}${cell("120")}</w:tr><w:tr>${cell("利润")}${cell("24")}</w:tr></w:tbl></w:body></w:document>`;
  return storedZip([["[Content_Types].xml", types], ["word/document.xml", document]]);
}
function docxRichFixture() {
  const types = '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const document = '<w:document xmlns:w="urn:w" xmlns:a="urn:a" xmlns:r="urn:r" xmlns:wp="urn:wp"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>图文报告</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:docPr name="经营趋势图" descr="已授权经营趋势图"/><a:blip r:embed="rId5"/></w:drawing></w:r><w:r><w:t>趋势图说明</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="2"/></w:numPr></w:pPr><w:r><w:t>三级列表事项</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>合并标题</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>值</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  const relationships = '<Relationships><Relationship Id="rId5" Target="media/image1.png"/></Relationships>'; const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8fK8QAAAABJRU5ErkJggg==", "base64");
  return storedZip([["[Content_Types].xml", types], ["word/document.xml", document], ["word/_rels/document.xml.rels", relationships], ["word/media/image1.png", png]]);
}
const options = { audience: "经营团队", purpose: "形成可执行的复盘汇报", maxSlides: 12 };

test("Markdown and DOCX inputs preserve headings and points through the Brief-to-Spec planner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-document-ingest-"));
  try {
    const markdown = path.join(root, "review.md"); fs.writeFileSync(markdown, "# 季度复盘\n\n## 核心结果\n- 收入同比增长 18%\n- 交付周期缩短 12%\n\n## 下一步\n聚焦高价值客户并标准化交付。\n");
    const fromMarkdown = documentToPresentation(markdown, options); assert.equal(fromMarkdown.report.sourceFormat, "markdown"); assert.equal(fromMarkdown.document.slides[0].title, "季度复盘"); assert.equal(fromMarkdown.document.slides.length, 3);
    const docx = path.join(root, "review.docx"); fs.writeFileSync(docx, docxFixture()); const records = extractDocxOutline(fs.readFileSync(docx));
    assert.deepEqual(records.map((record) => [record.kind, record.text]), [["heading", "年度经营复盘"], ["heading", "增长与效率"], ["paragraph", "收入同比增长 18%，交付周期缩短 12%。"], ["paragraph", "下一阶段聚焦高价值客户与标准化交付。"]]);
    const fromDocx = documentToPresentation(docx, { ...options, outputFormat: "brief" }); assert.equal(fromDocx.report.outputFormat, "brief"); assert.equal(fromDocx.document.sections[0].points.length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PDF ingestion requires a bounded fixed adapter and produces the same validated semantic contract", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-pdf-ingest-"));
  try {
    const pdf = path.join(root, "source.pdf"); fs.writeFileSync(pdf, "%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF");
    assert.throws(() => documentToPresentation(pdf, options), /adapter/);
    const result = documentToPresentation(pdf, { ...options, extractPdfText: () => "项目复盘\n现状：\n收入增长稳定\n交付效率仍需提升\n" });
    assert.equal(result.report.sourceFormat, "pdf"); assert.equal(result.document.slides[0].title, "项目复盘"); assert.equal(result.document.slides[1].items.length, 2);
    assert.throws(() => documentToPresentation(pdf, { ...options, extractPdfText: () => "" }), /extracted text/);
    assert.throws(() => resolvePdftotext({ COMMON_TOOLS_PDFTOTEXT_BIN: "bad\ncommand" }), /configuration/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("PDF bbox ingestion preserves page coordinates, heading scale and column evidence", () => {
  const records = parsePdfBboxLayout('<html><body><page width="600" height="800"><flow><block><line xMin="40" yMin="40" xMax="300" yMax="70"><word>项目</word><word>复盘</word></line><line xMin="40" yMin="100" xMax="260" yMax="116"><word>左栏事实</word></line><line xMin="340" yMin="100" xMax="560" yMax="116"><word>右栏事实</word></line></block></flow></page></body></html>');
  assert.equal(records[0].kind, "heading"); assert.equal(records[0].page, 1); assert.equal(records[1].column, 1); assert.equal(records[2].column, 2); assert.deepEqual(records[0].box, { x: 40 / 600, y: 40 / 800, w: 260 / 600, h: 30 / 800 });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-pdf-layout-ingest-"));
  try { const pdf = path.join(root, "layout.pdf"); fs.writeFileSync(pdf, "%PDF-1.4\n%%EOF"); const result = documentToPresentation(pdf, { ...options, extractPdfLayout: () => records }); assert.equal(result.report.positionedBlocks, 3); assert.equal(result.report.detectedColumns, 2); assert.equal(result.report.checks.find((check) => check.name === "pdf-layout-preserved").passed, true); } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("DOCX tables and PDF page boundaries become native visual structure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-visual-ingest-"));
  try {
    const docx = path.join(root, "table.docx"); fs.writeFileSync(docx, docxTableFixture());
    const fromDocx = documentToPresentation(docx, options);
    assert.equal(fromDocx.report.structuredTables, 1);
    assert.equal(fromDocx.document.slides[1].visual.kind, "table");
    assert.deepEqual(fromDocx.document.slides[1].visual.headers, ["指标", "本期"]);
    const pdf = path.join(root, "pages.pdf"); fs.writeFileSync(pdf, "%PDF-1.4\n%%EOF");
    const fromPdf = documentToPresentation(pdf, { ...options, extractPdfText: () => "封面\n摘要内容\f第二页标题\n第二页事实" });
    assert.equal(fromPdf.report.sourcePages, 2);
    assert.ok(fromPdf.document.slides.some((slide) => slide.title === "第二页标题"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("DOCX embedded images, list hierarchy and merged-cell evidence are preserved and materialized", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-rich-docx-"));
  try {
    const input = path.join(root, "rich.docx"); const output = path.join(root, "rich.presentation.json"); fs.writeFileSync(input, docxRichFixture()); const records = extractDocxOutline(fs.readFileSync(input));
    assert.equal(records.find((record) => record.kind === "image").alt, "已授权经营趋势图"); assert.equal(records.find((record) => record.listLevel === 2).text, "三级列表事项"); assert.equal(records.find((record) => record.kind === "table").mergedCells, 1);
    const result = persistDocumentPlan({ workspaceRoot: root, input, output, ...options }); const spec = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(result.report.extractedImages, 1); assert.equal(result.report.listItems, 1); assert.equal(result.report.mergedTableCells, 1); assert.equal(spec.assets.length, 1); assert.equal(spec.slides.find((slide) => slide.title === "图像 1").visual.assetId, "docx-image-1"); assert.equal(fs.existsSync(path.join(root, spec.assets[0].path)), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("document plan persistence and CLI refuse overwrite while emitting only bounded aggregate reports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-document-plan-"));
  try {
    const input = path.join(root, "source.md"); const output = path.join(root, "brief.json"); fs.writeFileSync(input, "# 项目方案\n## 背景\n现有流程需要提效。\n## 行动\n统一入口并建立验证门禁。\n");
    const persisted = persistDocumentPlan({ workspaceRoot: root, input, output, ...options, outputFormat: "brief" }); assert.equal(persisted.report.outputFormat, "brief"); assert.doesNotMatch(JSON.stringify(persisted.report), /现有流程|统一入口/);
    assert.throws(() => persistDocumentPlan({ workspaceRoot: root, input, output, ...options }), /new JSON/);
    const state = path.join(root, "state"); const specOutput = path.join(root, "spec.json"); setCapabilityEnabled(state, "ppt-create", true); const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
    const command = spawnSync(process.execPath, [cli, "ppt", "ingest", "--workspace", root, "--state", state, "--input", input, "--out", specOutput, "--audience", options.audience, "--purpose", options.purpose, "--max-slides", "12"], { encoding: "utf8", windowsHide: true });
    assert.equal(command.status, 0, command.stderr); assert.equal(JSON.parse(command.stdout).report.outputFormat, "spec"); assert.equal(JSON.parse(fs.readFileSync(specOutput, "utf8")).version, "1.0");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("document ingestion rejects empty, unsupported, oversized-structure and unsafe output inputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-document-invalid-"));
  try {
    const empty = path.join(root, "empty.md"); fs.writeFileSync(empty, "\n"); assert.throws(() => documentToPresentation(empty, options), /no extractable text/);
    const text = path.join(root, "source.txt"); fs.writeFileSync(text, "text"); assert.throws(() => documentToPresentation(text, options), /Markdown, DOCX, or PDF/);
    const malformed = path.join(root, "bad.docx"); fs.writeFileSync(malformed, Buffer.alloc(32)); assert.throws(() => documentToPresentation(malformed, options), /ZIP|DOCX/);
    const source = path.join(root, "source.md"); fs.writeFileSync(source, "# 标题\n内容"); assert.throws(() => persistDocumentPlan({ workspaceRoot: root, input: source, output: path.join(root, "..", "outside.json"), ...options }), /outside the approved root/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
