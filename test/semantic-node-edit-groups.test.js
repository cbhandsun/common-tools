'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {groupSemanticNodes:group}=require('../packages/slideclone-core/scene-plan/semantic-node-edit-groups');
function fixture(){
 const body=(id,x)=>({id:'body-'+id,type:'rect',box:{x,y:20,w:80,h:60},style:{fill:'#FFFFFF'},
  source:{sceneInventoryId:id,sceneRegionId:'region',detector:'source-scene-container',nativeRebuild:true,semanticNativeStructure:true}});
 const a=body('a',20),b=body('b',140),outline={...a,id:'outline-a',style:{fill:'none',stroke:'#333333'},
  source:{...a.source,detector:'source-scene-outline'}};
 const line={id:'relation',type:'line',box:{x:180,y:50,w:-120,h:0},style:{startAnchor:{elementId:b.id},endAnchor:{elementId:outline.id}},
  source:{nativeConnectorRoute:true,sceneRelationId:'a-to-b'}};
 const native={id:'icon-detail',type:'line',box:{x:30,y:30,w:0,h:12},style:{stroke:'#333333'},
  source:{nativeRebuild:true,detector:'visual-atom-native-connector'}};
 const boundary={id:'boundary-fragment',type:'rect',box:{x:70,y:79,w:12,h:5},style:{fill:'#CCCCCC'},
  source:{nativeRebuild:true,detector:'visual-atom-native-rect'}};
 const label=(id,x)=>({id,text:'Editable label',box:{x,y:45,w:35,h:10},source:{editable:true,sceneRegionId:'region'}});
 const icon={id:'icon',assetPath:'assets/icon.png',box:{x:30,y:30,w:15,h:15},
  source:{editable:false,protectedMinimumUnit:true,cropEvidenceRequired:true,sceneRegionId:'region'}};
 return {page:{shapes:[a,boundary,native,outline,b,line],images:[icon],textBoxes:[label('label-a',50),label('label-b',160)]},work:{checks:0}};
}
test('a source-order rejection can still yield complete output edit groups without altering paths, assets or anchors',()=>{
 const f=fixture(),before=structuredClone(f.page),result=group(f);
 assert.equal(result.report.status,'applied');assert.equal(result.report.groups.length,2);
 for(const collection of ['shapes','images','textBoxes'])for(const item of result.page[collection]){
  const prior=before[collection].find(p=>p.id===item.id);assert.ok(prior);
  assert.deepEqual(item,prior);assert.equal(item,f.page[collection].find(p=>p.id===item.id));
 }
 const members=result.report.groups.find(g=>g.id==='semantic-node-a').members;
 for(const id of ['body-a','outline-a','icon-detail','icon','label-a'])assert.ok(members.includes(id),id);
 assert.equal(members.includes('boundary-fragment'),false);assert.equal(members.includes('relation'),false);
 assert.equal(result.page.shapes.at(-1),f.page.shapes.at(-1));assert.deepEqual(f.page,before);
 assert.equal(result.report.sourceOwnership,false);assert.equal(result.report.sourcePixelsChanged,0);
 assert.equal(result.report.strictSourceEquivalent,false);assert.equal(result.report.paintOrderEquivalent,false);
 assert.equal(result.report.editingBehaviorVerified,false);assert.equal(result.report.wholeProductAcceptance,false);
 assert.deepEqual(result.page.outputEditGroups,result.report.groups);
 const again=group({page:result.page,work:{checks:0}});assert.equal(again.page,result.page);assert.equal(again.report.status,'unchanged');
});
test('existing verified groups, foreign labels and unproven pictures keep their identities',()=>{
 const f=fixture();for(const p of f.page.shapes.filter(p=>p.source?.sceneInventoryId==='a'))p.source.nativeComponentGroupId='verified-a';
 f.page.textBoxes[0].source.sceneRegionId='elsewhere';f.page.images[0].source.cropEvidenceRequired=false;
 const result=group(f);assert.equal(result.report.groups.length,1);
 assert.equal(result.page.shapes[0],f.page.shapes[0]);assert.equal(result.page.images[0],f.page.images[0]);
 assert.equal(result.page.textBoxes[0],f.page.textBoxes[0]);
});
test('overlapping candidate bodies do not claim a contained child by enumeration order',()=>{
 const f=fixture();f.page.shapes.find(p=>p.id==='body-b').box={...f.page.shapes[0].box};
 const result=group(f);assert.equal(result.report.groups.length,0);assert.equal(result.page,f.page);
});
test('node assembly is independent of image coordinates, scale, side and relation enumeration',()=>{
 for(const scale of [.25,1,3])for(const mirror of [false,true]){
  const f=fixture(),all=[...f.page.shapes,...f.page.images,...f.page.textBoxes];
  for(const item of all){const box=item.box;
   item.box={x:mirror?900-scale*(item.type==='line'?box.x:box.x+box.w):100+scale*box.x,y:70+scale*box.y,
    w:mirror&&item.type==='line'?-scale*box.w:scale*box.w,h:scale*box.h};}
  f.page.shapes.reverse();f.page.textBoxes.reverse();
  const before=structuredClone(f.page),result=group(f);
  assert.equal(result.report.groups.length,2);
  assert.deepEqual(result.report.groups.find(row=>row.id==='semantic-node-a').members.slice().sort(),
   ['body-a','outline-a','icon-detail','icon','label-a'].sort());
  assert.deepEqual(result.report.groups.find(row=>row.id==='semantic-node-b').members.slice().sort(),['body-b','label-b'].sort());
  assert.deepEqual(f.page,before);
 }
});
test('empty input is unchanged and connectors without proven scene node identity grant no groups',()=>{
 const page={shapes:[],images:[],textBoxes:[]};assert.equal(group({page,work:{checks:0}}).page,page);
 const f=fixture();for(const p of f.page.shapes)if(p.source?.sceneInventoryId)p.source.semanticNativeStructure=false;
 assert.equal(group(f).report.groups.length,0);
});

