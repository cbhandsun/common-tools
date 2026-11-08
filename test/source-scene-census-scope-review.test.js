'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {captureSceneCensusScopeReview:capture,resolveSceneCensusScopeReview:resolve}=require('../packages/slideclone-core/scene-plan/source-scene-census-scope-review');
const {selectRegionalInventoryTargets:select,readRegionalInventoryObservations:read,applyRegionalInventoryReview:apply,regionalInventoryPrompt:prompt}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {sceneProgramRelationObservation:count}=require('../packages/slideclone-core/scene-plan/source-scene-program-obligations');
const {sceneLocalRelationCapacity:remaining}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
function fixture(){return {version:1,sourceHash:'a'.repeat(64),widthPx:300,heightPx:200,
 regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:200}},
  {id:'overlay',parentId:'root',kind:'diagram',box:{x:10,y:10,w:280,h:170}}],
 objects:[{id:'left',regionId:'root',kind:'container',box:{x:30,y:60,w:30,h:25}},
  {id:'right',regionId:'root',kind:'container',box:{x:210,y:60,w:30,h:25}}],relations:[],
 observedInventory:[{regionId:'root',containers:2,icons:0,relations:2},{regionId:'overlay',containers:0,icons:0,relations:9}]};}
function selected(plan=fixture()){return {...select(plan,32,0).find(t=>t.scopeDiscovery),index:10};}
function rows(target){return [{index:target.index,units:[],relations:[{from:'left',to:'right',direction:'forward',shaftBox:{x:60,y:70,w:150,h:5}}]}];}

