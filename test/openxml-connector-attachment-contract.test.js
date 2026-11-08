"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildOpenXmlDecksSync } = require("../packages/slideclone-core/pptx-openxml-dotnet");
const { readZipEntryText } = require("../packages/ooxml-core/pptx-zip");

test("positioned text ports bind existing children and preserve exact terminals without proxy shapes", {timeout:120000}, () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'positioned-port-'));
  const text=(id,x,rotation=0)=>({id,text:'AB',box:{x,y:40,w:80,h:30},rotation,wrap:false,
    font:{family:'Arial',sizePt:12},style:{wrap:false,fit:'none',textWarp:'textPlain'},
    positionedRuns:[{text:'A',box:{x:x+5,y:45,w:20,h:20}},{text:'B',box:{x:x+50,y:45,w:20,h:20}}]});
  const targets=[text('words',20),text('rotated-words',300,90)];
  const ports=[['right',1,10,4],['left',0,-10,-4],['top',.5,0,-10],['bottom',.5,0,10]];
  const shapes=ports.map(([side,position,dxPt,dyPt],i)=>({id:`group-edge-${i}`,type:'line',box:{x:100,y:80,w:100,h:0},
    style:{stroke:'#111111',startAnchor:{elementId:'words',side,position,dxPt,dyPt,siteOffsetKind:'source-visible-diagonal-gap'}}}));
  shapes.push({id:'rotated-edge',type:'line',box:{x:100,y:80,w:100,h:0},style:{startAnchor:{elementId:'rotated-words',side:'right'}}});
  const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
  fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,shapes,textBoxes:targets,images:[],tables:[],charts:[]}]}));
  buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'..','skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
  const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml');
  const children=[...xml.matchAll(/<p:sp>.*?<\/p:sp>/gs)].map(m=>m[0]);
  assert.equal(children.length,4,'no proxy drawings');
  const ids=children.filter(c=>/name="words-position-/.test(c)).map(c=>c.match(/<p:cNvPr id="(\d+)"/)[1]);
  for(const m of xml.matchAll(/<p:cxnSp>.*?<\/p:cxnSp>/gs)){
    if(m[0].includes('name="rotated-edge"'))assert.doesNotMatch(m[0],/<a:stCxn/);
    else assert.ok(ids.includes(m[0].match(/<a:stCxn id="(\d+)"/)?.[1]));
  }
  assert.match(children.find(c=>c.includes('name="words-position-2"')),/fmla="\*\/ w 508000 254000"/);
});

test("OpenXML connectors attach forward references to actual emitted rectangle IDs", { timeout: 120000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connector-attachment-"));
  const irFile = path.join(root, "deck.json"), outFile = path.join(root, "deck.pptx");
  const anchor = (elementId, side, position = 0.5) => ({ elementId, side, position });
  const edge = (id, startAnchor, endAnchor) => ({ id, type: "line", box: { x: 100, y: 60, w: 200, h: 0 },
    style: { stroke: "#111111", startAnchor, endAnchor } });
  const shapes = [
    edge("edge", anchor("left", "right"), anchor("right", "left")),
    edge("offset", anchor("left", "right", 0.2), anchor("right", "left")),
    edge("missing", anchor("absent", "right"), anchor("right", "left")),
    edge("no-anchor", undefined, undefined),
    edge("invalid", { elementId: "left", side: "right", position: "0.5" }, { elementId: "right", side: "unknown" }),
    edge("translated", { ...anchor("left", "right"), dxPt: 1 }, anchor("rotated", "left")),
    edge("self", anchor("self", "right"), anchor("ellipse", "left")),
    edge("empty", {}, {}),
    { id: "left", type: "rect", box: { x: 20, y: 40, w: 80, h: 40 }, style: { fill: "#FFFFFF" } },
    { id: "right", type: "rect", box: { x: 300, y: 40, w: 80, h: 40 }, style: { fill: "#FFFFFF" } },
    { id: "rotated", type: "rect", box: { x: 300, y: 100, w: 80, h: 40 }, style: { rotation: 90 } },
    { id: "ellipse", type: "ellipse", box: { x: 300, y: 160, w: 80, h: 40 }, style: {} }
  ];
  fs.writeFileSync(irFile, JSON.stringify({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, shapes, textBoxes: [], images: [], tables: [], charts: [] }] }));
  buildOpenXmlDecksSync([{ irFile, outFile }], { skillRoot: path.join(__dirname, "..", "skills/pd-hifi-slideclone"), config: { openXmlBuilder: { cache: false } } });
  const xml = readZipEntryText(outFile, "ppt/slides/slide1.xml");
  const id = name => xml.match(new RegExp(`<p:cNvPr id="(\\d+)" name="${name}"`))[1];
  const connector = name => [...xml.matchAll(/<p:cxnSp>.*?<\/p:cxnSp>/gs)].map(match => match[0]).find(part => part.includes(`name="${name}"`));
  assert.match(connector("edge"), new RegExp(`<a:stCxn id="${id("left")}" idx="3"`));
  assert.match(connector("edge"), new RegExp(`<a:endCxn id="${id("right")}" idx="1"`));
  // Fractional sites preserve their position through a custom rectangle;
  // earlier midpoint references retain the original preset indices.
  assert.match(connector("offset"), new RegExp(`<a:stCxn id="${id("left")}" idx="4"`));
  assert.doesNotMatch(connector("missing"), /<a:stCxn/);
  assert.doesNotMatch(connector("no-anchor"), /<a:(stCxn|endCxn)/);
  for (const name of ["invalid", "translated", "self", "empty"]) assert.doesNotMatch(connector(name), /<a:(stCxn|endCxn)/, name);
});

