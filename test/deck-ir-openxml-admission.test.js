"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {validateDeckIr} = require("../packages/slideclone-core/team-worker");
const {promoteNativeChartPayload} = require("../packages/slideclone-core/chart-native-payload");
const {invokeBuilder, createMinimalDeckIr} = require("./helpers/openxml-contract-fixtures");
const {readZipEntryText, readZipEntries, readZipEntry} = require("../packages/slideclone-core/pptx-zip");

test("admitted Unicode text, native chart and placeholder data build as actual OpenXML", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-admission-openxml-"));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const input = createMinimalDeckIr("Unicode 中文 😀");
  input.pages[0].textBoxes[0].id = "body";
  input.pages[0].intent = {templatePlaceholderBindings:[{objectId:"body", collection:"textBoxes", placeholderType:"body", placeholderIndex:0}]};
  const chart = {id:"native-chart", type:"column", box:{x:50,y:150,w:400,h:250}, categories:["A","B"], values:[1,2]};
  chart.nativePayload = promoteNativeChartPayload(chart);
  input.pages[0].charts = [chart];
  assert.equal(validateDeckIr(input, root).pages, 1);
  const ir = path.join(root, "deck.json"), output = path.join(root, "deck.pptx");
  fs.writeFileSync(ir, JSON.stringify(input));
  const result = invokeBuilder(["--ir",ir,"--out",output]);
  assert.equal(result.status, 0, "Validated input must build successfully");
  const page = readZipEntryText(output, "ppt/slides/slide1.xml");
  assert.ok(page.includes("Unicode 中文 😀"));
  assert.match(page, /<p:ph[^>]*type="body"/u);
  const names = readZipEntries(fs.readFileSync(output)).map(entry => entry.name);
  const charts = names.filter(name => /\/charts\/chart\d+\.xml$/u.test(name));
  assert.equal(charts.length, 1);
  assert.match(readZipEntryText(output, charts[0]), /<c:externalData/u);
  const embeddedName = names.find(name => /\/embeddings\//u.test(name));
  assert.ok(embeddedName);
  const embedded = readZipEntry(fs.readFileSync(output), embeddedName);
  assert.ok(embedded);
  const workbookEntries = readZipEntries(embedded).map(entry => entry.name);
  assert.ok(workbookEntries.includes("xl/workbook.xml"));
  assert.ok(workbookEntries.includes("xl/worksheets/sheet1.xml"));
});

test("malformed XML text, native payload and bindings stop before launching OpenXML", () => {
  const valid = createMinimalDeckIr("normal text");
  const badInputs = [];
  for (const text of ["bad\u0001", "bad\ud800", "bad\uffff"]) {
    const input=structuredClone(valid); input.pages[0].textBoxes[0].text=text; badInputs.push(input);
  }
  const chart=structuredClone(valid);
  chart.pages[0].charts=[{id:"invalid-chart",type:"column",box:{x:0,y:0,w:100,h:100},values:[1],nativePayload:{}}];
  badInputs.push(chart);
  const bindings=structuredClone(valid);
  bindings.pages[0].intent={templatePlaceholderBindings:[{objectId:"body",collection:"shapes",placeholderType:"unknown",placeholderIndex:0}]};
  badInputs.push(bindings);
  for (const input of badInputs) {
    assert.throws(() => {
      validateDeckIr(input, os.tmpdir());
      assert.fail("Invalid input reached the builder boundary");
    }, error => /^editable deck (?:contains an invalid string|native chart payload is invalid|template placeholder binding is invalid)$/u.test(error.message));
  }
});
