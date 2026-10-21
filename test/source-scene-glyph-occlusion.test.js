"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence,sceneGlyphOcclusionScanReserve}=require("../packages/slideclone-core/source-scene-glyph-occlusion");
const {measureSceneFillWindow}=require("../packages/slideclone-core/source-scene-fill-window");
const {withSceneFillRasterCache}=require("../packages/slideclone-core/source-scene-fill-raster-cache");
function fixture(){
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)};
 const paint=(x,y,color)=>image.rgba.set([...color,255],(y*100+x)*4);
 for(let y=20;y<80;y++)for(let x=20;x<80;x++)if((x-49.5)**2+(y-49.5)**2<900)paint(x,y,[0,130,70]);
 // A thick white H is enclosed by the independently measured green body.
 for(let y=30;y<70;y++)for(let x=30;x<70;x++)if(x<41||x>=59||y>=44&&y<56)paint(x,y,[255,255,255]);
 const text={text:"H",box:{x:30,y:30,w:40,h:40},font:{color:"#FFFFFF"}};
 const input={image,hint:{x:20,y:20,w:60,h:60},fill:[0,130,70],color:"#008246",budget:{used:0},marginX:5,marginY:5};
 return {input,text,size:{widthPt:100,heightPt:100},paint};
}
function measure(f,token){return withSceneFillRasterCache(f.input.image,f.input.budget,()=>measureSceneFillWindow({...f.input,glyphOcclusion:token}));}
function splitPaintFixture(){
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},budget={used:0};
 for(let y=30;y<70;y++)for(let x=20;x<80;x++)image.rgba.set(x>=48&&x<=51?[0,0,0,255]:[0,130,70,255],(y*100+x)*4);
 return {input:{image,hint:{x:20,y:30,w:60,h:40},fill:[0,130,70],color:'#008246',budget,marginX:5,marginY:5},
  text:{text:'I',box:{x:44,y:30,w:12,h:40},font:{color:'#000000'}},size:{widthPt:100,heightPt:100}};
}

test('an overlapping OCR frame cannot acquire glyphs wholly outside the requested paint window',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const image={width:140,height:90,rgba:Buffer.alloc(140*90*4,255)},budget={used:0};
 for(let y=35;y<50;y++)for(let x=88;x<92;x++)image.rgba.set([0,0,0,255],(y*140+x)*4);
 const before=Buffer.from(image.rgba),text={text:'I',box:{x:20,y:30,w:90,h:25},font:{color:'#000000'}},
  token=createSceneGlyphOcclusion(image,[text],{widthPt:140,heightPt:90},budget),fill=[255,255,255];
 const empty={x:20,y:30,w:30,h:25};
 assert.equal(bridge(token,image,budget,empty,fill).size,0);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
 const scanned=budget.used;assert.ok(scanned>0);
 assert.equal(bridge(token,image,budget,empty,fill).size,0);assert.equal(budget.used,scanned);
 // Rejecting this query must not poison the same color for a later useful query.
 assert.equal(bridge(token,image,budget,{x:88,y:35,w:2,h:15},fill).size,30);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,30,'complete glyph context proves only the requested paint footprint');
 assert.equal(budget.used,scanned);assert.deepEqual(image.rgba,before);
 assert.equal(bridge(token,image,budget,{x:88,y:35,w:4,h:15},fill).size,60);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,60,'the wider query acquires the other cells rather than inheriting them');
});

test('a paint-color proof debits only complete glyphs on that witnessed background',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const image={width:140,height:90,rgba:Buffer.alloc(140*90*4,255)},budget={used:0},fill=[0,130,70];
 for(let y=0;y<90;y++)for(let x=70;x<140;x++)image.rgba.set([...fill,255],(y*140+x)*4);
 for(const left of [28,88])for(let y=35;y<50;y++)for(let x=left;x<left+4;x++)image.rgba.set([0,0,0,255],(y*140+x)*4);
 const before=Buffer.from(image.rgba),text={text:'II',box:{x:20,y:30,w:90,h:25},font:{color:'#000000'}},
  token=createSceneGlyphOcclusion(image,[text],{widthPt:140,heightPt:90},budget),box={x:0,y:0,w:140,h:90};
 const green=bridge(token,image,budget,box,fill);assert.equal(green.size,60);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:1,glyphOwnedPixels:60});
 const scan=budget.used,white=bridge(token,image,budget,box,[255,255,255]);assert.equal(white.size,60);
 assert.equal(budget.used,scan);assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,120);
 assert.equal(bridge(token,image,budget,box,fill).size,60);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,120);assert.deepEqual(image.rgba,before);
 assert.equal(bridge(token,image,budget,box,[255,0,0]).size,0);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,120);
});

