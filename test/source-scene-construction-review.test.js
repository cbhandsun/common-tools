'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {primitiveImage}=require('./helpers/scene-primitive-program-fixture.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene,preflightSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
const {selectSourceSceneReviewTargets,selectSourceSceneMissingReviewTargets}=require('../packages/slideclone-core/source-scene-review-targets');
const {applyStructuralReview}=require('../packages/slideclone-core/source-scene-structural-review');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/source-scene-group-retention');
const {allocateSourceSceneReview}=require('../packages/slideclone-core/source-scene-review-allocation');

function fixture(t){
 const source=primitiveImage('cylinder',{missingSeam:true});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-construction-review-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,source.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),b=source.box;
 const proposal={format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,[b.y*5,Math.round(b.x*1000/360),(b.y+b.h)*5,Math.round((b.x+b.w)*1000/360)],[3,.2,null,[.4,.7]]]],relations:[],programs:[[]]};
 const plan=admitSourceScenePlan(proposal,
 {sourceHash,widthPx:360,heightPx:200,labelRefs:[]});
 const input={page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:360,heightPt:200}};
 return {input,source,proposal};
}

test('failed complete construction retains its review slot through discovery and pixel allocation, then emits all corrected members',t=>{
 const {input,source}=fixture(t),failed=compileSourceScene(input),before=JSON.stringify(input.plan);
 assert.equal(failed.evidence.nativeProgram.admitted,0);assert.equal(failed.evidence.regionPrograms.completed,0);
 const selected=selectSourceSceneReviewTargets(input.plan,1,failed.evidence);
 assert.equal(selected.structures.length,1);assert.equal(selected.structures[0].compileProbe,false);assert.equal(selected.inventories.length,0);
 const discovered=selectSourceSceneMissingReviewTargets(input.plan,[],[],selected,1);
 assert.equal(discovered.missing.length,0);assert.equal(discovered.structures.length,1);
 const targets=discovered.structures.map((r,index)=>({...r,index}));
 const allocation=allocateSourceSceneReview({width:360,height:200,targets:targets.map(r=>({index:r.index,box:r.box,role:'structure',optional:false,textKnown:false}))});
 assert.deepEqual(allocation.indices,[0]);assert.deepEqual(allocation.deferred,[]);
 const observation=[{index:0,kind:'container',confidence:.99,regionId:input.plan.regions[0].id,box:null,
  nativeGeometry:{...input.plan.objects[0].nativeGeometry,seams:[.7]}}];
 const repaired=applyStructuralReview(input.plan,targets,[observation,structuredClone(observation)]);
 assert.equal(repaired.evidence.corrected.length,1);assert.equal(JSON.stringify(input.plan),before);
 const compiled=compileSourceScene({...input,plan:repaired.plan,compilationSession:failed.compilationSession});
 assert.equal(compiled.evidence.nativeProgram.admitted,1,JSON.stringify(compiled.evidence));
 assert.equal(compiled.evidence.nativeProgram.parts,3);assert.equal(compiled.evidence.regionPrograms.completed,1);
 assert.deepEqual(compiled.evidence.unresolved,[]);assert.equal(compiled.page.shapes.length,3);assert.equal(compiled.page.images.length,0);
 assert.equal(retainedSceneGroupMembers(compiled.page,compiled.groupReceipt).size,3);
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(input.sourceFile)).digest('hex'),input.plan.sourceHash);
 assert.equal(source.image.width,360);
});

test('real planner dispatches both construction reviews and the same source session publishes the corrected complete region',async t=>{
 const {input,proposal}=fixture(t);let globalCalls=0,localCalls=0;
 const planner=createSourceScenePlanner({recognize:async request=>{
  if(request.task==='structure'){globalCalls++;return {scene:proposal,reviews:[],missingText:[]};}
  localCalls++;const targets=request.localTargets;
  assert.equal(targets.structures.length,1,'a failed declared member must not disappear behind optional discovery');
  return {reviews:targets.reviews.map(index=>({index,kind:'text'})),
   recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   structures:targets.structures.map(index=>({index,kind:'container',confidence:.99,regionId:input.plan.regions[0].id,box_2d:null,
    nativeGeometry:{kind:'cylinder',capRatio:.2,seams:[.7]}})),
   ...(targets.inventories?{inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   ...(targets.relations?{relations:targets.relations.map(index=>({index,fromId:null,toId:null,direction:'unknown',confidence:0}))}:{}),
   ...(targets.regionInventories?{regionInventories:targets.regionInventories.map(index=>({index,units:[],relations:[]}))}:{})};
 }});
 const reviewed=await planner({root:input.root,sourceFile:input.sourceFile,dimensions:{widthPx:360,heightPx:200},ocr:{lines:[]},
  isCancellationRequested:async()=>false,preflightSourceScene:(plan,compilationSession)=>preflightSourceScene({...input,plan,...(compilationSession?{compilationSession}:{})})});
 assert.equal(globalCalls,1);assert.equal(localCalls,2);assert.equal(reviewed.evidence.structuralReview.proposed,1);
 assert.equal(reviewed.evidence.structuralReview.corrected.length,1);assert.deepEqual(reviewed.evidence.structuralReview.rejected,[]);
 const result=compileSourceScene({...input,plan:reviewed.plan,compilationSession:reviewed.compilationSession});
 assert.equal(result.evidence.nativeProgram.admitted,1);assert.equal(result.evidence.regionPrograms.completed,1);
 assert.equal(retainedSceneGroupMembers(result.page,result.groupReceipt).size,3);assert.deepEqual(result.evidence.unresolved,[]);
 assert.ok(result.evidence.sourceScanPixels<=4000000);
 const directory=fs.readdirSync(input.root).find(name=>name.startsWith('scene-review-'));
 const persisted=JSON.parse(fs.readFileSync(path.join(input.root,directory,'evidence.json')));
 assert.ok(Number.isSafeInteger(persisted.cropPixels)&&persisted.cropPixels<=4000000);
});

test('review scheduling never turns agreed but absent faces into source authority',t=>{
 const {input}=fixture(t),failed=compileSourceScene(input),selected=selectSourceSceneReviewTargets(input.plan,1,failed.evidence);
 const targets=selected.structures.map((r,index)=>({...r,index}));
 const observation=[{index:0,kind:'container',confidence:1,regionId:input.plan.regions[0].id,box:null,nativeGeometry:input.plan.objects[0].nativeGeometry}];
 const unchanged=applyStructuralReview(input.plan,targets,[observation,structuredClone(observation)]);
 const result=compileSourceScene({...input,plan:unchanged.plan,compilationSession:failed.compilationSession});
 assert.equal(result.evidence.nativeProgram.admitted,0);assert.equal(result.evidence.regionPrograms.completed,0);
 assert.equal(result.page.shapes.length,0);assert.ok(result.evidence.unresolved.some(r=>r.reason==='native-program-source-evidence'));
 const disagreed=structuredClone(observation);disagreed[0].nativeGeometry.seams=[.7];
 assert.equal(applyStructuralReview(input.plan,targets,[observation,disagreed]).evidence.rejected[0].reason,'native-geometry-consensus');
});
