'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sealMeasuredSceneGroups:seal,retainedSceneGroupMembers:retained}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
const {ungroupSourceNativeOverlays:finalize}=require('../packages/slideclone-core/scene-plan/source-native-finalization');
function fixture(){
 const item=(id,group)=>({id,type:'rect',box:{x:0,y:0,w:1,h:1},style:{fill:'none'},source:{...(group?{nativeComponentGroupId:group}:{})}});
 const a=item('a','card'),label=item('label','card'),b=item('b'),control=item('control','network'),line={...item('edge','network'),type:'line',
  style:{startAnchor:{elementId:'a'},endAnchor:{elementId:'control'}},source:{nativeComponentGroupId:'network',nativeConnectorRoute:true}};
 const page={shapes:[a,label,b,control,line],images:[],textBoxes:[]},groups=[{id:'card',members:[a,label]},{id:'network',members:[control,line]}];
 return {a,label,b,control,line,page,groups};
}
test('cross-container native networks flatten while verified business-card groups remain',()=>{
 const f=fixture(),token=seal(f.page,f.groups,0),before=f.page.shapes.map(p=>structuredClone({id:p.id,type:p.type,box:p.box,style:p.style}));
 assert.deepEqual([...retained(f.page,token)],[f.a,f.label]);finalize(f.page,token);
 assert.equal(f.a.source.nativeComponentGroupId,'card');assert.equal(f.label.source.nativeComponentGroupId,'card');
 assert.equal(f.control.source.nativeComponentGroupId,undefined);assert.equal(f.line.source.nativeComponentGroupId,undefined);
 assert.deepEqual(f.page.shapes.map(p=>({id:p.id,type:p.type,box:p.box,style:p.style})),before);
});

test('root native connectors retain verified child targets without changing endpoint identities',()=>{
 const f=fixture();delete f.line.source.nativeComponentGroupId;delete f.control.source.nativeComponentGroupId;
 const groups=[f.groups[0]],token=seal(f.page,groups,0),anchors=structuredClone(f.line.style);
 assert.deepEqual([...retained(f.page,token)],[f.a,f.label]);finalize(f.page,token);
 assert.equal(f.a.source.nativeComponentGroupId,'card');assert.deepEqual(f.line.style,anchors);
 assert.equal(f.line.source.nativeConnectorRoute,true);assert.equal(f.line.source.nativeComponentGroupId,undefined);
});

test('a root connector may bind verified children in two different physical cards',()=>{
 const f=fixture();delete f.line.source.nativeComponentGroupId;
 f.b.source.nativeComponentGroupId='target';f.control.source.nativeComponentGroupId='target';
 const groups=[f.groups[0],{id:'target',members:[f.b,f.control]}];
 const token=seal(f.page,groups,0);assert.deepEqual(new Set(retained(f.page,token)),new Set([f.a,f.label,f.b,f.control]));
 finalize(f.page,token);assert.equal(f.line.style.startAnchor.elementId,'a');assert.equal(f.line.style.endAnchor.elementId,'control');
});

test('flattening a connector group rechecks remaining connectors until all cross-container owners are removed',()=>{
 const f=fixture();
 const extra={id:'extra',type:'line',box:{x:0,y:0,w:1,h:1},style:{startAnchor:{elementId:'a'},endAnchor:{elementId:'b'}},
  source:{nativeComponentGroupId:'card',nativeConnectorRoute:true}};
 f.page.shapes.push(extra);f.groups[0].members.push(extra);
 const token=seal(f.page,f.groups,0);assert.equal(retained(f.page,token).size,0);finalize(f.page,token);
 assert.ok(f.page.shapes.every(p=>p.source.nativeComponentGroupId===undefined));
});

test('root connector targets still require exact private group membership and unchanged snapshots',()=>{
 for(const mode of ['copied-token','mutated-target','foreign-member']){
  const f=fixture();delete f.line.source.nativeComponentGroupId;delete f.control.source.nativeComponentGroupId;
  const token=seal(f.page,[f.groups[0]],0);
  if(mode==='mutated-target')f.a.box.w=2;
  if(mode==='foreign-member')f.b.source.nativeComponentGroupId='card';
  assert.equal(retained(f.page,mode==='copied-token'?structuredClone(token):token).size,0);
 }
});
test('a complete private group keeps native connectors when both targets share that drawing container',()=>{
 const f=fixture();for(const p of f.page.shapes)p.source.nativeComponentGroupId='complete';
 const groups=[{id:'complete',members:f.page.shapes}],token=seal(f.page,groups,0);assert.equal(retained(f.page,token).size,5);
 assert.equal(retained(structuredClone(f.page),token).size,0);
});
test('fixed native paths keep their private grouping contract and cannot mint node-following rights',()=>{
 const f=fixture();f.line.type='freeform';f.line.source.nativeConnectorRoute=false;
 assert.equal(retained(f.page,seal(f.page,f.groups,0)).size,4);
});
test('missing or duplicated native anchor targets reject a physical group rather than attach by a public name',()=>{
 for(const mode of ['missing','duplicate','mutated']){
  const f=fixture();if(mode==='missing')f.page.shapes=f.page.shapes.filter(p=>p!==f.a);
  if(mode==='duplicate')f.page.shapes.push({...structuredClone(f.a),source:{}});
  const token=seal(f.page,f.groups,0);if(mode==='mutated')f.line.style.startAnchor.elementId='missing';
  assert.equal([...retained(f.page,token)].some(p=>p===f.line),false);
 }
});
test('group compatibility shares the existing budget and serialized receipts grant no group',()=>{
 const f=fixture(),token=seal(f.page,f.groups,4000000);assert.equal(retained(f.page,token).size,0);
 assert.equal(retained(f.page,structuredClone(seal(f.page,f.groups,0))).size,0);
});
test('native connector group-scope regressions are discovered by unified unit and all CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-scene-connector-group-scope.test.js'));
});
