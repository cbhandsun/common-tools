"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const {runBuilder, invokeBuilder} = require("./helpers/openxml-contract-fixtures");
const {readZipEntry} = require("../packages/ooxml-core/pptx-inventory");
const repo = path.resolve(__dirname, "..");

function workspace(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, "native-line-cap-"));
  t.after(() => { assert.equal(path.dirname(path.resolve(root)), parent); assert.ok(path.basename(root).startsWith("native-line-cap-")); fs.rmSync(root, {recursive:true, force:true}); });
  return {root, ir:path.join(root, "deck.json"), out:path.join(root, "deck.pptx")};
}
function deck(style = {}) {
  return {version:"1.0", slideSize:{widthPt:240, heightPt:180}, pages:[{pageIndex:0, textBoxes:[], images:[], tables:[], charts:[],
    shapes:[{id:"route", type:"line", box:{x:20,y:40,w:180,h:0}, style:{stroke:"#123456",strokeWidthPt:2,...style}}]}]};
}
function slide(file, index = 1) { return readZipEntry(file, `ppt/slides/slide${index}.xml`).toString("utf8"); }

test("explicit round, flat and square caps survive the actual writer across connector and native path outlines", {timeout:60000}, t => {
  const w = workspace(t), data = deck(), expected = [];
  data.pages = [];
  for (const cap of ["round", "flat", "square"]) for (const kind of ["line", "polyline", "freeform", "rect"]) {
    const shape = deck({lineCap:cap}).pages[0].shapes[0]; shape.type = kind;
    if (kind === "polyline" || kind === "freeform") {
      shape.box.h = 40;
      shape.style.freeformSegments = [{type:"moveTo",points:[{x:0,y:0}]},{type:"lnTo",points:[{x:1,y:1}]}];
      shape.style.closePath = false; shape.style.fill = "none";
    }
    data.pages.push({...deck().pages[0],pageIndex:data.pages.length,shapes:[shape]}); expected.push(cap === "square" ? "sq" : cap === "round" ? "rnd" : "flat");
  }
  fs.writeFileSync(w.ir, JSON.stringify(data)); runBuilder(["--ir",w.ir,"--out",w.out]);
  for (const [index, cap] of expected.entries()) assert.match(slide(w.out,index+1), new RegExp(`<a:ln\\b[^>]*cap="${cap}"`, "u"));
});

test("source dash intervals, gradients, arrows and real anchors are preserved with an explicit flat cap", {timeout:60000}, t => {
  const w = workspace(t), data = deck({lineCap:"flat",strokeDashPattern:"[[3,0.5],[4,1],[2,0.5]]",
    strokeGradient:{type:"linear",angleDeg:90,stops:[{position:0,color:"#123456"},{position:1,color:"#789ABC"}]},
    endArrow:"triangle",endArrowWidth:"medium",endArrowLength:"medium",
    startAnchor:{elementId:"from",side:"right",position:.5},endAnchor:{elementId:"to",side:"left",position:.5}});
  data.pages[0].shapes.unshift({id:"from",type:"rect",box:{x:0,y:20,w:20,h:40},style:{fill:"#FFFFFF",stroke:"none"}},
    {id:"to",type:"rect",box:{x:200,y:20,w:20,h:40},style:{fill:"#FFFFFF",stroke:"none"}});
  fs.writeFileSync(w.ir, JSON.stringify(data)); runBuilder(["--ir",w.ir,"--out",w.out]);
  const xml = slide(w.out), connector = /<p:cxnSp\b[\s\S]*?<\/p:cxnSp>/u.exec(xml)?.[0]; assert.ok(connector);
  assert.match(connector, /<a:ln\b[^>]*cap="flat"/u); assert.equal((connector.match(/<a:ds /gu)||[]).length,3);
  assert.match(connector, /<a:ds d="300000" sp="50000"/u); assert.match(connector, /<a:ds d="400000" sp="100000"/u);
  assert.match(connector, /<a:lin\b[^>]*ang="5400000"/u); assert.match(connector, /<a:tailEnd\b[^>]*type="triangle"/u);
  assert.match(connector, /<a:stCxn id="2"/u); assert.match(connector, /<a:endCxn id="3"/u);
});

test("absent caps preserve the legacy default while valid nonpainted styles remain accepted", {timeout:60000}, t => {
  const w = workspace(t);
  for (const style of [{}, {stroke:"none",lineCap:"round"}]) {
    fs.writeFileSync(w.ir, JSON.stringify(deck(style))); runBuilder(["--ir",w.ir,"--out",w.out]);
    assert.doesNotMatch(slide(w.out), /<a:ln\b[^>]*cap=/u);
  }
});

test("invalid, empty, extreme and hostile explicit cap values fail with a fixed public error, including no-fill paths", {timeout:60000}, t => {
  const w = workspace(t);
  for (const cap of [null,true,0,1e100,[],{},"","ROUND","butt"," round ","private-secret/path","<script>","x".repeat(32000)]) {
    for (const stroke of ["#123456","none"]) {
      fs.writeFileSync(w.ir, JSON.stringify(deck({stroke,lineCap:cap})));
      const result = invokeBuilder(["--ir",w.ir,"--out",w.out]); assert.notEqual(result.status,0);
      assert.match(result.stderr, /Native line cap is invalid/u); assert.doesNotMatch(result.stderr, /private-secret|<script>/u);
    }
  }
});

test("duplicate and alternate-case cap properties cannot silently override the declared style", {timeout:60000}, t => {
  const w = workspace(t);
  for (const property of ['"lineCap":"flat","lineCap":"round"','"LineCap":"round"','"lineCap":"flat","LINECAP":"round"']) {
    const raw = JSON.stringify(deck({lineCap:"flat"})).replace('"lineCap":"flat"',property);
    fs.writeFileSync(w.ir, raw); const result = invokeBuilder(["--ir",w.ir,"--out",w.out]);
    assert.notEqual(result.status,0); assert.match(result.stderr,/Native line cap is invalid/u);
  }
});

test("line-cap regressions enter contract and unified CI discovery with the required runtime source", () => {
  const {discoverTestFiles} = require("../scripts/test-sharded");
  const file = "test/openxml-native-line-cap-contract.test.js";
  for (const suite of ["contract","all"]) assert.ok(discoverTestFiles(repo,suite).some(row=>row.file.replaceAll("\\","/")===file));
  assert.ok(fs.readFileSync(path.join(repo,"scripts/verify-runtime-package.js"),"utf8").includes('"packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeLineCap.cs"'));
});
