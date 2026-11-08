'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {groupSemanticNodes}=require('../packages/slideclone-core/scene-plan/semantic-node-edit-groups');
function fixture(kind='visible-gap-logical'){
 const node=(id,x)=>({id:'body-'+id,type:'rect',box:{x,y:20,w:80,h:60},style:{fill:'#FFFFFF'},
  source:{sceneInventoryId:id,sceneRegionId:'region',detector:'source-scene-container',nativeRebuild:true,semanticNativeStructure:true}});
 const relation={id:'relation',type:'line',box:{x:100,y:50,w:40,h:0},
  style:{startAnchor:{elementId:'body-a',side:'right',position:.5},endAnchor:{elementId:'body-b',side:'left',position:.5}},
  source:{sceneRelationId:'a-to-b',semanticNativeStructure:true,role:'relationship',sourceAttachmentKind:kind}};
 const label=(id,x)=>({id:'label-'+id,text:'Node',box:{x,y:40,w:30,h:12},source:{editable:true,sceneRegionId:'region'}});
 return {page:{shapes:[node('a',20),node('b',140),relation],images:[],textBoxes:[label('a',40),label('b',160)]},work:{checks:0}};
}
for(const kind of ['visible-gap-logical','source-body-contact']){
 test(`semantic ${kind} connections assemble their nodes without route-fitting metadata`,()=>{
  const input=fixture(kind),before=structuredClone(input.page),result=groupSemanticNodes(input);
  assert.equal(result.report.groups.length,2);
  for(const id of ['a','b'])assert.deepEqual(result.report.groups.find(g=>g.id==='semantic-node-'+id).members.slice().sort(),['body-'+id,'label-'+id]);
  assert.deepEqual(input.page,before);assert.equal(result.page.shapes,input.page.shapes);
  assert.equal(result.page.textBoxes,input.page.textBoxes);
  assert.ok(result.report.groups.every(g=>!g.members.includes('relation')));
  assert.equal(result.page.shapes.at(-1).source.nativeConnectorRoute,undefined);
  assert.equal(result.report.sourceOwnership,false);assert.equal(result.report.sourcePixelsChanged,0);
  assert.equal(result.report.editingBehaviorVerified,false);assert.equal(result.report.wholeProductAcceptance,false);
  assert.equal(groupSemanticNodes({page:result.page,work:{checks:0}}).page,result.page);
 });
}
test('direct node assembly is independent of position, scale and collection order',()=>{
 for(const kind of ['visible-gap-logical','source-body-contact'])for(const scale of [.25,3]){
  const input=fixture(kind);
  for(const item of [...input.page.shapes,...input.page.textBoxes]){
   const box=item.box;item.box={x:700-scale*(item.type==='line'?box.x:box.x+box.w),y:30+scale*box.y,
    w:scale*box.w*(item.type==='line'?-1:1),h:scale*box.h};
  }
  input.page.shapes.reverse();input.page.textBoxes.reverse();
  const before=structuredClone(input.page),result=groupSemanticNodes(input);
  assert.deepEqual(result.report.groups.map(g=>g.id).sort(),['semantic-node-a','semantic-node-b']);
  assert.deepEqual(input.page,before);
 }
});
test('a decoration or malformed semantic declaration does not authorize node grouping',()=>{
 for(const edit of [s=>delete s.sceneRelationId,s=>s.sceneRelationId='',s=>s.sceneRelationId='../private-content',
  s=>s.sceneRelationId='x'.repeat(65),s=>s.semanticNativeStructure=false,s=>s.role='decoration',
  s=>delete s.sourceAttachmentKind,s=>s.sourceAttachmentKind='unsupported',s=>s.sourceAttachmentKind=null]){
  const input=fixture();edit(input.page.shapes.at(-1).source);const before=structuredClone(input.page);
  const result=groupSemanticNodes(input);assert.equal(result.report.groups.length,0);assert.equal(result.page,input.page);assert.deepEqual(input.page,before);
 }
});
test('a declared direct connection with missing or invalid endpoint data fails without a partial group',()=>{
 for(const kind of ['visible-gap-logical','source-body-contact'])for(const edit of [s=>delete s.startAnchor,s=>delete s.endAnchor,
  s=>s.startAnchor=null,s=>s.endAnchor={},s=>s.endAnchor.elementId={toString(){throw Error('private-content');}}]){
  const input=fixture(kind);edit(input.page.shapes.at(-1).style);
  const shapes=input.page.shapes.slice(),texts=input.page.textBoxes.slice();
  assert.throws(()=>groupSemanticNodes(input),error=>error instanceof TypeError&&!error.message.includes('private-content'));
  assert.equal(input.page.outputEditGroups,undefined);assert.deepEqual(input.page.shapes,shapes);assert.deepEqual(input.page.textBoxes,texts);
 }
});
test('direct semantic metadata getters are rejected without invoking user code',()=>{
 const input=fixture();let touched=0;
 Object.defineProperty(input.page.shapes.at(-1).source,'sourceAttachmentKind',{get(){touched++;throw Error('private-content');}});
 assert.throws(()=>groupSemanticNodes(input),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.equal(touched,0);assert.equal(input.page.outputEditGroups,undefined);
});
test('direct grouping consumes the same geometry ledger and preserves input on exhaustion',()=>{
 const input=fixture('source-body-contact'),before=structuredClone(input.page);input.work.checks=3999999;
 assert.throws(()=>groupSemanticNodes(input),/geometry budget/u);assert.equal(input.work.checks,4000001);assert.deepEqual(input.page,before);
});
test('direct connection assembly regressions enter the unified unit and all suites',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 for(const suite of ['unit','all'])assert.equal(includesSuite('test/semantic-direct-node-groups.test.js',suite),true);
});
