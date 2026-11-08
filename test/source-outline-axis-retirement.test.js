'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {outlineOwnsAxisLine:owns}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
function fixture(){
 const line={id:'old-axis',type:'line',box:{x:20,y:10,w:60,h:0},style:{stroke:'#445566',strokeWidthPt:2,connectorType:'straight'},
  source:{nativeRebuild:true,detector:'visual-atom-native-connector',nativeComponentPart:'connector'}};
 const sourcePixels=[];for(let x=10;x<=90;x++){sourcePixels.push(10*100+x,90*100+x);}for(let y=11;y<90;y++)sourcePixels.push(y*100+10,y*100+90);
 const outline={box:{x:10,y:10,w:81,h:81},sourcePixels};
 const context={shapes:[line],protectedMembers:new Set(),work:{used:0,exhausted:false}};
 return {line,outline,context,run(){return owns(this.line,this.outline,100,{x:1,y:1},this.context);}};
}
test('a complete unbound visual axis yields to one measured source ring without changing inputs',()=>{
 const f=fixture(),before=JSON.stringify({line:f.line,outline:f.outline});assert.equal(f.run(),true);
 assert.equal(JSON.stringify({line:f.line,outline:f.outline}),before);assert.ok(f.context.work.used>f.outline.sourcePixels.length);
 const reverse=fixture();reverse.line.box={x:10,y:20,w:0,h:60};assert.equal(reverse.run(),true);
 assert.equal(owns(f.line,f.outline,100,{x:1,y:1}),false,'the legacy public predicate alone supplies no visual-axis retirement context');
});
test('one missing shaft sample, partial overlap, interior and crossing lines cannot retire',()=>{
 for(const mode of ['gap','endpoint','interior','crossing','diagonal','point']){
  const f=fixture();if(mode==='gap')f.outline.sourcePixels=f.outline.sourcePixels.filter(n=>n!==1050);
  if(mode==='endpoint')f.outline.sourcePixels=f.outline.sourcePixels.filter(n=>n!==1020);
  if(mode==='interior')f.line.box.y=50;if(mode==='crossing')f.line.box={x:0,y:10,w:99,h:0};
  if(mode==='diagonal')f.line.box.h=30;if(mode==='point')f.line.box.w=0;
  assert.equal(f.run(),false,mode);
 }
});
test('arrows, anchors, unknown effects, transformed and non-native line paint stay independent',()=>{
 for(const style of [{startArrow:'triangle'},{endArrow:'triangle'},{startAnchor:{elementId:'a'}},{endAnchor:{elementId:'b'}},
  {shadow:{}},{gradient:{}},{strokeDashPattern:[2,2]},{connectorType:'elbow'},{opacity:.5},{stroke:'none'},{stroke:'transparent'},
  {strokeWidthPt:0},{strokeWidthPt:Infinity},{strokeWidthPt:20},{unexpected:true}]){
  const f=fixture();Object.assign(f.line.style,style);assert.equal(f.run(),false,JSON.stringify(style));
 }
 for(const source of [{nativeRebuild:false},{semanticNativeStructure:true},{sceneRelationId:'relation'},{sceneInventoryId:'object'},
  {detector:'other'},{nativeComponentPart:'node'}]){
  const f=fixture();Object.assign(f.line.source,source);assert.equal(f.run(),false,JSON.stringify(source));
 }
 const rotated=fixture();rotated.line.rotation=90;assert.equal(rotated.run(),false);
});
test('protected, duplicated and externally referenced native IDs cannot retire',()=>{
 for(const mode of ['protected','duplicate','reference-start','reference-end','foreign']){
  const f=fixture();if(mode==='protected')f.context.protectedMembers.add(f.line);
  if(mode==='duplicate')f.context.shapes.push({...f.line});
  if(mode.startsWith('reference'))f.context.shapes.push({id:'relation',style:{[mode==='reference-start'?'startAnchor':'endAnchor']:{elementId:f.line.id}}});
  if(mode==='foreign')f.context.shapes=[structuredClone(f.line)];assert.equal(f.run(),false,mode);
 }
});
test('the original shared geometry limit fails closed and does not create a source scan allowance',()=>{
 const good=fixture();assert.equal(good.run(),true);const cost=good.context.work.used;
 const exact=fixture();exact.context.work.used=4000000-cost;assert.equal(exact.run(),true);assert.equal(exact.context.work.used,4000000);
 const short=fixture();short.context.work.used=4000001-cost;assert.equal(short.run(),false);assert.equal(short.context.work.exhausted,true);assert.ok(short.context.work.used<=4000000);
 const done=fixture();done.context.work.exhausted=true;assert.equal(done.run(),false);assert.equal(done.context.work.used,0);
});
test('empty, malformed, over-limit and hostile controls cannot grant retirement or execute accessors',()=>{
 let touched=false;const evil=new Proxy({},{get(){touched=true;throw Error('private');}}),getter={get id(){touched=true;throw Error('private');}};
 for(const line of [null,{},evil,getter]){const f=fixture();f.line=line;assert.equal(f.run(),false);}
 for(const pixels of [[],new Array(2),[NaN],[-1],[100*16384],[1,'2'],new Array(262145).fill(1),evil]){
  const f=fixture();f.outline.sourcePixels=pixels;assert.equal(f.run(),false);
 }
 for(const context of [null,{},evil,{get work(){touched=true;throw Error('private');}}]){const f=fixture();f.context=context;assert.equal(f.run(),false);}
 assert.equal(touched,false);
});
test('the retirement regression enters unified CI and the module ships in the installed runtime',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 for(const suite of ['all','unit'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(p=>p.file.endsWith('source-outline-axis-retirement.test.js')));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-outline-axis-retirement.js'));
});
