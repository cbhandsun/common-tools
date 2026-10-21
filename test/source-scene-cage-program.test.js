'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {primitiveImage}=require('./helpers/scene-primitive-program-fixture.cjs');
const {compileSceneCageProgram:compile,cageSceneParentMembers:members,rebindCageSceneParentMembers:rebind}=require('../packages/slideclone-core/source-scene-cage-program');
function fixture(options={}){const f=primitiveImage('cylinder',options);return {image:f.image,
 object:{id:'object-unit',regionId:'region-root',kind:'container',box:f.box,nativeGeometry:f.nativeGeometry},textMasks:[],budget:{used:0},slideSize:{widthPt:f.image.width,heightPt:f.image.height}};}
test('complete source cage emits native faces and a source-bound receipt under the shared scan limit',()=>{
 const input=fixture(),before=Buffer.from(input.image.rgba),result=compile(input);assert.equal(result.failure,null,JSON.stringify(result));
 assert(result.shapes.length>0);assert(result.portFrame);assert(result.shapes.some(s=>s.id===result.anchorId));
 assert.deepEqual(members(input.image,result.parentPaint,input.object.id,result.shapes),result.shapes);
 assert(input.budget.used>0&&input.budget.used<=4000000);assert.deepEqual(input.image.rgba,before);
});
test('missing divider, blank source, masked source and exhausted budget never publish a partial unit',()=>{
 const missing=compile(fixture({missingSeam:true}));assert.equal(missing.failure,'cage-topology-mismatch');assert.equal(missing.shapes,undefined);
 const cap=compile(fixture({missingCap:true}));assert.notEqual(cap.failure,null);assert.equal(cap.shapes,undefined);
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(compile(blank).failure,'cage-source-isolation');
 const masked=fixture();masked.textMasks=[{x:35,y:35,w:8,h:8}];assert.equal(compile(masked).failure,'cage-source-text');
 const exhausted=fixture();exhausted.budget.used=4000000;assert.equal(compile(exhausted).failure,'cage-source-budget');assert.equal(exhausted.budget.used,4000000);
});
test('unobserved alpha and an oversized unit never allocate or publish a guessed source face',()=>{
 const transparent=fixture();transparent.image.rgba[(60*transparent.image.width+65)*4+3]=0;
 const result=compile(transparent);assert.equal(result.failure,'cage-source-alpha');assert.equal(result.shapes,undefined);
 const large=fixture();large.image={width:1100,height:600,rgba:Buffer.alloc(1100*600*4,255)};
 large.object.box={x:20,y:20,w:1000,h:500};large.slideSize={widthPt:1100,heightPt:600};
 const denied=compile(large);assert.equal(denied.failure,'cage-native-capacity');assert.equal(large.budget.used,0);assert.equal(denied.shapes,undefined);
});
test('copied, foreign, serialized, changed-source and changed-authority receipts grant no native membership',()=>{
 const input=fixture(),result=compile(input);assert.equal(result.failure,null);
 for(const token of [{},structuredClone(result.parentPaint),new Proxy(result.parentPaint,{})])assert.equal(members(input.image,token,input.object.id,result.shapes),null);
 assert.equal(members({...input.image,rgba:Buffer.from(input.image.rgba)},result.parentPaint,input.object.id,result.shapes),null);
 assert.equal(members({...input.image,width:input.image.width-1},result.parentPaint,input.object.id,result.shapes),null);
 assert.equal(members(input.image,result.parentPaint,input.object.id,result.shapes.slice(1)),null);
 assert.equal(members(input.image,result.parentPaint,input.object.id,structuredClone(result.shapes)),null);
 result.shapes[0].source.detector='provider-claim';assert.equal(members(input.image,result.parentPaint,input.object.id,result.shapes),null);
});
test('whole-unit grouping may rebind the private receipt only with identical rendering and source fields',()=>{
 const input=fixture(),r=compile(input);assert.equal(r.failure,null);
 const grouped=r.shapes.map(s=>({...s,source:{...s.source,nativeComponentGroupId:'scene-unit-object-unit'}}));
 assert.equal(rebind(input.image,r.parentPaint,input.object.id,r.shapes,grouped),true);assert.deepEqual(members(input.image,r.parentPaint,input.object.id,grouped),grouped);
 const altered=grouped.map(s=>({...s,style:{...s.style,fill:'#FFFFFF'}}));assert.equal(rebind(input.image,r.parentPaint,input.object.id,grouped,altered),false);
});
test('unsafe and extreme inputs fail before executing accessors or granting source permissions',()=>{
 let calls=0;const input=fixture();for(const value of [null,{},new Proxy(input,{}),{get object(){calls++;throw Error('private-content');}},
  {...input,object:{...input.object,kind:'icon'}},{...input,slideSize:{widthPt:Infinity,heightPt:200}},
  {...input,object:{...input.object,id:{toString(){calls++;throw Error('private-content');}}}},
  {...input,object:{...input.object,regionId:{toString(){calls++;throw Error('private-content');}}}},
  {...input,textMasks:[{x:NaN,y:0,w:10,h:10}]},{...input,object:{...input.object,box:{x:0,y:0,w:0,h:0}}}])
  assert.throws(()=>compile(value),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.equal(calls,0);assert.equal(compile({...input,object:{...input.object,nativeGeometry:{kind:'ellipse'}}}),null);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-cage-program.test.js','all'),true);
});
