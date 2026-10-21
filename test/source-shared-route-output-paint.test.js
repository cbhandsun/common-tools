'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedOutputFixture}=require('./helpers/source-shared-output.cjs');
const {measuredSharedSceneRoutePaintGroups:read}=require('../packages/slideclone-core/source-shared-route-compiler');
const {sharedSourcePaintCells}=require('../packages/slideclone-core/source-shared-route-measurement');
const {createSharedRouteOutputPaintRegistry}=require('../packages/slideclone-core/source-shared-route-output-paint');

test('shared output proof reads complete current members and charges unrelated indexed rows',()=>{
 const f=sourceSharedOutputFixture(),work={checks:0},before=Buffer.from(f.image.rgba);
 assert.equal(read(f.image,f.shapes,work).length,1);
 const padded=f.shapes.concat(Array.from({length:9000},(_,i)=>({id:'other-'+i,type:'rect',box:{x:0,y:0,w:1,h:1}})));
 const extra={checks:0};assert.equal(read(f.image,padded,extra).length,1);
 assert.ok(extra.checks>=work.checks+9000);assert.ok(extra.checks<=4000000);
 assert.deepEqual(f.image.rgba,before);
});

test('shared output proof refuses nonnumeric endpoint geometry without executing coercion',()=>{
 for(const value of ['130',null,NaN,Infinity,undefined,{}]){
  const f=sourceSharedOutputFixture();let coercions=0;
  f.bodies[0].box.x=value===undefined?{[Symbol.toPrimitive](){coercions++;return 130;}}:value;
  assert.throws(()=>read(f.image,f.shapes,{checks:0}),/shared paint/);
  assert.equal(coercions,0);
 }
});

test('shared output proof rejects accessors and proxies without evaluating user code',()=>{
 for(const mode of ['row','box','source','nested','proxy','array-proxy']){
  const f=sourceSharedOutputFixture();let calls=0;
  const getter=()=>{calls++;throw Error('sensitive-content');};
  if(mode==='row')Object.defineProperty(f.bodies[0],'box',{get:getter,enumerable:true});
  if(mode==='box')Object.defineProperty(f.bodies[0].box,'x',{get:getter,enumerable:true});
  if(mode==='source')Object.defineProperty(f.built.parts[0].source,'secret',{get:getter,enumerable:true});
  if(mode==='nested')f.built.parts[0].style.nested={get value(){return getter();}};
  if(mode==='proxy')f.built.parts[0].style=new Proxy({},{get:getter,ownKeys:getter,getPrototypeOf:getter});
  if(mode==='array-proxy')f.shapes=new Proxy(f.shapes,{get:getter,ownKeys:getter,getPrototypeOf:getter});
  let proofs=[];try{proofs=read(f.image,f.shapes,{checks:0});}catch(error){assert.match(error.message,/shared paint/);}
  assert.deepEqual(proofs,[],mode);assert.equal(calls,0,mode);
 }
});

test('shared output proof bounds snapshot strings and nested trees before serialization',()=>{
 for(const mode of ['long-string','wide-tree','cycle','deep']){
  const f=sourceSharedOutputFixture();let value;
  if(mode==='long-string')value='x'.repeat(262145);
  if(mode==='wide-tree')value=Array.from({length:30001},()=>0);
  if(mode==='cycle'){value={};value.self=value;}
  if(mode==='deep'){value={};let tail=value;for(let i=0;i<20;i++){tail.child={};tail=tail.child;}}
  f.built.parts[0].source.extra=value;
  assert.deepEqual(read(f.image,f.shapes,{checks:0}),[],mode);
 }
});

test('snapshot capture bounds source payloads before granting a registry entry',()=>{
 for(const value of ['x'.repeat(262145),Array.from({length:30001},()=>0)]){
  const f=sourceSharedOutputFixture(),registry=createSharedRouteOutputPaintRegistry();f.built.parts[0].source.extra=value;
  assert.throws(()=>registry.capture({fit:f.fit,image:f.image,parts:f.built.parts,slideSize:{widthPt:300,heightPt:230},work:{checks:0}}),/shared paint snapshot/);
  assert.deepEqual(registry.read(f.image,f.shapes,{checks:0}),[]);
 }
 const f=sourceSharedOutputFixture(),registry=createSharedRouteOutputPaintRegistry(),work={checks:3999999};
 assert.throws(()=>registry.capture({fit:f.fit,image:f.image,parts:f.built.parts,slideSize:{widthPt:300,heightPt:230},work}),/shared paint|shared path budget/);
 assert.deepEqual(registry.read(f.image,f.shapes,{checks:0}),[]);
});

test('shared output proof exhaustion grants no partial groups and invalid controls are rejected',()=>{
 const f=sourceSharedOutputFixture();assert.deepEqual(read(f.image,[],{checks:0}),[]);
 for(const start of [4000000,3999999]){const work={checks:start};assert.deepEqual(read(f.image,f.shapes,work),[]);assert.ok(work.checks>4000000);}
 for(const work of [null,{}, {checks:-1},{checks:NaN},{checks:Infinity},{checks:'0'},{checks:4000001}])
  assert.throws(()=>read(f.image,f.shapes,work),/shared paint/);
 assert.throws(()=>read(f.image,Array(10001).fill(f.bodies[0]),{checks:0}),/shared paint/);
 assert.throws(()=>read(null,f.shapes,{checks:0}),/shared paint/);
});

test('complete shared source cells are private, detached, budgeted and source preserving',()=>{
 const f=sourceSharedOutputFixture(),before=Buffer.from(f.image.rgba),work={checks:0};
 const cells=sharedSourcePaintCells(f.fit,f.image,work);assert.ok(cells instanceof Set&&cells.size>0);assert.ok(work.checks>0);
 const size=cells.size;cells.clear();assert.equal(sharedSourcePaintCells(f.fit,f.image,{checks:0}).size,size);
 for(const fit of [null,{},structuredClone(f.fit)])assert.equal(sharedSourcePaintCells(fit,f.image,{checks:0}),null);
 assert.equal(sharedSourcePaintCells(f.fit,{...f.image,rgba:Buffer.from(f.image.rgba)},{checks:0}),null);
 const exhausted={checks:3999999};assert.equal(sharedSourcePaintCells(f.fit,f.image,exhausted),null);assert.ok(exhausted.checks>4000000);
 for(const bad of [null,{}, {checks:-1},{checks:NaN},{checks:'0'}])assert.throws(()=>sharedSourcePaintCells(f.fit,f.image,bad),/shared paint/);
 let calls=0;const hostile={};Object.defineProperty(hostile,'checks',{get(){calls++;return 0;}});
 assert.throws(()=>sharedSourcePaintCells(f.fit,f.image,hostile),/shared paint/);assert.equal(calls,0);
 assert.deepEqual(f.image.rgba,before);
});

test('shared output boundary regressions enter the unified unit suite',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/source-shared-route-output-paint.test.js'));
});
