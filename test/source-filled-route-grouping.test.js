'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFilledFringeFixture}=require('./helpers/source-filled-fringe.cjs');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const compiler=require('../packages/slideclone-core/routing/source-filled-route-compiler');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
const {ungroupSourceNativeOverlays}=require('../packages/slideclone-core/scene-plan/source-native-finalization');
function fixture(){
 const f=sourceFilledFringeFixture(),{fit,reason}=measureSourceSceneRoute(f);assert.ok(fit,reason);assert.ok(fit.filledBody);
 const input={fit,relation:{id:'curve',regionId:'region',fromId:'a',toId:'b',direction:'forward'},
  fromId:'a',toId:'b',widthPx:f.image.width,heightPx:f.image.height,slideSize:{widthPt:f.image.width,heightPt:f.image.height}};
 const parts=compiler.compileFilledSourceRoute(input);
 const bodies=[f.from,f.to].map(n=>({id:n.id,type:'rect',box:{...n.box},style:{fill:'#FFFFFF'},source:{}}));
 return {...f,fit,input,parts,page:{shapes:[...bodies,...parts],images:[],textBoxes:[]},bodies};
}
function retained(f,image=f.image,checks=0){
 const result=compiler.sealMeasuredFilledRouteGroups(image,f.page,checks);
 return {members:retainedSceneGroupMembers(f.page,result.token),...result};
}

test('a complete source-measured filled relation survives finalization as one group with both real nodes outside',()=>{
 const f=fixture(),pixels=Buffer.from(f.image.rgba);
 assert.equal(f.parts.length,4);
 assert.deepEqual([...new Set(f.parts.map(p=>p.source.nativeComponentGroupId))],['scene-route-curve']);
 assert.ok(f.parts.every(p=>p.source.sceneInventoryId==='curve'));
 // Normal scene finalization binds this exact logical inventory identity.
 // Its redundant assignment must not invalidate the compiler's snapshot.
 for(const part of f.parts)part.source={...part.source,sceneInventoryId:'curve'};
 const result=retained(f);assert.deepEqual([...result.members],f.parts);
 assert.ok(result.checks<=4000000);
 ungroupSourceNativeOverlays(f.page,result.token);
 assert.ok(f.parts.every(p=>p.source.nativeComponentGroupId==='scene-route-curve'));
 assert.ok(f.bodies.every(p=>p.source.nativeComponentGroupId===undefined));
 assert.deepEqual(f.image.rgba,pixels);
 const {auditSemanticEditability}=require('../packages/slideclone-core/quality/semantic-editability-quality');
 assert.equal(auditSemanticEditability({slideSize:f.input.slideSize,pages:[f.page]}).metrics.fixedRelationshipPaintCount,2);
});

test('complete filled grouping rejects partial, duplicated, copied, modified, foreign and reordered output',()=>{
 for(const mode of ['missing','duplicate','clone','style','source','foreign','order','id-collision']){
  const f=fixture();
  if(mode==='missing')f.page.shapes.splice(f.page.shapes.indexOf(f.parts[0]),1);
  if(mode==='duplicate')f.page.shapes.push(f.parts[0]);
  if(mode==='clone')f.page.shapes=f.page.shapes.map(p=>p===f.parts[0]?structuredClone(p):p);
  if(mode==='style')f.parts[0].style.opacity=.5;
  if(mode==='source')f.parts[0].source.sceneRelationId='other';
  if(mode==='foreign')f.page.shapes.push({id:'foreign',type:'rect',box:{x:0,y:0,w:1,h:1},source:{nativeComponentGroupId:'scene-route-curve'}});
  if(mode==='order')f.page.shapes=[...f.bodies,...f.parts.slice().reverse()];
  if(mode==='id-collision')f.page.shapes.push({...f.bodies[0],id:f.parts[0].id});
  assert.equal(retained(f).members.size,0,mode);
 }
});

test('filled group receipts bind original raster bytes, dimensions and both unchanged endpoint boxes',()=>{
 for(const mode of ['copy','changed','dimensions','start-position','end-size','endpoint-missing','endpoint-duplicate']){
  const f=fixture();let image=f.image;
  if(mode==='copy')image={...image,rgba:Buffer.from(image.rgba)};
  if(mode==='changed')f.image.rgba[0]^=1;
  if(mode==='dimensions')image={...image,width:image.height,height:image.width};
  if(mode==='start-position')f.bodies[0].box.x++;
  if(mode==='end-size')f.bodies[1].box.w++;
  if(mode==='endpoint-missing')f.page.shapes=f.page.shapes.filter(p=>p!==f.bodies[0]);
  if(mode==='endpoint-duplicate')f.page.shapes.push({...f.bodies[0]});
  assert.equal(retained(f,image).members.size,0,mode);
 }
 const f=fixture(),p=structuredClone(f.page);
 const result=compiler.sealMeasuredFilledRouteGroups(f.image,p,0);
 assert.equal(retainedSceneGroupMembers(p,result.token).size,0);
 const valid=retained(f);
 assert.equal(retainedSceneGroupMembers(f.page,structuredClone(valid.token)).size,0);
});

test('filled grouping cannot reorder interleaved outside paint or consume more than the existing ledger',()=>{
 const f=fixture(),crossing={id:'crossing',type:'rect',box:{x:0,y:0,w:240,h:180},style:{fill:'#FF0000'},source:{}};
 f.page.shapes.splice(f.page.shapes.indexOf(f.parts[1]),0,crossing);
 assert.equal(retained(f).members.size,0);
 const g=fixture();assert.equal(retained(g,g.image,4000000).members.size,0);
 for(const checks of [-1,1.5,NaN,Infinity,'0',4000001])assert.throws(()=>retained(g,g.image,checks),TypeError);
 const empty={shapes:[],images:[],textBoxes:[]};
 const result=compiler.sealMeasuredFilledRouteGroups(g.image,empty,0);
 assert.equal(retainedSceneGroupMembers(empty,result.token).size,0);
});

test('filled grouping safely rejects hostile collection, geometry and source controls',()=>{
 const f=fixture();let calls=0;
 const get=()=>{calls++;throw Error('private');};
 for(const bad of [null,{},new Proxy({},{get}),{get shapes(){return get();}},
  {...f.page,shapes:new Proxy(f.page.shapes,{get})},
  {...f.page,shapes:[...f.page.shapes,{id:'bad',box:{get x(){return get();}},source:{}}]},
  {...f.page,shapes:[...f.page.shapes,{id:'bad',box:{x:0,y:0,w:1,h:1},source:new Proxy({},{get})}]}])
  assert.throws(()=>compiler.sealMeasuredFilledRouteGroups(f.image,bad,0),TypeError);
 assert.equal(calls,0);
 const file='packages/slideclone-core/routing/source-route-output-groups.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-suites').includesSuite(__filename,suite));
});
