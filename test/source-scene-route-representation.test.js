'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {sourceFilledFringeFixture}=require('./helpers/source-filled-fringe.cjs');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const {summarizeSceneRouteRepresentations:describe}=require('../packages/slideclone-core/scene-plan/source-scene-route-representation');
function reportInput(){
 const node=id=>({id,type:'rect',box:{x:0,y:0,w:10,h:10}});
 return {page:{shapes:[node('a'),node('b'),{id:'line',type:'line',style:{fill:'none',stroke:'#123456',strokeWidthPt:2,
  startAnchor:{elementId:'a',side:'bottom',position:.5},endAnchor:{elementId:'b',side:'top',position:.5}}}],images:[],textBoxes:[]},
  relations:[{relationId:'route',memberIds:['line']}]};
}

test('scene evidence exposes a fixed filled fallback when native connectors were requested by default',t=>{
 const f=sourceFilledFringeFixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'source-route-representation-'));
 t.after(()=>{assert.ok(path.basename(root).startsWith('source-route-representation-'));assert.equal(path.dirname(root),fs.realpathSync(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan={sourceHash,widthPx:f.image.width,heightPx:f.image.height,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:f.image.width,h:f.image.height}}],
  objects:[f.from,f.to].map(n=>({id:n.id,kind:'container',regionId:'root',box:{...n.box}})),
  relations:[{id:'curve',regionId:'root',fromId:f.from.id,toId:f.to.id,direction:'forward',shaftBox:f.shaftBox}]};
 const page={shapes:[],images:[],textBoxes:[]},before=structuredClone(page),pixels=Buffer.from(f.image.rgba);
 const out=compileSourceScene({page,plan,root,sourceFile,slideSize:{widthPt:f.image.width,heightPt:f.image.height}});
 const parts=out.page.shapes.filter(s=>s.source?.sceneRelationId==='curve');
 assert.equal(parts.filter(s=>s.type==='freeform').length,2);assert.equal(parts.filter(s=>s.type==='line').length,2);
 const report=out.evidence.routeRepresentations;assert.ok(report,'the retained fixed fallback must be visible to the caller');
 assert.equal(report.basis,'compiled-ir-structure-only');assert.equal(report.requestedMode,'reroutable-elbow');
 assert.deepEqual(report.nativeModeUnmetRelationIds,['curve']);assert.equal(report.nodeFollowingVerification,'not-assessed');
 assert.deepEqual(report.relations.map(r=>({id:r.relationId,representation:r.representation,fixed:r.fixedPathParts})),
  [{id:'curve',representation:'mixed-fixed-and-connectors',fixed:2}]);
 assert.deepEqual(out.page.source.sourceScene.routeRepresentations,report);
 assert.deepEqual(page,before);assert.deepEqual(f.image.rgba,pixels);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),sourceHash);
 const {auditSemanticEditability}=require('../packages/slideclone-core/quality/semantic-editability-quality');
 assert.equal(auditSemanticEditability({slideSize:{widthPt:f.image.width,heightPt:f.image.height},pages:[out.page]}).passed,false);
});

test('actual bound preset lines are reported independently of source labels and without changing input',()=>{
 for(const connectorType of [undefined,'line','elbow','elbow-2','elbow-5','curved-2','curved-5']){
  const input=reportInput();input.page.shapes[2].style.connectorType=connectorType;
  const before=structuredClone(input),out=describe(input);
  assert.equal(out.relations[0].representation,'native-connectors');assert.equal(out.relations[0].boundConnectorParts,1);
  assert.deepEqual(out.nativeModeUnmetRelationIds,[]);assert.equal(out.nodeFollowingVerification,'not-assessed');assert.deepEqual(input,before);
 }
});

test('filled and open fixed paths keep native-mode shortfalls visible even with forged native flags',()=>{
 for(const fill of ['none','#123456'])for(const includeLine of [false,true]){
  const input=reportInput(),body={id:'body',type:'freeform',style:{fill,stroke:'#123456'},
   source:{nativeConnectorRoute:true,connectorCornerMode:'reroutable-elbow',editable:true,semanticNativeStructure:true}};
  input.page.shapes.push(body);input.relations[0].memberIds=includeLine?['line','body']:['body'];
  const out=describe(input),row=out.relations[0];
  assert.equal(row.representation,includeLine?'mixed-fixed-and-connectors':'fixed-paths');assert.equal(row.fixedPathParts,1);
  assert.equal(row.filledPathParts,fill==='none'?0:1);assert.deepEqual(out.nativeModeUnmetRelationIds,['route']);
  for(const connectorCornerMode of ['auto','rounded-freeform'])assert.deepEqual(describe({...input,connectorCornerMode}).nativeModeUnmetRelationIds,[]);
 }
});

test('transparent route controls are counted without posing as connector or fixed paint',()=>{
 const input=reportInput();input.page.shapes.push({id:'joint',type:'rect',style:{fill:'none',stroke:'none',strokeWidthPt:0}});
 input.relations[0].memberIds.push('joint');const row=describe(input).relations[0];
 assert.equal(row.representation,'native-connectors');assert.equal(row.controlParts,1);assert.equal(row.boundConnectorParts,1);
 assert.equal(row.wholeNativeObject,false);assert.equal(row.requestedNativeModeUnmet,true);
});