test('a different witnessed background remeasures color evidence without duplicate ownership or source reads',()=>{
 const image={width:220,height:100,rgba:Buffer.alloc(220*100*4,255)},budget={used:0};
 const paint=(x,y,color)=>image.rgba.set([...color,255],(y*220+x)*4);
 for(let band=0;band<8;band++)for(let y=0;y<60;y++)for(let x=band*25;x<(band+1)*25;x++)paint(x,y,[240,240,40+band*24]);
 const fill=[250,180,210];for(let y=65;y<92;y++)for(let x=90;x<130;x++)paint(x,y,fill);
 for(let y=72;y<86;y++)for(let x=104;x<108;x++)paint(x,y,[0,0,0]);
 const text={text:'I',box:{x:100,y:70,w:12,h:18},source:{segmentedOcrLineId:'line',segmentedOcrLinePolygonPt:[[0,0],[220,0],[220,100],[0,100]]},font:{color:'#000000'}};
 const token=createSceneGlyphOcclusion(image,[text],{widthPt:220,heightPt:100},budget),box={x:0,y:0,w:220,h:100};
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const first=bridge(token,image,budget,box,[255,255,255]),scan=budget.used;
 assert.equal(first.size,56);
 const second=bridge(token,image,budget,box,fill);assert.equal(second.size,56);assert.equal(budget.used,scan);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:2,glyphOwnedPixels:56});
 assert.equal(bridge(token,image,budget,box,fill).size,56);assert.equal(budget.used,scan);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:2,glyphOwnedPixels:56});
 assert.equal(bridge(token,image,budget,box,[40,250,70]).size,0);
});

