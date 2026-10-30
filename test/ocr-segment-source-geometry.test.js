"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {expandPositionedMixedColorTextSegments,boundedOcrSourceDeck}=require("../packages/slideclone-core/ocr/ocr-source-deck");
const {eraseObjectMask}=require("../packages/slideclone-core/archetypes/full-slide-native-residual");
const {residualSourceTextEvidence}=require("../packages/slideclone-core/typography/residual-source-text-evidence");
test("measured color segments retain parent provenance without reusing its erasure geometry",()=>{
  for(const scale of [1,2]){
    const box={x:10*scale,y:12*scale,w:60*scale,h:10*scale},polygon=[[10,12],[70,12],[70,22],[10,22]].map(p=>p.map(v=>v*scale));
    const original={id:"line",text:"AAAABBBB",box,font:{color:"#101010"},source:{evidenceBox:box,ocrPolygonPt:polygon,
      positionedMixedColorTextSegments:[{text:"AAAA",color:"#101010",box:{...box,w:30*scale}},{text:"BBBB",color:"#101010",box:{...box,x:40*scale,w:30*scale}}]}};
    const before=structuredClone(original),segments=expandPositionedMixedColorTextSegments([original]);
    assert.deepEqual(original,before);assert.equal(segments.length,2);
    for(const segment of segments){
      assert.equal(segment.source.ocrPolygonPt,undefined);assert.deepEqual(segment.source.segmentedOcrLinePolygonPt,polygon);
      const mask=eraseObjectMask(segment,{width:100*scale,height:60*scale},{w:100*scale,h:60*scale});
      const xs=mask.textInk.polygon.map(p=>p[0]);
      assert.equal(Math.max(...xs)-Math.min(...xs),30*scale);
      assert.ok(mask.x<=box.x&&mask.x+mask.w>=box.x+box.w,"source parent context must remain available to each child scan");
    }
  }
});
test("parent context cannot authorize erasure outside the child or accept a stale parent",()=>{
 const value={text:"Child",font:{color:"#141414"},box:{x:30,y:20,w:20,h:12},source:{evidenceBox:{x:30,y:20,w:20,h:12},segmentedOcrLineId:"line",segmentedOcrLinePolygonPt:[[10,20],[80,20],[80,32],[10,32]]}};
 const evidence=residualSourceTextEvidence(value,{width:100,height:60},{widthPt:100,heightPt:60});
 assert.deepEqual(evidence.contextBox,{x:10,y:20,w:70,h:12});
 assert.deepEqual(evidence.ink.polygon,[[30,20],[50,20],[50,32],[30,32]]);
 for(const source of [{...value.source,segmentedOcrLinePolygonPt:[[60,20],[80,20],[80,32],[60,32]]},{...value.source,segmentedOcrLineId:null}]){
  assert.throws(()=>residualSourceTextEvidence({...value,source},{width:100,height:60},{widthPt:100,heightPt:60}),/context|stale/);
 }
});
test("stale, malformed and hostile source evidence fails without exposing text",()=>{
  const value={text:"private-text",font:{color:"#101010"},box:{x:10,y:10,w:20,h:10},source:{evidenceBox:{x:10,y:10,w:20,h:10},ocrPolygonPt:[[0,0],[50,0],[50,40],[0,40]]}};
  assert.throws(()=>residualSourceTextEvidence(value,{width:100,height:60},{widthPt:100,heightPt:60}),/stale/);
  let calls=0;const hostile={};Object.defineProperty(hostile,"text",{get(){calls++;throw Error("private-token");},enumerable:true});
  for(const candidate of [null,{},hostile,{...value,text:""},{...value,font:{color:"private-key"}},{...value,source:new Proxy({},{})}]){
    assert.throws(()=>residualSourceTextEvidence(candidate,{width:100,height:60},{widthPt:100,heightPt:60}),e=>/invalid|stale/.test(e.message)&&!e.message.includes("private"));
  }
  assert.equal(calls,0);
});
test("rotated and perspective mixed-color lines preserve their source quadrilateral without horizontal splits",()=>{
 const width=240,height=80,rgba=Buffer.alloc(width*height*4,255);
 for(let char=0;char<18;char++)for(let y=24;y<44;y++)for(let x=17+char*10;x<24+char*10;x++){
  rgba.set([...(char<5||char>=14?[84,91,110]:[48,82,186]),255],(y*width+x)*4);
 }
 const sourceRaster={width,height,rgba},base={metadata:{dimensions:{widthPx:width,heightPx:height}},sourceImage:"assets/source.png",sourceRaster};
 const polygons=[[[16,20],[196,20],[196,48],[16,48]],[[16,20],[196,24],[196,48],[16,44]],[[16,18],[196,28],[190,55],[22,45]]];
 for(const [index,polygon] of polygons.entries()){
  const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  const deck=boundedOcrSourceDeck({...base,ocr:{lines:[{text:"ABCDE123456789WXYZ",confidence:.98,box,polygon}]}}),line=deck.pages[0].textBoxes[0];
  if(index===0){assert.ok(line.source.positionedMixedColorTextSegments.length>1);continue;}
  assert.equal(line.source.positionedMixedColorTextSegments,undefined);
  assert.deepEqual(line.source.ocrPolygonPt,polygon.map(p=>p.map(v=>v*4)));
  assert.equal(expandPositionedMixedColorTextSegments([line]).length,1);
 }
});
