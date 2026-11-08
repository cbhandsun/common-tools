"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { createPrintableHtml, deckIrFingerprint, effectiveText, effectiveTextBox, effectiveTextRotation, effectiveTextSizePt, inspectPdf, multiFormatQuality } = require("../packages/ppt-create-core/export");
const { createIrPreviewHtml } = require("../packages/ppt-create-core/ir-editor");
const { resolveLibreOffice } = require("../packages/ppt-create-core/libreoffice-pdf");

function ir(text = "Safe") {
  return { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, background: { fill: "FFFFFF" }, shapes: [], tables: [], charts: [], textBoxes: [{ id: "title", text, box: { x: 10, y: 10, w: 900, h: 80 }, font: { family: "Arial", sizePt: 40, color: "111111" } }] }] };
}
function writePdf(file, pages) {
  const objects = Array.from({ length: pages }, (_, index) => `${index + 1} 0 obj << /Type /Page /Parent 99 0 R >> endobj`).join("\n");
  fs.writeFileSync(file, `%PDF-1.7\n${objects}\n99 0 obj << /Type /Pages /Count ${pages} >> endobj\n%%EOF`);
}
function writePptx(file) { fs.writeFileSync(file, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(64, 1)])); }

test("font names cannot inject CSS declarations into printable HTML", () => {
  const families = ["Arial;position:fixed;inset:0;background:url(https://example.invalid/font)", "Arial", "Microsoft YaHei", "中文字体", 'A "quoted" font', "A\\font", 'Arial";position:fixed;/*', "</style><script>bad()</script>"];
  for (const family of families) {
    const model = ir(); model.pages[0].textBoxes[0].font.family = family;
    const dom = new JSDOM(createPrintableHtml(model));
    try {
      const element = dom.window.document.querySelector('[data-object-id="title"]');
      assert.equal(element.style.position, "");
      assert.equal(element.style.backgroundImage, "");
      assert.equal(element.style.inset, "");
      assert.equal(dom.window.document.querySelectorAll("script").length, 0);
      assert.ok(element.getAttribute("style").includes(';font-family:"'), "font is represented as one quoted CSS family");
      if (["Arial", "Microsoft YaHei", "中文字体"].includes(family)) assert.equal(element.style.fontFamily, `"${family}"`);
    } finally { dom.window.close(); }
  }
});

test("invalid or oversized font names use a bounded safe default", () => {
  for (const family of [undefined, null, "", " ", 123, [], {}, "x".repeat(121), "bad\nfont", "bad\0font", "bad\u007ffont"]) {
    const model = ir(); model.pages[0].textBoxes[0].font.family = family;
    const dom = new JSDOM(createPrintableHtml(model));
    try { assert.equal(dom.window.document.querySelector('[data-object-id="title"]').style.fontFamily, '"Arial"'); }
    finally { dom.window.close(); }
  }
});

test("printable HTML is self-contained, fingerprinted, paged, and escaped", () => {
  const model = ir('</div><script src="https://evil.invalid/x.js">alert(1)</script>');
  const html = createPrintableHtml(model);
  assert.match(html, new RegExp(deckIrFingerprint(model)));
  assert.equal((html.match(/class="slide"/g) || []).length, 1);
  assert.doesNotMatch(html, /<script|src="https:\/\/evil/u);
  assert.match(html, /&lt;\/div&gt;&lt;script/);
});

test("PDF inspection enforces regular bounded PDF files and exact page count", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-pdf-test-"));
  try {
    const file = path.join(root, "deck.pdf");
    writePdf(file, 2);
    assert.deepEqual(inspectPdf(file), { pageCount: 2 });
    fs.writeFileSync(file, "not a pdf");
    assert.throws(() => inspectPdf(file), /valid PDF|bounded regular file/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("multi-format gate rejects page and source mismatches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-format-test-"));
  try {
    const model = ir(); const pdfFile = path.join(root, "deck.pdf"); const htmlFile = path.join(root, "deck.html"); const pptxFile = path.join(root, "deck.pptx");
    writePdf(pdfFile, 2); writePptx(pptxFile); fs.writeFileSync(htmlFile, createPrintableHtml(model));
    const result = multiFormatQuality(model, { htmlFile, pptxFile, pdfFile }, { sourceFingerprint: "0".repeat(64) });
    assert.equal(result.passed, false);
    assert.deepEqual(result.checks.map((item) => item.passed), [true, false, false, true]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("LibreOffice resolution validates configuration without exposing it", () => {
  assert.equal(resolveLibreOffice({ COMMON_TOOLS_LIBREOFFICE_BIN: "custom-soffice" }, "linux"), "custom-soffice");
  assert.equal(resolveLibreOffice({}, "linux"), "soffice");
  assert.throws(() => resolveLibreOffice({ LIBREOFFICE_BIN: "bad\ncommand" }, "linux"), /configuration is invalid/);
});

test("single-line OCR text boxes clamp oversized font sizes and use container-relative preview scaling", () => {
  const routerBox = {
    id: "p0-ocr-003",
    text: "品 [2] Router 层",
    wrap: false,
    box: { x: 438.49, y: 74.09, w: 122.41, h: 23.12 },
    font: { family: "Microsoft YaHei", sizePt: 17.91, weight: "bold", color: "#1F2334" },
    style: { wrap: false },
    source: { ocrProvider: "team-pinned-ocr" },
    positionedRuns: [
      { text: "品 ", box: { x: 438.49, y: 74.09, w: 23.89, h: 23.12 } },
      { text: "[2] ", box: { x: 468.82, y: 78.36, w: 24.15, h: 15.72 } },
      { text: "Router ", box: { x: 493.85, y: 78.73, w: 50.85, h: 14.96 } },
      { text: "层", box: { x: 545.6, y: 77.73, w: 15.3, h: 16.47 } }
    ]
  };
  const triggerBox = {
    id: "p0-ocr-001",
    text: "[3]环境事件(Trigger)",
    wrap: false,
    box: { x: 86.2, y: 80.28, w: 129.02, h: 16.59 },
    font: { family: "Microsoft YaHei", sizePt: 14.37, weight: "bold", color: "#191E29" },
    style: { wrap: false },
    source: { ocrProvider: "team-pinned-ocr" }
  };
  assert.equal(effectiveText(routerBox), "[2] Router 层", "leading single-glyph icon noise run is stripped");
  assert.ok(effectiveTextBox(routerBox).x >= 468, "effectiveTextBox starts at the actual text run");
  assert.equal(effectiveTextRotation({ rotation: -1.11, source: { ocrQuadrilateralProjected: true } }), 0, "micro-skew polygon jitter is de-skewed");
  assert.ok(effectiveTextSizePt(routerBox) <= 13.5, "icon-inflated OCR run height is clamped to text run height");
  assert.ok(effectiveTextSizePt(triggerBox) <= 12.5, "single-line OCR text is bounded by box width capacity");
  const model = {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 299 },
    pages: [{ pageIndex: 0, background: { fill: "#FFFFFF" }, shapes: [], tables: [], charts: [], textBoxes: [routerBox, triggerBox] }]
  };
  const previewHtml = createIrPreviewHtml(model);
  assert.match(previewHtml, /container-type:inline-size/);
  assert.match(previewHtml, /font-size:calc\(var\(--font-pt,16\) \/ 960 \* 100cqw\)!important/);
  assert.match(previewHtml, /white-space:nowrap/);
});
