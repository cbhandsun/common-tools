'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {captureSceneRelationScopeReview:capture,resolveSceneRelationScopeReview:resolve}=require('../packages/slideclone-core/scene-plan/source-scene-relation-scope-review');
const {selectTopologyReviewTargets:select,readTopologyObservations:read,applyTopologyReview:apply,sceneEndpointWithinScope:within,topologyReviewPrompt:prompt}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
function scene(){return {coordinateSpace:'source-pixels',regions:[
 {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:200}},
 {id:'outer',parentId:'root',kind:'section',box:{x:10,y:10,w:280,h:180}},
 {id:'left',parentId:'outer',kind:'section',box:{x:20,y:40,w:100,h:100}},
 {id:'right',parentId:'outer',kind:'section',box:{x:160,y:40,w:100,h:100}},
 {id:'overlay',parentId:'outer',kind:'diagram',box:{x:25,y:45,w:240,h:70}}],objects:[
 {id:'a',regionId:'left',kind:'container',pictorialContent:'absent',box:{x:30,y:60,w:30,h:25}},
 {id:'b',regionId:'right',kind:'container',pictorialContent:'absent',box:{x:210,y:60,w:30,h:25}}],relations:[
 {id:'ab',regionId:'overlay',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:60,y:65,w:150,h:15}}]};}
function fixture(){return parseSourceScenePlan(scene(),{sourceHash:'a'.repeat(64),widthPx:300,heightPx:200});}
function controls(plan){return select(plan,32).map((row,index)=>({...row,index:7+index}));}
function observation(plan){const r=plan.relations[0];return {index:7,fromId:r.fromId,toId:r.toId,direction:r.direction,confidence:.99};}

test('a containing semantic overlay nominates the unique nearest existing ancestor without changing the plan',()=>{
 const p=fixture(),before=structuredClone(p),ts=controls(p),r=p.relations[0];
 assert.equal(within(p,r.regionId,r.fromId),false);assert.equal(ts.length,1);
 assert.equal(ts[0].regionId,'region-outer');assert.equal(ts[0].scopeReview.previousOwner.id,'region-overlay');
 assert.deepEqual(ts[0].endpoints.map(e=>e.id),['object-a','object-b']);
 assert.ok(ts[0].box.w*ts[0].box.h<300*200);assert.deepEqual(p,before);
 const rows=read({relations:[observation(p)]},ts),out=apply(p,ts,[rows,rows]);
 assert.equal(out.evidence.corrected.length,1);assert.equal(out.plan.relations[0].regionId,'region-outer');
 assert.deepEqual({...out.plan.relations[0],regionId:r.regionId},r);
 assert.deepEqual(out.plan.objects,p.objects);assert.deepEqual(out.plan.regions,p.regions);
 assert.equal(within(out.plan,'region-outer',r.fromId),true);assert.equal(within(out.plan,'region-outer',r.toId),true);
 const frame={width:300,height:200,sourceTargets:[{index:7,cropBox:{x:0,y:0,w:300,h:200}}],sheetTargets:[{index:7,cropBox:{x:0,y:0,w:300,h:200}}]};
 assert.match(prompt(ts,frame),/ownerReview/);assert.match(prompt(ts,frame),/unchanged endpoints and direction/);
});

test('scope repair needs two confident consistent observations and cannot repair an endpoint or direction at the same time',()=>{
 const p=fixture(),ts=controls(p),row=observation(p);
 for(const other of [{...row,confidence:.89},{...row,fromId:null,toId:null,direction:'unknown'},
  {...row,fromId:row.toId,toId:row.fromId},{...row,direction:'backward'}]){
  const out=apply(p,ts,[[row],[other]]);assert.equal(out.evidence.corrected.length,0);assert.deepEqual(out.plan.relations,p.relations);
 }
 for(const changed of [{...row,fromId:row.toId,toId:row.fromId},{...row,direction:'backward'}]){
  const out=apply(p,ts,[[changed],[changed]]);assert.equal(out.evidence.corrected.length,0);
 }
 assert.throws(()=>apply(p,ts,[[row]]),TypeError);
 const out=apply(p,ts,[[{...row,fromId:null,toId:null,direction:'unknown',confidence:0}],[{...row,fromId:null,toId:null,direction:'unknown',confidence:0}]]);
 assert.equal(out.evidence.corrected.length,0);
});

test('out-of-box physical unknown missing and cyclic owners never widen scope, and stale source controls reject',()=>{
 const p=fixture(),r=p.relations[0],control=capture(p,r),row=observation(p);assert.ok(control);
 assert.equal(capture({...p,relations:[]},{...r,regionId:'missing'}),undefined);
 for(const mutate of [x=>x.regions.find(r=>r.id==='region-overlay').kind='card',
  x=>x.regions.find(r=>r.id==='region-overlay').box.w=100,
  x=>x.regions.find(r=>r.id==='region-overlay').parentId='region-overlay',
  x=>x.regions.find(r=>r.id==='region-outer').parentId='region-overlay',
  x=>x.relations[0].shaftBox.x=0,x=>x.relations[0].fromId='missing']){
  const current=structuredClone(p);mutate(current);assert.equal(capture(current,current.relations[0]),undefined);
 }
 for(const mutate of [x=>x.sourceHash='b'.repeat(64),x=>x.widthPx++,x=>x.objects[0].box.x++,
  x=>x.relations[0].direction='both',x=>x.regions.find(r=>r.id==='region-outer').box.w--]){
  const current=structuredClone(p);mutate(current);assert.equal(resolve(current,control,current.relations[0],row),undefined);
 }
 const legal={...p,relations:[{...r,regionId:'region-outer'}]};assert.equal(capture(legal,legal.relations[0]),undefined);
 assert.deepEqual(select({...p,relations:[]},32),[]);assert.deepEqual(select(p,0),[]);
});

