'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/approved-frame-application.cjs');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {createApprovedFrameAssetApplication}=require('../packages/slideclone-core/scene-plan/approved-frame-application');
const {finalizeWithApprovedFrames,composeApprovedAssetApplications}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
const {auditApprovedFrameCompletion:audit}=require('../packages/slideclone-core/scene-plan/approved-frame-completion');
const {selectNativeOutputImages:select}=require('../packages/slideclone-core/quality/native-output-selection');
const {auditNativeComponentQuality:quality}=require('../packages/slideclone-core/quality/native-component-quality');
function setup(t){
 const f=fixture(t),source=f.review.source;
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:120,h:120}},
  {id:'n6',parentId:'root',kind:'container',box:{x:10,y:40,w:100,h:25}}],objects:[],relations:[],
  inventory:[['root',0,0,0],['n6',0,0,0]],programs:[
   {regionId:'root',objects:[],relations:[],labels:[]},{regionId:'n6',objects:[],relations:[],labels:[]}]},
 {sourceHash:source.sha256,widthPx:120,heightPx:120,labelRefs:[]});
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,root:f.root,sourceFile:f.context.sourceFile,slideSize:f.deck.slideSize});
 assert.equal(compiled.evidence.regionPrograms.coverage.regions.completed,1);
 assert.deepEqual(compiled.evidence.unresolved.map(row=>[row.id,row.reason]),[
  ['region-n6','container-perimeter'],['region-n6','region-members-incomplete']]);
 const crop=f.deck.pages[0].images[0];crop.box={x:0,y:0,w:6,h:6};delete crop.style;
 f.deck.pages=[compiled.page];f.deck.pages[0].images=[crop];f.deck.meta={sourceSceneCompilation:compiled.evidence};
 f.review.retirements=[];
 const apply=()=>createApprovedFrameAssetApplication(f.review,{frameRegionIds:['region-n6']});
 return {...f,apply,run:fn=>finalizeWithApprovedFrames(apply(),f.context,fn)};
}

test('real approved application completes semantic perimeter only and retains strict failures unchanged',async t=>{
 const f=setup(t),scene=structuredClone(f.deck.pages[0].source),compilation=structuredClone(f.deck.meta.sourceSceneCompilation);
 assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-incomplete/);
 const result=await f.run(()=>{
  const output=select(f.deck,'semantic-native'),report=quality(f.deck);
  assert.equal(report.passed,true,JSON.stringify(report.findings));assert.equal(report.strictSceneCompletion.passed,false);
  assert.equal(report.strictSceneCompletion.unresolved.length,2);assert.equal(report.approvedFrameCompletions.length,1);
  assert.equal(output.report.approvedFrameCompletions[0].regionId,'region-n6');
  assert.equal(output.report.strictSceneUnresolved.length,2);assert.equal(output.report.strictSourceEquivalent,false);
  return output;
 });
 assert.equal(audit(f.deck,f.deck.pages[0]).status,'verified');assert.equal(quality(f.deck).passed,true);
 assert.deepEqual(f.deck.pages[0].source,scene);assert.deepEqual(f.deck.meta.sourceSceneCompilation,compilation);
 assert.equal(result.report.wholeProductAcceptance,false);
});

test('serialized claims and cloned output do not grant completion authority',async t=>{
 const f=setup(t);await f.run(()=>select(f.deck,'semantic-native'));
 const copy=structuredClone(f.deck);
 assert.equal(audit(copy,copy.pages[0]).status,'absent');
 assert.throws(()=>select(copy,'semantic-native'),/semantic-native-output-incomplete/);
 assert.equal(quality(copy).passed,false);
});

