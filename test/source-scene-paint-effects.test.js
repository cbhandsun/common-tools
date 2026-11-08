'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paintConflict}=require('../packages/slideclone-core/scene-plan/source-scene-physical-groups');
const {nativeGroupPaintBounds:bounds}=require('../packages/slideclone-core/scene-plan/native-group-paint-bounds');
const shape=(x,style={})=>({type:'rect',box:{x,y:30,w:10,h:10},style:{fill:'#123456',stroke:'none',strokeWidthPt:0,...style}});
const conflict=(a,b)=>paintConflict(a,b,{used:0,exhausted:false});

test('physical paint ordering includes shadow and glow outside the base geometry',()=>{
 const label=shape(30),shadow=shape(50,{shadow:{blurPt:2,distancePt:12,angleDeg:180}}),glow=shape(55,{glow:{radiusPt:20,alpha:1,color:'#123456'}});
 assert.equal(conflict(label,shadow),true);
 assert.equal(conflict(shadow,label),true);
 assert.equal(conflict(label,glow),true);
 assert.equal(conflict(glow,label),true);
 assert.equal(conflict(label,shape(150,{shadow:{blurPt:2,distancePt:12}})),false,'bounded effects on distant paint remain separable');
});

test('unknown or invalid effect bounds never prove separation or execute accessors',()=>{
 for(const style of [{reflection:{}},{shadow:{blurPt:Infinity}},{shadow:{distancePt:-1}},{shadow:{scaleX:2}},
  {glow:{radiusPt:41,alpha:1,color:'#123456'}},{glow:[]},{shadow:new Proxy({},{get(){throw Error('must not read');}})}])
  assert.equal(conflict(shape(30),shape(150,style)),true);
 let calls=0;const shadow={get blurPt(){calls++;return 0;}};
 assert.equal(conflict(shape(30),shape(150,{shadow})),true);assert.equal(calls,0);
});

test('empty effects preserve ordinary overlap decisions and unified CI includes this regression',()=>{
 assert.equal(conflict(shape(30),shape(55,{shadow:null,glow:null})),false);
 assert.equal(conflict(shape(30),shape(35)),true);
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-scene-paint-effects.test.js'));
});

test('paint envelopes compose stroke, rotation, default shadow and glow without changing the drawable',()=>{
 const item=shape(30,{strokeWidthPt:4,shadow:{},glow:{radiusPt:3,alpha:1,color:'#123456'}});item.rotation=90;
 const before=structuredClone(item),result=bounds(item),padding=2+4+1.5+3+2/12700;
 assert.ok(Math.abs(result.x-(30-padding))<1e-9);assert.ok(Math.abs(result.w-(10+2*padding))<1e-9);
 assert.deepEqual(item,before);
 const contracted=structuredClone(item);contracted.style.shadow.scaleX=.00001;contracted.style.shadow.scaleY=1;
 assert.deepEqual(bounds(contracted),result,'a centered contracted shadow stays within the conservative envelope');
 assert.ok(bounds({box:{x:0,y:0,w:0,h:100},style:{strokeWidthPt:2}}),'vertical zero-width native lines remain bounded');
});

test('paint bounds reject empty, malformed, extreme and unsafe input without observing user getters',()=>{
 for(const value of [null,undefined,[],{},new Proxy({},{get(){throw Error('must not read');}}),
  {box:{x:0,y:0,w:-1,h:1}},shape(Infinity),{...shape(0),rotation:NaN},shape(0,{strokeWidthPt:-1})])assert.equal(bounds(value),null);
 let reads=0;assert.equal(bounds({get box(){reads++;return {};}}),null);assert.equal(reads,0);
 assert.equal(bounds(shape(0,{Glow:{radiusPt:1,alpha:1,color:'#123456'}})),null);
 assert.ok(bounds(shape(0,{shadow:{blurPt:100000,distancePt:100000},glow:{radiusPt:40,alpha:0,color:'#000000'}})));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/native-group-paint-bounds.js'));
});

test('signed native connector extents and endpoint arrowheads have bounded paint without changing their path',()=>{
 const line={type:'line',box:{x:100,y:60,w:-60,h:-20},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,endArrow:'triangle'}};
 const before=structuredClone(line),paint=bounds(line);assert.ok(paint);
 assert.ok(paint.x<=39&&paint.y<=32);assert.ok(paint.x+paint.w>=101&&paint.y+paint.h>=61);
 assert.equal(conflict(line,{...shape(140),box:{x:140,y:20,w:10,h:10}}),false);
 assert.equal(conflict(line,{...shape(47),box:{x:47,y:32,w:5,h:5}}),true,'arrow body near the destination still prevents reordering');
 assert.equal(conflict(line,{...shape(28),box:{x:28,y:28,w:5,h:5}}),false,'the triangle does not paint beyond its tip into the node');
 const large=bounds({...line,style:{...line.style,endArrowWidth:'large'}});
 assert.ok(large&&large.y<paint.y&&large.y+large.h>paint.y+paint.h);
 assert.deepEqual(line,before);
 const straight={type:'line',box:{x:300,y:56,w:20,h:-1},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,endArrow:'triangle'}};
 assert.equal(conflict(straight,{...shape(30),box:{x:30,y:27,w:260,h:7}}),false);
 assert.equal(bounds({...line,rotation:90}),null);
 assert.equal(bounds({...line,style:{...line.style,endArrow:{type:'triangle'}}}),null);
 assert.equal(bounds({...line,style:{...line.style,endArrowLength:'unbounded'}}),null);
});

