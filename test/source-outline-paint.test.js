"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceOutlinePaint:measure}=require('../packages/slideclone-core/scene-plan/source-outline-paint');
const {applySourceOutlinePaint:apply}=require('../packages/slideclone-core/scene-plan/source-outline-paint-shapes');
const {hasClosedRingTopology}=require('../packages/slideclone-core/scene-plan/source-closed-ring');
const {measureOutlinedSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
function fixture(){
 const points=[],colors=new Map(),width=100;
 for(let y=10;y<70;y++)for(let x=10;x<80;x++){
  const edge=Math.min(x-10,79-x,y-10,69-y);if(edge>3)continue;
  points.push({x,y});colors.set(y*width+x,edge===1||edge===2?[20,70,90]:[180,210,220]);
 }
 return {points,colors,width};
}
test('source ring paint preserves a dark hollow core and pale fringes instead of flattening them',()=>{
 const input=fixture(),before=structuredClone(input),work={checks:0,exhausted:false},fit=measure(input,work);
 assert.ok(fit);assert.equal(fit.baseColor,'#b4d2dc');assert.equal(fit.parts.length,1);
 assert.equal(fit.parts[0].color,'#14465a');assert.ok(hasClosedRingTopology(fit.parts[0].segments));
 assert.ok(fit.parts.every(p=>p.segments.length<=120));assert.ok(work.checks>0&&work.checks<=4000000);
 assert.deepEqual(input,before);
});
test('uniform paint, empty input, missing colors and invalid samples retain explicit failure behavior',()=>{
 const uniform=fixture();for(const key of uniform.colors.keys())uniform.colors.set(key,[20,70,90]);
 assert.equal(measure(uniform,{checks:0,exhausted:false}),null);
 for(const mutate of [v=>v.points=[],v=>v.colors.delete(1010),v=>v.colors.set(1010,[0,NaN,0]),v=>v.width=0,
  v=>v.points[0].x=100,v=>v.points=Array(262145).fill({x:10,y:10})]){
  const input=fixture();mutate(input);assert.throws(()=>measure(input,{checks:0,exhausted:false}),TypeError);
 }
});
test('paint search consumes remaining contour allowance atomically and never returns partial paint',()=>{
 const input=fixture(),exhausted={checks:4000000,exhausted:false};
 assert.equal(measure(input,exhausted),null);assert.equal(exhausted.checks,4000000);
 const almost={checks:3999999,exhausted:false};assert.equal(measure(input,almost),null);
 assert.equal(almost.checks,4000001);assert.equal(almost.exhausted,true);
 for(const work of [null,{}, {checks:-1,exhausted:false},{checks:Infinity,exhausted:false},{checks:0,exhausted:1}])
  assert.throws(()=>measure(input,work),TypeError);
});
test('fragmented source paint that exceeds the physical part allowance retains the original ring',()=>{
 const input={width:200,points:[],colors:new Map()};
 for(let y=10;y<130;y++)for(let x=10;x<150;x++)if(Math.min(x-10,149-x,y-10,129-y)<4){
  input.points.push({x,y});input.colors.set(y*input.width+x,(x+y)%2?[20,70,90]:[180,210,220]);
 }
 const work={checks:0,exhausted:false};assert.equal(measure(input,work),null);
 assert.ok(work.checks<=4000000);
});
test('hostile source controls, map methods and work getters cannot execute or leak data',()=>{
 let reads=0;const input=fixture();input.colors.get=()=>{reads++;throw Error('private-token');};
 assert.ok(measure(input,{checks:0,exhausted:false}));
 const getter={get checks(){reads++;throw Error('private-token');},exhausted:false};
 for(const [value,work]of [[new Proxy(fixture(),{}),{checks:0,exhausted:false}],[fixture(),getter],
  [fixture(),new Proxy({checks:0,exhausted:false},{})]])
  assert.throws(()=>measure(value,work),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.equal(reads,0);
});
test('native paint keeps the original anchor geometry, existing text group and neighboring draw order',()=>{
 const fit=measure(fixture(),{checks:0,exhausted:false});assert.ok(fit);
 const path=[{type:'moveTo',points:[{x:0,y:0}]},{type:'lineTo',points:[{x:1,y:0}]},{type:'lineTo',points:[{x:1,y:1}]},{type:'close',points:[]}];
 const shape={id:'ring',type:'freeform',box:{x:10,y:20,w:140,h:120},style:{fill:'#888888',freeformSegments:path},source:{nativeComponentGroupId:'physical-text-group'}};
 const neighbor={id:'next',box:{x:0,y:0,w:5,h:5}},before=structuredClone(shape);
 const result=apply([shape,neighbor],new Map([['ring',fit]]));
 assert.deepEqual(shape,before);assert.equal(result.shapes[0].id,'ring');
 assert.deepEqual(result.shapes[0].style.freeformSegments,path);assert.equal(result.shapes.at(-1),neighbor);
 for(const part of result.shapes.slice(0,-1)){
  assert.deepEqual(part.box,shape.box);assert.equal(part.source.nativeComponentGroupId,'physical-text-group');
 }
 for(const segment of result.shapes[1].style.freeformSegments)for(const p of segment.points)assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
 assert.equal(result.shapes[1].source.sceneOutlinePaintOwnerId,'ring');
 const flat=apply([{...shape,source:{}}],new Map([['ring',fit]]));
 assert.ok(flat.shapes.every(s=>s.source.nativeComponentGroupId==='scene-paint-ring'));
 assert.deepEqual(apply([],new Map()).shapes,[]);
 assert.deepEqual(apply([shape],new Map()).shapes,[shape]);
});
test('closed-ring observation reuses its original source scan and rejects text contact before paint',()=>{
 const f=fixture(),image={width:100,height:100,rgba:Buffer.alloc(40000,255)};
 for(const p of f.points)image.rgba.set([...f.colors.get(p.y*100+p.x),255],(p.y*100+p.x)*4);
 const hint={x:10,y:10,w:70,h:60},budget={used:0},original=Buffer.from(image.rgba);
 const result=measureOutlinedSceneContainer(image,hint,[],budget);
 assert.ok(result?.paint);assert.equal(budget.used,86*76);assert.deepEqual(image.rgba,original);
 assert.equal(measureOutlinedSceneContainer(image,hint,[{x:10,y:30,w:4,h:10}],{used:0}),null);
});
test('new ring paint regressions are included in the unified unit suite',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 assert.equal(includesSuite('test/source-outline-paint.test.js','unit'),true);
});
