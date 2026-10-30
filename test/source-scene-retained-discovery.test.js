'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {retainedScenePlanningContext:context,retainedSceneDiscoveryTargets:targets}=require('../packages/slideclone-core/scene-plan/source-scene-retained-discovery');
const {selectReviewedRegionalTargets:select,applyRegionalInventoryReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-regional-review');
function fixture(){
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:300,heightPx:200,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:200}}],
  objects:[{id:'left',regionId:'root',kind:'container',pictorialContent:'absent',box:{x:30,y:60,w:30,h:25}},
   {id:'right',regionId:'root',kind:'container',pictorialContent:'absent',box:{x:210,y:60,w:30,h:25}}],relations:[],
  observedInventory:[{regionId:'root',containers:2,icons:0,relations:null}]};
 const endpoint=o=>({collection:'objects',kind:'container',point:{x:o.box.x+15,y:o.box.y+12},sourceBox:{...o.box}});
 const review={sourceHash:plan.sourceHash,widthPx:300,heightPx:200,reviewId:'trusted-source-decision',
  routes:[{from:endpoint(plan.objects[0]),to:endpoint(plan.objects[1]),direction:'forward',steps:[{id:'ink-'+'b'.repeat(24),reversed:false}]}],icon:null};
 return {plan,review};
}
test('same-source retained endpoint pairs nominate missing relations with unknown census without adding an edge or changing counts',()=>{
 const {plan,review}=fixture(),before=structuredClone(plan),rows=targets(plan,review);
 assert.equal(rows.length,1);assert.equal(rows[0].regionId,'root');assert.equal(rows[0].addObjects,false);
 assert.deepEqual(rows[0].endpoints.map(e=>e.id),['left','right']);assert.deepEqual(rows[0].box,plan.regions[0].box);
 assert.deepEqual(plan,before);assert.deepEqual(plan.relations,[]);assert.equal(plan.observedInventory[0].relations,null);
 const prompt=context(review,plan);assert.match(prompt,/Host-retained/);assert.match(prompt,/"direction":"forward"/);
 assert.doesNotMatch(prompt,/ink-|trusted-source-decision|textStartsWith|sourcePathChoice/);
 const retained=structuredClone(review);retained.routes=[];assert.equal(context(retained,plan),'');assert.deepEqual(targets(plan,retained),[]);
 assert.deepEqual(targets(plan,undefined),[]);assert.deepEqual(targets(undefined,review),[]);
});
test('missing identity, duplicate physical representations and an existing relation do not grant a guessed replacement',()=>{
 const {plan,review}=fixture();
 for(const mutate of [p=>p.objects.pop(),p=>p.objects.push({...p.objects[0],id:'duplicate'}),
  p=>p.objects[0].box.x+=3,p=>p.relations.push({id:'existing',regionId:'root',fromId:'left',toId:'right',direction:'forward'})]){
  const p=structuredClone(plan);mutate(p);assert.deepEqual(targets(p,review),[]);
 }
 const p=structuredClone(plan),o=p.objects.pop();p.regions.push({id:o.id,kind:'card',parentId:'root',box:{...o.box,x:o.box.x+1}});
 assert.equal(targets(p,review)[0].endpoints[1].entityKind,'region');
});
test('only the declared nearest common ancestor can own an observation, even for equal or misleading boxes',()=>{
 const {plan,review}=fixture();plan.regions.push({id:'middle',parentId:'root',kind:'diagram',box:{x:0,y:0,w:300,h:200}});
 plan.objects.forEach(o=>o.regionId='middle');assert.equal(targets(plan,review)[0].regionId,'middle');
 plan.regions[1].parentId='middle';assert.throws(()=>targets(plan,review),TypeError);
});

test('unrelated out-of-owner proposals retain ordinary repair without aborting valid retained observations',()=>{
 const {plan,review}=fixture();
 plan.regions.push({id:'unrelated',parentId:'root',kind:'card',box:{x:100,y:130,w:70,h:40}});
 plan.objects.push({id:'pending-icon',regionId:'unrelated',kind:'icon',pictorialContent:'present',box:{x:280,y:10,w:1,h:1}});
 const before=structuredClone(plan),rows=targets(plan,review);
 assert.equal(rows.length,1);assert.deepEqual(rows[0].endpoints.map(e=>e.id),['left','right']);
 assert.ok(select([plan,1,0],review).some(t=>t.regionId==='root'));
 assert.deepEqual(plan,before);assert.deepEqual(plan.objects[2].box,{x:280,y:10,w:1,h:1});
});