test("measured fractional ports attach to custom source geometry without snapping endpoints", { timeout: 120000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connector-source-port-"));
  const irFile = path.join(root, "deck.json"), outFile = path.join(root, "deck.pptx");
  const polygon = [{ type: "moveTo", points: [{ x: 0, y: 0 }] },
    { type: "lnTo", points: [{ x: 1, y: 0 }] }, { type: "lnTo", points: [{ x: 1, y: 1 }] },
    { type: "lnTo", points: [{ x: 0, y: 1 }] }, { type: "close", points: [] }];
  const port = (elementId, position) => ({ elementId, side: "right", position });
  const shapes = [
    { id: "measured", type: "line", box: { x: 100, y: 50, w: 200, h: 0 }, style: {
      stroke: "#111111", startAnchor: port("source-outline", .25),
      endAnchor: { elementId: "target-rectangle", side: "left", position: .25 } } },
    { id: "repeat", type: "line", box: { x: 100, y: 50, w: 200, h: 0 }, style: {
      stroke: "#111111", startAnchor: port("source-outline", .25) } },
    ...[-1, 2, "0.25", null].map((position, index) => ({ id: `invalid-port-${index}`, type: "line",
      box: { x: 100, y: 50, w: 20, h: 0 }, style: { stroke: "#111111", startAnchor: port("source-outline", position) } })),
    { id: "outside-offset", type: "line", box: { x: 100, y: 50, w: 20, h: 0 }, style: {
      stroke: "#111111", startAnchor: { ...port("source-outline", .25), dxPt: 2 } } },
    { id: "source-outline", type: "freeform", box: { x: 20, y: 40, w: 80, h: 40 }, style: {
      fill: "#DDEEFF", freeformSegments: polygon } },
    { id: "target-rectangle", type: "rect", box: { x: 300, y: 40, w: 80, h: 40 }, style: { fill: "#FFFFFF" } }
  ];
  fs.writeFileSync(irFile, JSON.stringify({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, shapes, textBoxes: [], images: [], tables: [], charts: [] }] }));
  buildOpenXmlDecksSync([{ irFile, outFile }], { skillRoot: path.join(__dirname, "..", "skills/pd-hifi-slideclone"), config: { openXmlBuilder: { cache: false } } });
  const xml = readZipEntryText(outFile, "ppt/slides/slide1.xml");
  const objects = [...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(match => match[0]);
  const drawing = name => objects.find(part => part.includes(`name="${name}"`));
  const id = name => drawing(name).match(/<p:cNvPr id="(\d+)"/)[1];
  const start = drawing("measured").match(/<a:stCxn id="(\d+)" idx="(\d+)"/);
  assert.ok(start, "a measured source outline must receive an actual Office connection");
  assert.equal(start[1], id("source-outline"));
  assert.match(drawing("repeat"), new RegExp(`<a:stCxn id="${start[1]}" idx="${start[2]}"`));
  assert.match(drawing("measured"), new RegExp(`<a:endCxn id="${id("target-rectangle")}" idx="4"`));
  assert.equal((drawing("source-outline").match(/<a:cxn /g) || []).length, 1);
  assert.match(drawing("source-outline"), /fmla="\*\/ h 127000 508000"/);
  assert.match(drawing("source-outline"), /<a:off x="254000" y="508000"/);
  assert.match(drawing("measured"), /<a:off x="1270000" y="635000"/);
  for (const name of ["outside-offset", ...[-1, 2, "0.25", null].map((_, i) => `invalid-port-${i}`)]) {
    assert.doesNotMatch(drawing(name), /<a:stCxn/, name);
  }
});