test("a censored background cannot consume glyph ownership merely by proposing paint connectivity",()=>{
 const image={width:100,height:100,rgba:Buffer.alloc(40000,255)},budget={used:0};
 for(let y=30;y<70;y++)for(let x=48;x<52;x++)image.rgba.set([0,0,0,255],(y*100+x)*4);
 const text={text:"I",box:{x:44,y:30,w:12,h:40},font:{color:"#000000"}},
  token=createSceneGlyphOcclusion(image,[text],{widthPt:100,heightPt:100},budget);
 const input={image,hint:{x:20,y:20,w:60,h:60},fill:[255,255,255],color:"#FFFFFF",budget,marginX:5,marginY:5,glyphOcclusion:token};
 assert.equal(measureSceneFillWindow(input).fit,null);assert.equal(budget.used,70*70);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:0,glyphOwnedPixels:0});
});
test('source-owned thin glyphs reconnect paint components rejected before hole compensation',()=>{
 const f=splitPaintFixture(),before=Buffer.from(f.input.image.rgba);
 const disconnected=measure(f).fit;assert.ok(disconnected?.parts);assert.equal(disconnected.segments,undefined);
 assert.equal(disconnected.glyphOcclusionPixels,undefined);f.input.budget.used=0;
 const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget),fit=measure(f,token).fit;
 assert.ok(fit);assert.deepEqual(fit.box,f.input.hint);assert.ok(fit.support>=.58);assert.ok(fit.glyphOcclusionPixels>0);
 assert.equal(fit.support,fit.paintSupport+fit.glyphOcclusionPixels/(fit.box.w*fit.box.h));
 assert.ok(fit.segments.length<=120);assert.ok(f.input.budget.used<=4000000);assert.deepEqual(f.input.image.rgba,before);
});
test('glyph bridging keeps private source and budget binding and independently witnessed paint color',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const f=splitPaintFixture(),token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget),box={x:15,y:25,w:70,h:50};
 const cells=withSceneFillRasterCache(f.input.image,f.input.budget,()=>bridge(token,f.input.image,f.input.budget,box,f.input.fill));assert.ok(cells.size>0);
 assert.equal(bridge(token,f.input.image,{used:0},box,f.input.fill).size,0);
 assert.equal(bridge(token,{...f.input.image,rgba:Buffer.from(f.input.image.rgba)},f.input.budget,box,f.input.fill).size,0);
 assert.equal(bridge(token,f.input.image,f.input.budget,box,[255,0,0]).size,0);
 cells.add(0);assert.ok(!bridge(token,f.input.image,f.input.budget,box,f.input.fill).has(0));
 assert.equal(bridge(structuredClone(token),f.input.image,f.input.budget,box,f.input.fill).size,0);
});
test('an optional bridge skips exhausted reserve without reading pixels or granting fallback geometry',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const f=splitPaintFixture(),token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 f.input.budget.used=4000000;
 assert.equal(bridge(token,f.input.image,f.input.budget,{x:15,y:25,w:70,h:50},f.input.fill).size,0);
 assert.equal(f.input.budget.used,4000000);assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:0,glyphOwnedPixels:0});
});
test('bridge controls reject unsafe source, budget, windows and color channels without invoking accessors',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const f=splitPaintFixture(),box={x:15,y:25,w:70,h:50};let calls=0;
 const hostile={get x(){calls++;throw Error('private-token');}},channels=[0,130,70];Object.defineProperty(channels,0,{get(){calls++;throw Error('private-token');}});
 for(const b of [hostile,new Proxy(box,{}),{...box,w:0},{...box,w:Infinity},{...box,w:300000}])assert.throws(()=>bridge({},f.input.image,f.input.budget,b,f.input.fill),TypeError);
 for(const fill of [channels,new Proxy([0,130,70],{}),[0,130,NaN],[0,130,256],new Array(3)])assert.throws(()=>bridge({},f.input.image,f.input.budget,box,fill),TypeError);
 assert.throws(()=>bridge({},new Proxy(f.input.image,{}),f.input.budget,box,f.input.fill),TypeError);
 assert.throws(()=>bridge({},f.input.image,new Proxy({used:0},{}),box,f.input.fill),TypeError);
 assert.equal(calls,0);assert.equal(f.input.budget.used,0);
});
test('large blank glyph windows are scanned within budget without acquiring any glyph population',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const image={width:600,height:300,rgba:Buffer.alloc(600*300*4,255)},budget={used:0};
 const text={text:'I',box:{x:10,y:10,w:500,h:250},font:{color:'#000000'}};
 const token=createSceneGlyphOcclusion(image,[text],{widthPt:600,heightPt:300},budget);
 assert.equal(bridge(token,image,budget,{x:0,y:0,w:600,h:300},[255,255,255]).size,0);
 const mask=require('../packages/slideclone-core/residual-source-text-evidence').sourceTextEraseMask(text,image,{widthPt:600,heightPt:300});
 assert.equal(budget.used,mask.w*mask.h);assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:1,glyphOwnedPixels:0});
});

test('sparse large windows retain whole glyph proofs and cache rejected colors without losing counts',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const image={width:600,height:300,rgba:Buffer.alloc(600*300*4,255)},budget={used:0};
 for(let y=80;y<160;y++)for(let x=200;x<204;x++)image.rgba.set([0,0,0,255],(y*600+x)*4);
 const text={text:'I',box:{x:10,y:10,w:500,h:250},font:{color:'#000000'}},box={x:0,y:0,w:600,h:300};
 const token=createSceneGlyphOcclusion(image,[text],{widthPt:600,heightPt:300},budget);
 assert.equal(bridge(token,image,budget,box,[0,0,255]).size,0);const rejectedScan=budget.used;
 assert.ok(rejectedScan>100000&&rejectedScan<=262144);
 assert.equal(bridge(token,image,budget,box,[0,0,255]).size,0);assert.equal(budget.used,rejectedScan);
 const cells=bridge(token,image,budget,box,[255,255,255]);assert.equal(cells.size,320);
 assert.equal(budget.used,rejectedScan,'a different color must reuse measured source bytes without acquiring cached ownership');
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:1,glyphOwnedPixels:320});
 const measuredScan=budget.used;assert.equal(bridge(token,image,budget,box,[255,255,255]).size,320);
 assert.equal(budget.used,measuredScan);assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,320);
});