test('an empty unresolved list needs no region tree and grants no perimeter completion receipt',async t=>{
 const f=setup(t),page=f.deck.pages[0];
 page.source.sourceScene.unresolved=[];delete page.source.sourceScene.regionTree;
 const before=structuredClone(page.source),compilation=structuredClone(f.deck.meta.sourceSceneCompilation);
 let calls=0;
 const result=await f.run(()=>{
  calls++;assert.equal(audit(f.deck,page).status,'absent');
  // The independent compiler still reports an incomplete region. Absence
  // of an exception must not turn contradictory source evidence green.
  assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-incomplete/);
  return 'normal-finalizer-result';
 });
 assert.equal(result,'normal-finalizer-result');assert.equal(calls,1);
 assert.equal(audit(f.deck,page).status,'absent');
 assert.deepEqual(page.source,before);assert.deepEqual(f.deck.meta.sourceSceneCompilation,compilation);
});

test('missing or malformed unresolved lists cannot use the no-exception path',async t=>{
 for(const value of [undefined,null,{},Array(113).fill({id:'region-n6'})]){
  const f=setup(t);f.deck.pages[0].source.sourceScene.unresolved=value;
  const before=structuredClone(f.deck);let calls=0;
  await assert.rejects(f.run(()=>{calls++;return 'unexpected';}),/invalid-approved-frame-list/);
  assert.equal(calls,0);assert.deepEqual(f.deck,before);assert.deepEqual(f.directories(),[]);
  assert.equal(audit(f.deck,f.deck.pages[0]).status,'absent');
 }
});

test('retained approved geometry binds a renamed current region without rewriting the fit or strict evidence',async t=>{
 const f=setup(t),rename=value=>{
  if(Array.isArray(value))return value.map(rename);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v)]));
  return value==='region-n6'?'region-current':value;
 };
 f.deck.pages[0].source=rename(f.deck.pages[0].source);
 f.deck.meta.sourceSceneCompilation=rename(f.deck.meta.sourceSceneCompilation);
 const strict=structuredClone(f.deck.pages[0].source),fits=structuredClone(f.review.fits);
 await f.run(()=>{
  const result=select(f.deck,'semantic-native'),approval=result.report.approvedFrameCompletions[0];
  assert.equal(approval.regionId,'region-current');assert.equal(approval.approvedRegionId,'region-n6');
  assert.equal(quality(f.deck).passed,true);
 });
 assert.deepEqual(f.deck.pages[0].source,strict);assert.deepEqual(f.review.fits,fits);
 assert.equal(f.deck.pages[0].shapes.find(s=>s.source?.approximateFrame).source.approximateFrame.regionId,'region-n6');
});

test('frame completion refuses ambiguous or displaced current containers and rolls the transaction back',async t=>{
 for(const change of [f=>{f.deck.pages[0].source.sourceScene.regionTree.push({...f.deck.pages[0].source.sourceScene.regionTree[1],id:'duplicate'});
   f.deck.pages[0].source.sourceScene.unresolved.push({id:'duplicate',reason:'container-perimeter'});},
  f=>{f.deck.pages[0].source.sourceScene.regionTree[1].box.x+=6;}]){
  const f=setup(t);change(f);const before=structuredClone(f.deck);
  await assert.rejects(f.run(()=>select(f.deck,'semantic-native')),/approved-frame-completion-unverified/);
  assert.deepEqual(f.deck,before);assert.deepEqual(f.directories(),[]);
 }
});

test('native finalization may refresh its derived route report without changing strict source obligations',async t=>{
 const f=setup(t);
 await f.run(()=>{
  const page=f.deck.pages[0],old=page.source.sourceScene;
  page.source={...page.source,sourceScene:{...old,routeRepresentations:{requestedMode:'reroutable-elbow',nativeModeUnmetRelationIds:[]}}};
  assert.equal(audit(f.deck,page).status,'verified');
  assert.equal(select(f.deck,'semantic-native').report.approvedFrameCompletions.length,1);
  assert.equal(quality(f.deck).passed,true);assert.deepEqual(page.source.sourceScene.unresolved,old.unresolved);
 });
 assert.equal(audit(f.deck,f.deck.pages[0]).status,'verified');
});

