"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createJointTextInkEvidence:create}=require('../packages/slideclone-core/text-ink-joint-evidence');
const {measureTextInkGeometry:paired,measureSourceTextInkGeometry:source}=require('../packages/slideclone-core/text-ink-geometry');
function fixture(scale=1){
 const image={width:30*scale,height:30*scale,rgba:new Uint8Array(3600*scale*scale).fill(255)};
 for(const top of [6,16])for(let y=top*scale;y<(top+4)*scale;y++)for(let x=7*scale;x<19*scale;x++)image.rgba.set([17,17,17,255],(y*image.width+x)*4);
 const textBoxes=[{x:5,y:4,w:16,h:10},{x:5,y:13,w:16,h:10}].map((box,i)=>({id:'row'+i,box,font:{color:'#111111'},source:{evidenceBox:box,confidence:.99}}));
 return {sourceImage:image,textBoxes,slideSize:{widthPt:30,heightPt:30}};
}
test('overlapping OCR frames recover independently witnessed rows at different resolutions without changing pixels',()=>{
 const f=fixture(),rendered=fixture(2).sourceImage,bytes=f.sourceImage.rgba.slice();
 const expected=[{id:'row0',source:{x:7,y:6,w:12,h:4}},{id:'row1',source:{x:7,y:16,w:12,h:4}}];
 const measured=source(f);assert.deepEqual(measured.measurements,expected);
 // Window plus ownership scans are charged exactly once; cached second row is free.
 assert.equal(measured.samples,1020);
 assert.deepEqual(paired({...f,renderedImage:rendered}).measurements,expected.map(m=>({...m,rendered:m.source})));
 assert.deepEqual(f.sourceImage.rgba,bytes);
 assert.deepEqual(paired({...f,renderedImage:f.sourceImage}).samples,1120);
});
test('connected rows, low confidence and transparent ink retain refusal',()=>{
 for(const mode of ['connected','confidence','transparent','empty']){
  const f=fixture();
  if(mode==='connected')for(let y=9;y<=16;y++)f.sourceImage.rgba.set([17,17,17,255],(y*30+10)*4);
  if(mode==='confidence')f.textBoxes[1].source.confidence=.5;
  if(mode==='transparent')f.sourceImage.rgba.fill(0);
  if(mode==='empty')f.sourceImage.rgba.fill(255);
  assert.deepEqual(source(f).measurements,[],mode);
  assert.equal(create(f.sourceImage,f.textBoxes,f.slideSize).observe('row0',4000000).accept,null,mode);
 }
});
test('only witnessed foreign ink is excluded; unknown and changed pixels stay visible',()=>{
 const f=fixture();f.sourceImage.rgba.set([17,17,17,255],(8*30+21)*4);
 const e=create(f.sourceImage,f.textBoxes,f.slideSize),proof=e.observe('row0',4000000);
 assert.ok(proof.accept);assert.equal(proof.accept(10,17),false);assert.equal(proof.accept(10,7),true);
 assert.equal(proof.accept(21,8),true);assert.equal(proof.accept(0,0),true);
 f.sourceImage.rgba[(17*30+10)*4]=80;assert.equal(proof.accept(10,17),true);
 assert.equal(e.observe('row1',4000000).samples,0);
});
test('failed budget probes cannot enlarge the shared ledger; missing and empty collections are bounded',()=>{
 const f=fixture(),e=create(f.sourceImage,f.textBoxes,f.slideSize);
 assert.deepEqual(e.observe('row0',1),{samples:0,accept:null});
 assert.deepEqual(e.observe('row0',4000000),{samples:0,accept:null});
 assert.deepEqual(e.observe('missing',4000000),{samples:0,accept:null});
 assert.deepEqual(create(f.sourceImage,[],f.slideSize).observe('row0',4000000),{samples:0,accept:null});
 for(const n of [-1,NaN,20000001,1.5])assert.throws(()=>e.observe('row0',n),TypeError);
 assert.throws(()=>e.observe('x'.repeat(257),1),TypeError);
});
test('one evidence scope cannot exceed the existing 32 row target limit',()=>{
 const image={width:30,height:520,rgba:new Uint8Array(30*520*4).fill(255)},texts=[];
 for(let i=0;i<17;i++)for(const [row,top]of [6,16].entries()){
  const offset=i*30;
  for(let y=top+offset;y<top+offset+4;y++)for(let x=7;x<19;x++)image.rgba.set([17,17,17,255],(y*30+x)*4);
  const box={x:5,y:(row?13:4)+offset,w:16,h:10};
  texts.push({id:`group${i}-row${row}`,box,font:{color:'#111111'},source:{evidenceBox:box,confidence:.99}});
 }
 const e=create(image,texts,{widthPt:30,heightPt:520});
 for(let i=0;i<16;i++)assert.ok(e.observe(`group${i}-row0`,4000000).accept);
 assert.deepEqual(e.observe('group16-row0',4000000),{samples:0,accept:null});
});
test('hostile frames, collections and byte buffers fail without executing accessors',()=>{
 const f=fixture();let calls=0;const hostile={get width(){calls++;throw Error('private');}};
 for(const image of [null,hostile,new Proxy(f.sourceImage,{}),{...f.sourceImage,width:Infinity},
  {...f.sourceImage,rgba:new Proxy(f.sourceImage.rgba,{})},{...f.sourceImage,rgba:new Uint8Array(1)},
  {...f.sourceImage,rgba:new Uint8Array(new SharedArrayBuffer(3600))}])assert.throws(()=>create(image,f.textBoxes,f.slideSize),TypeError);
 for(const texts of [null,new Array(2),new Proxy(f.textBoxes,{})])assert.throws(()=>create(f.sourceImage,texts,f.slideSize),TypeError);
 assert.equal(calls,0);
 const {classifyTestFile}=require('../scripts/test-suites');assert.equal(classifyTestFile(__filename),'unit');
});