test('cached failed probes grant no ownership to other sources or budgets at exhaustion',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const f=splitPaintFixture(),box={x:15,y:25,w:70,h:50},token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 assert.equal(bridge(token,f.input.image,f.input.budget,box,[255,0,0]).size,0);
 const scanned=f.input.budget.used;assert.ok(scanned>0);
 assert.equal(sceneGlyphOcclusionScanReserve(token,box),0);
 assert.equal(bridge(token,{...f.input.image,rgba:Buffer.from(f.input.image.rgba)},f.input.budget,box,f.input.fill).size,0);
 assert.equal(bridge(token,f.input.image,{used:scanned},box,f.input.fill).size,0);
 f.input.budget.used=4000000;
 assert.ok(bridge(token,f.input.image,f.input.budget,box,f.input.fill).size>0);
 assert.equal(f.input.budget.used,4000000);
 const evidence=sceneGlyphOcclusionEvidence(token);assert.ok(evidence.glyphOwnedPixels>0&&evidence.glyphOwnedPixels<=100000);
 assert.equal(bridge(structuredClone(token),f.input.image,f.input.budget,box,f.input.fill).size,0);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),evidence);
});
test("optional scans reserve captured unmeasured glyph windows without reading or granting ownership",()=>{
 const f=fixture(),token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 const window={x:20,y:20,w:60,h:60};
 const reserve=sceneGlyphOcclusionScanReserve(token,window);
 assert.ok(reserve>=1600);assert.ok(reserve<=10000);
 assert.equal(sceneGlyphOcclusionScanReserve(token,window),reserve);
 assert.equal(sceneGlyphOcclusionScanReserve(token,{x:0,y:0,w:10,h:10}),0);
 assert.equal(f.input.budget.used,0);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:0,glyphOwnedPixels:0});
 f.text.box.x=0;
 assert.equal(sceneGlyphOcclusionScanReserve(token,window),reserve);
 assert.ok(measure(f,token).fit);
 assert.equal(sceneGlyphOcclusionScanReserve(token,window),0);
 const used=f.input.budget.used;
 assert.equal(sceneGlyphOcclusionScanReserve(token,window),0);
 assert.equal(f.input.budget.used,used);
});
test("overlapping optional glyph reservations stop at the original source scan ceiling",()=>{
 const f=fixture(),token=createSceneGlyphOcclusion(f.input.image,Array.from({length:3000},()=>f.text),f.size,f.input.budget);
 assert.equal(sceneGlyphOcclusionScanReserve(token,{x:20,y:20,w:60,h:60}),4000001);
 assert.equal(f.input.budget.used,0);
 assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:0,glyphOwnedPixels:0});
});
test("an enclosed source glyph restores a body under the original density gate and denominator",()=>{
 const f=fixture(),before=Buffer.from(f.input.image.rgba);assert.equal(measure(f).fit,null);
 f.input.budget.used=0;const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 const fit=measure(f,token).fit;assert.ok(fit);assert.ok(fit.paintSupport<.58);assert.ok(fit.support>=.58);
 assert.equal(fit.support,fit.paintSupport+fit.glyphOcclusionPixels/(fit.box.w*fit.box.h));
 assert.ok(fit.glyphOcclusionPixels>0);assert.deepEqual(f.input.image.rgba,before);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphMeasurements,1);assert.ok(f.input.budget.used<4000000);
});
test("empty or legacy OCR rectangles cannot supply glyph authority",()=>{
 for(const texts of [[],[{text:"H",box:{x:30,y:30,w:40,h:40}}],[{...fixture().text,text:" "}]]){
  const f=fixture(),token=createSceneGlyphOcclusion(f.input.image,texts,f.size,f.input.budget);
  assert.equal(measure(f,token).fit,null);assert.equal(sceneGlyphOcclusionEvidence(token).glyphMeasurements,0);
 }
});
test("unknown, copied and hostile handles are opaque and cannot authorize pixels",()=>{
 const f=fixture();let calls=0;const hostile=new Proxy({}, {get(){calls++;throw Error('private-token');}});
 for(const token of [null,{},hostile])assert.equal(measure(f,token).fit,null);
 assert.deepEqual(sceneGlyphOcclusionEvidence(hostile),{glyphMeasurements:0,glyphOwnedPixels:0});assert.equal(calls,0);
});
test("proofs belong to the exact source buffer and shared budget",()=>{
 const f=fixture(),token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 const other=fixture();assert.equal(measure(other,token).fit,null);
 const old=f.input.budget;f.input.budget={used:0};assert.equal(measure(f,token).fit,null);f.input.budget=old;
 assert.ok(measure(f,token).fit);
});
test("captured glyph controls cannot be changed after admission and evidence is a copy",()=>{
 const f=fixture(),token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 f.text.box.x=0;f.text.font.color="#000000";f.text.text="changed";
 assert.ok(measure(f,token).fit);const evidence=sceneGlyphOcclusionEvidence(token);evidence.glyphMeasurements=999;
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphMeasurements,1);assert.equal(Object.keys(token).length,0);
});
test("an exterior-connected glyph opening cannot fill a missing body",()=>{
 const f=fixture();for(let y=0;y<45;y++)for(let x=30;x<41;x++)f.paint(x,y,[255,255,255]);
 const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 assert.equal(measure(f,token).fit,null);
});
test("blank source or wrong ink cannot turn an OCR proposal into paint",()=>{
 for(const blank of [false,true]){const f=fixture();if(blank)f.input.image.rgba.fill(255);else f.text.font.color="#000000";
  const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);assert.equal(measure(f,token).fit,null);
 }
});
test("a broad blank hollow center cannot be claimed by a fabricated glyph rectangle",()=>{
 const f=fixture();for(let y=30;y<70;y++)for(let x=30;x<70;x++)f.paint(x,y,[255,255,255]);
 const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 assert.equal(measure(f,token).fit,null);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
 const scanned=f.input.budget.used;assert.equal(measure(f,token).fit,null);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);assert.ok(scanned>0);assert.ok(f.input.budget.used<4000000);
});
test("a broad round hollow center also lacks a source stroke witness",()=>{
 const f=fixture();for(let y=20;y<80;y++)for(let x=20;x<80;x++){
  if((x-49.5)**2+(y-49.5)**2<625)f.paint(x,y,[255,255,255]);
 }
 f.text.box={x:25,y:25,w:50,h:50};
 const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 assert.equal(measure(f,token).fit,null);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
});

