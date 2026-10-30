'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteVisibleBackground:observe}=require('../packages/slideclone-core/routing/source-route-visible-background');
const {sourceRouteCoverageWidth:measure}=require('../packages/slideclone-core/routing/source-route-coverage-width');
function fixture(){
 const width=60,height=60,background=[238,247,242],image={width,height,rgba:Buffer.alloc(width*height*4)};
 const put=(x,y,rgb,alpha=255)=>image.rgba.set([...rgb,alpha],(y*width+x)*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)put(x,y,x<29?[209,250,254]:background);
 for(let y=5;y<55;y++)for(let x=29;x<=31;x++)put(x,y,[68,157,129]);
 const path=Array.from({length:40},(_,i)=>({x:30,y:i+10}));
 return {image,background,work:{checks:0},put,path};
}
const request=f=>({...f.image,background:f.background,work:f.work,path:f.path,cache:new Map()});
test('visible halo witnesses calibrate the same source stroke without borrowing another edge width',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),at=observe(f),n=30*f.image.width+26;
 assert.equal(measure(request(f)),null,'a global field cannot certify the colored halo');
 assert.deepEqual(at(n),[209,250,254]);
 assert.deepEqual(at(n+4),f.background,'no hidden background is inferred at the core');
 assert.equal(measure({...request(f),backgroundAt:at}),3);
 const spent=f.work.checks;assert.deepEqual(at(n),[209,250,254]);assert.ok(f.work.checks>spent);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.work.checks<=4000000);
});
test('wide, opaque excess and missing real flank cells still reject rather than use a nearby thin stroke',()=>{
 for(const change of [
  f=>{for(let y=5;y<55;y++)for(let x=27;x<=33;x++)f.put(x,y,[68,157,129]);},
  f=>{for(let y=5;y<55;y++)for(let x=18;x<=31;x++)f.put(x,y,[68,157,129]);},
  f=>{for(let y=5;y<55;y++)for(let x=0;x<60;x++)f.put(x,y,[68,157,129]);},
  f=>{for(let y=0;y<60;y++)for(let x=0;x<60;x++)f.put(x,y,[209,250,254]);}
 ]){const f=fixture();change(f);assert.equal(measure({...request(f),backgroundAt:observe(f)}),null);}
});
test('interpolation requires independent opaque witnesses, existing contrast and exact tolerance limits',()=>{
 const n=30*60+26;
 for(const delta of [18,19,41,42]){
  const f=fixture();
  // Disable the orthogonal certificate, then test the remaining pair.
  f.put(26,29,[68,157,129]);f.put(26,31,[68,157,129]);
  f.put(25,30,[238-delta,247,242]);f.put(27,30,[238-delta,247,242]);f.put(26,30,[238-delta,247,242]);
  assert.deepEqual(observe(f)(n),delta<42?[238-delta,247,242]:f.background);
 }
 for(const alpha of [0,239]){
  const f=fixture();f.put(26,29,[68,157,129]);f.put(26,31,[68,157,129]);f.put(25,30,[209,250,254],alpha);
  assert.deepEqual(observe(f)(n),f.background);
 }
 const f=fixture();f.put(26,29,[68,157,129]);f.put(26,31,[68,157,129]);
 f.put(25,30,[199,250,254]);f.put(27,30,[218,250,254]);assert.deepEqual(observe(f)(n),f.background);
});
test('conflicting local axes and clipped evidence do not acquire a field',()=>{
 const f=fixture(),n=30*60+26;f.put(25,30,[199,250,254]);f.put(27,30,[199,250,254]);
 f.put(26,29,[224,250,254]);f.put(26,31,[224,250,254]);
 assert.deepEqual(observe(f)(n),f.background);
 const tiny={image:{width:1,height:1,rgba:Buffer.from([209,250,254,255])},background:f.background,work:{checks:0}};
 assert.deepEqual(observe(tiny)(0),f.background);
});
test('invalid inputs, accessors, proxies and exhausted work retain safe boundaries and CI registration',()=>{
 for(const input of [null,{}, {...fixture(),background:[0,NaN,0]}, {...fixture(),work:{checks:-1}},
  {...fixture(),work:Object.freeze({checks:0})},{...fixture(),backgroundAt:42},
  {...fixture(),image:{width:513,height:513,rgba:Buffer.alloc(513*513*4)}},
  {...fixture(),image:{width:60,height:60,rgba:Buffer.alloc(1)}}])assert.throws(()=>observe(input));
 let calls=0;const trap=()=>{calls++;throw Error('private');};
 for(const input of [new Proxy({}, {get:trap}),Object.defineProperty({},'image',{get:trap}),
  {...fixture(),background:new Proxy([238,247,242],{get:trap})},
  {...fixture(),backgroundAt:new Proxy(()=>[],{apply:trap})}])assert.throws(()=>observe(input),TypeError);
 assert.equal(calls,0);
 for(const index of [-1,3600,NaN,Infinity,1.5]){const f=fixture();assert.deepEqual(observe(f)(index),f.background);}
 const f=fixture(),at=observe(f);at(1826);f.work.checks=4000000;assert.deepEqual(at(1826),f.background);
 const spent=f.work.checks;assert.deepEqual(at(1826),f.background);assert.equal(f.work.checks,spent);
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-route-visible-background.test.js'));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-visible-background.js'));
});