test('unchanged receipt cannot cover changed frame, source, coverage, output identity or duplicate output',async t=>{
 for(const mutate of [f=>{f.deck.pages[0].shapes[0].box.x++;},f=>{f.deck.pages[0].shapes[0]=structuredClone(f.deck.pages[0].shapes[0]);},
  f=>{f.deck.pages[0].shapes.push(f.deck.pages[0].shapes[0]);},
  f=>{f.deck.pages[0].source.sourceScene.sourceHash='a'.repeat(64);},
  f=>{f.deck.meta.sourceSceneCompilation.regionPrograms.coverage.rows[0].complete=false;}]){
  const f=setup(t);await f.run(()=>select(f.deck,'semantic-native'));mutate(f);
  assert.equal(audit(f.deck,f.deck.pages[0]).status,'invalid');
  assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-unverified/);assert.equal(quality(f.deck).passed,false);
 }
});

test('perimeter exception refuses incomplete objects, unknown census, extra own failure and incorrect missing members',async t=>{
 for(const mutate of [f=>{f.deck.meta.sourceSceneCompilation.regionPrograms.coverage.rows[1].objects.admitted=1;},
  f=>{f.deck.meta.sourceSceneCompilation.regionPrograms.coverage.rows[1].relations.observed=null;},
  f=>{f.deck.pages[0].source.sourceScene.unresolved.push({id:'region-n6',reason:'region-containment'});},
  f=>{f.deck.meta.sourceSceneCompilation.regionPrograms.rejected[0].missing.push('missing-child');}]){
  const f=setup(t);mutate(f);const before=structuredClone(f.deck);
  await assert.rejects(f.run(()=>f.deck),/approved-frame-completion-unverified/);
  assert.deepEqual(f.deck,before);assert.deepEqual(f.directories(),[]);assert.equal(audit(f.deck,f.deck.pages[0]).status,'absent');
 }
});

test('unrelated failures and incomplete observed inventory still reject semantic completion',async t=>{
 for(const mutate of [f=>{f.deck.pages[0].source.sourceScene.unresolved.push({id:'unrelated',reason:'container-perimeter'});},
  f=>{f.deck.pages[0].source.sourceScene.observedInventory.regions[0].observed.containers=1;}]){
  const f=setup(t);mutate(f);const before=structuredClone(f.deck);
  await assert.rejects(f.run(()=>select(f.deck,'semantic-native')),/semantic-native-output-(?:incomplete|unverified)/);
  assert.deepEqual(f.deck,before);assert.deepEqual(f.directories(),[]);
 }
});

test('later application rejection or asynchronous finalizer revokes receipt and restores original output',async t=>{
 for(const mode of ['sibling','async']){
  const f=setup(t),before=structuredClone(f.deck);
  const apply=mode==='sibling'?composeApprovedAssetApplications(f.apply(),async()=>{throw Error('later-rejection');}):f.apply();
  await assert.rejects(finalizeWithApprovedFrames(apply,f.context,mode==='async'?()=>Promise.resolve(f.deck):()=>f.deck),
   mode==='async'?/approved-frame-finalizer-must-be-synchronous/:/later-rejection/);
  assert.deepEqual(f.deck,before);assert.deepEqual(f.directories(),[]);assert.equal(audit(f.deck,f.deck.pages[0]).status,'absent');
 }
});

test('hostile and extreme audit inputs execute no getters or Proxy traps',()=>{
 let calls=0;const hostile={get pages(){calls++;throw Error('private');}},proxy=new Proxy({}, {get(){calls++;throw Error('private');}});
 for(const input of [null,undefined,[],hostile,proxy,{pages:Array(10001).fill({})}])assert.equal(audit(input,proxy).status,'invalid');
 assert.equal(calls,0);
});

test('semantic frame regression and implementation enter unified CI and runtime package',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),{REQUIRED_FILES}=require('../scripts/verify-runtime-package');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.endsWith('approved-frame-completion.test.js')));
 assert.ok(REQUIRED_FILES.includes('packages/slideclone-core/scene-plan/approved-frame-completion.js'));
});
