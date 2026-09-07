"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { createPrintableHtml, deckIrFingerprint, inspectPdf, multiFormatQuality } = require("../packages/ppt-create-core/export");
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