test('terminal arrow envelopes follow both endpoint tangents and preserve actual body and effect overlaps',()=>{
 for(const reverse of [false,true])for(const key of ['startArrow','endArrow']){
  const line={type:'line',box:{x:reverse?100:0,y:30,w:reverse?-100:100,h:0},
   style:{fill:'none',stroke:'#123456',strokeWidthPt:4,[key]:'triangle'}};
  const tip=key==='startArrow'?line.box.x:line.box.x+line.box.w,inside=tip===0?1:-1;
  const outside={...shape(0),box:{x:tip-inside*20-2,y:28,w:4,h:4}};
  const body={...shape(0),box:{x:tip+inside*12-2,y:40,w:4,h:4}};
  assert.equal(conflict(line,outside),false);
  assert.equal(conflict(line,body),true);
  assert.equal(conflict({...line,style:{...line.style,glow:{radiusPt:24,alpha:1,color:'#123456'}}},outside),true);
 }
});

test('paint proofs include the writer default line width and its supported legacy alias',()=>{
 const line={type:'line',box:{x:10,y:30,w:80,h:0},style:{fill:'none',stroke:'#123456',endArrow:'triangle'}};
 const defaultPaint=bounds(line),explicitPaint=bounds({...line,style:{...line.style,strokeWidthPt:1}});
 assert.deepEqual(defaultPaint,explicitPaint);assert.ok(defaultPaint);
 const legacy=bounds({...line,style:{...line.style,strokeWidth:4}}),modern=bounds({...line,style:{...line.style,strokeWidthPt:4}});
 assert.deepEqual(legacy,modern);assert.ok(legacy&&legacy.h>defaultPaint.h);
 assert.equal(conflict(line,{...shape(82),box:{x:82,y:34,w:3,h:2}}),true,'the default arrow body has nonzero paint');
});

test('native preset paint includes every actual bend outside the signed endpoint box',()=>{
 const {nativeElbowConnector,nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
 const connector=nativeElbowConnector([{x:20,y:20},{x:100,y:20},{x:100,y:80},{x:40,y:80}]);assert.ok(connector);
 const item={type:'line',box:{x:20,y:20,w:20,h:60},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,...connector}};
 const paint=bounds(item);assert.ok(paint);
 for(const p of nativeElbowVertices(connector))assert.ok(p.x>=paint.x&&p.x<=paint.x+paint.w&&p.y>=paint.y&&p.y<=paint.y+paint.h);
 assert.equal(conflict(item,{...shape(95),box:{x:95,y:45,w:10,h:10}}),true,'an outside elbow remains a paint conflict');
 assert.equal(conflict(item,{...shape(40),box:{x:40,y:40,w:10,h:10}}),false,'empty space between the actual legs is not paint');
 const {nativeLinePaintDisjoint}=require('../packages/slideclone-core/scene-plan/native-group-paint-bounds');
 const work={used:4000000,exhausted:false};assert.equal(nativeLinePaintDisjoint(item,{x:40,y:40,w:10,h:10},work),false);
 assert.equal(work.exhausted,true);assert.equal(work.used,4000000);
 assert.equal(conflict({...item,style:{...item.style,glow:{radiusPt:30,alpha:1,color:'#123456'}}},{...shape(40),box:{x:40,y:40,w:10,h:10}}),true);
 assert.equal(bounds({...item,style:{...item.style,connectorFrame:undefined}}),null);
});

test('ordinary visual-atom straight defaults remain bounded and unsupported presets stay conservative',()=>{
 const item={type:'line',box:{x:20,y:20,w:0,h:80},style:{stroke:'#123456',strokeWidthPt:2,connectorType:'straight'}};
 const before=structuredClone(item),paint=bounds(item);assert.ok(paint);assert.ok(paint.x<=19&&paint.y<=19&&paint.h>=82);
 assert.equal(conflict(item,shape(150)),false);assert.deepEqual(item,before);
 assert.equal(bounds({...item,style:{...item.style,connectorType:'unknown'}}),null);
 assert.equal(bounds({...item,style:{...item.style,fill:'#123456'}}),null);
});