test('compiled region endpoints group their own boundary and labels without inventing an object inventory identity',()=>{
 for(const detector of ['source-scene-container','source-scene-outline']){
  const f=fixture(),node=f.page.shapes.find(p=>p.id==='body-b');
  node.id=detector==='source-scene-container'?'scene-container-section':'scene-outline-section';
  delete node.source.sceneInventoryId;node.source.sceneRegionId='section';node.source.detector=detector;
  f.page.shapes.at(-1).style.startAnchor.elementId=node.id;f.page.textBoxes[1].source.sceneRegionId='section';
  const paint={...node,id:'scene-outline-section-paint-0',style:{fill:'#AABBCC'},source:{...node.source,detector:'source-scene-outline'}};
  f.page.shapes.splice(1,0,paint);
  const before=structuredClone(f.page),out=group(f),region=out.report.groups.find(g=>g.id==='semantic-node-section');
  assert.ok(region);assert.deepEqual(region.members.slice().sort(),[node.id,paint.id,'label-b'].sort());
  assert.equal(out.report.groups.length,2);assert.deepEqual(f.page,before);
  assert.equal(out.page.shapes.at(-1).style.startAnchor.elementId,node.id);
  assert.equal(group({page:out.page,work:{checks:0}}).page,out.page);
 }
});

test('existing region groups stay intact and missing or mismatched boundary identities cannot grant grouping',()=>{
 const f=fixture(),node=f.page.shapes.find(p=>p.id==='body-b');
 node.id='scene-outline-section';delete node.source.sceneInventoryId;node.source.sceneRegionId='section';
 node.source.nativeComponentGroupId='verified-section';f.page.shapes.at(-1).style.startAnchor.elementId=node.id;
 const out=group(f);assert.equal(out.report.groups.length,1);assert.equal(out.page.shapes.find(p=>p.id===node.id),node);
 for(const id of ['body-b','scene-outline-other','scene-outline-section-paint-0','scene-outline-section-extra']){
  const bad=fixture(),target=bad.page.shapes.find(p=>p.id==='body-b');target.id=id;
  delete target.source.sceneInventoryId;target.source.sceneRegionId='section';bad.page.shapes.at(-1).style.startAnchor.elementId=id;
  const before=structuredClone(bad.page);assert.throws(()=>group(bad),TypeError);assert.deepEqual(bad.page,before);
 }
});
test('malformed, duplicate, sparse and extreme inputs fail without modifying drawing',()=>{
 for(const edit of [f=>f.page.shapes.push({...f.page.shapes[0]}),f=>delete f.page.images[0],
  f=>f.page.textBoxes[0].box.x=NaN,f=>f.page.images[0].box.w=-1,f=>f.work.checks=Infinity,
  f=>f.page.images=Array(10001).fill(f.page.images[0])]){
  const f=fixture();edit(f);const before=structuredClone(f.page);assert.throws(()=>group(f),TypeError);assert.deepEqual(f.page,before);
 }
 for(const input of [null,{},[],{page:{shapes:[],images:[],textBoxes:[]},work:{}}])assert.throws(()=>group(input),TypeError);
});
test('capacity rejection and a geometry failure never publish partial mutations or reset the caller ledger',()=>{
 const f=fixture();for(let i=0;i<130;i++)f.page.shapes.push({...f.page.shapes[0],id:'detail-'+i});
 const before=structuredClone(f.page),result=group(f);assert.deepEqual(f.page,before);
 assert.ok(result.report.rejected.some(row=>row.id==='a'&&row.reason==='member-capacity'));
 const exhausted=fixture(),original=structuredClone(exhausted.page);exhausted.work.checks=3999999;
 assert.throws(()=>group(exhausted),/geometry budget/);assert.equal(exhausted.work.checks,4000001);assert.deepEqual(exhausted.page,original);
});
test('getters, proxies and coercion hooks never execute or enter a public error',()=>{
 let touched=0;const trap=()=>{touched++;throw Error('private-content');};
 for(const edit of [f=>f.page=new Proxy(f.page,{get:trap}),f=>Object.defineProperty(f.page.images[0],'source',{get:trap}),
  f=>f.page.shapes[0].source.sceneInventoryId={toString:trap},f=>f.work=new Proxy({checks:0},{get:trap})]){
  const f=fixture();edit(f);assert.throws(()=>group(f),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 }assert.equal(touched,0);
});
test('the generic grouping module is typed, shipped and included by unified CI',()=>{
 const file='packages/slideclone-core/scene-plan/semantic-node-edit-groups.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/semantic-node-edit-groups.test.js'));
});
