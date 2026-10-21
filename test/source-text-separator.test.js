"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSourceTextInkGeometry}=require("../packages/slideclone-core/text-ink-geometry");
const {partitionSourceTextOverlaps}=require("../packages/slideclone-core/source-text-separator");
function fixture(vertical=false,scale=1){
 const image={width:120*scale,height:120*scale,rgba:Buffer.alloc(120*120*scale*scale*4,255)};
 const boxes=vertical?[{x:20,y:10,w:18,h:50},{x:20,y:55,w:18,h:40}]:[{x:10,y:20,w:50,h:18},{x:55,y:20,w:40,h:18}];
 const ink=vertical?[{x:23,y:12,w:12,h:37},{x:23,y:61,w:12,h:29}]:[{x:12,y:23,w:37,h:12},{x:61,y:23,w:29,h:12}];
 for(const b of ink)for(let y=b.y*scale;y<(b.y+b.h)*scale;y++)for(let x=b.x*scale;x<(b.x+b.w)*scale;x++)image.rgba.set([20,30,40,255],(y*image.width+x)*4);
 const texts=boxes.map((b,i)=>({id:`line-${i}`,text:"Editable",box:b,source:{evidenceBox:{...b}},font:{color:"#141E28"}}));
 return {slideSize:{widthPt:120,heightPt:120},sourceImage:image,textBoxes:texts,ink};
}
test("a unique source whitespace separator resolves overlapping horizontal and vertical hints at multiple resolutions",()=>{
 for(const vertical of [false,true])for(const scale of [1,2,3]){
  const f=fixture(vertical,scale),before=Buffer.from(f.sourceImage.rgba),texts=structuredClone(f.textBoxes);
  const r=measureSourceTextInkGeometry(f);assert.deepEqual(r.measurements.map(m=>m.source),f.ink);
  assert.ok(r.samples>0&&r.samples<20000000);
  assert.deepEqual(measureSourceTextInkGeometry({...f,textBoxes:[...f.textBoxes].reverse()}).measurements,[...r.measurements].reverse());
  assert.deepEqual(f.sourceImage.rgba,before);assert.deepEqual(f.textBoxes,texts);
 }
});
test("crossing ink, incomplete second ink, transparent separators and extra candidate gaps cannot authorize ownership",()=>{
 for(const kind of ["crossing","incomplete","transparent","multiple"]){
  const f=fixture(),im=f.sourceImage;
  if(kind==="crossing")for(let x=49;x<62;x++)im.rgba.set([20,30,40,255],(26*im.width+x)*4);
  if(kind==="incomplete")for(let y=9;y<49;y++)for(let x=65;x<68;x++)im.rgba.set([20,30,40,255],(y*im.width+x)*4);
  if(kind==="transparent")for(let y=12;y<46;y++)for(let x=55;x<60;x++)im.rgba[(y*im.width+x)*4+3]=0;
  if(kind==="multiple")for(let y=12;y<46;y++)im.rgba.set([20,30,40,255],(y*im.width+57)*4);
  assert.deepEqual(measureSourceTextInkGeometry(f).measurements,[],kind);
 }
 const noNeighborInk=fixture();for(let y=0;y<120;y++)for(let x=60;x<120;x++)noNeighborInk.sourceImage.rgba.set([255,255,255,255],(y*120+x)*4);
 assert.deepEqual(measureSourceTextInkGeometry(noNeighborInk).measurements,[]);
});
test("a third owner, nested seeds and frames without source evidence retain ambiguity",()=>{
 const third=fixture();third.textBoxes.push({id:"third",text:"Third",box:{x:54,y:25,w:12,h:8},source:{evidenceBox:{x:54,y:25,w:12,h:8}},font:{color:"#141E28"}});
 assert.deepEqual(measureSourceTextInkGeometry(third).measurements,[]);
 const missing=fixture();delete missing.textBoxes[1].source;assert.deepEqual(measureSourceTextInkGeometry(missing).measurements,[]);
 const nested=fixture();nested.textBoxes[1].source.evidenceBox={x:30,y:22,w:20,h:14};assert.deepEqual(measureSourceTextInkGeometry(nested).measurements,[]);
});
test("separator boundary rejects hostile, malformed and excessive inputs without invoking accessors or callbacks",()=>{
 const image=fixture().sourceImage;let calls=0;
 const measure=()=>{calls++;return {x:1,y:1,w:2,h:2};};
 assert.equal(partitionSourceTextOverlaps(image,[],measure),0);
 for(const entries of [new Proxy([],{}),new Array(1),Array(2001).fill(null),[{get id(){calls++;throw Error("private-content");}}]])
  assert.throws(()=>partitionSourceTextOverlaps(image,entries,measure),/invalid/);
 for(const value of [new Proxy(image,{}),{...image,width:Infinity},{...image,rgba:Buffer.from(new SharedArrayBuffer(image.rgba.length))}])
  assert.throws(()=>partitionSourceTextOverlaps(value,[],measure),/invalid/);
 assert.throws(()=>partitionSourceTextOverlaps(image,[],null),/invalid/);assert.equal(calls,0);
});

test("separator projections and validation scans share the original source sampling limit",()=>{
 const image={width:1400,height:13000,rgba:Buffer.alloc(1400*13000*4,255)},entries=[];
 for(let i=0;i<11;i++)for(const x of [10,200]){
  const seed={x,y:100+i*1150,w:1000,h:950};
  entries.push({id:`${i}-${x}`,seed,region:seed,color:[20,30,40],window:{sx:1,sy:1,left:x-2,right:x+1002,top:seed.y-2,bottom:seed.y+952}});
 }
 assert.throws(()=>partitionSourceTextOverlaps(image,entries,()=>({x:1,y:1,w:2,h:2})),/sampling exceeds/);
});

test("failed completeness measurement propagates and leaves its candidate windows unchanged",()=>{
 const f=fixture(),image=f.sourceImage;
 const entries=f.textBoxes.map(t=>({id:t.id,seed:t.box,region:t.box,color:[20,30,40],window:{sx:1,sy:1,left:t.box.x-2,right:t.box.x+t.box.w+2,top:t.box.y-2,bottom:t.box.y+t.box.h+2}}));
 const before=structuredClone(entries);
 assert.throws(()=>partitionSourceTextOverlaps(image,entries,()=>{throw new Error("measurement-failed");}),/measurement-failed/);
 assert.deepEqual(entries,before);
});
