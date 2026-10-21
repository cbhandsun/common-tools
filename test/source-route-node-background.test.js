'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteNodeBackground:measure}=require('../packages/slideclone-core/source-route-node-background');
const {sourceRouteLocalBackground}=require('../packages/slideclone-core/source-route-local-background');
function fixture(){
 const image={width:48,height:32,rgba:Buffer.alloc(48*32*4,255)},mask=new Uint8Array(48*32);
 const put=(x,y,rgb)=>image.rgba.set([...rgb,255],(y*48+x)*4);
 for(let y=0;y<5;y++)for(let x=8;x<32;x++)mask[y*48+x]=1;
 for(let y=5;y<14;y++)for(let x=8;x<32;x++)put(x,y,[255,205+(y-5)*5,185+(y-5)*7]);
 for(let y=5;y<32;y++)put(20,y,[150,40,10]);
 return {image,bodies:[{box:{x:8,y:0,w:24,h:5},mask}],background:[255,255,255],work:{checks:0},put};
}
test('a source body inside a multi-node window can independently certify its own exterior field',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),mask=f.bodies[0].mask.slice();
 assert.deepEqual(sourceRouteLocalBackground({image:f.image,body:f.bodies[0].mask,background:f.background,work:{checks:0}})(5*48+20),f.background);
 const at=measure(f);assert.deepEqual(at(5*48+20),[255,205,185]);
 assert.deepEqual(at(30*48+20),f.background);assert.deepEqual(at(5*48+7),f.background);assert.deepEqual(at(5*48+32),f.background);
 assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.bodies[0].mask,mask);assert.ok(f.work.checks<=4000000);
});
test('unknown anchors, sharp branches, transparent flanks and clipped gradients grant no local background',()=>{
 for(const change of [
  f=>f.bodies[0].mask.fill(0),
  f=>{for(let x=8;x<32;x++)f.put(x,8,[30,60,90]);},
  f=>{f.image.rgba[(7*48+8)*4+3]=0;},
  f=>{for(let y=5;y<32;y++)for(let x=8;x<32;x++)f.put(x,y,[255,205,185]);}
 ]){const f=fixture();change(f);assert.deepEqual(measure(f)(5*48+20),f.background);}
 const exhausted=fixture();exhausted.work.checks=4000000;assert.deepEqual(measure(exhausted)(5*48+20),exhausted.background);assert.ok(exhausted.work.checks>4000000);
 const empty=fixture();empty.bodies=[];assert.deepEqual(measure(empty)(5*48+20),empty.background);
});
test('queries charge the shared ledger, including all candidate fields, and exhaustion grants no certificate',()=>{
 const costs=[];
 for(const count of [1,32]){
  const f=fixture();f.bodies=Array.from({length:count},()=>f.bodies[0]);
  const at=measure(f),before=f.work.checks;
  assert.deepEqual(at(5*48+20),[255,205,185]);costs.push(f.work.checks-before);
  assert.ok(f.work.checks>before,'certificate lookups must spend work');
  for(let n=0;n<10;n++)assert.deepEqual(at(5*48+20),[255,205,185]);
  assert.ok(f.work.checks>before+costs.at(-1),'repeated lookups cannot escape the shared ledger');
  f.work.checks=3999999;
  assert.deepEqual(at(5*48+20),f.background);assert.ok(f.work.checks>4000000);
  const exhausted=f.work.checks;assert.deepEqual(at(5*48+20),f.background);
  assert.equal(f.work.checks,exhausted,'a spent ledger cannot run another certificate search');
 }
 assert.ok(costs[1]>costs[0],'a larger candidate portfolio cannot masquerade as constant work');
});
test('independently valid but disagreeing body fields fall back without averaging or extrapolation',()=>{
 const width=401,height=32,image={width,height,rgba:Buffer.alloc(width*height*4,255)},background=[255,255,255];
 const bodies=[{box:{x:0,y:0,w:203,h:5},mask:new Uint8Array(width*height)},
  {box:{x:198,y:0,w:203,h:5},mask:new Uint8Array(width*height)}];
 for(const body of bodies)for(let y=0;y<5;y++)for(let x=body.box.x;x<body.box.x+body.box.w;x++)body.mask[y*width+x]=1;
 for(let y=5;y<14;y++)for(let x=0;x<width;x++){
  const local=x>=198&&x!==202?[255,Math.min(255,225+(y-5)*4),Math.min(255,215+(y-5)*5)]:[255,205+(y-5)*5,185+(y-5)*7];
  image.rgba.set([...local,255],(y*width+x)*4);
 }
 const query=5*width+200,input={image,background,work:{checks:0}};
 const a=measure({...input,bodies:[bodies[0]],work:{checks:0}})(query),b=measure({...input,bodies:[bodies[1]],work:{checks:0}})(query);
 assert.notDeepEqual(a,background);assert.notDeepEqual(b,background);assert.ok(a.some((v,c)=>Math.abs(v-b[c])>18));
 assert.deepEqual(measure({...input,bodies})(query),background);
});
test('an empty certificate portfolio does not repeatedly search nonexistent local evidence',()=>{
 const costs=[];
 for(const count of [1,32]){
  const f=fixture();f.bodies[0].mask.fill(0);f.bodies=Array.from({length:count},()=>f.bodies[0]);
  const at=measure(f),before=f.work.checks;assert.deepEqual(at(5*48+20),f.background);costs.push(f.work.checks-before);
 }
 assert.equal(costs[0],costs[1],'bodies without a certified local field must not multiply query work');
});
test('malformed, extreme and executable inputs fail without reading provider accessors',()=>{
 for(const input of [null,{}, {...fixture(),bodies:new Array(1)}, {...fixture(),background:[0,NaN,0]},
  {...fixture(),work:{checks:-1}}, {...fixture(),bodies:Array(33).fill(fixture().bodies[0])},
  {...fixture(),bodies:[{box:{x:0,y:0,w:1000,h:5},mask:new Uint8Array(48*32)}]},
  {...fixture(),bodies:[{box:{x:8,y:0,w:24,h:5},mask:new Uint8Array(1)}]},
  {...fixture(),image:{width:513,height:513,rgba:Buffer.alloc(513*513*4)}}])assert.throws(()=>measure(input));
 let reads=0;const trap=()=>{reads++;throw Error('private');};
 const a=fixture();Object.defineProperty(a.bodies[0],'mask',{get:trap});assert.throws(()=>measure(a),TypeError);
 const b=fixture();b.bodies[0].mask=new Proxy(new Uint8Array(48*32),{get:trap});assert.throws(()=>measure(b),TypeError);
 assert.throws(()=>measure(new Proxy({}, {get:trap})),TypeError);assert.equal(reads,0);
 const suites=require('../scripts/test-suites'),runtime=require('../scripts/verify-runtime-package');
 assert.equal(suites.includesSuite(__filename,'unit'),true);assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-route-node-background.js'));
});
