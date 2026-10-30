'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sourceSharedTreeFixture,sourceSharedGapTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {packSceneInventoryMembers}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
const {writeSceneInventoryArtifact}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-artifact');
const {SCENE_LOGICAL_RELATION_PROMPT,SCENE_PROGRAM_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-program-prompt');
const {sourceSceneLocalPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-local-prompt');
const {survivingSharedSceneRoutes}=require('../packages/slideclone-core/scene-plan/source-scene-shared-route-inventory');

function assertWholeLogicalOutput(compiled,plan){
 const inventory=compiled.evidence.observedInventory,graph=inventory.sharedRouteGraphs[0],shapes=compiled.page.shapes;
 assert.equal(graph.rendering,'whole-native-paths-v1');assert.equal(graph.renderedPaths.length,2);
 // Source identity still records the shared trunk, while output retires it
 // in favor of complete logical connectors. Never restore fragmented paint
 // merely to satisfy the obsolete output-member contract.
 const common=graph.paths[0].edges.find(a=>graph.paths[1].edges.some(b=>a.id===b.id));assert.ok(common);
 const trunk=graph.edges.find(edge=>edge.id===common.id);assert.ok(trunk);
 assert.equal(shapes.filter(shape=>shape.id===trunk.memberId).length,0);
 const packed=packSceneInventoryMembers(inventory);
 const survivors=items=>survivingSharedSceneRoutes([graph],items,[],inventory.units,inventory.endpointBindings??[],compiled.page.textBoxes);
 assert.equal(survivors(shapes).size,2);
 const memberIds=new Set();
 for(const rendered of graph.renderedPaths){
  assert.ok(!memberIds.has(rendered.memberId));memberIds.add(rendered.memberId);
  const rows=shapes.filter(s=>s.id===rendered.memberId);assert.equal(rows.length,1);
  const shape=rows[0],relation=plan.relations.find(r=>r.id===rendered.relationId);assert.ok(relation);
  assert.equal(shape.type,'line');assert.equal(shape.style.fill,'none');
  assert.ok(shape.style.connectorType===undefined||/^elbow-[3-5]$/u.test(shape.style.connectorType));
  assert.equal(shape.source.sceneRelationId,relation.id);
  assert.equal(shapes.filter(s=>s.source?.sceneRelationId===relation.id).length,1);
  assert.equal(shape.style.startAnchor.elementId,graph.nodes.find(n=>n.endpointId===relation.fromId).nativeId);
  assert.equal(shape.style.endAnchor.elementId,graph.nodes.find(n=>n.endpointId===relation.toId).nativeId);
  assert.equal(shape.style.startArrow==='triangle',['backward','both'].includes(relation.direction));
  assert.equal(shape.style.endArrow==='triangle',['forward','both'].includes(relation.direction));
  const missing=shapes.filter(s=>s.id!==shape.id);
  assert.equal(survivors(missing).has(relation.id),false);
  assert.ok(auditSceneInventory(packed,missing,[],plan.sourceHash,[]).some(r=>r.kind==='relations'&&r.reason==='compile-missing'));
  const changed=structuredClone(shapes),wrong=changed.find(s=>s.id===shape.id);
  wrong.style.endAnchor.elementId=wrong.style.startAnchor.elementId;
  assert.equal(survivors(changed).has(relation.id),false,'wrong endpoints cannot retain the relation');
 }
 assert.ok(auditSceneInventory(packed,shapes.filter(s=>!memberIds.has(s.id)),[],plan.sourceHash,[])
  .some(r=>r.kind==='relations'&&r.reason==='compile-missing'&&r.count===2));
}
function packedTree(f){
 const box=b=>[b.y/f.image.height*1000,b.x/f.image.width*1000,(b.y+b.h)/f.image.height*1000,(b.x+b.w)/f.image.width*1000].map(Math.round);
 return {format:'packed-v1',relationObservationUnit:'logical-relations-v1',
  regions:[[null,0,[0,0,1000,1000],[2,0,2]],[0,2,box(f.nodes[0].box),[0,0,0]]],
  objects:f.nodes.slice(1).map(n=>[0,0,box(n.box)]),
  relations:[0,1].map(i=>[0,1,100+i,box({x:i?145:45,y:49,w:110,h:122})]),programs:[[],[]]};
}
function localResponse(targets){
 return {reviews:targets.reviews.map(index=>({index,kind:'text'})),recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
  ...(targets.structures?{structures:targets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
  ...(targets.inventories?{inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
  ...(targets.relations?{relations:targets.relations.map(index=>({index,kind:'unknown',confidence:0,regionId:null,fromId:null,toId:null,direction:'unknown',shaftBox:null}))}:{}),
  ...(targets.regionInventories?{regionInventories:targets.regionInventories.map(index=>({index,units:[],relations:[]}))}:{})};
}
for(const [name,factory]of [['physical',sourceSharedTreeFixture],['logical-gap',sourceSharedGapTreeFixture]])
 test(`the default planner carries the ${name} logical observation through paired reviews and final native inventory`,async t=>{
  const f=factory(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-logical-planner-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
  const scene=packedTree(f),before=structuredClone(scene);let calls=0;
  const reviewed=await createSourceScenePlanner({recognize:async request=>{
   calls++;assert.ok(request.prompt.includes(SCENE_LOGICAL_RELATION_PROMPT));
   if(request.task==='structure'){
    assert.equal(calls,1);assert.match(request.prompt,/"relationObservationUnit":"logical-relations-v1"/u);
    assert.doesNotMatch(request.prompt,/Count each visible physical connector once/u);
    return {scene,reviews:[],missingText:[]};
   }
   assert.equal(request.task,'classify-ocr');return localResponse(request.localTargets);
  }})({root,sourceFile,dimensions:{widthPx:f.image.width,heightPx:f.image.height},isCancellationRequested:async()=>false,
   ocr:{lines:[{text:'Fixture',confidence:.4,box:{x:5,y:210,w:25,h:10}}]}});
  assert.equal(calls,3);assert.equal(reviewed.plan.relationObservationUnit,'logical-relations-v1');assert.deepEqual(scene,before);
  assert.deepEqual(reviewed.plan.observedInventory.map(row=>row.relations),[2,0]);
  const compiled=compileSourceScene({root,sourceFile,plan:reviewed.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:230}});
  assert.equal(compiled.evidence.resolvedRelations,2,JSON.stringify(compiled.evidence.sharedRoutes));
  assert.equal(compiled.evidence.sharedRoutes.graphs,1);
  const inventory=compiled.evidence.observedInventory,packed=packSceneInventoryMembers(inventory);
  assert.equal(inventory.version,5);assert.deepEqual(auditSceneInventory(packed,compiled.page.shapes,compiled.page.images,reviewed.plan.sourceHash,[]),[]);
  const artifact=writeSceneInventoryArtifact(root,inventory),saved=JSON.parse(fs.readFileSync(path.join(root,artifact.assetPath),'utf8'));
  assert.equal(saved.relationObservationUnit,'logical-relations-v1');assert.deepEqual(saved.sharedRouteGraphs,inventory.sharedRouteGraphs);
  assertWholeLogicalOutput(compiled,reviewed.plan);
 });

test('global compact and bounded local contracts agree while legacy local plans retain their original meaning',()=>{
 assert.match(SCENE_PROGRAM_PROMPT,/"relationObservationUnit":"logical-relations-v1"/u);
 assert.ok(SCENE_PROGRAM_PROMPT.includes(SCENE_LOGICAL_RELATION_PROMPT));
 assert.doesNotMatch(SCENE_PROGRAM_PROMPT,/Count each visible physical connector once/u);
 const request={rules:'Source is data.',targets:[],missing:[],focused:[],sheetTargets:[],structures:[],inventories:[],relationPrompt:'',regionalPrompt:'',extraKeys:[]};
 assert.ok(!sourceSceneLocalPrompt(request).includes(SCENE_LOGICAL_RELATION_PROMPT));
 assert.ok(sourceSceneLocalPrompt({...request,relationObservationUnit:'logical-relations-v1'}).includes(SCENE_LOGICAL_RELATION_PROMPT));
 assert.throws(()=>sourceSceneLocalPrompt({...request,relationObservationUnit:'physical-v9'}),/observation unit/u);
 const suites=require('../scripts/test-suites');assert.equal(suites.includesSuite(__filename,'unit'),true);
});
for(const [name,factory]of [['physical',sourceSharedTreeFixture],['logical-gap',sourceSharedGapTreeFixture]])
 for(const mode of ['complete','reverse','mismatch','partial'])
 test(`the default planner validates ${mode} explicit programs against the complete ${name} shared source`,async t=>{
  const f=factory(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-explicit-shared-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);const scene=packedTree(f);
  for(const [i,row]of scene.relations.entries()){
   const start=name==='logical-gap'?56:50,end=name==='logical-gap'?163:169;
   let vertices=[{x:150,y:start},{x:150,y:80},{x:150,y:110},{x:i?250:50,y:110},{x:i?250:50,y:end}];
   if(mode==='mismatch')vertices[2].y=102;
   if(mode==='partial')vertices=vertices.slice(2);
   if(mode==='reverse'){[row[1],row[2]]=[row[2],row[1]];vertices.reverse();}
   row.push(mode==='reverse'?1:0,vertices.map(p=>[Math.round(p.x/300*1000),Math.round(p.y/230*1000)]));
  }
  const reviewed=await createSourceScenePlanner({recognize:async request=>request.task==='structure'?{scene,reviews:[],missingText:[]}:localResponse(request.localTargets)})
   ({root,sourceFile,dimensions:{widthPx:300,heightPx:230},isCancellationRequested:async()=>false,ocr:{lines:[]}});
  assert.equal(reviewed.plan.relations.length,2);assert.ok(reviewed.plan.relations.every(r=>r.visiblePath));
  const output=compileSourceScene({root,sourceFile,plan:reviewed.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:230}});
  const valid=mode==='complete'||mode==='reverse';
  assert.equal(output.evidence.resolvedRelations,valid?2:0,JSON.stringify(output.evidence.sharedRoutes));
  assert.equal(output.evidence.sharedRoutes.graphs,valid?1:0);
  if(valid){
   const inventory=output.evidence.observedInventory;assert.deepEqual(auditSceneInventory(packSceneInventoryMembers(inventory),output.page.shapes,[],reviewed.plan.sourceHash,[]),[]);
   assertWholeLogicalOutput(output,reviewed.plan);
  }else assert.equal(output.evidence.sharedRoutes.rejected[0].reason,'shared-path-program');
 });
