'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {parseFrameFailureWitness:parse}=require('../packages/slideclone-core/scene-plan/source-scene-frame-diagnostics');
const gap=()=>({kind:'rail-gap',stage:'rail',side:1,startPx:10,endPx:30,trackPx:42.5,thicknessPx:2,allowedGapPx:8});
const corner=()=>({kind:'corner-unproven',xPx:32768,yPx:0,farX:true,farY:false,searchLimitPx:64});
test('numeric frame locations round trip independently and empty optional evidence stays empty',()=>{
 assert.equal(parse(undefined),undefined);
 for(const row of [gap(),corner(),{...gap(),stage:'corner-join',side:3}]){
  const actual=parse(row);assert.deepEqual(actual,row);assert.notEqual(actual,row);
 }
});
test('invalid empty nonfinite extreme and inconsistent diagnostics fail with a fixed safe error',()=>{
 for(const row of [null,{},[],{...gap(),side:4},{...gap(),side:.5},{...gap(),startPx:-1},
  {...gap(),endPx:32769},{...gap(),endPx:Infinity},{...gap(),endPx:NaN},{...gap(),trackPx:'42.5'},
  {...gap(),thicknessPx:13},{...gap(),thicknessPx:0},{...gap(),allowedGapPx:.5},
  {...gap(),allowedGapPx:20},{...gap(),endPx:10},{...gap(),stage:'sensitive-user-content'},
  {...corner(),farX:1},{...corner(),searchLimitPx:0},{...gap(),extra:'sensitive-user-content'}])
  assert.throws(()=>parse(row),{name:'TypeError',message:'Scene frame diagnostic is invalid'});
});
test('hostile descriptors and proxies cannot execute or leak their content through diagnostic parsing',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('sensitive-user-content');};
 for(const row of [new Proxy(gap(),{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  Object.defineProperty(gap(),'startPx',{get:trap}),{...gap(),[Symbol('sensitive-user-content')]:true}])
  assert.throws(()=>parse(row),{name:'TypeError',message:'Scene frame diagnostic is invalid'});
 assert.equal(calls,0);
});
test('frame diagnostic regressions enter unified unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite)
  .some(row=>path.normalize(row.file)===path.normalize('test/source-scene-frame-diagnostics.test.js')));
});
