"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSceneMeasurementCache}=require("../packages/slideclone-core/scene-plan/source-scene-measurement-cache");
const {measureLayeredSceneBackground}=require("../packages/slideclone-core/scene-plan/source-scene-layered-background");
const {parseBandBackground,crossesUnobservedCore,curveTouchesUnobservedCore}=require("../packages/slideclone-core/scene-plan/source-scene-band-geometry");
function fixture(){
 const image={width:1200,height:400,rgba:Buffer.alloc(1200*400*4,255)},hint={x:20,y:80,w:1160,h:260};
 const paint=(box,color)=>{for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([...color,255],(y*image.width+x)*4);};
 paint(hint,[253,233,241]);
 const children=Array.from({length:4},(_,index)=>({x:80+index*270,y:150,w:200,h:140}));
 for(const child of children)paint(child,[242,247,252]);
 const budget={used:0},cache=createSceneMeasurementCache(image,[],budget);
 return {image,hint,children,budget,cache,paint};
}
test("source-measured children allow a large parent without scanning an oversized full-body rectangle",()=>{
 const f=fixture();for(const child of f.children)assert.ok(f.cache.surface(child).measured);
 assert.equal(f.cache.surface(f.hint).measured,null);
 const fit=f.cache.layeredBackground(f.hint,f.children);assert.ok(fit);
 assert.equal(fit.fill,"#FDE9F1");assert.deepEqual(fit.box,f.hint);
 assert.ok(fit.support>=.58);assert.ok(fit.segments.length<=120);assert.ok(f.budget.used<=4000000);
 const frame=parseBandBackground({image:f.image,hint:f.hint,textMasks:[],owners:[],budget:{used:0}});
 assert.ok(frame.area<=262144);assert.ok(frame.area<f.hint.w*f.hint.h);
});
test("unmeasured provider child boxes cannot authorize parent foreground masks",()=>{
 const f=fixture(),before=f.budget.used;
 assert.equal(f.cache.layeredBackground(f.hint,f.children),null);assert.equal(f.budget.used,before);
});

test("a complete layered source body retains its physical frame independently of the returned drawing",()=>{
 const {measuredSceneOpaqueSurface,hasMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
 const f=fixture();for(const child of f.children)assert.ok(f.cache.surface(child).measured);
 assert.equal(f.cache.portFrame(f.hint),null);
 const fit=f.cache.layeredBackground(f.hint,f.children);assert.ok(fit);
 const used=f.budget.used,token=f.cache.portFrame(f.hint);assert.ok(token);
 assert.equal(hasMeasuredScenePortFrame(f.image,token,fit.box),true);
 const physical=measuredSceneOpaqueSurface(f.image,token);assert.ok(physical);assert.ok(physical.vertices.length>=4);
 fit.fill='#000000';fit.segments[0].points[0].x=.5;
 assert.deepEqual(measuredSceneOpaqueSurface(f.image,f.cache.portFrame(f.hint)),physical);
 assert.equal(f.budget.used,used,'retaining physical evidence must not scan again');
 assert.equal(measuredSceneOpaqueSurface({...f.image,rgba:Buffer.from(f.image.rgba)},token),null);
 assert.equal(measuredSceneOpaqueSurface(f.image,{}),null);
 const other=createSceneMeasurementCache(f.image,[],{used:0});assert.equal(other.portFrame(f.hint),null);
});
test("a source gap exposing the unknown core remains unresolved",()=>{
 const f=fixture();f.paint({x:20,y:160,w:60,h:40},[255,255,255]);
 for(const child of f.children)assert.ok(f.cache.surface(child).measured);
 assert.equal(f.cache.layeredBackground(f.hint,f.children),null);
});
test("blank, transparent and hollow-only bands cannot acquire an interior from child hints",()=>{
 for(const mode of ["blank","transparent","hollow"]){
  const f=fixture();f.paint(f.hint,[255,255,255]);
  if(mode==="transparent")for(let n=3;n<f.image.rgba.length;n+=4)f.image.rgba[n]=0;
  if(mode==="hollow")for(const b of [{x:20,y:80,w:1160,h:2},{x:20,y:338,w:1160,h:2},{x:20,y:80,w:2,h:260},{x:1178,y:80,w:2,h:260}])f.paint(b,[140,90,110]);
  assert.equal(measureLayeredSceneBackground({image:f.image,hint:f.hint,textMasks:[],owners:[{box:f.children[0]}],budget:{used:0}}),null);
 }
});
test("pixel exhaustion and an oversized band preserve both original scan caps",()=>{
 const f=fixture(),budget={used:3999000};
 assert.equal(measureLayeredSceneBackground({image:f.image,hint:f.hint,textMasks:[],owners:[{box:f.children[0]}],budget}),null);
 assert.equal(budget.used,3999000);
 const image={width:1800,height:900,rgba:Buffer.alloc(1800*900*4,255)},wideBudget={used:0};
 assert.equal(measureLayeredSceneBackground({image,hint:{x:20,y:100,w:1760,h:700},textMasks:[],owners:[{box:{x:100,y:150,w:200,h:100}}],budget:wideBudget}),null);
 assert.equal(wideBudget.used,0);
});
test("hostile control values fail without invoking accessors or coercion hooks",()=>{
 const f=fixture(),base={image:f.image,hint:f.hint,textMasks:[],owners:[],budget:{used:0}};let calls=0;
 const hostile={};Object.defineProperty(hostile,"hint",{get(){calls++;throw Error("private-secret");}});
 const coercion={toString(){calls++;throw Error("private-secret");}};
 const hostileSegment={type:coercion,points:[]};
 for(const input of [null,hostile,new Proxy(base,{}),{...base,textMasks:new Array(1)},
  {...base,owners:[{box:f.children[0],segments:[hostileSegment,hostileSegment,hostileSegment,hostileSegment]}]},
  {...base,budget:{used:Infinity}},{...base,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(f.image.rgba.length))}}]){
  assert.throws(()=>measureLayeredSceneBackground(input),/Scene background band/);
 }
 assert.equal(calls,0);
});
test("closing edges and curve control hulls cannot cross an unobserved core",()=>{
 const core={x:4,y:4,w:2,h:2};
 assert.equal(crossesUnobservedCore([{x:0,y:5},{x:10,y:5},{x:10,y:10}],core),true);
 const owner={box:{x:0,y:0,w:10,h:10},segments:[{type:"moveTo",points:[{x:0,y:0}]},
  {type:"cubicBezTo",points:[{x:.5,y:.5},{x:.5,y:.5},{x:1,y:0}]},{type:"close",points:[]}]};
 assert.equal(curveTouchesUnobservedCore(owner,core),true);
});
test("layered background regressions are discovered by the unified unit suite",()=>{
 const {includesSuite,classifyTestFile}=require("../scripts/test-suites");
 assert.equal(classifyTestFile(__filename),"unit");assert.equal(includesSuite(__filename,"unit"),true);
});