test('pending disjoint object owners preserve structural recovery without gaining scope authority',()=>{
 const {sceneEndpointWithinScope}=require('../packages/slideclone-core/scene-plan/source-scene-endpoint-scope');
 for(const kind of ['container','icon','unknown']){
  const plan=fixture();
  plan.regions.push({id:'side',parentId:'root',kind:'diagram',box:{x:260,y:150,w:30,h:30}});
  plan.objects[0].regionId='side';plan.objects[0].kind=kind;
  const before=structuredClone(plan);
  assert.equal(capture(plan,'overlay'),undefined);
  assert.doesNotThrow(()=>select(plan,32,0));
  assert.equal(sceneEndpointWithinScope(plan,'root','left'),false);
  assert.deepEqual(plan,before);
 }
 const invalid=fixture();invalid.textEndpoints=[{id:'label',regionId:'overlay',box:{x:0,y:0,w:5,h:5}}];
 assert.throws(()=>capture(invalid,'overlay'),/owner/);
});
test('a census with no legal endpoint pair schedules a bounded ancestor discovery without reparenting or changing counts',()=>{
 const plan=fixture(),before=structuredClone(plan),control=capture(plan,'overlay');
 assert.equal(control.reviewRegionId,'root');assert.equal(control.observedRelations,9);assert.equal(control.endpoints.length,2);
 const target=selected(plan);assert.equal(target.regionId,'root');assert.deepEqual(target.box,plan.regions[1].box);
 assert.deepEqual(target.ownerBox,plan.regions[0].box);assert.equal(target.addObjects,false);assert.equal(target.inventoryMissing.relations,9);
 assert.deepEqual(resolve(plan,control),control);assert.deepEqual(plan,before);
 assert.equal(select(plan,0,0).length,0);
});
test('both cropped observations must supply the same complete connector; only its exact identity allocates an original obligation',()=>{
 const plan=fixture(),before=structuredClone(plan),target=selected(plan),observations=rows(target);
 const out=apply(plan,[target],[observations,structuredClone(observations)]);
 assert.equal(out.plan.relations.length,1);assert.equal(out.plan.relations[0].regionId,'root');
 assert.equal(count(out.plan,'overlay'),8);assert.equal(count(out.plan,'root'),3);assert.deepEqual(out.plan.observedInventory,plan.observedInventory);
 assert.equal(count(out.plan,'overlay')+count(out.plan,'root'),11);
 assert.deepEqual(out.plan.regions,plan.regions);assert.deepEqual(plan,before);assert.equal(remaining(out.plan),23);
 assert.deepEqual(out.evidence.scopeDiscoveries,[{sourceRegionId:'overlay',reviewRegionId:'root',addedRelationIds:['relation-regional-10-0']}]);
 const disagreement=structuredClone(observations);disagreement[0].relations[0].direction='backward';
 const rejected=apply(plan,[target],[observations,disagreement]);assert.equal(rejected.plan.relations.length,0);assert.equal(remaining(rejected.plan),23);
});
test('cropped discovery uses existing response transport and exposes counts only as unresolved context',()=>{
 const plan=fixture(),target=selected(plan),frame={width:300,height:200,
  sourceTargets:[{index:10,cropBox:plan.regions[0].box,candidateBox:target.box}],
  sheetTargets:[{index:10,cropBox:plan.regions[0].box,candidateBox:target.box}]};
 const capacity={objects:0,relations:1};
 const response={regionInventories:[{index:10,units:[],relations:[{from:'left',to:'right',direction:'forward',shaftBox_2d:[350,200,375,700]}]}]};
 const parsed=read(response,[target],frame,capacity),out=apply(plan,[target],[parsed,structuredClone(parsed)]);
 assert.equal(out.plan.relations.length,1);
 const text=prompt([target],capacity,frame);assert.match(text,/scopeDiscovery/);assert.match(text,/Return units:\[\]/);
 assert.doesNotMatch(text,/"directOwnerWindow":true/);assert.match(text,/"sourceRegionId":"overlay"/);
});
test('missing, clipped, disjoint or inconsistent shafts cannot be admitted through the scope nomination',()=>{
 const plan=fixture(),target=selected(plan),a=rows(target);
 for(const shaft of [undefined,{x:0,y:70,w:210,h:5},{x:60,y:70,w:241,h:5}]){
  const bad=structuredClone(a);bad[0].relations[0].shaftBox=shaft;
  const out=apply(plan,[target],[bad,bad]);assert.equal(out.plan.relations.length,0);assert.equal(remaining(out.plan),23);
 }
 const b=structuredClone(a);b[0].relations[0].shaftBox={x:60,y:110,w:150,h:5};
 assert.equal(apply(plan,[target],[a,b]).plan.relations.length,0);
});
test('stale source, dimensions, envelopes, census, ownership or hierarchy cannot reuse a scope control',()=>{
 const plan=fixture(),control=capture(plan,'overlay');
 const changes=[p=>p.sourceHash='b'.repeat(64),p=>p.widthPx=301,p=>p.regions[1].box.w=279,
  p=>p.observedInventory[1].relations=8,p=>p.objects[0].box.x=31,p=>p.objects[0].regionId='overlay',
  p=>p.regions[1].parentId='overlay'];
 for(const change of changes){const stale=structuredClone(plan);change(stale);assert.throws(()=>resolve(stale,control),TypeError);}
 const changed=selected(plan);changed.endpoints[0].box.x++;
 assert.throws(()=>apply(plan,[changed],[rows(changed),rows(changed)]),TypeError);
});
test('a nominated crop cannot add objects, change its owner, consume another window or replace a program',()=>{
 const plan=fixture();
 for(const mutate of [t=>t.regionId='overlay',t=>t.box.x++,t=>t.addObjects=true,t=>t.boundaryReview=true,
  t=>t.programOnly=true,t=>t.endpoints=[],t=>t.scopeDiscovery.sourceRegionId='root']){
  const target=selected(plan);mutate(target);assert.throws(()=>apply(plan,[target],[rows(target),rows(target)]),TypeError);
 }
 const target=selected(plan),a=rows(target);a[0].units=[{kind:'container',confidence:.99,box:{x:80,y:80,w:10,h:10}}];
 assert.throws(()=>apply(plan,[target],[a,a]),TypeError);
});
test('valid direct scopes, physical owners, empty/unknown census and insufficient references keep the existing selection contract',()=>{
 for(const change of [p=>p.observedInventory=undefined,p=>p.observedInventory[1].relations=null,
  p=>p.observedInventory[1].relations=0,p=>p.regions[1].kind='card',p=>p.objects.pop(),
  p=>p.objects.forEach(o=>o.regionId='overlay')]){
  const plan=fixture();change(plan);assert.equal(capture(plan,'overlay'),undefined);
 }
 const plan=fixture();assert.equal(capture(plan,'root'),undefined);
});
test('nomination must include every eligible contained endpoint, use a complete valid ancestor chain and stay within reference capacity',()=>{
 const plan=fixture();plan.regions.push({id:'middle',kind:'diagram',parentId:'root',box:{x:10,y:10,w:280,h:170}});
 plan.regions[1].parentId='middle';plan.objects[0].regionId='middle';
 assert.equal(capture(plan,'overlay').reviewRegionId,'root');
 const oversized=fixture();oversized.objects=Array.from({length:65},(_,i)=>({id:'node'+i,regionId:'root',kind:'container',box:{x:20+i,y:60,w:5,h:5}}));
 assert.equal(capture(oversized,'overlay'),undefined);
 for(const change of [p=>p.regions[0].parentId='overlay',p=>p.regions[1].parentId='missing',p=>p.objects[0].regionId='missing',
  p=>p.objects[0].box.w=1000,p=>p.objects[1].id=p.objects[0].id,p=>p.observedInventory.push({...p.observedInventory[0]}),
  p=>p.observedInventory[1].relations=10001,p=>p.widthPx=16385]){
  const invalid=fixture();change(invalid);assert.throws(()=>capture(invalid,'overlay'),TypeError);
 }
});
test('hostile controls and entity inputs reject without invoking getters, proxies or leaking their contents',()=>{
 let invoked=0;const marker='private-census-content',getter=()=>{invoked++;throw new Error(marker);};
 const plan=fixture(),control=capture(plan,'overlay');
 for(const value of [null,{},new Proxy(control,{get:getter,getPrototypeOf:getter,ownKeys:getter}),
  {...control,endpoints:[{get id(){return getter();}}]}, {...control,chain:new Array(2)}]){
  assert.throws(()=>resolve(plan,value),error=>error instanceof TypeError&&!error.message.includes(marker));
 }
 const entity=fixture();Object.defineProperty(entity.objects[0],'regionId',{get:getter});
 assert.throws(()=>capture(entity,'overlay'),TypeError);
 const array=fixture();array.objects=new Proxy(array.objects,{get:getter,getPrototypeOf:getter,ownKeys:getter});
 assert.throws(()=>capture(array,'overlay'),TypeError);assert.equal(invoked,0);
});
test('the scope review module ships and its regression is in unified unit/all CI',()=>{
 const suites=require('../scripts/test-suites');assert.equal(suites.classifyTestFile(__filename),'unit');assert.ok(suites.includesSuite(__filename,'all'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-census-scope-review.js'));
});

test('scope discovery retains the original relation-attempt and complete-window pixel budgets',()=>{
 const {recordSceneLocalRelationBatch:record}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
 const plan=fixture(),target=selected(plan),a=rows(target);a[0].relations=Array.from({length:24},()=>({...a[0].relations[0]}));
 const b=structuredClone(a);b[0].relations.forEach(r=>r.direction='backward');
 const exhausted=apply(plan,[target],[a,b]);assert.equal(exhausted.plan.relations.length,0);assert.equal(remaining(exhausted.plan),0);
 assert.equal(select(exhausted.plan,32,0).some(t=>t.scopeDiscovery),false);
 const spent=record(plan,plan,[],[],24);assert.equal(select(spent,32,0).some(t=>t.scopeDiscovery),false);
 const {allocateSourceSceneReview:allocate}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
 const request={width:300,height:200,targets:[{index:10,box:target.box,role:'region-inventory',optional:true,textKnown:false}]};
 assert.deepEqual(allocate({...request,spentPixels:4000000}).indices,[]);
 assert.deepEqual(allocate({...request,spentPixels:0}).indices,[10]);
});

test('a malformed nested or extreme nomination cannot consume unbounded work',()=>{
 const plan=fixture(),control=capture(plan,'overlay');
 for(const value of [{...control,endpoints:Array(513).fill(null)},{...control,sourceHash:'x'.repeat(129)},
  {...control,endpoints:[control,control]}, {...control,extra:Array.from({length:512},()=>Array(8).fill(null))}])
  assert.throws(()=>resolve(plan,value),TypeError);
});

test('an explicit scope deficit keeps its shared references before unrelated inventories and OCR inside a node is not another node',()=>{
 const plan=fixture();
 plan.regions.push({id:'child',kind:'card',parentId:'root',box:{x:20,y:50,w:240,h:50}});
 plan.objects.forEach(o=>o.regionId='child');
 plan.observedInventory.push({regionId:'child',containers:2,icons:1,relations:0});
 plan.textEndpoints=Array.from({length:70},(_,i)=>({id:'text'+i,regionId:'child',labelRef:'label-'+'a'.repeat(24),box:{x:32,y:62,w:2,h:2}}));
 const control=capture(plan,'overlay');assert.equal(control.endpoints.length,3);assert.equal(plan.textEndpoints.length,70);
 const targets=select(plan,32,0);assert.equal(targets[0].scopeDiscovery.sourceRegionId,'overlay');
 assert.equal(targets.some(t=>t.regionId==='child'),false,'overlapping reference scopes are deferred, not silently truncated');
 plan.relations=[{id:'text-link',regionId:'root',fromId:'text0',toId:'right',direction:'forward'}];
 assert(capture(plan,'overlay').endpoints.some(e=>e.id==='text0'),'an explicit text endpoint survives nomination');
});

test('the production planner allocates observed relation identities in its original two local calls without granting pixel authority',async t=>{
 const fs=require('node:fs'),path=require('node:path');
 const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
 const {writePng}=require('../packages/slideclone-core/png');
 const {createSourceScenePlanner:create}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
 const root=createTemp('census-scope-');t.after(()=>removeTemp(root));
 const sourceFile=path.join(root,'source.png'),image={width:300,height:200,rgba:Buffer.alloc(300*200*4,255)};
 for(const x0 of [30,210])for(let y=60;y<85;y++)for(let x=x0;x<x0+30;x++)image.rgba.set([180,220,240,255],(y*300+x)*4);
 for(let x=60;x<210;x++)for(let y=71;y<=73;y++)image.rgba.set([30,60,90,255],(y*300+x)*4);
 for(let x=202;x<210;x++)for(let y=72-(209-x);y<=72+(209-x);y++)image.rgba.set([30,60,90,255],(y*300+x)*4);
 writePng(sourceFile,image);
 const p=fixture(),scene={coordinateSpace:'source-pixels',regions:p.regions,
  objects:p.objects.map(o=>({...o,pictorialContent:'absent'})),relations:[],inventory:[['root',2,0,0],['overlay',0,0,1]]};
 let globalCalls=0,localCalls=0;
 const planner=create({recognize:async request=>{
  if(request.task==='structure'){globalCalls++;return {scene,reviews:[],missingText:[]};}
  localCalls++;const targets=request.localTargets,bindings=JSON.parse(request.prompt.split('Targets: ')[1]);
  assert.equal(targets.regionInventories.length,1);assert.equal(targets.regionObjectCapacity,0);assert.match(request.prompt,/scopeDiscovery/);
  const index=targets.regionInventories[0],frame=bindings.find(r=>r.index===index).candidateBox2D;
  const x=value=>Math.round(frame[1]+(value-10)/280*(frame[3]-frame[1]));
  const y=value=>Math.round(frame[0]+(value-10)/170*(frame[2]-frame[0]));
  return {reviews:targets.reviews.map(index=>({index,kind:'text'})),recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   ...(targets.structures?{structures:targets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   ...(targets.inventories?{inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   regionInventories:[{index,units:[],relations:[{from:'object-left',to:'object-right',direction:'forward',shaftBox_2d:[y(65),x(60),y(80),x(210)]}]}]};
 }});
 const out=await planner({root,sourceFile,dimensions:{widthPx:300,heightPx:200},ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.equal(globalCalls,1);assert.equal(localCalls,2);assert.equal(out.plan.relations.length,1);
 assert.equal(out.plan.relations[0].regionId,'region-root');assert.equal(count(out.plan,'region-overlay'),0);
 assert.equal(count(out.plan,'region-root'),1);
 assert.equal(out.plan.observedInventory.find(r=>r.regionId==='region-overlay').relations,1);
 const directory=fs.readdirSync(root).find(name=>name.startsWith('scene-review-'));
 const evidence=JSON.parse(fs.readFileSync(path.join(root,directory,'evidence.json')));assert(evidence.cropPixels<=4000000);
 assert.equal(out.evidence.regionalInventoryReview.scopeDiscoveries.length,1);
 const {compileSourceScene:compile}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const compiled=compile({root,sourceFile,plan:out.plan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:200}});
 assert.equal(compiled.evidence.resolvedRelations,1);
 const connectors=compiled.page.shapes.filter(s=>s.source?.detector==='source-scene-relation');assert.equal(connectors.length,1);
 assert.equal(connectors[0].style.startAnchor.elementId,'scene-container-object-left');
 assert.equal(connectors[0].style.endAnchor.elementId,'scene-container-object-right');
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);
 const blankFile=path.join(root,'blank.png');writePng(blankFile,{width:300,height:200,rgba:Buffer.alloc(300*200*4,255)});
 const blankPlan=structuredClone(out.plan),hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(blankFile)).digest('hex');
 blankPlan.sourceHash=hash;blankPlan.admission.history.sourceHash=hash;
 blankPlan.objectBatches.sourceHash=hash;
 for(const entry of blankPlan.admission.history.scopeDiscoveries)entry.control.sourceHash=hash;
 const blank=compile({root,sourceFile:blankFile,plan:blankPlan,page:{shapes:[],images:[],textBoxes:[]},slideSize:{widthPt:300,heightPt:200}});
 assert.equal(blank.evidence.resolvedRelations,0,'discovery provenance never substitutes for actual source strokes');
});