test('a reviewed owner grants no source strokes, connectors, or larger compiler ledger',t=>{
 const root=createTemp('scope-source-');t.after(()=>removeTemp(root));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:300,height:200,rgba:Buffer.alloc(300*200*4,255)});
 const p=fixture();p.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const row=observation(p),reviewed=apply(p,controls(p),[[row],[row]]);
 const result=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene({
  root,sourceFile,plan:reviewed.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:200}});
 assert.equal(result.evidence.resolvedRelations,0);assert.ok(result.evidence.unresolved.some(r=>r.id===p.relations[0].id));
 assert.equal(result.page.shapes.some(s=>s.type==='connector'),false);assert.ok(result.evidence.sourceScanPixels<=4000000);
});

test('paired planner scope repair refreshes preflight on the original compiler session without extra model calls',async t=>{
 const root=createTemp('scope-planner-');t.after(()=>removeTemp(root));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:300,height:200,rgba:Buffer.alloc(300*200*4,255)});
 let calls=0;const snapshots=[],session=Object.freeze({});
 const planner=require('../packages/slideclone-core/scene-plan/source-scene-planner').createSourceScenePlanner({recognize:async request=>{
  calls++;if(request.task==='structure')return {scene:scene(),reviews:[],missingText:[]};
  assert.match(request.prompt,/ownerReview/);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:(request.localTargets.structures??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   inventories:(request.localTargets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   relations:request.localTargets.relations.map(index=>({index,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}))};
 }});
 const result=await planner({root,sourceFile,dimensions:{widthPx:300,heightPx:200},ocr:{lines:[]},isCancellationRequested:async()=>false,
  preflightSourceScene:(plan,previous)=>{snapshots.push(plan.relations[0].regionId);assert.equal(previous,snapshots.length===1?undefined:session);
   return {evidence:{unresolved:[],sharedRoutes:{graphs:0,resolved:0,rejected:[],pathChoices:[]}},compilationSession:session};}});
 assert.equal(calls,3);assert.deepEqual(snapshots,['region-overlay','region-outer']);assert.equal(result.compilationSession,session);
 assert.equal(result.plan.relations[0].regionId,'region-outer');
 const directory=fs.readdirSync(root).find(n=>n.startsWith('scene-review-'));
 assert.ok(fs.existsSync(path.join(root,directory,'compile-post-review.json')));
 const evidence=JSON.parse(fs.readFileSync(path.join(root,directory,'evidence.json')));
 assert.ok(evidence.cropPixels<=4000000);
});

test('paired owner correction unlocks a source-measured complete attached connector',t=>{
 const root=createTemp('scope-painted-');t.after(()=>removeTemp(root));
 const image={width:300,height:200,rgba:Buffer.alloc(300*200*4,255)};
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*image.width+x)*4);
 for(const [left,color] of [[30,[210,225,240]],[210,[230,215,245]]])
  for(let y=60;y<85;y++)for(let x=left;x<left+30;x++)put(x,y,color);
 for(let x=60;x<210;x++)for(let y=71;y<=73;y++)put(x,y,[30,60,90]);
 for(let x=202;x<210;x++)for(let y=72-(209-x);y<=72+(209-x);y++)put(x,y,[30,60,90]);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const plan=fixture();plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const compile=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene;
 const input={root,sourceFile,plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:200}};
 const before=compile(input);assert.ok(before.evidence.unresolved.some(r=>r.detailCode==='relation-scope'));
 const row=observation(plan),reviewed=apply(plan,controls(plan),[[row],[row]]);
 const after=compile({...input,plan:reviewed.plan});
 assert.equal(after.evidence.resolvedRelations,1);
 const connectors=after.page.shapes.filter(s=>s.source?.detector==='source-scene-relation');assert.equal(connectors.length,1);
 assert.equal(connectors[0].style.startAnchor.elementId,'scene-container-object-a');
 assert.equal(connectors[0].style.endAnchor.elementId,'scene-container-object-b');
 assert.ok(after.evidence.sourceScanPixels<=4000000);
});

test('scope review modules ship and the regression is in the unified unit entry',()=>{
 const suites=require('../scripts/test-suites');assert.equal(suites.classifyTestFile(__filename),'unit');assert.ok(suites.includesSuite(__filename,'all'));
 const files=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
 for(const name of ['source-scene-endpoint-scope','source-scene-relation-scope-review'])assert.ok(files.includes('packages/slideclone-core/scene-plan/'+name+'.js'));
});
