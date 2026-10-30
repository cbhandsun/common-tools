'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
function fixture(){
 const page={shapes:[{id:'card',type:'rect',box:{x:10,y:10,w:40,h:30},style:{fill:'#EEEEEE',stroke:'none'},source:{sceneInventoryId:'card'}},
  {id:'route',type:'freeform',box:{x:50,y:20,w:30,h:20},style:{fill:'none',stroke:'#123456',strokeWidthPt:2,freeformPath:'[[0,0,0],[1,1,1]]',startAnchor:{elementId:'card',side:'right',position:.5}},source:{sceneRelationId:'relation',connector:true}}],
  images:[{id:'underlay',type:'fidelity-crop',assetPath:'assets/underlay.png',box:{x:0,y:0,w:100,h:80},source:{fullSlideResidual:true}},
   {id:'icon',type:'fidelity-crop',assetPath:'assets/icon.png',box:{x:15,y:15,w:5,h:5},source:{protectedMinimumUnit:true}}],
  textBoxes:[{id:'label',text:'Label',box:{x:15,y:15,w:30,h:10},style:{fontSizePt:12}}],source:{sourceScene:{sourceHash:'a'.repeat(64)}}};
 const gradient={type:'linear',angleDeg:90,stops:[{position:0,color:'#EEEEEE'},{position:1,color:'#DDDDDD'}]};
 const review={version:1,reviewId:'review-one',sourceHash:'a'.repeat(64),pageFingerprint:fingerprint(page),
  addedShapes:[{id:'new-background',type:'roundRect',box:{x:0,y:0,w:100,h:80},style:{fill:'#FAFAFA',stroke:'none',strokeWidthPt:0,radiusPt:4}}],
  shapeOrder:['new-background','card','route'],shapeChanges:[{id:'card',beforeFingerprint:fingerprint(page.shapes[0]),style:{...page.shapes[0].style,gradient}}],
  removedImageIds:['underlay'],textChanges:[{id:'label',beforeFingerprint:fingerprint(page.textBoxes[0]),style:{fontSizePt:12,textOutlineColor:'#000000',textOutlineWidthPt:.2}}]};
 return {page,slideSize:{widthPt:100,heightPt:80},review};
}
const plan=input=>require('../packages/slideclone-core/scene-plan/native-layer-change-plan').planNativeLayerChanges(input);
test('bounded native layer plans preserve source evidence and whole paths without granting application authority',()=>{
 const f=fixture(),before=structuredClone(f),result=plan(f);assert.deepEqual(f,before);
 assert.equal(result.applicationAuthorized,false);assert.equal(result.sourceErasureAuthority,false);assert.equal(result.strictSourceEquivalent,false);
 assert.equal(result.page.images.length,1);assert.equal(result.page.images[0],f.page.images[1]);
 assert.equal(result.page.shapes[2],f.page.shapes[1]);assert.equal(result.page.source,f.page.source);
 assert.equal(result.page.textBoxes[0].text,'Label');assert.deepEqual(result.page.shapes[1].box,f.page.shapes[0].box);
 assert.equal(result.page.shapes[0].source.nativeLayerProposal,true);assert.equal(result.page.shapes[0].source.semanticNativeStructure,undefined);
 f.review.shapeChanges[0].style.gradient.stops[0].color='#000000';assert.equal(result.page.shapes[1].style.gradient.stops[0].color,'#EEEEEE');
});
test('source bindings, full reviewed page bindings and per-object bindings cannot be replaced by public flags',()=>{
 for(const change of [f=>f.review.sourceHash='b'.repeat(64),f=>f.page.source.sourceScene.sourceHash='b'.repeat(64),
  f=>f.page.shapes[0].box.x++,f=>f.review.shapeChanges[0].beforeFingerprint='b'.repeat(64),f=>f.review.textChanges[0].beforeFingerprint='b'.repeat(64)]){
  const f=fixture();change(f);assert.throws(()=>plan(f),/native-layer-plan-binding/u);
 }
 const f=fixture();f.review.approved=true;assert.throws(()=>plan(f),/native-layer-plan-invalid/u);
});
test('styles cannot change text, geometry, anchors, path encoding or protected source identities',()=>{
 const changes=[f=>f.review.shapeChanges[0].style.stroke='#000000',f=>f.review.shapeChanges[0].style.freeformPath='altered',
  f=>f.review.textChanges[0].style.fontSizePt=14,f=>f.review.removedImageIds=['icon'],
  f=>f.review.shapeOrder=['new-background','route','card'],f=>f.review.addedShapes[0].type='freeform',
  f=>f.review.addedShapes[0].source={semanticNativeStructure:true},f=>f.review.shapeChanges.push(structuredClone(f.review.shapeChanges[0])),
  f=>f.review.shapeOrder=['new-background','card','card'],f=>f.review.removedImageIds=['absent']];
 for(const change of changes){const f=fixture();change(f);assert.throws(()=>plan(f),TypeError);}
 const f=fixture();f.review.shapeChanges=[{id:'route',beforeFingerprint:fingerprint(f.page.shapes[1]),style:{...f.page.shapes[1].style,glow:{radiusPt:2,alpha:.7,color:'#ABDFF4'}}}];
 assert.deepEqual(plan(f).page.shapes[2].style.glow,{radiusPt:2,alpha:.7,color:'#ABDFF4'});
 f.review.shapeChanges[0].style.gradient=f.review.addedShapes[0].style;assert.throws(()=>plan(f),TypeError);
 const noFlags=fixture();noFlags.page.shapes[1].source={};noFlags.review.pageFingerprint=fingerprint(noFlags.page);
 noFlags.review.shapeChanges=[{id:'route',beforeFingerprint:fingerprint(noFlags.page.shapes[1]),style:{...noFlags.page.shapes[1].style,fill:'#123456'}}];
 assert.throws(()=>plan(noFlags),/native-layer-plan-invalid/u);
});
test('unknown empty and extreme inputs reject with safe bounded diagnostics and never run provider hooks',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-layer-secret');};const f=fixture(),getter={...f};Object.defineProperty(getter,'page',{get:trap});
 const proxy=new Proxy(f,{get:trap,ownKeys:trap});
 const values=[null,[],getter,proxy,{...f,slideSize:{widthPt:Infinity,heightPt:80}}];
 for(const value of values)assert.throws(()=>plan(value),e=>e instanceof TypeError&&!e.message.includes('private-layer-secret'));
 const changes=[g=>g.review.shapeChanges[0].style.gradient.stops[0].position=NaN,g=>g.review.shapeChanges[0].style.gradient.stops[1].position=0,
  g=>g.review.shapeChanges[0].style.gradient.angleDeg=Infinity,g=>g.review.addedShapes[0].box.w=1e12,
  g=>g.review.addedShapes=Array(513).fill(g.review.addedShapes[0]),g=>g.review.shapeChanges[0].style.glow={radiusPt:41,alpha:.5,color:'#123456'},
  g=>g.review.textChanges[0].style.textOutlineColor='private-layer-secret',g=>g.review.textChanges[0].style.textOutlineWidthPt=-1];
 for(const change of changes){const g=fixture();change(g);assert.throws(()=>plan(g),TypeError);}
 assert.equal(calls,0);
 const nested=fixture();Object.defineProperty(nested.review.addedShapes[0].box,'x',{get:trap});
 assert.throws(()=>plan(nested),{name:'TypeError',message:'native-layer-plan-invalid'});assert.equal(calls,0);
 const cycle=fixture();cycle.review.textChanges[0].style.loop=cycle.review;assert.throws(()=>plan(cycle),{name:'TypeError',message:'native-layer-plan-invalid'});
 const empty=fixture();empty.review.addedShapes=[];empty.review.shapeOrder=['card','route'];empty.review.shapeChanges=[];empty.review.removedImageIds=[];empty.review.textChanges=[];
 assert.throws(()=>plan(empty),/native-layer-plan-invalid/u);
});
test('a removed image cannot remain an endpoint and new objects cannot collide with any existing drawing',()=>{
 const f=fixture();f.page.shapes[1].style.startAnchor.elementId='underlay';f.review.pageFingerprint=fingerprint(f.page);assert.throws(()=>plan(f),TypeError);
 const g=fixture();g.review.addedShapes[0].id='label';g.review.shapeOrder[0]='label';assert.throws(()=>plan(g),TypeError);
});
test('empty optional change sets and edge-aligned decorative lines remain bounded and discoverable in unit/all CI',t=>{
 const f=fixture();f.review.shapeChanges=[];f.review.textChanges=[];f.review.removedImageIds=[];
 f.review.addedShapes=[{id:'new-background',type:'line',box:{x:0,y:80,w:100,h:0},style:{fill:'none',stroke:'#123456',strokeWidthPt:1}}];
 const r=plan(f);assert.equal(r.page.shapes[0].box.h,0);assert.equal(r.page.images,f.page.images);assert.equal(r.page.textBoxes,f.page.textBoxes);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(t=>t.file.replaceAll('\\','/')==='test/native-layer-change-plan.test.js'));
 const files=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
 for(const name of ['input','style','plan'])assert.ok(files.includes('packages/slideclone-core/scene-plan/native-layer-change-'+name+'.js'));
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const installed=fs.mkdtempSync(path.join(os.tmpdir(),'native-layer-plan-consumer-'));t.after(()=>fs.rmSync(installed,{recursive:true,force:true}));
 const {copyCoreModuleClosure}=require('./helpers/isolated-core-package.cjs');
 const copied=copyCoreModuleClosure(installed,['native-layer-change-plan'],files);assert.ok(copied.includes('scene-plan/native-layer-change-plan.js'));
 const cold=require(path.join(installed,'scene-plan/native-layer-change-plan.js')).planNativeLayerChanges(f);
 assert.deepEqual(cold.changes,r.changes);assert.equal(cold.applicationAuthorized,false);assert.equal(cold.sourceErasureAuthority,false);
});
