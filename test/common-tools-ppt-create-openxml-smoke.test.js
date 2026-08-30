"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { parsePresentationSpec } = require("../packages/ppt-create-core/spec");
const { buildPptx } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker");
const { listZipEntries, readZipEntry } = require("../skills/pd-hifi-slideclone/scripts/lib/pptx-inventory");
const { inspectPptx } = require("../packages/ppt-quality-core");
const { buildUserTemplateArchiveCase, writeCorpusTemplate } = require("../scripts/lib/ppt-create-template-archive-corpus");

test("ppt-create OpenXML output contains native editable content without raster media", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-create-openxml-"));
  try {
    const input = fs.readFileSync(path.join(__dirname, "fixtures", "ppt-create", "basic.presentation.json"));
    const ir = createDeckIr(parsePresentationSpec(input));
    const irFile = path.join(root, "deck.ir.json");
    const outFile = path.join(root, "deck.pptx");
    fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    buildPptx({ irFile, outFile });

    const entries = listZipEntries(outFile).map((entry) => entry.name);
    assert.deepEqual(entries.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(), ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide3.xml"]);
    assert.equal(entries.some((name) => /^ppt\/media\//.test(name)), false);
    const slide = readZipEntry(outFile, "ppt/slides/slide2.xml").toString("utf8");
    assert.match(slide, /Verified outputs/);
    assert.match(slide, /Text and shapes remain native/);
    assert.match(slide, /<p:sp>/);
    assert.doesNotMatch(slide, /<p:pic>/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("production ppt-create worker forwards an admitted user template to OpenXML", { timeout: 60_000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-create-template-worker-"));
  try {
    const input = fs.readFileSync(path.join(__dirname, "fixtures", "ppt-create", "basic.presentation.json"));
    const ir = createDeckIr(parsePresentationSpec(input)); const irFile = path.join(root, "deck.ir.json");
    const basePptx = path.join(root, "base.pptx"); const templatePptx = path.join(root, "template.pptx"); const outFile = path.join(root, "templated.pptx");
    fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    buildPptx({ irFile, outFile: basePptx }); writeCorpusTemplate(basePptx, templatePptx); buildPptx({ irFile, outFile, templatePptx });
    assert.notDeepEqual(readZipEntry(basePptx, "ppt/slideMasters/slideMaster1.xml"), readZipEntry(templatePptx, "ppt/slideMasters/slideMaster1.xml"));
    assert.match(readZipEntry(outFile, "ppt/slideMasters/slideMaster1.xml").toString("utf8"), /Controlled User Template Corpus/u);
    assert.deepEqual(readZipEntry(outFile, "ppt/slideMasters/slideMaster1.xml"), readZipEntry(templatePptx, "ppt/slideMasters/slideMaster1.xml"));
    assert.notDeepEqual(readZipEntry(basePptx, "ppt/theme/theme1.xml"), readZipEntry(templatePptx, "ppt/theme/theme1.xml"));
    assert.deepEqual(readZipEntry(outFile, "ppt/theme/theme1.xml"), readZipEntry(templatePptx, "ppt/theme/theme1.xml"));
    assert.equal(inspectPptx(outFile).slideCount, ir.pages.length);
    const before = fs.readFileSync(templatePptx);
    assert.throws(() => writeCorpusTemplate(basePptx, templatePptx), /already exists/u);
    assert.deepEqual(fs.readFileSync(templatePptx), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("template archive corpus rejects valid but template-free builder output", { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-template-negative-"));
  try {
    const ir = createDeckIr(parsePresentationSpec(fs.readFileSync(path.join(__dirname, "fixtures", "ppt-create", "basic.presentation.json"))));
    const irFile = path.join(root, "base.ir.json"); const templatePptx = path.join(root, "base.pptx");
    fs.writeFileSync(irFile, JSON.stringify(ir), { flag: "wx" }); buildPptx({ irFile, outFile: templatePptx });
    await assert.rejects(() => buildUserTemplateArchiveCase(root, templatePptx, {
      buildPptx: ({ outFile }) => fs.copyFileSync(templatePptx, outFile, fs.constants.COPYFILE_EXCL),
      renderLibreOffice: () => assert.fail("a dropped template must fail before renderer validation")
    }), /template master was not preserved/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("ppt-create writes citations as editable footer text and speaker notes as native notes slides", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ppt-notes-"));
  try {
    const spec = { version: "1.0", title: "Source-backed deck", slides: [{ id: "cover", role: "cover", title: "Source-backed deck" }, { id: "facts", role: "content", title: "Verified facts", items: [{ id: "fact", label: "Measured outcome" }], speakerNotes: "Explain the measurement boundary.", citations: [{ id: "source-1", title: "Primary measurement report", locator: "https://example.com/report", accessedAt: "2026-08-28", license: "authorized reference" }] }] };
    const ir = createDeckIr(spec); const irFile = path.join(root, "deck.ir.json"); const outFile = path.join(root, "deck.pptx"); fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 }); buildPptx({ irFile, outFile });
    const entries = listZipEntries(outFile).map((entry) => entry.name); assert.ok(entries.includes("ppt/notesSlides/notesSlide1.xml")); assert.ok(entries.includes("ppt/notesMasters/notesMaster1.xml")); assert.equal(inspectPptx(outFile).notesCount, 1);
    const slide = readZipEntry(outFile, "ppt/slides/slide2.xml").toString("utf8"); assert.match(slide, /\[1\] Primary measurement report/);
    const notes = readZipEntry(outFile, "ppt/notesSlides/notesSlide1.xml").toString("utf8"); assert.match(notes, /Explain the measurement boundary/); assert.match(notes, /https:\/\/example.com\/report/);
    assert.match(notes, /ph type="sldImg"/); assert.match(notes, /ph type="body" idx="3"/); assert.match(notes, /ph type="sldNum"[^>]*idx="5"/);
    const notesMaster = readZipEntry(outFile, "ppt/notesMasters/notesMaster1.xml").toString("utf8"); assert.match(notesMaster, /ph type="hdr"/); assert.match(notesMaster, /ph type="dt" idx="1"/); assert.match(notesMaster, /ph type="body"[^>]*idx="3"/); assert.match(notesMaster, /ph type="ftr"[^>]*idx="4"/);
    const notesMasterRelationships = readZipEntry(outFile, "ppt/notesMasters/_rels/notesMaster1.xml.rels").toString("utf8"); assert.match(notesMasterRelationships, /Target="[^"]*theme2.xml"/); assert.doesNotMatch(notesMasterRelationships, /Target="[^"]*theme1.xml"/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
