"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {observeJointSourceWordRows:observe,sampleJointSourceWordOwner:sample}=require('../packages/slideclone-core/typography/source-word-joint-observation');
function fixture(){const image={width:30,height:30,rgba:new Uint8Array(3600).fill(255)};
 for(const top of [6,16])for(let y=top;y<top+4;y++)for(let x=7;x<19;x++)image.rgba.set([17,17,17,255],(y*30+x)*4);
 const rows=[{box:{x:5,y:4,w:16,h:10},color:'#111111',confidence:.99},{box:{x:5,y:13,w:16,h:10},color:'#111111',confidence:.99}];
 return {image,rows,anchor:rows[0].box,budget:{remaining:4000000}};
}
test('private observed components keep source identity and cache the same charged window',()=>{
 const f=fixture(),before=f.image.rgba.slice(),token=observe(f);assert.ok(token);
 const remaining=f.budget.remaining;assert.ok(remaining<4000000);assert.equal(sample(token,f.image,f.anchor,10,7),1);
 assert.equal(sample(token,f.image,f.anchor,10,17),0);assert.equal(sample(token,f.image,f.anchor,0,0),255);
 const second=observe({...f,anchor:f.rows[1].box});assert.ok(second);assert.equal(f.budget.remaining,remaining);
 assert.equal(sample(second,f.image,f.rows[1].box,10,17),1);assert.equal(sample(second,f.image,f.rows[1].box,10,7),0);
 for(const fake of [{},structuredClone(token),new Proxy(token,{})])assert.equal(sample(fake,f.image,f.anchor,10,7),255);
 assert.equal(sample(token,{...f.image},f.anchor,10,7),255);assert.equal(sample(token,f.image,{...f.anchor},10,7),255);
 assert.deepEqual(f.image.rgba,before);f.image.rgba[(7*30+10)*4]=80;assert.equal(sample(token,f.image,f.anchor,10,7),255);
 let calls=0;Object.defineProperty(f.image,'width',{get(){calls++;throw Error('private');}});
 assert.equal(sample(token,f.image,f.anchor,10,7),255);assert.equal(calls,0);
});
test('unknown tiny components stay unresolved and blank or connected rows fail closed',()=>{
 const unknown=fixture();unknown.image.rgba.set([17,17,17,255],(8*30+21)*4);
 const token=observe(unknown);assert.ok(token);assert.equal(sample(token,unknown.image,unknown.anchor,21,8),255);
 for(const mode of ['empty','transparent','crossing']){const f=fixture();
  if(mode==='empty')f.image.rgba.fill(255);
  if(mode==='transparent')f.image.rgba.fill(0);
  if(mode==='crossing')for(let y=9;y<=16;y++)f.image.rgba.set([17,17,17,255],(y*30+10)*4);
  assert.equal(observe(f),null,mode);assert.ok(f.budget.remaining<4000000);
 }
});
test('source and target budgets remain shared and cannot be enlarged by retries',()=>{
 const f=fixture();f.budget.remaining=1;assert.equal(observe(f),null);assert.equal(f.budget.remaining,1);
 const budget={remaining:4000000};for(let i=0;i<16;i++)assert.ok(observe({...fixture(),budget}));
 const before=budget.remaining;assert.equal(observe({...fixture(),budget}),null);assert.equal(budget.remaining,before);
 const outsider=fixture();outsider.rows.push({box:{x:10,y:8,w:3,h:3},color:'#111111',confidence:.5});
 assert.equal(observe(outsider),null);assert.equal(outsider.budget.remaining,4000000);
 const duplicate=fixture();duplicate.rows.push({...duplicate.rows[0],box:{...duplicate.rows[0].box}});
 assert.equal(observe(duplicate),null);assert.equal(duplicate.budget.remaining,4000000);
});
test('hostile, missing and invalid source context is rejected without user code',()=>{
 const f=fixture();let calls=0;const getter={get box(){calls++;throw Error('private');}};
 for(const bad of [null,{},new Proxy(f,{get(){calls++;throw Error('private');}}),{...f,rows:[getter]},
  {...f,rows:new Array(2)},{...f,rows:new Proxy(f.rows,{})},{...f,rows:[{...f.rows[0],color:'private'}]},
  {...f,budget:{remaining:4000001}},{...f,budget:{remaining:NaN}},{...f,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(3600))}},
  {...f,image:{...f.image,rgba:new Proxy(f.image.rgba,{})}},{...f,image:{...f.image,width:Infinity}}])assert.throws(()=>observe(bad),TypeError);
 assert.equal(calls,0);assert.equal(observe({...f,rows:[]}),null);
 const {classifyTestFile}=require('../scripts/test-suites');assert.equal(classifyTestFile(__filename),'unit');
});

test('horizontal frames require the exact private joint proof, original pixels and bounded source work',()=>{
 const {prepareAxisAlignedSourceWordFrame:prepare}=require('../packages/slideclone-core/typography/source-word-rotated-frame');
 const {measureSourceWordLayout:measure}=require('../packages/slideclone-core/typography/source-word-layout-evidence');
 const f=fixture(),token=observe(f);
 const line={text:'ROW',confidence:.99,box:f.anchor};
 const request={image:f.image,line,nativeBox:f.anchor,neighbors:f.rows.map(r=>r.box),maximum:f.budget.remaining};
 assert.equal(prepare(request),null);
 const frame=prepare({...request,jointEvidence:token});assert.ok(frame);assert.equal(frame.rotation,0);
 const scan=image=>measure({image,line:frame.line,color:'#111111',neighborBoxes:frame.neighborBoxes,maxScanPixels:f.budget.remaining-frame.scannedPixels});
 assert.ok(scan(frame.image).runs);assert.equal(frame.scannedPixels,frame.image.width*frame.image.height);
 assert.equal(prepare({...request,jointEvidence:token,maximum:frame.scannedPixels-1}),null);
 for(const fake of [{},structuredClone(token),new Proxy(token,{})]){
  const unknown=prepare({...request,jointEvidence:fake});assert.ok(unknown);
  assert.equal(scan(unknown.image).reason,'joint-source-ownership');
 }
 f.image.rgba[(7*30+10)*4]=80;
 const changed=prepare({...request,jointEvidence:token});assert.equal(scan(changed.image).runs,null);
 let calls=0;const unsafe={...request,get maximum(){calls++;throw Error('private');}};
 for(const input of [null,{},unsafe,new Proxy(request,{}),{...request,maximum:4000001},
  {...request,neighbors:new Array(1)},{...request,image:{...f.image,width:Infinity}}])assert.throws(()=>prepare(input),TypeError);
 assert.equal(calls,0);
});
