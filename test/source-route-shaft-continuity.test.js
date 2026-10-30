'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMeasuredShaftContinuity:create}=require('../packages/slideclone-core/routing/source-route-shaft-continuity');
function fixture(){
 const width=40,height=40,shaft=new Uint8Array(width*height),cells=Array.from({length:24},(_,i)=>(i+8)*width+20);
 for(const cell of cells)for(let dx=-2;dx<=2;dx++)shaft[cell+dx]=1;
 return {width,height,shaft,edges:[{cells,widthPx:3}],work:{checks:0}};
}
test('measured path continuity retains its own width and excludes tips, absent ink and detached geometry',()=>{
 const f=fixture(),before=f.shaft.slice(),geometry=structuredClone(f.edges),reader=create(f);assert.ok(reader);
 assert.equal(reader(20*40+20),true);assert.equal(reader(20*40+22),true);assert.equal(reader(20*40+23),false);
 assert.equal(reader(8*40+20),false);assert.equal(reader(31*40+20),false);
 f.shaft[20*40+23]=1;assert.equal(reader(20*40+23),false,'no 2% halo or joint radius can enlarge the own-width bound');f.shaft[20*40+23]=0;
 assert.deepEqual(f.shaft,before);assert.deepEqual(f.edges,geometry);
 for(const cell of [null,{},-1,1600,1.5,NaN,Infinity,'820'])assert.equal(reader(cell),false);
 assert.ok(f.work.checks<=4000000);
});
test('empty shafts and short paths cannot substitute for two observed interior arms',()=>{
 const f=fixture();assert.equal(create({...f,edges:[]})(20*40+20),false);
 assert.equal(create({...f,edges:[{widthPx:3,cells:f.edges[0].cells.slice(0,8)}]})(10*40+20),false);
 const empty={...f,shaft:new Uint8Array(1600),edges:[]};assert.equal(create(empty)(820),false);
});
test('both source axes and nonzero typed-array offsets preserve witnesses; a hairpin cannot supply opposite arms',()=>{
 const f=fixture(),mask=f.shaft.slice();for(let y=0;y<40;y++)for(let x=0;x<40;x++)f.shaft[x*40+y]=mask[y*40+x];
 f.edges[0].cells=f.edges[0].cells.map(n=>n%40*40+Math.floor(n/40));
 const storage=new Uint8Array(1620);storage.set(f.shaft,10);f.shaft=storage.subarray(10,1610);
 assert.equal(create(f)(22*40+20),true);
 const points=[[10,10],[11,10],[12,10],[13,10],[14,10],[14,11],[13,11],[12,11],[11,11]],shaft=new Uint8Array(1600),cells=points.map(([x,y])=>y*40+x);
 for(const n of cells)shaft[n]=1;
 assert.equal(create({width:40,height:40,shaft,edges:[{cells,widthPx:1}],work:{checks:0}})(10*40+14),false);
});
test('invalid frames, disconnected paths, duplicate cells and extreme geometry fail closed',()=>{
 for(const edit of [f=>f.width=0,f=>f.height=Infinity,f=>f.height=1000000,f=>f.shaft=[],f=>f.shaft=new Uint8Array(2),
  f=>f.edges[0].widthPx=NaN,f=>f.edges[0].widthPx=6,f=>f.edges[0].widthPx=0,f=>f.edges[0].cells[1]=999,
  f=>f.edges[0].cells[1]=f.edges[0].cells[0],f=>f.shaft[f.edges[0].cells[1]]=0,f=>f.edges[0].cells=new Array(9),f=>f.edges=Array(1025).fill({})]){
  const f=fixture();edit(f);assert.throws(()=>create(f),TypeError);
 }
});
test('unknown input never invokes proxies, accessors or coercion hooks, including typed-array metadata',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,getPrototypeOf:trap,ownKeys:trap});
 for(const value of [null,proxy,{get work(){return trap();}}])assert.throws(()=>create(value),TypeError);
 for(const edit of [f=>f.edges=new Proxy([],{get:trap}),f=>f.edges[0]=proxy,
  f=>Object.defineProperty(f.edges[0],'widthPx',{get:trap}),f=>Object.defineProperty(f.edges[0].cells,'0',{get:trap}),
  f=>f.edges[0].widthPx={valueOf:trap},f=>f.shaft=new Proxy(f.shaft,{get:trap})]){
  const f=fixture();edit(f);assert.throws(()=>create(f),TypeError);
 }
 const f=fixture();Object.defineProperty(f.shaft,'length',{get:trap});const reader=create(f);assert.ok(reader);assert.equal(reader(820),true);assert.equal(calls,0);
});
test('construction and query exhaustion never produce a usable partial witness',()=>{
 const f=fixture();f.work.checks=3999999;assert.equal(create(f),null);assert.equal(f.work.checks,4000001);
 const full=fixture(),reader=create(full);assert.ok(reader);full.work.checks=4000000;assert.equal(reader(820),false);assert.equal(full.work.checks,4000001);
});
