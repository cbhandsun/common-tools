"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fitSceneFillGeometry}=require('../packages/slideclone-core/scene-plan/source-scene-fill-geometry');
const {sameSceneFillComponent}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
function fixture(){
 const box={x:10,y:20,w:30,h:15},points=[];
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)points.push({x,y});
 return {box,points,wide:false,bridged:false,compound:false};
}
test('independent geometry retains a rectangle and cannot grant source ownership',()=>{
 const input=fixture(),before=structuredClone(input),result=fitSceneFillGeometry(input);
 assert.deepEqual(result,{});assert.deepEqual(input,before);
 assert.equal(sameSceneFillComponent(result,result),false);
 input.compound=true;const compound=fitSceneFillGeometry(input);
 assert.equal(compound.parts.length,1);assert.deepEqual(compound.parts[0].box,input.box);
 assert.equal(compound.parts[0].segments.length,5);
});
test('observed concavities and the bounded curved fallback retain their geometry',()=>{
 const {traceNativeMaskContours}=require('../packages/slideclone-core/scene-plan/native-mask-contours');
 const points=[];
 for(let x=20;x<180;x++)for(let y=22+(Math.floor((x-20)/2)%2)*2;y<42;y++)points.push({x,y});
 const box={x:20,y:22,w:160,h:20},state={checks:0,exhausted:false};
 const expected=traceNativeMaskContours(points,box,{outerOnly:true,curveFallback:true,minimizeSegments:false,workState:state,fastFail:false});
 const result=fitSceneFillGeometry({box,points,wide:true,bridged:false,compound:false});
 assert.deepEqual(result,{segments:expected});assert.ok(result.segments.some(s=>s.type==='cubicBezTo'));
 assert.ok(result.segments.length<=120);
});
test('empty and unrepresentable observations produce no geometry',()=>{
 assert.equal(fitSceneFillGeometry({...fixture(),points:[]}),null);
 const points=[];for(let y=0;y<33;y++)for(let x=0;x<33;x++)points.push({x:x*3,y:y*3});
 assert.equal(fitSceneFillGeometry({points,box:{x:0,y:0,w:100,h:100},wide:false,bridged:false,compound:true}),null);
});
test('untrusted controls, frames, pixels and accessors fail before evaluation',()=>{
 let evaluated=0;const trap={get x(){evaluated++;throw Error('content must not run');},y:20};
 const inputs=[null,[],{},new Proxy(fixture(),{}),{...fixture(),points:new Proxy([], {})},
  {...fixture(),points:[trap]},{...fixture(),points:Array(3)},
  {...fixture(),points:[{x:9,y:20}]},{...fixture(),points:[{x:10.5,y:20}]},
  {...fixture(),box:{x:0,y:0,w:513,h:512}},{...fixture(),box:{x:16384,y:0,w:1,h:1}},
  {...fixture(),wide:1},{...fixture(),compound:undefined}];
 for(const input of inputs)assert.throws(()=>fitSceneFillGeometry(input),TypeError);
 const withGetter={...fixture()};Object.defineProperty(withGetter,'points',{get(){evaluated++;throw Error('must not read');}});
 assert.throws(()=>fitSceneFillGeometry(withGetter),TypeError);assert.equal(evaluated,0);
});
test('the original window ceiling admits its exact boundary and rejects one excess cell',()=>{
 const box={x:0,y:0,w:512,h:512},points=[];
 for(let y=0;y<512;y++)for(let x=0;x<512;x++)points.push({x,y});
 const input={box,points,wide:false,bridged:false,compound:false};
 assert.deepEqual(fitSceneFillGeometry(input),{});
 assert.throws(()=>fitSceneFillGeometry({...input,points:[...points,{x:0,y:0}]}),TypeError);
});
test('the unified suites discover this geometry boundary regression',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
});