test('a confirmed endpoint outside its declared owner is deferred without reparenting or granting a route',()=>{
 const {plan,review}=fixture();
 plan.regions.push({id:'wrong-owner',parentId:'root',kind:'card',box:{x:100,y:130,w:70,h:40}});
 plan.objects[0].regionId='wrong-owner';const before=structuredClone(plan);
 assert.deepEqual(targets(plan,review),[]);assert.deepEqual(plan,before);
 const missing=structuredClone(plan);missing.objects[0].regionId='absent';assert.throws(()=>targets(missing,review),TypeError);
 const outside=structuredClone(plan);outside.objects[0].box.x=301;assert.throws(()=>targets(outside,review),TypeError);
});

test('pending child region geometry does not abort unrelated nominations or authorize a broken ancestry',()=>{
 const {plan,review}=fixture();
 plan.regions.push({id:'pending-parent',parentId:'root',kind:'container',box:{x:27.15,y:110,w:250,h:80}},
  {id:'pending-child',parentId:'pending-parent',kind:'container',box:{x:24.978,y:120,w:80,h:40}});
 const before=structuredClone(plan);
 assert.equal(targets(plan,review).length,1);assert.ok(select([plan,1,0],review).some(t=>t.regionId==='root'));
 assert.deepEqual(plan,before);
 // The endpoint itself fits its immediate owner; that owner's out-of-parent
 // geometry must still prevent it from borrowing the root's route authority.
 const affected=structuredClone(plan);affected.objects[0].regionId='pending-child';affected.objects[0].box={x:35,y:125,w:30,h:25};
 const decision=structuredClone(review);decision.routes[0].from={collection:'objects',kind:'container',point:{x:50,y:137},sourceBox:{...affected.objects[0].box}};
 assert.deepEqual(targets(affected,decision),[]);
 assert.deepEqual(affected.objects[0].box,{x:35,y:125,w:30,h:25});
 for(const mutate of [p=>p.regions[2].parentId='missing',p=>p.regions[1].parentId='pending-child',
  p=>p.regions[2].box.x=301,p=>p.regions[2].box.w=0]){
  const invalid=structuredClone(plan);mutate(invalid);assert.throws(()=>targets(invalid,review),TypeError);
 }
});
test('retained nominations use the original capacity, reference and local attempt ledgers',()=>{
 const {plan,review}=fixture(),args=[plan,1,0];
 const rows=select(args,review);assert.equal(rows.length,1);assert.deepEqual(select([plan,0,0],review),[]);
 const target={...rows[0],index:9},a=[{index:9,units:[],relations:[{from:'left',to:'right',direction:'forward',shaftBox:{x:60,y:65,w:150,h:15}}]}];
 const out=apply(plan,[target],[a,structuredClone(a)]);assert.equal(out.plan.relations.length,1);
 assert.equal(out.plan.observedInventory[0].relations,null);assert.deepEqual(out.plan.regions,plan.regions);
 const changed=structuredClone(a);changed[0].relations[0].direction='backward';assert.equal(apply(plan,[target],[a,changed]).plan.relations.length,0);
 const {recordSceneLocalRelationBatch:record,sceneLocalRelationCapacity:remaining}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
 assert.equal(remaining(out.plan),23);const exhausted=record(plan,plan,[],[],24);assert.deepEqual(select([exhausted,1,0],review),[]);
 const {allocateSourceSceneReview:allocate}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
 const request={width:300,height:200,spentPixels:4000000,targets:[{index:9,box:target.box,role:'region-inventory',optional:true,textKnown:false}]};
 assert.deepEqual(allocate(request).indices,[]);
});
test('stale, malformed, extreme or hostile retained inputs reject without executing accessors or exposing content',()=>{
 const {plan,review}=fixture();let invoked=0;const trap=()=>{invoked++;throw Error('private-retained-content');};
 for(const value of [{...review,sourceHash:'f'.repeat(64)},{...review,widthPx:301},{...review,routes:Array(49).fill(null)},
  new Proxy(review,{get:trap,ownKeys:trap}),{...review,routes:[{get from(){return trap();}}]}])
  assert.throws(()=>targets(plan,value),e=>e instanceof TypeError&&!e.message.includes('private-retained-content'));
 const p=structuredClone(plan);p.textEndpoints=new Proxy([],{get:trap,ownKeys:trap});assert.throws(()=>targets(p,review),TypeError);
 assert.equal(invoked,0);assert.throws(()=>context(review,{...plan,heightPx:201}),TypeError);
});
test('the production runtime feeds trusted decisions into the global request and the original two local observations',async t=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
 const root=createTemp('retained-discovery-');t.after(()=>removeTemp(root));
 const {plan,review}=fixture(),image={width:300,height:200,rgba:Buffer.alloc(300*200*4,255)};
 for(const [left,color]of [[30,[210,225,240]],[210,[230,215,245]]])for(let y=60;y<85;y++)for(let x=left;x<left+30;x++)image.rgba.set([...color,255],(y*300+x)*4);
 for(let x=60;x<210;x++)for(let y=71;y<=73;y++)image.rgba.set([30,60,90,255],(y*300+x)*4);
 for(let x=202;x<210;x++)for(let y=72-(209-x);y<=72+(209-x);y++)image.rgba.set([30,60,90,255],(y*300+x)*4);
 const sourceFile=path.join(root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,image);
 review.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const store=path.join(root,'store');fs.mkdirSync(store);fs.writeFileSync(path.join(store,review.sourceHash+'.json'),JSON.stringify(review));
 let globalCalls=0,localCalls=0;
 const runtime=require('../packages/remote-mcp-server/source-scene-runtime').createSourceSceneRuntime({environment:{COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT:store},sceneVision:async request=>{
  if(request.task==='structure'){globalCalls++;assert.match(request.prompt,/Host-retained/);return {scene:{coordinateSpace:'source-pixels',regions:plan.regions,objects:plan.objects,relations:[],inventory:[['root',2,0,null]]},reviews:[],missingText:[]};}
  localCalls++;const controls=request.localTargets;assert.equal(controls.regionInventories.length,1);assert.equal(controls.regionObjectCapacity,0);
  const index=controls.regionInventories[0],bindings=JSON.parse(request.prompt.split('Targets: ')[1]),frame=bindings.find(b=>b.index===index).candidateBox2D;
  const x=v=>Math.round(frame[1]+v/300*(frame[3]-frame[1])),y=v=>Math.round(frame[0]+v/200*(frame[2]-frame[0]));
  return {reviews:controls.reviews.map(index=>({index,kind:'text'})),recoveredText:controls.missing.map(index=>({index,text:null,confidence:0})),
   regionInventories:[{index,units:[],relations:[{from:'object-left',to:'object-right',direction:'forward',shaftBox_2d:[y(65),x(60),y(80),x(210)]}]}]};
 }});
 const out=await runtime.reviewSourceScene({root,sourceFile,dimensions:{widthPx:300,heightPx:200},ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.equal(globalCalls,1);assert.equal(localCalls,2);assert.equal(out.plan.relations.length,1);
 assert.equal(out.plan.observedInventory[0].relations,null);assert.ok(!out.plan.relations[0].sourcePathChoice);
 const compile=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene;
 const compiled=compile({root,sourceFile,plan:out.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:200}});
 assert.equal(compiled.evidence.resolvedRelations,1);const connectors=compiled.page.shapes.filter(s=>s.source?.detector==='source-scene-relation');assert.equal(connectors.length,1);
 assert.equal(connectors[0].style.startAnchor.elementId,'scene-container-object-left');assert.equal(connectors[0].style.endAnchor.elementId,'scene-container-object-right');
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);
});
test('retained discovery modules ship and regressions enter the unified unit/all CI',()=>{
 const files=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
 for(const name of ['source-scene-retained-discovery','source-scene-regional-review'])assert.ok(files.includes('packages/slideclone-core/scene-plan/'+name+'.js'));
 const suites=require('../scripts/test-suites');assert.equal(suites.classifyTestFile(__filename),'unit');assert.ok(suites.includesSuite(__filename,'all'));
});