test('rejected broad holes cannot starve later independently witnessed strokes under the unchanged shared allowance',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const image={width:850,height:450,rgba:Buffer.alloc(850*450*4)},fill=[0,130,70],budget={used:0};
 for(let i=0;i<850*450;i++)image.rgba.set([...fill,255],i*4);
 const paint=(x,y)=>image.rgba.set([255,255,255,255],(y*850+x)*4);
 for(let y=20;y<280;y++)for(let x=20;x<290;x++)paint(x,y);
 for(let stripe=0;stripe<16;stripe++)for(let y=40;y<380;y++)for(let x=340+stripe*25;x<349+stripe*25;x++)paint(x,y);
 const hole={x:20,y:20,w:270,h:260},glyph={x:330,y:20,w:450,h:400};
 const texts=[hole,glyph].map(box=>({text:'I',box,font:{color:'#FFFFFF'}})),before=Buffer.from(image.rgba);
 const token=createSceneGlyphOcclusion(image,texts,{widthPt:850,heightPt:450},budget);
 assert.equal(bridge(token,image,budget,hole,fill).size,0);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
 const scanned=budget.used;assert.ok(scanned>0);
 assert.equal(bridge(token,image,budget,hole,fill).size,0);assert.equal(budget.used,scanned);
 assert.equal(bridge(token,image,budget,glyph,fill).size,48960);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,48960);
 assert.ok(budget.used<=4000000);assert.deepEqual(image.rgba,before);
});

