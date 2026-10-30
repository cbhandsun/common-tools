'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteLocalBackground:observe,hasRouteLocalBackground:active}=require('../packages/slideclone-core/routing/source-route-local-background');
function fixture(transpose=false){
 const image={width:67,height:49,rgba:Buffer.alloc(67*49*4)},body=new Uint8Array(67*49);
 // Deliberately different surrounding pixels expose any offset/stride leak.
 for(let n=0;n<body.length;n++)image.rgba.set([70,20,90,255],n*4);
 const window=transpose?{x:7,y:11,w:32,h:24}:{x:11,y:7,w:24,h:32};
 const index=(x,y)=>(window.y+(transpose?x:y))*image.width+window.x+(transpose?y:x);
 for(let y=0;y<32;y++)for(let x=0;x<24;x++){
  const rgb=y>=5&&y<14?[255,205+(y-5)*5,185+(y-5)*7]:[255,255,255];
  image.rgba.set([...rgb,255],index(x,y)*4);if(y<5)body[index(x,y)]=1;
 }
 for(let y=5;y<32;y++)image.rgba.set([150,40,10,255],index(12,y)*4);
 return {image,body,window,background:[255,255,255],work:{checks:0},index};
}
function copied(f){
 const b=f.window,image={width:b.w,height:b.h,rgba:Buffer.alloc(b.w*b.h*4)},body=new Uint8Array(b.w*b.h);
 for(let y=0;y<b.h;y++)for(let x=0;x<b.w;x++){
  const original=(b.y+y)*f.image.width+b.x+x,n=y*b.w+x;
  image.rgba.set(f.image.rgba.subarray(original*4,original*4+4),n*4);body[n]=f.body[original];
 }
 return {image,body,background:f.background.slice(),work:{checks:0}};
}

test('source windows exactly reproduce copied raster and body observations at every cell in both orientations',()=>{
 for(const transpose of [false,true])for(const edit of [()=>{},f=>f.image.rgba[f.index(0,7)*4+3]=0,
  f=>{for(let x=0;x<24;x++)f.image.rgba.set([30,60,90,255],f.index(x,8)*4);},
  f=>{for(let y=5;y<32;y++)for(let x=0;x<24;x++)f.image.rgba.set([255,205,185,255],f.index(x,y)*4);}]){
  const f=fixture(transpose);edit(f);const before=Buffer.from(f.image.rgba),mask=f.body.slice(),reference=copied(f);
  const direct=observe(f),old=observe(reference);assert.equal(active(direct),active(old));
  for(let n=0;n<f.window.w*f.window.h;n++)assert.deepEqual(direct(n),old(n));
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.body,mask);
  assert.equal(f.work.checks,reference.work.checks,'all original corridor and flank checks still run');
 }
 const f=fixture(),at=observe(f);assert.deepEqual(at(5*f.window.w+12),[255,205,185]);assert.equal(active(at),true);
});

test('default full-image windows preserve behavior and one-cell or empty body fields add no authority',()=>{
 const f=fixture(),without={...f};delete without.window;
 const a=observe(without),b=observe({...without,window:{x:0,y:0,w:f.image.width,h:f.image.height},work:{checks:0}});
 for(let n=0;n<f.body.length;n++)assert.deepEqual(a(n),b(n));
 const tiny=observe({...f,window:{x:1,y:1,w:1,h:1},work:{checks:0}});assert.equal(active(tiny),false);assert.deepEqual(tiny(0),f.background);
 const blank=observe({...f,body:new Uint8Array(f.body.length),work:{checks:0}});assert.equal(active(blank),false);
 assert.deepEqual(blank(5*f.window.w+12),f.background);
});

test('windows reject invalid, extreme, out-of-source and executable controls before sampling',()=>{
 for(const window of [null,[],{},new Date(),{x:-1,y:0,w:5,h:5},{x:0,y:0,w:0,h:5},
  {x:0,y:0,w:Infinity,h:5},{x:0,y:0,w:100000,h:5},{x:.5,y:0,w:5,h:5},{x:0,y:NaN,w:5,h:5},
  {x:66,y:48,w:2,h:2},{x:0,y:0,w:5,h:-1}])assert.throws(()=>observe({...fixture(),window}),TypeError);
 let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 for(const window of [new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  {get x(){return trap();},y:0,w:5,h:5},{x:{valueOf:trap},y:0,w:5,h:5}])
  assert.throws(()=>observe({...fixture(),window}),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 assert.equal(calls,0);
});

test('window observations retain the same ledger failure and unified CI coverage',()=>{
 const f=fixture();observe(f);const cost=f.work.checks;
 const exact=fixture();exact.work.checks=4000000-cost;assert.equal(active(observe(exact)),true);assert.equal(exact.work.checks,4000000);
 const short=fixture();short.work.checks=4000000-cost+1;const at=observe(short);assert.equal(active(at),false);
 assert.ok(short.work.checks>4000000);assert.deepEqual(at(5*short.window.w+12),short.background);
 const file='packages/slideclone-core/routing/source-route-local-background.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-route-background-window.test.js'));
});
