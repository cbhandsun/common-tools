'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createCoreBackgroundRanges:create}=require('../packages/slideclone-core/routing/source-route-background-ranges');
function fixture(){
 const image={width:24,height:12,rgba:Buffer.alloc(24*12*4)},component=new Uint8Array(24*12),blocked=new Uint8Array(24*12),halo=new Uint8Array(24*12);
 for(let n=0;n<24*12;n++)image.rgba.set([100,110,120,255],n*4);
 return {image,window:{x:0,y:0,w:24,h:12},component,blocked,halo,work:{checks:0}};
}
const query=()=>({y:4,start:8,end:15,left:[100,110,120],step:[0,0,0],origin:8});
function oracle(f,q){
 let total=0,supported=0;
 for(let x=q.start;x<=q.end;x++){
  const n=q.y*f.window.w+x,offset=((f.window.y+q.y)*f.image.width+f.window.x+x)*4;
  if(f.blocked[n]||f.image.rgba[offset+3]!==255)return 'refused';if(f.component[n])continue;
  const delta=q.left.map((v,c)=>Math.abs(f.image.rgba[offset+c]-(v+q.step[c]*(x-q.origin))));
  if(f.halo[n]){if(delta.some(v=>v>=42))return 'refused';continue;}
  total++;if(delta.some(v=>v>18))return 'refused';if(delta.every(v=>v<=3))supported++;
 }
 return {total,supported};
}

test('complete physical range summaries reuse reads while retaining source bytes and support counts',()=>{
 const f=fixture(),source=Buffer.from(f.image.rgba),read=create(f),q=query();
 assert.deepEqual(read(q),{total:8,supported:8});const first=f.work.checks;
 assert.deepEqual(read({...q,left:[101,111,121]}),{total:8,supported:8});assert.ok(f.work.checks-first<first);
 assert.deepEqual(read({...q,start:9,end:14}),{total:6,supported:6});assert.deepEqual(f.image.rgba,source);
});

test('inconclusive envelopes use exact per-pixel predictions without false support or false rejection',()=>{
 const f=fixture(),q={...query(),end:9,left:[103,110,120],step:[2,0,0]};
 f.image.rgba[(4*24+9)*4]=108;
 assert.deepEqual(create(f)(q),{total:2,supported:2});
 const mixed=fixture();mixed.image.rgba[(4*24+9)*4]=104;mixed.image.rgba[(4*24+10)*4]=118;
 assert.deepEqual(create(mixed)({...query(),end:10}),{total:3,supported:1});
});

test('exterior and fringe limits preserve inclusive and strict boundaries with fractional predictions',()=>{
 for(const [halo,delta,expected]of [[false,3,{total:1,supported:1}],[false,3.00001,{total:1,supported:0}],
  [false,18,{total:1,supported:0}],[false,18.00001,'refused'],[true,41.99999,{total:0,supported:0}],[true,42,'refused']]){
  const f=fixture();f.halo[4*24+8]=Number(halo);
  assert.deepEqual(create(f)({...query(),end:8,left:[100-delta,110,120]}),expected);
 }
});

test('blocked and transparent source refuse even on a component; empty component-only ranges do not invent exterior support',()=>{
 for(const mode of ['body','transparent','foreign','core-body','core-transparent','core']){
  const f=fixture(),n=4*24+8;if(mode.startsWith('core'))f.component.fill(1);
  if(mode.endsWith('body'))f.blocked[n]=1;if(mode.endsWith('transparent'))f.image.rgba[n*4+3]=0;
  if(mode==='foreign')f.image.rgba[n*4]=10;
  assert.deepEqual(create(f)(query()),mode==='core'?{total:0,supported:0}:'refused',mode);
 }
});

test('ranged and original per-pixel proofs agree for deterministic mixed masks, noise, gradients and reversed predictions',()=>{
 let seed=76123;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let iteration=0;iteration<600;iteration++){
  const f=fixture(),q=query();q.left=q.left.map(v=>v+(random()-.5)*12);q.step=q.step.map(()=>random()*4-2);
  for(let x=8;x<=15;x++){
   const n=4*24+x;for(let c=0;c<3;c++)f.image.rgba[n*4+c]+=Math.floor(random()*45)-22;
   f.component[n]=Number(random()<.12);f.halo[n]=Number(random()<.35);
   f.blocked[n]=Number(random()<.01);if(random()<.01)f.image.rgba[n*4+3]=0;
  }
  const read=create(f);assert.deepEqual(read(q),oracle(f,q),String(iteration));
  const next={...q,left:q.left.map(v=>v+.125),step:q.step.map(v=>-v)};
  assert.deepEqual(read(next),oracle(f,next),String(iteration));
 }
});

test('source-view byte offsets and local windows remain independent between observer calls',()=>{
 const f=fixture(),storage=Buffer.alloc(40*30*4+32,255),rgba=storage.subarray(16,-16);
 for(let y=0;y<12;y++)f.image.rgba.copy(rgba,((y+7)*40+5)*4,y*24*4,(y+1)*24*4);
 f.image={width:40,height:30,rgba};f.window={x:5,y:7,w:24,h:12};
 assert.deepEqual(create(f)(query()),{total:8,supported:8});
 rgba[((7+4)*40+5+8)*4]=0;assert.equal(create({...f,work:{checks:0}})(query()),'refused');
});

test('partial summary or fallback budget failure returns no evidence and never caches an incomplete proof',()=>{
 for(const initial of [3999980,3999944]){
  const f=fixture();if(initial===3999944)f.image.rgba[(4*24+8)*4]=104;
  const read=create(f);f.work.checks=initial;assert.equal(read(query()),null);assert.ok(f.work.checks>4000000);
  f.work.checks=0;assert.deepEqual(read(query()),oracle(f,query()));
 }
});

test('malformed geometry, incompatible masks, unsafe spans and nonfinite predictions fail closed',()=>{
 for(const change of [f=>{f.window.x=-1;},f=>{f.window.w=0;},f=>{f.window.h=Number.MAX_SAFE_INTEGER;},
  f=>{f.halo=new Uint8Array(1);},f=>{f.image.rgba=f.image.rgba.subarray(1);},f=>{f.image.width=NaN;}]){
  const f=fixture();change(f);assert.throws(()=>create(f),RangeError);
 }
 const read=create(fixture());for(const bad of [{start:-1},{start:16,end:15},{end:16},{y:12},{y:NaN},{left:[Infinity,0,0]},
  {left:[]},{step:[0,0,NaN]},{origin:1.5},{step:[Number.MAX_VALUE,0,0],origin:-Number.MAX_SAFE_INTEGER}])
  assert.throws(()=>read({...query(),...bad}),RangeError);
});

test('range proof regressions run in both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-background-ranges.test.js'));
});
