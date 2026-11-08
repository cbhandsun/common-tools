'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedHeadBranch:observe}=require('../packages/slideclone-core/routing/source-shared-head-branch');
function fixture(){
 const width=64,height=64,mask=new Uint8Array(width*height);
 for(let y=5;y<=30;y++)mask[y*width+32]=1;
 for(let x=10;x<=54;x++)mask[30*width+x]=1;
 for(let y=30;y<=56;y++){mask[y*width+10]=1;mask[y*width+54]=1;}
 return {width,height,mask,start:56*width+10,terminals:[5*width+32,56*width+10,56*width+54],work:{checks:0}};
}
test('terminal branches stop before the first shared junction and do not depend on endpoint order',()=>{
 const f=fixture(),before=f.mask.slice(),path=observe(f);assert.ok(path);assert.ok(path.length>20);
 assert.deepEqual(path[0],{x:10,y:56});assert.ok(path.at(-1).x<=32&&path.at(-1).y>=29);
 assert.ok(path.every(p=>p.x<=32&&p.y>=29));
 for(const terminals of [f.terminals.slice().reverse(),[f.terminals[1],f.terminals[2],f.terminals[0]]])
  assert.deepEqual(observe({...fixture(),terminals}),path);
 assert.deepEqual(f.mask,before);assert.ok(f.work.checks>0&&f.work.checks<=4000000);
});
test('measured terminal branches retain source cells under transposition and reversal',()=>{
 const original=fixture(),baseline=observe(original);
 for(const transpose of [false,true])for(const reverse of [false,true]){
  const point=(x,y)=>{const a=reverse?63-x:x;return transpose?{x:y,y:a}:{x:a,y};};
  const index=n=>{const p=point(n%64,Math.floor(n/64));return p.y*64+p.x;},mask=new Uint8Array(4096);
  for(let n=0;n<mask.length;n++)mask[index(n)]=original.mask[n];
  const path=observe({...fixture(),mask,start:index(original.start),terminals:original.terminals.map(index)});assert.ok(path);
  assert.deepEqual(path[0],point(baseline[0].x,baseline[0].y));assert.ok(path.every(p=>mask[p.y*64+p.x]));
  const expected=baseline.map(p=>point(p.x,p.y));assert.ok(path.every(p=>expected.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=1.5)));
 }
});
test('disconnected, empty, malformed, hostile and exhausted branch observations grant no path',()=>{
 const disconnected=fixture();disconnected.mask[20*64+32]=0;assert.equal(observe(disconnected),null);
 const exhausted=fixture();exhausted.work.checks=4000000;assert.equal(observe(exhausted),null);assert.ok(exhausted.work.checks>4000000);
 for(const value of [null,{}, {...fixture(),mask:new Uint8Array(1)}, {...fixture(),terminals:[]}, {...fixture(),terminals:[1,2,3]},
  {...fixture(),terminals:new Array(3)}, {...fixture(),start:-1}, {...fixture(),width:100000}, {...fixture(),work:{checks:NaN}}])assert.throws(()=>observe(value),TypeError);
 let calls=0;const trap=()=>{calls++;throw Error('private');};
 const getter=fixture();Object.defineProperty(getter,'mask',{get:trap});
 for(const value of [getter,new Proxy({}, {get:trap}),{...fixture(),mask:new Proxy(new Uint8Array(4096),{get:trap})}])assert.throws(()=>observe(value),TypeError);
 assert.equal(calls,0);assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-shared-head-branch.js'));
});
