"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { validateEditableIr, createIrPreviewHtml, applyIrEditorPatch, exportEditedIrArtifacts } = require("../packages/ppt-create-core/ir-editor");
const { deckIrFingerprint } = require("../packages/ppt-create-core/export");

function deck(text) {
  const box = { x: 10, y: 10, w: 80, h: 40 };
  return { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0,
    textBoxes: [{ id: "text", text, box }],
    tables: [{ id: "table", box, rows: [[text]] }],
    charts: [{ id: "chart", box, type: "bar", categories: [text], series: [{ name: text, values: [1] }] }]
  }] };
}

const fields = [
  ["text", (ir, value) => { ir.pages[0].textBoxes[0].text = value; }],
  ["table", (ir, value) => { ir.pages[0].tables[0].rows[0][0] = value; }],
  ["category", (ir, value) => { ir.pages[0].charts[0].categories[0] = value; }],
  ["series", (ir, value) => { ir.pages[0].charts[0].series[0].name = value; }]
];

for (const [name, set] of fields) test(`editable ${name} rejects XML-invalid text before preview`, () => {
  for (const invalid of ["\u0001", "\u000b", "\ufffe", "\uffff", "\ud800", "\udfff", "\ud800X", "X\udfff"]) {
    const ir = deck("valid"); set(ir, `private-content${invalid}`);
    for (const operation of [validateEditableIr, createIrPreviewHtml]) assert.throws(() => operation(ir), error => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message.includes("private-content"), false);
      return true;
    });
  }
});

test("editable XML text preserves empty, multilingual, escaped and supplementary text", () => {
  for (const text of ["", "中文 & < > \" ' café", "\tline\r\nnext", "emoji 😀 𠮷", "\u0085\ue000\ufffd", "\udbff\udfff"]) {
    const ir = deck(text); const before = structuredClone(ir);
    assert.equal(validateEditableIr(ir), ir);
    assert.deepEqual(ir, before);
  }
});

test("text patch rejects invalid XML and preserves the original deck", () => {
  const ir = deck("original"); const before = structuredClone(ir);
  assert.throws(() => applyIrEditorPatch(ir, { version: "1.0", expectedRevision: deckIrFingerprint(ir), operations: [{ type: "set-text", pageIndex: 0, objectId: "text", value: "bad\ufffe" }] }), /invalid/u);
  assert.deepEqual(ir, before);
});

test("invalid XML text never reaches artifact builders or creates output", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editable-xml-text-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "deck.json"); const output = path.join(root, "out");
  fs.writeFileSync(input, JSON.stringify(deck("bad\ufffe")));
  let builds = 0;
  assert.throws(() => exportEditedIrArtifacts({ workspaceRoot: root, input, output, buildPptx() { builds++; }, buildPdf() { builds++; } }), /invalid/u);
  assert.equal(builds, 0);
  assert.equal(fs.existsSync(output), false);
});