test('cached complete context grants each requested footprint atomically and never exceeds the total ownership ceiling',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
 const image={width:950,height:500,rgba:Buffer.alloc(950*500*4)},fill=[0,130,70],budget={used:0};
 for(let i=0;i<950*500;i++)image.rgba.set([...fill,255],i*4);
 for(const [left,stripes]of [[30,8],[300,25]])for(let stripe=0;stripe<stripes;stripe++)
  for(let y=30;y<390;y++)for(let x=left+stripe*23;x<left+stripe*23+10;x++)image.rgba.set([255,255,255,255],(y*950+x)*4);
 const texts=[{x:20,y:10,w:240,h:400},{x:290,y:10,w:590,h:400}].map(box=>({text:'I',box,font:{color:'#FFFFFF'}}));
 const token=createSceneGlyphOcclusion(image,texts,{widthPt:950,heightPt:500},budget);
 assert.equal(bridge(token,image,budget,texts[0].box,fill).size,28800);
 assert.equal(bridge(token,image,budget,{x:300,y:30,w:103,h:360},fill).size,18000);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,46800);
 // The full 90K context was measured, but its unrequested cells have no rights.
 const scanned=budget.used;
 assert.equal(bridge(token,image,budget,texts[1].box,fill).size,0);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,46800);
 assert.equal(bridge(token,image,budget,{x:300,y:30,w:401,h:360},fill).size,64800);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,93600);
 assert.equal(bridge(token,image,budget,texts[1].box,fill).size,0);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,93600);
 assert.equal(bridge(token,image,budget,{x:714,y:30,w:10,h:360},fill).size,3600);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,97200);
 assert.equal(budget.used,scanned);assert.ok(budget.used<=4000000);
});
test("diagonal stroke junctions use physical distance under the unchanged radius and fill gate",()=>{
 const f=fixture();
 for(let y=30;y<70;y++)for(let x=30;x<70;x++){
  f.paint(x,y,Math.abs(x-y)<=12?[255,255,255]:[0,130,70]);
 }
 assert.equal(measure(f).fit,null);
 f.input.budget.used=0;
 const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget),fit=measure(f,token).fit;
 assert.ok(fit);assert.ok(fit.paintSupport<.58);assert.ok(fit.support>=.58);
 assert.ok(fit.glyphOcclusionPixels>0);
});
test("a complete unoccluded body retains its original fit and does not measure glyphs",()=>{
 const f=fixture();for(let y=30;y<70;y++)for(let x=30;x<70;x++)f.paint(x,y,[0,130,70]);
 const token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 const fit=measure(f,token).fit;assert.ok(fit);assert.equal(fit.glyphOcclusionPixels,undefined);
 assert.equal(fit.paintSupport,undefined);assert.equal(sceneGlyphOcclusionEvidence(token).glyphMeasurements,0);
});
test("invalid controls fail without executing accessors or exposing contents",()=>{
 const f=fixture();let calls=0;const hostile={};Object.defineProperty(hostile,'text',{get(){calls++;throw Error('private-token');}});
 for(const texts of [new Array(1),new Proxy([],{}),[hostile],[{...f.text,font:{color:'private-token'}}],[{...f.text,box:{x:NaN,y:0,w:1,h:1}}],Array(10001).fill(f.text)]){
  assert.throws(()=>createSceneGlyphOcclusion(f.input.image,texts,f.size,f.input.budget),error=>error instanceof TypeError&&!error.message.includes('private-token'));
 }
 assert.equal(calls,0);
 assert.throws(()=>createSceneGlyphOcclusion(f.input.image,[],{widthPt:Infinity,heightPt:100},f.input.budget),TypeError);
 assert.throws(()=>createSceneGlyphOcclusion(f.input.image,[],f.size,{used:-1}),TypeError);
 const shared={...f.input.image,rgba:new Uint8Array(new SharedArrayBuffer(40000))};
 assert.throws(()=>createSceneGlyphOcclusion(shared,[],f.size,f.input.budget),TypeError);
});
test("proof reuse does not read glyph pixels twice and original exhaustion remains an error",()=>{
 const f=fixture(),token=createSceneGlyphOcclusion(f.input.image,[f.text],f.size,f.input.budget);
 withSceneFillRasterCache(f.input.image,f.input.budget,()=>{assert.ok(measure(f,token).fit);const used=f.input.budget.used;
  assert.ok(measure(f,token).fit);assert.equal(f.input.budget.used,used);});
 f.input.budget.used=4000000;assert.throws(()=>measure(f,token),RangeError);
});
