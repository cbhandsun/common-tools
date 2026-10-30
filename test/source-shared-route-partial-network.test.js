'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedNetworkFixture:fixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute:measure}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute:compile,measuredSharedSceneRoutePaintGroups:paint}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {createSourceRouteCatalog:create}=require('../packages/slideclone-core/routing/source-shared-route-choice');
function request(){
 const f=fixture(),measured=measure(f);assert.ok(measured.fit,measured.reason);
 const relations=[...networkRelations,{...networkRelations[0],id:'ambiguous',shaftBox:{x:35,y:45,w:230,h:130}}];
 return {f,input:{fit:measured.fit,image:f.image,relations,id:'partial-network',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}}};
}
test('explicit partial binding retains the complete physical loop and the full catalog while leaving ambiguity unresolved',()=>{
 const {f,input}=request(),before=Buffer.from(f.image.rgba);
 assert.throws(()=>compile(input),/shared-relation-ambiguous/);
 const result=compile({...input,allowUnboundRelations:true});
 assert.equal(result.graph.paths.length,2);assert.equal(result.graph.topology,'source-network-v1');
 assert.deepEqual(result.unbound,[{id:'ambiguous',reason:'shared-relation-ambiguous'}]);
 const full=compile({...input,relations:networkRelations});
 assert.deepEqual(result.parts,full.parts);assert.deepEqual(result.graph.edges,full.graph.edges);
 assert.equal(result.catalog.networkHash,create({...input,work:{checks:input.fit.workChecks}}).catalog.networkHash);
 assert.equal(result.catalog.relationIds.length,3);assert.deepEqual(f.image.rgba,before);
 const shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box})),...result.parts];
 assert.equal(paint(f.image,shapes,{checks:0}).length,1);
 const used=new Set(result.graph.paths.flatMap(p=>p.edges.map(e=>e.id))),unused=result.graph.edges.find(e=>!used.has(e.id));
 // Either a used or unused member is mandatory for this complete network.
 const member=unused??result.graph.edges[0];
 assert.equal(paint(f.image,shapes.filter(s=>s.id!==member.memberId),{checks:0}).length,0);
 assert.equal(paint(f.image,structuredClone(shapes),{checks:0}).length,0);
});
test('duplicate forward and reverse paths reject every conflicting relation independently of input order',()=>{
 const {input}=request(),left=networkRelations[0],right=networkRelations[1];
 const relations=[left,right,{...left,id:'reverse',fromId:left.toId,toId:left.fromId,direction:'backward'},
  {...right,id:'right-upper',shaftBox:{x:157,y:97,w:5,h:3}}];
 for(const rs of [relations,[...relations].reverse()]){
  assert.throws(()=>compile({...input,relations:rs}),/shared-relation-duplicate/);
  const result=compile({...input,relations:rs,allowUnboundRelations:true});
  assert.deepEqual(result.graph.paths.map(p=>p.relationId).sort(),['right-route','right-upper']);
  assert.deepEqual(result.unbound.map(r=>r.id).sort(),['left-route','reverse']);
  assert.ok(result.unbound.every(r=>r.reason==='shared-relation-duplicate'));
 }
});
test('partial binding cannot accept fewer than two paths, invalid controls, stale choices or forged source proofs',()=>{
 const {input}=request();let calls=0;
 for(const value of [null,'true',1,{},new Proxy({},{get(){calls++;throw Error('private');}})])
  assert.throws(()=>compile({...input,allowUnboundRelations:value}),TypeError);
 assert.equal(calls,0);
 assert.throws(()=>compile({...input,allowUnboundRelations:true,fit:structuredClone(input.fit)}),/proof/);
 assert.throws(()=>compile({...input,allowUnboundRelations:true,relations:input.relations.slice(1)}),/shared-relation-ambiguous/);
 const catalog=create({...input,work:{checks:input.fit.workChecks}}).catalog;
 const stale={kind:'source-edges-v1',sourceHash:input.sourceHash,networkHash:'b'.repeat(64),steps:[{id:catalog.edges[0].id,reversed:false}]};
 assert.throws(()=>compile({...input,allowUnboundRelations:true,relations:input.relations.map((r,i)=>i===2?{...r,sourcePathChoice:stale}:r)}),/shared-path-program/);
 for(const direction of ['backward','unknown'])assert.throws(()=>compile({...input,allowUnboundRelations:true,
  relations:input.relations.map((r,i)=>i===2?{...r,direction}:r)}),TypeError);
 assert.throws(()=>compile({...input,allowUnboundRelations:true,relations:input.relations.map((r,i)=>i===2?{...r,shaftBox:{x:0,y:0,w:1,h:1}}:r)}),/shared-relation-anchor/);
 assert.throws(()=>compile({...input,allowUnboundRelations:true,relations:[...input.relations,input.relations[0]]}),/controls/);
});
test('logical scene compilation retains pending inventory and excludes pending identities from every ordinary fallback',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const fallback=require('../packages/slideclone-core/scene-plan/source-scene-relation-fallbacks'),original=fallback.compileSceneRelationFallbacks;
 const received=[];fallback.compileSceneRelationFallbacks=request=>{received.push(request.plan.relations.map(r=>r.id));return original(request);};
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 t.after(()=>{fallback.compileSceneRelationFallbacks=original;});
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {initializeSceneObjectBatches}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
 const {auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'partial-network-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const relations=networkRelations.map((r,i)=>({...r,fromId:'source',shaftBox:{x:35,y:45,w:230,h:130},
  visiblePath:{kind:'polyline',dash:'solid',vertices:(i?[[150,50],[150,98],[138,98],[138,122],[162,122],[162,110],[250,110],[250,169]]
   :[[150,50],[150,98],[138,98],[138,110],[50,110],[50,169]]).map(([x,y])=>({x,y}))}}));
 relations.push({...relations[0],id:'ambiguous',visiblePath:undefined});
 const raw={coordinateSpace:'source-pixels',relationObservationUnit:'logical-relations-v1',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:230}},{id:'source',parentId:'root',kind:'container',box:f.nodes[0].box}],
  objects:f.nodes.slice(1).map(n=>({id:n.endpointId,kind:'container',regionId:'root',box:n.box,pictorialContent:'absent'})),
  relations,inventory:[['root',2,0,3],['source',0,0,0]]};
 const plan=initializeSceneObjectBatches(parseSourceScenePlan(raw,{sourceHash,widthPx:300,heightPx:230}));
 const before=structuredClone(plan),result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:300,heightPt:230}});
 assert.deepEqual(plan,before);assert.equal(result.evidence.resolvedRelations,2);
 assert.equal(result.evidence.sharedRoutes.graphs,1);assert.equal(result.evidence.sharedRoutes.resolved,2);
 assert.deepEqual(result.evidence.sharedRoutes.rejected,[{ids:['relation-ambiguous'],reason:'shared-relation-ambiguous'}]);
 assert.ok(result.evidence.unresolved.some(r=>r.id==='relation-ambiguous'&&r.detailCode==='shared-relation-ambiguous'));
 assert.equal(received.length,1);assert.ok(!received[0].includes('relation-ambiguous'));
 assert.ok(!result.page.shapes.some(s=>s.source?.sceneRelationId==='relation-ambiguous'||s.id==='scene-relation-ambiguous'));
 const inventory=result.evidence.observedInventory,graph=inventory.sharedRouteGraphs[0];
 assert.equal(graph.topology,'source-network-v1');assert.equal(graph.paths.length,2);
 const issues=auditSceneInventory(inventory,result.page.shapes,result.page.images,sourceHash);
 assert.ok(issues.some(r=>r.kind==='relations'&&r.count===1));
 const used=new Set(graph.paths.flatMap(p=>p.edges.map(e=>e.id))),unused=graph.edges.find(e=>!used.has(e.id));assert.ok(unused);
 assert.ok(auditSceneInventory(inventory,result.page.shapes.filter(s=>s.id!==unused.memberId),result.page.images,sourceHash).some(r=>r.kind==='relations'&&r.count===3));
});
test('partial network modules enter the unified unit suite, strict boundary checks and release payload',()=>{
 const fs=require('node:fs');
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-shared-route-partial-network.test.js'));
 const file='packages/slideclone-core/routing/source-shared-route-bindings.js';
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 assert.ok(JSON.parse(fs.readFileSync('tsconfig.boundaries.json','utf8')).include.includes(file));
});
