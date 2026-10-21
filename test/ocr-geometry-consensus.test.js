"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {geometryReviewTargets,geometryReviewSheet,applyGeometryConsensus}=require("../packages/slideclone-core/ocr-geometry-consensus");
function fixture(){const image={width:100,height:100,rgba:Buffer.alloc(40000,255)};
for(let y=24;y<40;y++)for(let x=24;x<44;x++)image.rgba.set([17,17,17,255],(y*100+x)*4);
for(let y=48;y<90;y++)for(let x=32;x<35;x++)image.rgba.set([17,17,17,255],(y*100+x)*4);
return {image,ocr:{lines:[{text:"字",confidence:0.99,box:{x:20,y:20,w:30,h:30}}]}};}
function observation(image,ocr,padding,box={x:22,y:22,w:24,h:22}){const sheet=geometryReviewSheet(image,ocr.lines,[0],padding),p=sheet.placements[0];
return {placements:sheet.placements,ocr:{lines:[{text:"字",confidence:0.98,box:{x:box.x-p.box.x+p.x,y:box.y-p.box.y+p.y,w:box.w,h:box.h}}]}};}
test("geometry consensus removes icon contamination from a true word without relaxing text ownership",()=>{
 const {image,ocr}=fixture(),original=Buffer.from(image.rgba);assert.deepEqual(geometryReviewTargets(image,ocr),[0]);
 const result=applyGeometryConsensus(ocr,[observation(image,ocr,0),observation(image,ocr,8)],{widthPx:100,heightPx:100});
 assert.equal(result.revised,1);assert.equal(result.ocr.lines[0].text,"字");assert.equal(result.ocr.lines[0].confidence,0.98);
 assert.deepEqual(geometryReviewTargets(image,result.ocr),[]);assert.deepEqual(image.rgba,original);
});
test("geometry consensus preserves content when observations disagree or change the text",()=>{
 const {image,ocr}=fixture();const a=observation(image,ocr,0),b=observation(image,ocr,8);
 b.ocr.lines[0].text="other";assert.equal(applyGeometryConsensus(ocr,[a,b],{widthPx:100,heightPx:100}).revised,0);
 b.ocr.lines[0].text="字";b.ocr.lines[0].box.y+=30;assert.equal(applyGeometryConsensus(ocr,[a,b],{widthPx:100,heightPx:100}).revised,0);
 assert.throws(()=>applyGeometryConsensus(ocr,[a],{widthPx:100,heightPx:100}),/two observations/);
});
test("geometry sheet has exact pixel mapping and rejects duplicate, missing and oversized requests",()=>{
 const {image,ocr}=fixture(),sheet=geometryReviewSheet(image,ocr.lines,[0],8),p=sheet.placements[0];
 assert.deepEqual([...sheet.image.rgba.subarray(((24-p.box.y+p.y)*sheet.image.width+24-p.box.x+p.x)*4,((24-p.box.y+p.y)*sheet.image.width+24-p.box.x+p.x)*4+4)],[17,17,17,255]);
 for(const targets of [[0,0],[-1],[999],Array.from({length:33},(_,i)=>i)])assert.throws(()=>geometryReviewSheet(image,ocr.lines,targets,8));
 assert.throws(()=>geometryReviewSheet(image,ocr.lines,[0],Infinity));
 const huge={width:2000,height:2000,rgba:Buffer.alloc(16000000,255)};
 assert.throws(()=>geometryReviewSheet(huge,[{text:"large",confidence:1,box:{x:0,y:0,w:1900,h:1900}}],[0],8),/budget/);
 assert.deepEqual(applyGeometryConsensus(ocr,[{placements:[],ocr:{lines:[]}},{placements:[],ocr:{lines:[]}}],{widthPx:100,heightPx:100}).ocr,ocr);
});
test("batched geometry crops do not become a long strip that forces detector downsampling",()=>{
 const {image,ocr}=fixture();const lines=Array.from({length:16},()=>ocr.lines[0]);
 const sheet=geometryReviewSheet(image,lines,lines.map((_,i)=>i),0,2);
 assert.ok(sheet.image.height<=512);assert.ok(sheet.image.width<=512);
 for(const p of sheet.placements){
  const x=p.x+(24-p.box.x)*2,y=p.y+(24-p.box.y)*2;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)assert.deepEqual([...sheet.image.rgba.subarray(((y+dy)*sheet.image.width+x+dx)*4,((y+dy)*sheet.image.width+x+dx)*4+4)],[17,17,17,255]);
 }
 for(let i=0;i<sheet.placements.length;i++)for(let j=i+1;j<sheet.placements.length;j++){
  const a=sheet.placements[i],b=sheet.placements[j];
  assert.ok(a.x+a.box.w*2<=b.x||b.x+b.box.w*2<=a.x||a.y+a.box.h*2<=b.y||b.y+b.box.h*2<=a.y);
 }
});
test("two-times OCR polygons map back to source coordinates without changing text",()=>{
 const {image,ocr}=fixture(),first=observation(image,ocr,0),sheet=geometryReviewSheet(image,ocr.lines,[0],0,2),p=sheet.placements[0];
 const box={x:p.x+4,y:p.y+4,w:48,h:44};
 const second={placements:sheet.placements,ocr:{lines:[{text:"字",confidence:0.97,box}]}};
 const result=applyGeometryConsensus(ocr,[first,second],{widthPx:100,heightPx:100});
 assert.equal(result.revised,1);assert.deepEqual(result.ocr.lines[0].box,{x:22,y:22,w:24,h:22});
 assert.deepEqual(result.ocr.lines[0].polygon,[[22,22],[46,22],[46,44],[22,44]]);
});