test('a connected chain or group cannot impersonate a complete native relationship',()=>{
 const input=reportInput(),first=input.page.shapes[2];
 input.page.shapes.push({...structuredClone(first),id:'second',source:{nativeComponentGroupId:'same-group',wholeNativeObject:true}});
 input.relations[0].memberIds.push('second');
 const report=describe(input),row=report.relations[0];
 assert.equal(row.boundConnectorParts,2);assert.equal(row.objectStructure,'segmented-route');
 assert.equal(row.wholeNativeObject,false);assert.equal(row.requestedNativeModeUnmet,true);
 assert.deepEqual(report.wholeObjectUnmetRelationIds,['route']);assert.deepEqual(report.nativeModeUnmetRelationIds,['route']);
});

test('missing, ambiguous, duplicated and empty physical members cannot satisfy native mode',()=>{
 for(const mode of ['missing','ambiguous-member','duplicate-member','empty','ambiguous-target','unsupported']){
  const input=reportInput();
  if(mode==='missing')input.relations[0].memberIds.push('missing');
  if(mode==='ambiguous-member')input.page.shapes.push(structuredClone(input.page.shapes[2]));
  if(mode==='duplicate-member')input.relations[0].memberIds.push('line');
  if(mode==='empty')input.relations[0].memberIds=[];
  if(mode==='ambiguous-target')input.page.shapes.push(structuredClone(input.page.shapes[0]));
  if(mode==='unsupported')input.page.shapes[2].type='image';
  const out=describe(input);assert.equal(out.relations[0].representation,'unavailable',mode);assert.deepEqual(out.nativeModeUnmetRelationIds,['route']);
 }
});

test('unbound lines and unsupported custom geometry cannot be labelled native presets',()=>{
 const edits=[s=>delete s.startAnchor,s=>s.startAnchor.elementId='line',s=>s.startAnchor.position=Infinity,
  s=>s.startAnchor.side='invalid',s=>s.endAnchor.dxPt=100001,s=>s.connectorType='custom-path',s=>s.connectorPath='private',
  s=>s.freeformSegments=[],s=>s.stroke='none',s=>s.strokeWidthPt=0,s=>s.strokeWidthPt=101,s=>s.strokeWidthPt=NaN];
 for(const edit of edits){const input=reportInput();edit(input.page.shapes[2].style);const row=describe(input).relations[0];
  assert.equal(row.representation,'unavailable');assert.equal(row.unboundLineParts,1);assert.equal(row.requestedNativeModeUnmet,true);}
});

test('empty pages and relation lists report no following verification or implied success',()=>{
 const input=reportInput();input.relations=[];input.page.shapes=[];
 const out=describe(input);assert.deepEqual(out.relations,[]);assert.deepEqual(out.nativeModeUnmetRelationIds,[]);
 assert.equal(out.basis,'compiled-ir-structure-only');assert.equal(out.nodeFollowingVerification,'not-assessed');
});

test('invalid and extreme diagnostic controls reject with fixed messages',()=>{
 const edits=[i=>i.page=null,i=>i.page.shapes=new Array(2),i=>i.page.images=Array(10001).fill({}),
  i=>i.page.textBoxes=undefined,i=>i.relations=Array(1025).fill({}),i=>i.relations[0].memberIds=Array(257).fill('line'),
  i=>i.relations[0].relationId='private content',i=>i.relations[0].memberIds=['a'.repeat(257)],
  i=>i.relations.push(structuredClone(i.relations[0]))];
 for(const edit of edits){const input=reportInput();edit(input);assert.throws(()=>describe(input),{name:'TypeError',message:'Scene route representation controls are invalid'});}
 for(const input of [undefined,null,false,1,'private-content',[]])assert.throws(()=>describe(input),TypeError);
 for(const connectorCornerMode of [null,'',1,{},'x'.repeat(100000)])assert.throws(()=>describe({...reportInput(),connectorCornerMode}),
  {name:'TypeError',message:'Connector corner mode is invalid'});
});

test('provider getters, proxies, coercion hooks and serialization hooks never run',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-provider-content');};
 const proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap});
 const revoked=Proxy.revocable({},{});revoked.revoke();
 for(const input of [proxy,revoked.proxy,{get page(){return trap();}},
  {...reportInput(),page:proxy},{...reportInput(),relations:new Proxy([],{get:trap})}])assert.throws(()=>describe(input),TypeError);
 const input=reportInput();input.page.shapes[2].style.startAnchor.side={toString:trap,valueOf:trap};
 assert.equal(describe(input).relations[0].representation,'unavailable');
 input.page.shapes[2].style.startAnchor=proxy;assert.equal(describe(input).relations[0].representation,'unavailable');
 input.page.shapes[2].style={get fill(){return trap();}};assert.equal(describe(input).relations[0].representation,'unavailable');
 assert.equal(calls,0);
});

test('diagnostic regressions and implementation join unified CI, typed boundaries and package checks',()=>{
 const file='packages/slideclone-core/scene-plan/source-scene-route-representation.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-scene-route-representation.test.js'));
});
