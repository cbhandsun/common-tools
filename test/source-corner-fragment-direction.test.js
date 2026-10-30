'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sourceCornerFragmentDirection:measure}=require('../packages/slideclone-core/scene-plan/source-corner-fragment-direction');
function fixture(sx=1,sy=1,offset=50){
 const points=[];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(Math.abs(x-y)<=1){
  const u=x,v=3-y;points.push({x:offset+(sx===1?u:3-u),y:offset+(sy===1?v:3-v)});
 }
 return {points,sx,sy,thickness:3,work:{checks:0,exhausted:false}};
}
test('compact source-cell diagonals retain direction in all four corners and at raster bounds',()=>{
 for(const sx of [-1,1])for(const sy of [-1,1])for(const offset of [0,50,16380]){
  const f=fixture(sx,sy,offset),before=structuredClone(f.points);assert.equal(measure(f),true);
  assert.deepEqual(f.points,before);assert.equal(f.work.exhausted,false);assert.equal(f.work.checks,3*f.points.length);
 }
});
test('empty sparse isotropic axis-aligned near-axis and wrong-turn source marks cannot supply a diagonal',()=>{
 const blank=fixture();blank.points=[];assert.equal(measure(blank),false);assert.equal(blank.work.checks,0);
 const sparse=fixture();sparse.points=sparse.points.slice(0,7);assert.equal(measure(sparse),false);
 const blob=fixture();blob.points=Array.from({length:16},(_,i)=>({x:i%4,y:Math.floor(i/4)}));assert.equal(measure(blob),false);
 const axis=fixture();axis.points=Array.from({length:12},(_,i)=>({x:i%6,y:Math.floor(i/6)}));assert.equal(measure(axis),false);
 const shallow=fixture();shallow.points=Array.from({length:12},(_,i)=>({x:i,y:3-Math.floor(i/5)}));assert.equal(measure(shallow),false);
 const wrong=fixture();wrong.sx=-1;assert.equal(measure(wrong),false);
 const thick=fixture();thick.thickness=12;assert.equal(measure(thick),false);
});
test('direction work shares the existing geometry ceiling and stops permanently at exhaustion',()=>{
 const f=fixture();f.work.checks=3999999;assert.equal(measure(f),false);assert.equal(f.work.exhausted,true);
 assert.equal(f.work.checks,4000001);assert.equal(measure(f),false);assert.equal(f.work.checks,4000001);
});
test('invalid extreme duplicate and hostile controls fail with a fixed diagnostic and no accessor execution',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('sensitive-source-content');};
 const hostile=Object.defineProperty({y:0},'x',{get:trap});
 const rows=[null,{},[],{...fixture(),sx:0},{...fixture(),sy:'1'},{...fixture(),thickness:Infinity},
  {...fixture(),points:new Array(1)},{...fixture(),points:Array(4097).fill({x:0,y:0})},
  {...fixture(),points:[{x:16384,y:0}]},{...fixture(),points:[{x:-1,y:0}]},
  {...fixture(),points:[{x:0,y:NaN}]},{...fixture(),points:[{x:.1,y:0}]},
  {...fixture(),points:[{x:0,y:0},{x:0,y:0}]},{...fixture(),points:[hostile]},
  {...fixture(),work:Object.freeze({checks:0,exhausted:false})},
  {...fixture(),work:{checks:4000002,exhausted:true}},
  {...fixture(),points:new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap})},
  new Proxy(fixture(),{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  Object.defineProperty(fixture(),'work',{get:trap}),{...fixture(),extra:'sensitive-source-content'}];
 for(const row of rows)assert.throws(()=>measure(row),{name:'TypeError',message:'Scene corner direction controls are invalid'});
 assert.equal(calls,0);
});
test('direction and complete-corner regressions enter unified unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])for(const name of ['source-corner-fragment-direction','source-scene-fragmented-corner'])
  assert(discoverTestFiles(process.cwd(),suite).some(row=>path.normalize(row.file)===path.normalize(`test/${name}.test.js`)));
});
