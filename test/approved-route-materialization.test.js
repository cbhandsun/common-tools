'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base}=require('./helpers/approved-frame-application.cjs');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {createApprovedFrameAssetApplication}=require('../packages/slideclone-core/scene-plan/approved-frame-application');
const {finalizeWithApprovedFrames,composeApprovedAssetApplications,issueApprovedFrameApplication}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {buildSceneInventoryEvidence,auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
const {auditApprovedRouteMaterialization:auditFinal,approvedRouteMaterializedMembers:members}=require('../packages/slideclone-core/scene-plan/approved-route-materialization');

function fixture(t){
 const f=base(t),page=f.deck.pages[0],relationId='relation-n0',regionId='region-n0';
 const a={id:'from',type:'rect',box:{x:5,y:5,w:10,h:10},source:{sceneInventoryId:'object-n0',sceneRegionId:regionId}},
  b={id:'to',type:'rect',box:{x:80,y:80,w:10,h:10},source:{sceneInventoryId:'object-n1',sceneRegionId:regionId}};
 const source={sceneInventoryId:relationId,sceneRelationId:relationId,sceneRegionId:regionId,nativeComponentGroupId:'old-route'};
 const body={id:'body',type:'freeform',box:{x:9,y:15,w:76,h:65},style:{fill:'#123456'},source:{...source}},
  body2={...body,id:'body2',source:{...source}};
 const start={id:'start',type:'line',box:{x:10,y:15,w:0,h:1},style:{startAnchor:{elementId:a.id,side:'bottom',position:.5},
  endAnchor:{elementId:body.id,side:'top',position:.1}},source:{...source}},
  end={id:'end',type:'line',box:{x:85,y:79,w:0,h:1},style:{startAnchor:{elementId:body.id,side:'right',position:1},
   endAnchor:{elementId:b.id,side:'top',position:.5}},source:{...source}};
 const retired=[body,body2,start,end];page.shapes.push(a,b,...retired);
 const plan=parseSourceScenePlan({format:'compact-v5',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:[[0,null,'section',[0,0,1000,1000]]],objects:[[0,0,'container',[40,40,130,130],'present'],[1,0,'container',[650,650,750,750],'present']],
  relations:[[0,0,0,1,'forward',[130,80,660,750]]],inventory:[[0,2,0,1]]},
 {sourceHash:f.review.source.sha256,widthPx:120,heightPx:120});
 const evidence=buildSceneInventoryEvidence(plan,page.shapes,page.images);
 page.source.sourceScene={version:1,sourceHash:plan.sourceHash,unresolved:[],observedInventory:evidence};
 const route={approvalId:'user-approved-materialization-fixture',relationId,direction:'forward',source:{...f.review.source},
  members:retired.map(row=>({id:row.id,fingerprint:fingerprint(row)})),endpoints:[a,b].map(row=>({id:row.id,fingerprint:fingerprint(row)})),
  points:[{x:10,y:15},{x:23,y:24},{x:30,y:60},{x:85,y:80}],color:'#123456',widthPx:3};
 const service=()=>createApprovedFrameAssetApplication(f.review,{nativeRoute:route});
 const strict=()=>auditSceneInventory(evidence,page.shapes,page.images,plan.sourceHash,page.textBoxes);
 return {...f,page,plan,route,evidence,retired,a,b,service,strict,part:()=>page.shapes.find(s=>s.id==='approved-route-'+relationId),
  run:finalize=>finalizeWithApprovedFrames(service(),f.context,finalize??(()=>auditNativeComponentQuality(f.deck)))};
}

test('verified four-to-one materialization passes final integrity while original strict evidence and failure remain',async t=>{
 const f=fixture(t),original=JSON.stringify(f.evidence);assert.deepEqual(f.strict(),[]);
 const quality=await f.run();assert.equal(quality.passed,true);assert.equal(JSON.stringify(f.evidence),original);
 assert.equal(f.evidence.units.find(u=>u.id===f.route.relationId).members.length,4);
 assert.deepEqual(f.strict(),[{reason:'evidence-invalid',detail:'unit-members-unexpected',unitId:f.route.relationId,expectedMembers:4,actualMembers:1}]);
 assert.equal(quality.sourceInventory.passed,false);assert.equal(quality.sourceInventory.findings[0].expectedMembers,4);
 assert.deepEqual(quality.approvedMaterializations,[{pageIndex:0,relationId:f.route.relationId,approvalId:f.route.approvalId,
  sourceMembers:4,outputMembers:1,strictSourceEquivalent:false}]);
 assert.equal(f.part().type,'freeform');assert.equal(f.part().source.sourceErasure,false);
 assert.equal(auditNativeComponentQuality(f.deck).passed,true);
 assert.equal(members(f.evidence.units.at(-1),f.page.shapes,f.page.images,f.page.textBoxes),undefined);
});

test('native approximation is selected before publication and survives the normal output finalizer',async t=>{
 const f=fixture(t),originalEvidence=JSON.stringify(f.evidence),originalPage=f.page;
 // The lightweight approval fixture omits unrelated drawing boxes. Supply
 // valid IR geometry before exercising the complete-page output boundary.
 for(const item of [...f.page.shapes,...f.page.images,...f.page.textBoxes])if(!item.box)item.box={x:0,y:0,w:1,h:1};
 f.context.connectorCornerMode='reroutable-elbow';
 f.route.points=[15,25,35,45,55,65,75,80].map((y,i)=>({x:i===0||i===7?10:10+(i%2?.2:-.2),y}))
  .concat([22,34,46,58,70,85].map(x=>({x,y:80})));
 const originalPoints=structuredClone(f.route.points);
 let siblingChecked=false;
 const afterDrawingReview=async context=>{
  assert.equal(f.part().type,'freeform');assert.equal(f.deck.meta.approvedNativeRoute.measuredVerticesPreserved,true);
  siblingChecked=true;return issueApprovedFrameApplication(context,{commit(){},rollback(){}});
 };
 await finalizeWithApprovedFrames(composeApprovedAssetApplications(f.service(),afterDrawingReview),f.context,()=>{
  const published=f.part(),report=f.deck.meta.approvedNativeRoute;
  assert.equal(published.type,'line');assert.equal(report.nativeConnectors,1);assert.equal(report.measuredVerticesPreserved,false);
  assert.equal(report.outputGeometryApproximation,'standard-office-connector');assert.ok(report.outputGeometryChecks>0);
  const out=require('../packages/slideclone-core/routing/source-native-route-finalization').finalizeNativeRouteRepresentations({
   page:f.page,slideSize:f.deck.slideSize,connectorCornerMode:'reroutable-elbow',work:{checks:0}});
  f.page.shapes=out.page.shapes;if(out.page.source!==undefined)f.page.source=out.page.source;
  assert.equal(f.part(),published);assert.equal(f.deck.pages[0],originalPage);
  assert.equal(auditNativeComponentQuality(f.deck).passed,true);
 });
 assert.equal(siblingChecked,true);assert.equal(auditNativeComponentQuality(f.deck).passed,true);assert.deepEqual(f.route.points,originalPoints);
 assert.equal(JSON.stringify(f.evidence),originalEvidence);assert.equal(f.part().style.startAnchor.elementId,'from');assert.equal(f.part().style.endAnchor.elementId,'to');
});

test('output node assembly preserves private route endpoint proof through actual finalization and commit',async t=>{
 const f=fixture(t);
 for(const node of [f.a,f.b])Object.assign(node.source,{nativeRebuild:true,semanticNativeStructure:true,detector:'source-scene-container'});
 for(const item of [...f.page.shapes,...f.page.images,...f.page.textBoxes])if(!item.box)item.box={x:0,y:0,w:1,h:1};
 f.route.endpoints=[f.a,f.b].map(row=>({id:row.id,fingerprint:fingerprint(row)}));
 for(const node of [f.a,f.b])f.page.textBoxes.push({id:'label-'+node.id,text:'Label',box:{x:node.box.x+1,y:node.box.y+1,w:5,h:5},
  source:{editable:true,sceneRegionId:node.source.sceneRegionId}});
 const endpoints=[fingerprint(f.a),fingerprint(f.b)],originalPage=f.page;
 f.context.connectorCornerMode='reroutable-elbow';
 f.route.points=[15,25,35,45,55,65,75,80].map((y,i)=>({x:i===0||i===7?10:10+(i%2?.2:-.2),y}))
  .concat([22,34,46,58,70,85].map(x=>({x,y:80})));
 await f.run(()=>{
  assert.equal(f.part().type,'line');
  const grouped=require('../packages/slideclone-core/scene-plan/semantic-node-edit-groups').groupSemanticNodes({page:f.page,work:{checks:0}});
  assert.equal(grouped.report.groups.length,2);f.page.outputEditGroups=grouped.page.outputEditGroups;
  assert.equal(f.deck.pages[0],originalPage);assert.deepEqual([fingerprint(f.a),fingerprint(f.b)],endpoints);
  assert.equal(auditFinal(f.deck,f.page,()=>true).status,'verified');
 });
 assert.equal(auditFinal(f.deck,f.page,()=>true).status,'verified');
 f.a.box.x++;assert.equal(auditFinal(f.deck,f.page,()=>true).status,'invalid');
});

test('pending publication, direct application and JSON copies cannot create finalization authority',async t=>{
 const f=fixture(t),receipt=await f.service()(f.context);
 assert.equal(auditNativeComponentQuality(f.deck).passed,false);
 assert.equal(auditFinal(f.deck,f.page,()=>[]).status,'invalid');
 const quality=await finalizeWithApprovedFrames(async()=>receipt,f.context,()=>auditNativeComponentQuality(f.deck));
 assert.equal(quality.passed,true);
 assert.equal(auditNativeComponentQuality(structuredClone(f.deck)).passed,false);
 await assert.rejects(finalizeWithApprovedFrames(async()=>receipt,f.context,()=>true),/invalid-approved-frame-application-receipt/u);
});

test('deletion, duplication, replacement clones, paint, anchors, hidden fields and source mutations fail closed',async t=>{
 for(const mode of ['missing','duplicate','clone','stroke','path','hidden','anchor','direction','owner','node','node-copy','source','evidence',
  'evidence-removed','scene-removed','source-removed','retired','outside-reference','size','page']){
  const f=fixture(t);await f.run();const part=f.part();
  if(mode==='missing')f.page.shapes=f.page.shapes.filter(s=>s!==part);
  if(mode==='duplicate')f.page.shapes.push(structuredClone(part));
  if(mode==='clone')f.page.shapes=f.page.shapes.map(s=>s===part?structuredClone(part):s);
  if(mode==='stroke')part.style.stroke='#FFFFFF';if(mode==='path')part.style.freeformPath='invalid';
  if(mode==='hidden')part.style.opacity=0;if(mode==='anchor')part.style.startAnchor.position=.6;
  if(mode==='direction')part.style.endArrow='none';if(mode==='owner')part.source.sceneInventoryId='object-n0';
  if(mode==='node')f.a.box.x++;if(mode==='node-copy')f.page.textBoxes.push(structuredClone(f.a));
  if(mode==='source')f.page.source.sourceScene.sourceHash='b'.repeat(64);
  if(mode==='evidence')f.evidence.units.find(u=>u.id===f.route.relationId).members=[{type:'shape',id:part.id}];
  if(mode==='evidence-removed')delete f.page.source.sourceScene.observedInventory;
  if(mode==='scene-removed')delete f.page.source.sourceScene;
  if(mode==='source-removed')delete f.page.source;
  if(mode==='retired')f.page.shapes.push(f.retired[0]);
  if(mode==='outside-reference')f.page.shapes.push({id:'outside',type:'line',style:{startAnchor:{elementId:'body'}}});
  if(mode==='size')f.deck.slideSize.widthPt++;
  if(mode==='page')f.deck.pages[0]={...f.page};
  assert.equal(auditNativeComponentQuality(f.deck).passed,false,mode);
 }
});

test('substitution does not mask missing, unexpected or unknown units elsewhere in the inventory',async t=>{
 for(const mode of ['missing','unexpected','unknown']){
  const f=fixture(t);await f.run();
  if(mode==='missing')f.page.shapes=f.page.shapes.filter(s=>s!==f.a);
  if(mode==='unexpected')f.page.shapes.push({id:'unexpected',type:'rect',source:{sceneInventoryId:'object-n0'}});
  if(mode==='unknown')f.page.shapes.push({id:'unknown',type:'rect',source:{sceneInventoryId:'unknown'}});
  const quality=auditNativeComponentQuality(f.deck);assert.equal(quality.passed,false,mode);
  if(mode!=='missing')assert.equal(quality.approvedMaterializations.length,1,mode);
 }
});

test('finalizer failure and post-audit tampering revoke the substitution and roll back the entire transaction',async t=>{
 for(const mode of ['throw','mutate','thenable']){
  const f=fixture(t),before=JSON.stringify(f.deck);let escaped;
  await assert.rejects(f.run(()=>{
   assert.equal(auditNativeComponentQuality(f.deck).passed,true);escaped={...f.page};
   if(mode==='throw')throw Error('finalizer-failed');
   if(mode==='mutate')f.part().style.stroke='#FFFFFF';
   return mode==='thenable'?Promise.resolve(true):true;
  }),/finalizer-failed|approved-route-materialization-unverified|approved-frame-finalizer-must-be-synchronous/u);
  assert.equal(JSON.stringify(f.deck),before);assert.deepEqual(f.directories(),[]);
  assert.equal(auditFinal({...f.deck,pages:[escaped]},escaped,()=>[]).status,'invalid');
 }
});

test('later composed application rejection rolls back a pending replacement without leaking authority',async t=>{
 const f=fixture(t),before=JSON.stringify(f.deck);let escaped;
 const apply=composeApprovedAssetApplications(f.service(),async()=>{escaped={...f.page};throw Error('later-rejected');});
 await assert.rejects(finalizeWithApprovedFrames(apply,f.context,()=>true),/later-rejected/u);
 assert.equal(JSON.stringify(f.deck),before);assert.deepEqual(f.directories(),[]);
 assert.equal(auditFinal({...f.deck,pages:[escaped]},escaped,()=>[]).status,'invalid');
 assert.equal((await f.run()).passed,true);
});

test('a later commit failure revokes an already committed route replacement and restores staged assets',async t=>{
 const f=fixture(t),before=JSON.stringify(f.deck);let escaped;
 const fail=async context=>issueApprovedFrameApplication(context,{commit(){throw Error('later-commit-failed');},rollback(){}});
 const apply=composeApprovedAssetApplications(f.service(),fail);
 await assert.rejects(finalizeWithApprovedFrames(apply,f.context,()=>{
  assert.equal(auditNativeComponentQuality(f.deck).passed,true);escaped={...f.page};return true;
 }),/later-commit-failed/u);
 assert.equal(JSON.stringify(f.deck),before);assert.deepEqual(f.directories(),[]);
 assert.equal(auditFinal({...f.deck,pages:[escaped]},escaped,()=>[]).status,'invalid');
 assert.equal((await f.run()).passed,true);
});

test('failed and asynchronous finalizers cannot retain the private audit scope',async t=>{
 const f=fixture(t);let delayed;
 await f.run(()=>{
  const result=auditFinal(f.deck,f.page,()=>{
   delayed=Promise.resolve().then(()=>members(f.evidence.units.at(-1),f.page.shapes,f.page.images,f.page.textBoxes));
   return [];
  });
  assert.equal(result.status,'verified');
 });
 assert.equal(await delayed,undefined);
 assert.equal(auditFinal(f.deck,f.page,()=>Promise.resolve([])).status,'invalid');
});

test('changed original source and member receipts reject before publishing assets or shapes',async t=>{
 for(const mode of ['hash','members','unit-kind','unit-owner','duplicate-unit']){
  const f=fixture(t),unit=f.evidence.units.find(u=>u.id===f.route.relationId);
  if(mode==='hash')f.evidence.sourceHash='b'.repeat(64);
  if(mode==='members')unit.members.pop();if(mode==='unit-kind')unit.kind='icon';
  if(mode==='unit-owner')unit.regionId='other';if(mode==='duplicate-unit')f.evidence.units.push(structuredClone(unit));
  const before=JSON.stringify(f.deck);await assert.rejects(f.run(),/approved-route-materialization-unverified/u);
  assert.equal(JSON.stringify(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});

test('expiry, concurrent jobs and changed deck identities cannot share replacement authority',async t=>{
 const a=fixture(t),b=fixture(t);await Promise.all([a.run(),b.run()]);
 assert.equal(auditFinal(b.deck,a.page,()=>[]).status,'invalid');
 assert.equal(auditNativeComponentQuality({...a.deck,pages:a.deck.pages}).passed,false);
 const now=Date.now;try{Date.now=()=>now()+31*60*1000;assert.equal(auditNativeComponentQuality(a.deck).passed,false);}
 finally{Date.now=now;}
 assert.equal(auditNativeComponentQuality(b.deck).passed,true);
});

test('empty, hostile, extreme, cyclic and public approval inputs grant no substitution or execute hooks',()=>{
 assert.equal(auditFinal({pages:[{}]}, {},()=>[]).status,'absent');
 let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 const getter={};Object.defineProperty(getter,'shapes',{enumerable:true,get:trap});
 const proxy=new Proxy({},{get:trap,getPrototypeOf:trap,ownKeys:trap});
 const cyclic={shapes:[]};cyclic.shapes.push(cyclic);
 for(const page of [null,[],getter,proxy,{shapes:new Array(1)},{shapes:Array(10001).fill({})},cyclic]){
  assert.equal(auditFinal({pages:[page]},page,()=>[]).status,'invalid');
 }
 assert.equal(calls,0);
 const fake={shapes:[{source:{detector:'approved-native-route-approximation'}}],source:{approvedMaterialization:{verified:true}}};
 assert.equal(auditFinal({pages:[fake]},fake,()=>[]).status,'invalid');
});

test('materialization regression is discovered by unified CI and its implementation is typed and shipped',()=>{
 const file='packages/slideclone-core/scene-plan/approved-route-materialization.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/approved-route-materialization.test.js'));
});
test('unrelated large glyph geometry cannot mint or invalidate an absent approval receipt',()=>{
 const shapes=Array.from({length:600},(_,i)=>({id:'glyph-'+i,type:'freeform',source:{detector:'glyph'},
  style:{freeformSegments:Array.from({length:40},()=>({type:'lnTo',points:[{x:0,y:1}]}))}}));
 const page={shapes,images:[],textBoxes:[]},deck={pages:[page]};
 assert.throws(()=>require('../packages/slideclone-core/scene-plan/approved-frame-application-input').fingerprint(page),RangeError);
 assert.equal(auditFinal(deck,page,()=>[]).status,'absent');
 shapes[0].source.detector='approved-native-route-approximation';assert.equal(auditFinal(deck,page,()=>[]).status,'invalid');
 let calls=0;const bad={};Object.defineProperty(bad,'detector',{get(){calls++;throw Error('private');}});
 shapes[0].source=bad;assert.equal(auditFinal(deck,page,()=>[]).status,'invalid');assert.equal(calls,0);
});