test("band ownership accepts the cubic contour already emitted by the source tracer",()=>{
 const {parseBandBackground,ownerVertices}=require("../packages/slideclone-core/scene-plan/source-scene-band-geometry");
 const f=fixture(),segments=[{type:"moveTo",points:[{x:0,y:0}]},
  {type:"cubicBezTo",points:[{x:.5,y:0},{x:1,y:.5},{x:1,y:1}]},
  {type:"lnTo",points:[{x:0,y:1}]},{type:"close",points:[]}];
 const parsed=parseBandBackground({image:f.image,hint:f.hint,textMasks:[],owners:[{box:f.children[0],segments}],budget:{used:0}});
 assert.equal(parsed.owners[0].segments[1].type,"cubicBezTo");
 assert.ok(ownerVertices(parsed.owners[0]).length>4);
 segments[1].points[0].x=.9;assert.equal(parsed.owners[0].segments[1].points[0].x,.5);
});

test("cubic band owners reject malformed, out of range, hostile and over-budget controls",()=>{
 const {parseBandBackground}=require("../packages/slideclone-core/scene-plan/source-scene-band-geometry");
 const f=fixture(),curve=[{type:"moveTo",points:[{x:0,y:0}]},
  {type:"cubicBezTo",points:[{x:.5,y:0},{x:1,y:.5},{x:1,y:1}]},
  {type:"lnTo",points:[{x:0,y:1}]},{type:"close",points:[]}];
 let calls=0;const accessor={};Object.defineProperty(accessor,"x",{get(){calls++;return .5;}});accessor.y=0;
 const invalid=[[],[{x:.5,y:0}],[{x:.5,y:0},{x:1,y:.5}],
  [{x:-.01,y:0},{x:1,y:.5},{x:1,y:1}],
  [{x:.5,y:0},{x:1,y:NaN},{x:1,y:1}],
  [accessor,{x:1,y:.5},{x:1,y:1}],new Proxy(curve[1].points,{})];
 for(const points of invalid){const segments=[curve[0],{type:"cubicBezTo",points},curve[2],curve[3]];
  assert.throws(()=>parseBandBackground({image:f.image,hint:f.hint,textMasks:[],owners:[{box:f.children[0],segments}],budget:{used:0}}),/owner contour/);}
 const segments=[curve[0],...Array.from({length:119},()=>curve[1]),curve[3]];
 assert.throws(()=>parseBandBackground({image:f.image,hint:f.hint,textMasks:[],owners:[{box:f.children[0],segments}],budget:{used:0}}),/owner contour/);
 assert.equal(calls,0);
});
