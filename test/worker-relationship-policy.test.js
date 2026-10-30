'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoundedRouteFixture}=require('./helpers/source-rounded-route.cjs');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
const {auditSemanticEditability:audit}=require('../packages/slideclone-core/quality/semantic-editability-quality');
const {withWorkerRelationshipPolicy:within,auditWorkerSemanticEditability:workerAudit}=require('../packages/slideclone-worker-adapter/worker-relationship-policy');
function fixture(controls={connectorCornerMode:'auto'}){
 const f=sourceRoundedRouteFixture(),measured=measureSourceSceneRoute(f);assert.ok(measured.fit,measured.reason);
 const parts=compileSourceSceneRoute({fit:measured.fit,relation:{id:'route',regionId:'root',fromId:'a',toId:'b',direction:'forward'},
  fromId:'a',toId:'b',widthPx:240,heightPx:180,slideSize:{widthPt:240,heightPt:180},...controls});
 return {slideSize:{widthPt:240,heightPt:180},pages:[{shapes:[...parts,...[f.from,f.to].map(n=>({id:n.id,type:'rect',box:n.box,style:{fill:'#D2E6F5'}}))],images:[],textBoxes:[]}]};
}

test('unconfigured bound native routes satisfy the default Worker node-following policy',()=>{
 const deck=fixture({}),route=deck.pages[0].shapes[0];
 assert.equal(route.type,'line');assert.equal(route.source.nativeConnectorRoute,true);
 assert.equal(route.style.startAnchor.elementId,'a');assert.equal(route.style.endAnchor.elementId,'b');
 assert.equal(audit(deck).passed,true);assert.equal(workerAudit(deck).passed,true);
 assert.equal(within(undefined,()=>workerAudit(deck)).passed,true);
 assert.equal(workerAudit(deck).relationshipEditing.nodeMoveRerouting,null);
 assert.equal(workerAudit(deck).relationshipEditing.nodeFollowingVerification,'not-assessed');
});
test('explicit native path policy proves actual geometry and reports the missing node-move capability',()=>{
 const deck=fixture(),before=structuredClone(deck);
 assert.equal(audit(deck).passed,false);
 const result=audit(deck,{relationshipEditing:'native-path'});assert.equal(result.passed,true);
 assert.equal(result.metrics.nativePathRelationshipCount,1);assert.equal(result.metrics.nonReroutableRelationshipCount,1);
 assert.deepEqual(result.relationshipEditing,{required:'native-path',basis:'compiled-ir-structure-only',
  containsOnlyReroutableRepresentations:false,nodeMoveRerouting:false,nodeFollowingVerification:'not-assessed'});
 assert.deepEqual(deck,before);
 const minimal=structuredClone(deck);minimal.pages[0].shapes[0].source={detector:'source-scene-route'};
 assert.equal(audit(minimal,{relationshipEditing:'native-path'}).passed,true);
});
test('filled, closed, malformed, detached or conflicting paths cannot claim native path editing',()=>{
 const changes=[s=>s.style.fill='#123456',s=>s.style.closed=true,s=>s.style.stroke='none',s=>s.style.strokeWidthPt=0,
  s=>s.style.freeformPath='invalid',s=>s.style.freeformPath='[[0,0,0],[1,1,1],[4]]',
  s=>s.style.freeformPath='[[0,0,0],[1,1,1],[0,0,0],[1,1,1]]',s=>s.style.freeformSegments=[],
  s=>delete s.style.startAnchor,s=>s.style.endAnchor.elementId='absent',s=>s.style.startAnchor.position=NaN,
  s=>s.style.endAnchor.dxPt=100,s=>s.box.x++,s=>s.style.rotationDeg=1];
 for(const change of changes){const deck=fixture(),shape=deck.pages[0].shapes[0];change(shape);
  assert.equal(audit(deck,{relationshipEditing:'native-path'}).passed,false);
 }
 const duplicate=fixture();duplicate.pages[0].shapes.push(structuredClone(duplicate.pages[0].shapes[1]));
 assert.equal(audit(duplicate,{relationshipEditing:'native-path'}).passed,false);
});
test('hostile policy and geometry controls cannot execute getters or use a serialized mode as authorization',()=>{
 const deck=fixture();deck.meta={connectorCornerMode:'rounded-freeform',relationshipEditing:'native-path'};
 assert.equal(audit(deck).passed,false);assert.equal(workerAudit(deck).passed,false);
 let calls=0;const hostile={get relationshipEditing(){calls++;throw Error('private');}};
 for(const options of [null,[],hostile,new Proxy({},{get(){calls++;throw Error('private');}}),{relationshipEditing:'private'}, {relationshipEditing:'native-path',extra:true}])
  assert.throws(()=>audit(deck,options),TypeError);
 const {isNativeRelationshipPath}=require('../packages/slideclone-core/quality/native-relationship-path');
 const shape=deck.pages[0].shapes[0],objects=new Map(deck.pages[0].shapes.map(s=>[s.id,[s]]));
 for(const value of [null,{},new Proxy(shape,{get(){calls++;throw Error('private');}})])assert.equal(isNativeRelationshipPath(value,objects),false);
 const bad=structuredClone(shape);bad.style.startAnchor.side={toString(){calls++;throw Error('private');}};
 assert.equal(isNativeRelationshipPath(bad,objects),false);assert.equal(calls,0);
});
test('worker policy is isolated across concurrent jobs and reaches candidate and refinement auditors',async()=>{
 const deck=fixture(),services=require('../packages/slideclone-worker-adapter/worker-output-services');
 const {assessStrictNativeCandidate}=require('../packages/slideclone-worker-adapter/candidate-quality-policy');
 const quality={passed:true,metrics:{'pixel-diff-ratio':.01,'foreground-missing-ratio':.01,'mean-absolute-delta':1},
  checks:[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed:true}]};
 const results=await Promise.all(['auto','reroutable-elbow','rounded-freeform'].map(mode=>within(mode,async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  const expected=mode!=='reroutable-elbow';
  assert.equal(services.auditSemanticEditability(deck).passed,expected);
  const candidate=assessStrictNativeCandidate({candidateDeck:deck,baselineQuality:quality,candidateQuality:quality});
  assert.equal(candidate.semantic.passed,expected);
  return workerAudit(deck).passed;
 })));
 assert.deepEqual(results,[true,false,true]);assert.equal(workerAudit(deck).passed,false);
 assert.throws(()=>within('invalid',()=>null),TypeError);
 await assert.rejects(within('auto',async()=>{throw Error('failure');}),/failure/);assert.equal(workerAudit(deck).passed,false);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/worker-relationship-policy.test.js'));
});
test('bounded delivery metrics retain editing capabilities and visual acceptance evidence together',()=>{
 const {trimQualityMetrics}=require('../packages/slideclone-worker-adapter/worker-quality-policy');
 const required={'semantic-native-path-relationships':2,'semantic-non-reroutable-relationships':2,'semantic-node-rerouting-required':0,
  'pixel-diff-ratio':.03,'foreground-missing-ratio':.01,'mean-absolute-delta':2};
 const result=trimQualityMetrics({...required,...Object.fromEntries(Array.from({length:40},(_,i)=>['extra-'+i,i]))});
 assert.ok(Object.keys(result).length<=32);for(const [k,v]of Object.entries(required))assert.equal(result[k],v);
});
test('the archive handler carries configured policy through raw rebuilding, refinement and final delivery',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {writePng}=require('../packages/slideclone-core/png');
 const {createImageToEditableArchiveHandler}=require('../packages/slideclone-worker-adapter/team-worker');
 const {archive,tarEntry,minimalPptxBuilderSource}=require('./helpers/image-team-worker.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worker-relationship-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const builder=path.join(root,'builder.cjs');fs.writeFileSync(builder,minimalPptxBuilderSource());
 const source=path.join(root,'source.png');writePng(source,sourceRoundedRouteFixture().image);
 const body=archive([tarEntry('assets/source.png',fs.readFileSync(source))]);
 const valid={version:'1.0',...fixture()};valid.pages[0].pageIndex=0;
 const results=[];
 for(const mode of ['auto','reroutable-elbow']){
  let refined=false;
  const handler=createImageToEditableArchiveHandler({temporaryRoot:root,builderExecutable:process.execPath,builderArgs:[builder],connectorCornerMode:mode,
   rawImageOcr:async()=>({lines:[]}),rawImageRebuilder:async()=>({deck:structuredClone(valid)}),
   rawImageQualityVerifier:async()=>({passed:true,checks:[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed:true}],
    metrics:{'pixel-diff-ratio':.01,'foreground-missing-ratio':.01,'mean-absolute-delta':1}}),
   rawImageTypographyRefiner:async({deck})=>{refined=true;assert.equal(workerAudit(deck).passed,mode==='auto');return {accepted:false};},
   objectStore:{readObject:async()=>body,putObject:async()=>{}}});
  const result=await handler({job:{capability:'image-to-editable',inputObjectKey:'owners/test/inputs/source.tar.gz',outputPrefix:'owners/test/jobs/relationship/'},
   isCancellationRequested:async()=>false});
  assert.equal(refined,true);results.push(result);
  assert.equal(result.quality.checks.find(c=>c.name==='semantic-editability').passed,mode==='auto');
 }
 assert.equal(results[0].quality.metrics['semantic-native-path-relationships'],1);
 assert.equal(results[0].quality.metrics['semantic-non-reroutable-relationships'],1);
 assert.equal(results[0].quality.metrics['semantic-node-rerouting-required'],0);
 assert.equal(results[1].quality.metrics['semantic-native-path-relationships'],undefined);
 assert.equal(workerAudit(valid).passed,false);
});