test("custom connection sites remain bounded and reject transformed or malformed target ports", { timeout: 120000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connector-port-boundary-"));
  const irFile = path.join(root, "deck.json"), outFile = path.join(root, "deck.pptx");
  const polygon = [{ type: "moveTo", points: [{ x: 0, y: 0 }] },
    { type: "lnTo", points: [{ x: 1, y: 0 }] }, { type: "lnTo", points: [{ x: 1, y: 1 }] },
    { type: "lnTo", points: [{ x: 0, y: 1 }] }, { type: "close", points: [] }];
  const target = (id, style = {}) => ({ id, type: "freeform", box: { x: 20, y: 40, w: 80, h: 40 },
    style: { fill: "#DDEEFF", freeformSegments: polygon, ...style } });
  const edge = (id, anchor) => ({ id, type: "line", box: { x: 100, y: 50, w: 200, h: 0 },
    style: { stroke: "#111111", startAnchor: anchor } });
  const shapes = Array.from({ length: 65 }, (_, index) => edge(`bounded-${index}`, {
    elementId: "many-ports", side: "right", position: (index + 1) / 66 }));
  for (const [id, anchor] of [
    ["rotated-port", { elementId: "rotated", side: "right", position: .25 }],
    ["flipped-port", { elementId: "flipped", side: "right", position: .25 }],
    ["bad-side", { elementId: "ordinary", side: "center", position: .25 }],
    ["bad-offset", { elementId: "ordinary", side: "right", position: .25, dxPt: "1" }],
    ["huge-offset", { elementId: "ordinary", side: "right", position: .25, dyPt: 10000 }],
    ["empty-port", {}], ["missing-port", { elementId: "absent", side: "right" }]
  ]) shapes.push(edge(id, anchor));
  shapes.push(target("many-ports"), target("ordinary"), target("rotated", { rotation: 90 }), target("flipped", { flipH: true }));
  fs.writeFileSync(irFile, JSON.stringify({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, shapes, textBoxes: [], images: [], tables: [], charts: [] }] }));
  buildOpenXmlDecksSync([{ irFile, outFile }], { skillRoot: path.join(__dirname, "..", "skills/pd-hifi-slideclone"), config: { openXmlBuilder: { cache: false } } });
  const xml = readZipEntryText(outFile, "ppt/slides/slide1.xml");
  const objects = [...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(match => match[0]);
  const drawing = name => objects.find(part => part.includes(`name="${name}"`));
  assert.equal((drawing("many-ports").match(/<a:cxn /g) || []).length, 64);
  assert.match(drawing("bounded-63"), /<a:stCxn .*?idx="63"/);
  for (const id of ["bounded-64", "rotated-port", "flipped-port", "bad-side", "bad-offset", "huge-offset", "empty-port", "missing-port"]) {
    assert.doesNotMatch(drawing(id), /<a:stCxn/, id);
  }
  assert.doesNotMatch(drawing("ordinary"), /<a:cxn /);
});

test("unrepresentable anchor coordinates fail the package gate instead of producing a successful deck", { timeout: 120000 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "connector-port-overflow-"));
  const irFile = path.join(root, "deck.json"), outFile = path.join(root, "deck.pptx");
  fs.writeFileSync(irFile, JSON.stringify({ version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, shapes: [
      { id: "overflow", type: "line", box: { x: 100, y: 50, w: 200, h: 0 }, style: {
        stroke: "#111111", startAnchor: { elementId: "target", side: "right", position: .25, dyPt: 1e300 } } },
      { id: "target", type: "rect", box: { x: 20, y: 40, w: 80, h: 40 }, style: { fill: "#FFFFFF" } }
    ], textBoxes: [], images: [], tables: [], charts: [] }] }));
  assert.throws(() => buildOpenXmlDecksSync([{ irFile, outFile }], {
    skillRoot: path.join(__dirname, "..", "skills/pd-hifi-slideclone"), config: { openXmlBuilder: { cache: false } }
  }), /Generated PPTX is not valid Open XML/);
});

