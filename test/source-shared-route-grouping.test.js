'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedFixedOutputFixture:sourceSharedOutputFixture}=require('./helpers/source-shared-output.cjs');
const {sealMeasuredSharedRouteGroups:seal}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
const {ungroupSourceNativeOverlays}=require('../packages/slideclone-core/scene-plan/source-native-finalization');
const page=f=>({shapes:f.shapes,images:[],textBoxes:[]});

test('all privately compiled fixed-path shared members survive finalization as one complete native group',()=>{
 const f=sourceSharedOutputFixture(),p=page(f),before=Buffer.from(f.image.rgba);
 const ids=new Set(f.built.parts.map(s=>s.source.nativeComponentGroupId));
 assert.deepEqual([...ids],['scene-network-shared-output']);
 const receipt=seal(f.image,p,0);
 assert.deepEqual([...retainedSceneGroupMembers(p,receipt)],f.built.parts);
 ungroupSourceNativeOverlays(p,receipt);
 assert.ok(f.built.parts.every(s=>s.source.nativeComponentGroupId==='scene-network-shared-output'));
 assert.ok(f.bodies.every(s=>s.source.nativeComponentGroupId===undefined));
 assert.deepEqual(f.image.rgba,before);
});

test('reroutable shared members keep graph and drawing but cannot retain a group across business endpoints',()=>{
 const f=require('./helpers/source-shared-output.cjs').sourceSharedOutputFixture(),p=page(f),graph=structuredClone(f.built.graph),
  drawing=f.built.parts.map(s=>structuredClone({id:s.id,type:s.type,box:s.box,style:s.style}));
 assert.ok(f.built.parts.some(s=>s.source.nativeConnectorRoute===true));const receipt=seal(f.image,p,0);
 assert.equal(retainedSceneGroupMembers(p,receipt).size,0);ungroupSourceNativeOverlays(p,receipt);
 assert.deepEqual(f.built.graph,graph);assert.deepEqual(f.built.parts.map(s=>({id:s.id,type:s.type,box:s.box,style:s.style})),drawing);
 assert.ok(f.built.parts.every(s=>s.source.nativeComponentGroupId===undefined));
});

test('missing, duplicated, replaced, modified and foreign shared members cannot retain a partial group',()=>{
 for(const mode of ['missing','duplicate','clone','style','source','foreign','endpoint','raster','order']){
  const f=sourceSharedOutputFixture(),p=page(f);let image=f.image;
  if(mode==='missing')p.shapes=p.shapes.filter(s=>s!==f.built.parts[0]);
  if(mode==='duplicate')p.shapes.push(f.built.parts[0]);
  if(mode==='clone')p.shapes=p.shapes.map(s=>s===f.built.parts[0]?structuredClone(s):s);
  if(mode==='style')f.built.parts[0].style.opacity=.5;
  if(mode==='source')f.built.parts[0].source.sceneInventoryId='other';
  if(mode==='foreign')p.shapes.push({id:'foreign',type:'rect',box:{x:0,y:0,w:1,h:1},
   source:{nativeComponentGroupId:'scene-network-shared-output'}});
  if(mode==='endpoint')f.bodies[0].box.x++;
  if(mode==='raster')image={...image,rgba:Buffer.from(image.rgba)};
  if(mode==='order')p.shapes=[...f.bodies,...f.built.parts.slice().reverse()];
  assert.equal(retainedSceneGroupMembers(p,seal(image,p,0)).size,0,mode);
 }
});

test('a serialized group and source graph grant no private assembly receipt',()=>{
 const f=sourceSharedOutputFixture(),p=structuredClone(page(f));
 assert.equal(retainedSceneGroupMembers(p,seal(f.image,p,0)).size,0);
 assert.equal(retainedSceneGroupMembers(page(f),structuredClone(seal(f.image,page(f),0))).size,0);
 assert.equal(retainedSceneGroupMembers({shapes:[],images:[],textBoxes:[]},seal(f.image,{shapes:[],images:[],textBoxes:[]},0)).size,0);
});

test('shared group admission retains the existing geometry allowance and validates unknown inputs safely',()=>{
 const f=sourceSharedOutputFixture(),p=page(f);
 assert.equal(retainedSceneGroupMembers(p,seal(f.image,p,4000000)).size,0);
 for(const checks of [-1,1.5,NaN,Infinity,'0',4000001])assert.throws(()=>seal(f.image,p,checks),TypeError);
 for(const bad of [null,{},new Proxy({}, {get(){assert.fail('proxy must not run');}}),
  {get shapes(){assert.fail('getter must not run');}}])assert.throws(()=>seal(f.image,bad,0),TypeError);
 const p2={...p,shapes:new Proxy(p.shapes,{get(){assert.fail('array proxy must not run');}})};
 assert.throws(()=>seal(f.image,p2,0),TypeError);
});

test('interleaved outside paint cannot authorize a new overlapping shared group',()=>{
 const f=sourceSharedOutputFixture(),p=page(f);
 const crossing={id:'new-paint',type:'rect',box:{x:0,y:0,w:300,h:230},style:{fill:'#FF0000'},source:{}};
 p.shapes.splice(p.shapes.indexOf(f.built.parts[1]),0,crossing);
 assert.equal(retainedSceneGroupMembers(p,seal(f.image,p,0)).size,0);
});

test('shared grouping regressions are included in the unified unit suite',()=>{
 assert.ok(require('../scripts/test-suites').includesSuite(__filename,'unit'));
});