test("geometry consensus retains the contextual word proposal in the same source frame",()=>{
 const {image,ocr}=fixture(),first=observation(image,ocr,0),sheet=geometryReviewSheet(image,ocr.lines,[0],0,2),p=sheet.placements[0];
 ocr.lines[0].wordPositionHints=[{text:"字",box:{...ocr.lines[0].box}}];
 const box={x:p.x+4,y:p.y+4,w:48,h:44};
 const second={placements:sheet.placements,ocr:{lines:[{text:"字",confidence:0.97,box,wordPositionHints:[{text:"字",box:{...box}}]}]}};
 const before=structuredClone({ocr,second}),result=applyGeometryConsensus(ocr,[first,second],{widthPx:100,heightPx:100});
 assert.deepEqual(result.ocr.lines[0].wordPositionHints,[{text:"字",box:{x:22,y:22,w:24,h:22}}]);
 assert.deepEqual({ocr,second},before);
 const {admitOcrResult}=require("../packages/slideclone-core/ocr-result-admission");
 assert.doesNotThrow(()=>admitOcrResult(result.ocr,{widthPx:100,heightPx:100}));
 const {boundedOcrSourceDeck}=require("../packages/slideclone-core/ocr-source-deck");
 const {applySourceWordLayouts}=require("../packages/slideclone-core/source-word-layout-registry");
 const deck=boundedOcrSourceDeck({metadata:{dimensions:{widthPx:100,heightPx:100}},ocr:result.ocr,sourceImage:"source.png",sourceRaster:image});
 assert.equal(applySourceWordLayouts(deck.pages[0],deck.pages[0].textBoxes).layouts,1);
 assert.deepEqual(geometryReviewTargets(image,result.ocr),[]);
});

test("geometry consensus drops stale proposals and supports trimmed outer whitespace",()=>{
 const {image,ocr}=fixture();ocr.lines[0].wordPositionHints=[{text:"字",box:{...ocr.lines[0].box}}];
 const first=observation(image,ocr,0),second=observation(image,ocr,8);
 assert.equal(applyGeometryConsensus(ocr,[first,second],{widthPx:100,heightPx:100}).ocr.lines[0].wordPositionHints,undefined);
 second.ocr.lines[0].wordPositionHints=[{text:"字",box:{...second.ocr.lines[0].box}}];
 second.ocr.lines[0].text=" 字 ";
 const result=applyGeometryConsensus(ocr,[first,second],{widthPx:100,heightPx:100});
 assert.deepEqual(result.ocr.lines[0].wordPositionHints,[{text:"字",box:{x:22,y:22,w:24,h:22}}]);
 assert.equal(result.ocr.lines[0].text,"字");
});

test("a different internal word sequence cannot inherit the contextual positions",()=>{
 const {image,ocr}=fixture();ocr.lines[0].text="A B";
 const a=observation(image,ocr,0),b=observation(image,ocr,8);
 a.ocr.lines[0].text="A B";b.ocr.lines[0].text="A  B";
 b.ocr.lines[0].wordPositionHints=[{text:"A  B",box:{...b.ocr.lines[0].box}}];
 const result=applyGeometryConsensus(ocr,[a,b],{widthPx:100,heightPx:100});
 assert.equal(result.ocr.lines[0].wordPositionHints,undefined);
 assert.equal(result.ocr.lines[0].text,"A B");
});

test("contextual words reject empty, malformed, extreme and hostile proposals safely",()=>{
 const {image,ocr}=fixture();let calls=0;
 const hostile={};Object.defineProperty(hostile,"text",{get(){calls++;throw Error('private-content');}});
 for(const hints of [[],new Array(1),new Proxy([],{}),[hostile],[{text:"字",box:{x:0,y:0,w:Infinity,h:1}}],Array(513).fill({text:"字",box:{x:0,y:0,w:1,h:1}})]){
  const a=observation(image,ocr,0),b=observation(image,ocr,8);b.ocr.lines[0].wordPositionHints=hints;
  assert.throws(()=>applyGeometryConsensus(ocr,[a,b],{widthPx:100,heightPx:100}),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 }
 assert.equal(calls,0);
});
