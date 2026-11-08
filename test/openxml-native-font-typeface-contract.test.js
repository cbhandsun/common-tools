"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMinimalDeckIr, runBuilder, invokeBuilder } = require("./helpers/openxml-contract-fixtures");
const { readZipEntry } = require("../packages/ooxml-core/pptx-inventory");

function build(t, families, runs = false, table = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-font-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = createMinimalDeckIr("字体 identity"), original = deck.pages[0].textBoxes[0];
  deck.pages[0].textBoxes = families.map((family, index) => ({ ...structuredClone(original), id: `face-${index}`,
    font: { ...original.font, family }, ...(runs ? { runs: [{ text: "字体 identity", font: { ...original.font, family } }] } : {}) }));
  if (table) {
    deck.pages[0].textBoxes = [];
    deck.pages[0].tables = [{ id: "table", box: { x: 100, y: 100, w: 400, h: 100 }, rows: [["字体 identity"]], style: { fontFamily: families[0] } }];
  }
  const file = path.join(root, "deck.json"), out = path.join(root, "deck.pptx");
  fs.writeFileSync(file, JSON.stringify(deck));
  runBuilder(["--ir", file, "--out", out]);
  return readZipEntry(out, "ppt/slides/slide1.xml").toString("utf8");
}

test("native text and rich runs retain the requested Windows font face through localized aliases", { timeout: 120000 }, t => {
  const aliases = [["DengXian", "等线"], ["dengxian light", "等线 Light"], ["KaiTi", "楷体"],
    ["STKaiti", "华文楷体"], ["STXingkai", "华文行楷"], ["stxihei", "华文细黑"],
    ["STXinwei", "华文新魏"], ["FangSong", "仿宋"],
    ["STFangsong", "华文仿宋"], ["YouYuan", "幼圆"], ["LiSu", "隶书"]];
  for (const runs of [false, true]) {
    const xml = build(t, aliases.map(pair => pair[0]), runs);
    for (const [family, local] of aliases) {
      const actual = process.platform === "win32" ? local : family;
      assert.equal((xml.match(new RegExp(`typeface="${actual}"`, "gu")) || []).length, 3);
    }
    assert.match(xml, /字体 identity/u);
    assert.doesNotMatch(xml, /<p:pic[ >]|<a:custGeom[ >]/u);
  }
});

test("unknown, Latin, already-localized and installed working faces remain unchanged", { timeout: 60000 }, t => {
  const families = ["Microsoft YaHei", "Arial", "Noto Sans CJK SC", "Custom font", "楷体", "DengXian Extended",
    "STXihei Extended", "STXinwei Extended", "华文细黑", "华文新魏", "SimHei"];
  const xml = build(t, families);
  for (const family of families) assert.equal((xml.match(new RegExp(`typeface="${family}"`, "gu")) || []).length, 3);
});

test("empty font family adds no face and native table fonts use the same resolver", { timeout: 60000 }, t => {
  const xml = build(t, ["", "   "]);
  assert.doesNotMatch(xml, /typeface=/u);
  const table = build(t, ["DengXian"], false, true);
  assert.match(table, /<a:tbl>/u);
  assert.equal((table.match(new RegExp(`typeface="${process.platform === "win32" ? "等线" : "DengXian"}"`, "gu")) || []).length, 3);
  assert.match(table, /字体 identity/u);
});

test("font names containing XML markup remain literal native attributes", { timeout: 60000 }, t => {
  const xml = build(t, ['family"&<face>']);
  assert.equal((xml.match(/typeface="family&quot;&amp;&lt;face&gt;"/gu) || []).length, 3);
  assert.doesNotMatch(xml, /<face>/u);
});

test("native fonts preserve independent Latin, East Asian and complex script faces in ordinary and rich text",{timeout:60000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-script-font-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const deck=createMinimalDeckIr("字体 identity"),text=deck.pages[0].textBoxes[0];
 Object.assign(text.font,{family:"Microsoft YaHei",latinFamily:"Arial",eastAsianFamily:"KaiTi",complexScriptFamily:'family"&<face>'});
 const file=path.join(root,"deck.json"),out=path.join(root,"deck.pptx");
 for(const rich of [false,true]){
  if(rich)text.runs=[{text:text.text,font:{eastAsianFamily:"YouYuan"}}];
  fs.writeFileSync(file,JSON.stringify(deck));runBuilder(["--ir",file,"--out",out]);const xml=readZipEntry(out,"ppt/slides/slide1.xml").toString("utf8");
  assert.match(xml,/<a:latin typeface="Arial"/u);
  const requested=rich?"YouYuan":"KaiTi",localized=rich?"幼圆":"楷体";
  assert.match(xml,new RegExp(`<a:ea typeface="${process.platform==="win32"?localized:requested}"`,"u"));
  assert.match(xml,/<a:cs typeface="family&quot;&amp;&lt;face&gt;"/u);
 }
 delete text.runs;
 for(const key of ["latinFamily","eastAsianFamily","complexScriptFamily"]){
  const prior=text.font[key];for(const value of [false,{},"", " ","bad\nfont","x".repeat(257)]){
   text.font[key]=value;fs.writeFileSync(file,JSON.stringify(deck));assert.notEqual(invokeBuilder(["--ir",file,"--out",out]).status,0);
  }text.font[key]=prior;
 }
});
