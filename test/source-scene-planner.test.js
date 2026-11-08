"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {writePng,readPng}=require("../packages/slideclone-core/png");
const {createSourceScenePlanner}=require("../packages/slideclone-core/scene-plan/source-scene-planner");
const {SCENE_INVENTORY_CHECK_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-packed-program-prompt');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),"scene-planner-")),sourceFile=path.join(root,"source.png");
writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
return {root,sourceFile,dimensions:{widthPx:100,heightPx:100},isCancellationRequested:async()=>false,ocr:{lines:[{text:"Q",confidence:0.4,box:{x:20,y:20,w:10,h:10}},{text:"节点",confidence:0.99,box:{x:50,y:50,w:20,h:10}}]}};}

test('the actual production planner sends single and multiline text endpoint capability in its packed protocol',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));let calls=0;
 const stop=new Error('captured-production-prompt');
 await assert.rejects(createSourceScenePlanner({recognize:async request=>{
  calls++;assert.equal(request.task,'structure');assert.match(request.prompt,/packed-v1/);
  const {SCENE_TEXT_ENDPOINT_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-program-prompt');
  assert.ok(request.prompt.includes(SCENE_TEXT_ENDPOINT_PROMPT));assert.match(request.prompt,/\["labels",\[originalOcrIndex/);
  assert.match(request.prompt,/Both later independent source views/);
  assert.match(request.prompt,/excluding all declared REGION panels/);
  assert.match(request.prompt,/do not count a child region panel again as a container object in its parent census/);throw stop;
 }})(f),error=>error===stop);assert.equal(calls,1);
});

test('global inventory cross-check covers ancestor-owned relations and faint badge connectors in the existing observation',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));let calls=0;
 const stop=new Error('inventory-request-captured');
 await assert.rejects(createSourceScenePlanner({recognize:async request=>{
  calls++;assert.equal(request.task,'structure');
  const check=request.prompt.slice(request.prompt.lastIndexOf(' OWNERSHIP AND COMPLETENESS CHECK BEFORE RETURNING:'));
  assert.equal(check,SCENE_INVENTORY_CHECK_PROMPT);
  assert.match(check,/explicit object-parent chain/u);
  assert.match(check,/child REGION panel is not an object in the parent census/u);
  assert.match(check,/THAT RELATION'S explicit regionId/u);
  assert.match(check,/including the page root/u);
  assert.match(check,/cannot simultaneously claim observed absence/u);
  assert.match(check,/re-inspect the source rather than copying the proposal-array length/u);
  assert.match(check,/thin, light or dashed connectors outside the main colored network/u);
  assert.match(check,/never infer an edge from numbering or reading order/u);
  assert.match(check,/Return null for uncertain counts/u);
  assert.match(request.prompt,/4M scans, 100000 glyph pixels, 540 seconds/u);
  throw stop;
 }})(f),error=>error===stop);
 assert.equal(calls,1);
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').map(row=>row.file.replaceAll('\\','/'));
 assert.ok(files.includes('test/source-scene-planner.test.js'));
});

test('oversized rejected relation remains unresolved while paired structural review executes',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.dimensions={widthPx:2304,heightPx:1728};f.ocr.lines=[];
 writePng(f.sourceFile,{width:2304,height:1728,rgba:Buffer.alloc(2304*1728*4,255)});
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:2304,h:1728}},
  {id:'left',parentId:'root',kind:'section',box:{x:0,y:0,w:500,h:1728}},
  {id:'right',parentId:'root',kind:'section',box:{x:1800,y:0,w:504,h:1728}}],objects:[
  {id:'a',regionId:'left',kind:'container',pictorialContent:'present',box:{x:30,y:30,w:40,h:40}},
  {id:'b',regionId:'right',kind:'container',box:{x:2200,y:1600,w:40,h:40}}],relations:[
  {id:'bad',regionId:'left',fromId:'a',toId:'b',direction:'forward',shaftBox:{x:0,y:0,w:2304,h:1728}}]};
 f.preflightSourceScene=()=>({evidence:{unresolved:[{id:'object-a',reason:'container-perimeter',detailCode:'outline-no-closed-component'}]}});
 let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(request.localTargets.structures.length,1);assert.equal(request.localTargets.relations,undefined);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:request.localTargets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))};
 }})(f);
 assert.equal(calls,3);assert.equal(result.plan.admission.complete,false);
 assert.equal(result.plan.admission.relationCandidates.length,1);assert.equal(result.plan.relations.length,0);
 assert.equal(result.evidence.structuralReview.proposed,1);assert.equal(result.evidence.topologyReview.corrected.length,0);
 assert.ok(result.evidence.reviewAllocation.deferred.some(row=>row.role==='relation'));
 const directory=path.join(f.root,fs.readdirSync(f.root).find(name=>name.startsWith('scene-review-')));
 const evidence=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 assert.ok(Number.isSafeInteger(evidence.cropPixels)&&evidence.cropPixels<=4000000);
});

test('the original two local calls can recover omitted relations using existing node IDs without displacing pictorial review',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));f.ocr.lines=[];let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
  {id:'card',parentId:'root',kind:'card',box:{x:5,y:5,w:90,h:90}}],objects:[
  {id:'left',regionId:'card',kind:'container',pictorialContent:'present',box:{x:10,y:15,w:25,h:25}},
  {id:'right',regionId:'card',kind:'container',pictorialContent:'present',box:{x:65,y:15,w:25,h:25}}
 ],relations:[]};
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  const targets=request.localTargets,index=targets.regionInventories[0];
  assert.equal(targets.regionInventories.length,1);assert.equal(targets.regionObjectCapacity,0);
  assert.deepEqual(targets.regionEndpointIds[String(index)],['object-left','object-right']);
  assert.equal(targets.inventories.length,2);assert.match(request.prompt,/existingEndpoints/);
  return {reviews:[],recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   regionInventories:[{index,units:[],relations:[{from:'object-left',to:'object-right',direction:'forward'}]}]};
 }})(f);
 assert.equal(calls,3);assert.equal(result.plan.objects.length,2);assert.equal(result.plan.relations.length,1);
 assert.equal(result.evidence.regionalInventoryReview.addedRelations,1);assert.equal(result.evidence.inventoryReview.proposed,2);
 // Recognition still grants no pixels: the source is white, so the real
 // compiler must reject this proposed edge rather than hallucinate its ink.
 const {preflightSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const compiled=preflightSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],textBoxes:[],images:[]},plan:result.plan,slideSize:{widthPt:100,heightPt:100}});
 assert.equal(compiled.evidence.resolvedRelations,0);assert.ok(compiled.evidence.unresolved.length>0);
});

test('mandatory overlapping structural reviews reach both calls with every target and exact charged sheet cost',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.dimensions={widthPx:1400,heightPx:1200};f.ocr.lines=[];
 writePng(f.sourceFile,{width:1400,height:1200,rgba:Buffer.alloc(1400*1200*4,255)});
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1400,h:1200}},
  {id:'wrong',parentId:'root',kind:'section',box:{x:0,y:0,w:20,h:20}}],
  objects:Array.from({length:27},(_,i)=>({id:'obj'+i,regionId:'wrong',kind:'container',box:{x:400+i,y:400+i,w:250,h:180}})),relations:[]};
 let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(request.localTargets.structures.length,27);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:request.localTargets.structures.map(index=>({index,kind:'container',confidence:.99,regionId:'region-root',box_2d:null}))};
 }})(f);
 assert.equal(calls,3);assert.equal(result.evidence.structuralReview.corrected.length,27);
 const dir=path.join(f.root,fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-')));
 const allocation=JSON.parse(fs.readFileSync(path.join(dir,'allocation.json')));
 let actual=0,duplicate=0;
 for(const ratio of [0,.7]){const m=JSON.parse(fs.readFileSync(path.join(dir,`sheet-${ratio}-mapping.json`)));
  assert.equal(m.targets.length,allocation.indices.length);actual+=m.width*m.height;
  duplicate+=m.sourceTargets.reduce((n,t)=>n+t.cropBox.w*t.cropBox.h,0);}
 assert.ok(duplicate>4000000);assert.equal(actual,allocation.sheetPixels);
 const evidence=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
 const focusActual=fs.readdirSync(dir).filter(n=>/^focus-[0-9.]+-[0-9]+\.png$/u.test(n)).reduce((sum,name)=>{
  const image=readPng(path.join(dir,name));return sum+image.width*image.height;
 },0);
 assert.equal(focusActual,allocation.focusPixels??0);
 assert.equal(evidence.cropPixels,actual+focusActual);
 assert.ok(actual+focusActual+allocation.reservedPixels<=4000000);
});

test('a global text claim still sends low-confidence longer tokens and their enclosing icon to both local observations',async t=>{
 for(const disagree of [true,false]){
  const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
  f.ocr.lines=[{text:'III',confidence:.76,box:{x:30,y:35,w:20,h:10}}];let calls=0;
  const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
   objects:[{id:'icon',regionId:'root',kind:'icon',box:{x:20,y:20,w:50,h:50}}],relations:[]};
  const result=await createSourceScenePlanner({recognize:async request=>{
   if(++calls===1)return {scene,reviews:[{index:0,kind:'text'}]};
   assert.deepEqual(request.localTargets.reviews,[0]);
   const targets=JSON.parse(request.prompt.split('Targets: ')[1]),target=targets.find(t=>t.index===0);
   assert.ok(target.cropBox2D[0]<target.candidateBox2D[0]);assert.ok(target.cropBox2D[2]>target.candidateBox2D[2]);
   return {reviews:[{index:0,kind:disagree&&calls===2?'mixed':'graphic'}],recoveredText:[],
    ...(request.localTargets.structures?{structures:request.localTargets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{})};
  }})(f);
  assert.equal(calls,3);assert.equal(result.ocr.lines.length,disagree?1:0);
  assert.deepEqual(result.evidence.unresolvedReviewedGraphics,disagree?[]:[0],'no graphic may disappear when materialization fails');
  const dir=path.join(f.root,fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-')));
  for(const ratio of [0,.7]){
   const mapping=JSON.parse(fs.readFileSync(path.join(dir,`sheet-${ratio}-mapping.json`))).sourceTargets.find(t=>t.index===0);
   assert.ok(mapping.cropBox.x<=20&&mapping.cropBox.y<=20&&mapping.cropBox.x+mapping.cropBox.w>=70&&mapping.cropBox.y+mapping.cropBox.h>=70);
   assert.equal(mapping.cropBox.x+mapping.candidateBox.x,30);assert.equal(mapping.cropBox.y+mapping.candidateBox.y,35);
   assert.equal(mapping.candidateBox.w,20);assert.equal(mapping.candidateBox.h,10);
  }
  const allocation=JSON.parse(fs.readFileSync(path.join(dir,'allocation.json')));
  const evidence=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
  assert.ok(allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0)<=4000000);
  assert.ok(evidence.cropPixels<=allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0));
 }
});

test('mandatory low-confidence review beyond 32 targets fails before any model call without dropping tokens or expanding the budget',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.ocr.lines=Array.from({length:33},(_,index)=>({text:'token'+index,confidence:.8,box:{x:20,y:20,w:40,h:10}}));
 const before=JSON.stringify(f.ocr);let calls=0;
 const planner=createSourceScenePlanner({recognize:async()=>{calls++;return {reviews:f.ocr.lines.map((_,index)=>({index,kind:'text'})),missingText:[]};}});
 await assert.rejects(planner(f),/Scene crop review exceeds boundary/);
 assert.equal(calls,0);assert.equal(JSON.stringify(f.ocr),before);
});

test('global prompt reserves all local mandatory indices and rejects the 38-target union before local dispatch',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.ocr.lines=Array.from({length:38},(_,index)=>({text:'token'+index,confidence:index<27?.8:.99,box:{x:20,y:20,w:40,h:10}}));
 let calls=0;
 const planner=createSourceScenePlanner({recognize:async request=>{
  calls++;assert.equal(request.task,'structure');
  assert.ok(request.prompt.includes('MANDATORY LOCAL REVIEW RESERVATION: indices '+JSON.stringify(Array.from({length:27},(_,i)=>i))));
  assert.match(request.prompt,/Only 5 additional distinct/);
  return {reviews:Array.from({length:11},(_,i)=>({index:i+27,kind:'graphic'})),missingText:[]};
 }});
 await assert.rejects(planner(f),error=>error.code==='SCENE_REVIEW_CAPACITY_EXCEEDED'&&error.requiredReviews===38);
 assert.equal(calls,1);
 const directory=path.join(f.root,fs.readdirSync(f.root).find(name=>name.startsWith('scene-review-')));
 const capacity=JSON.parse(fs.readFileSync(path.join(directory,'review-capacity.json'),'utf8'));
 assert.deepEqual({...capacity,sourceHash:undefined},{sourceHash:undefined,mandatoryReviews:27,requiredReviews:38,missingTargets:0,limitTargets:32,feasible:false});
});

test('global transport can omit reserved OCR rows without losing mandatory or additional local review',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.ocr.lines=Array.from({length:20},(_,index)=>({text:index===14||index===15?'A':'token'+index,
  confidence:index<14?.8:.99,box:{x:20,y:20,w:index===14||index===15?10:40,h:10}}));
 let calls=0;const seen=[];
 const result=await createSourceScenePlanner({recognize:async request=>{
  calls++;
  if(request.task==='structure'){
   assert.match(request.prompt,/Do not repeat these reserved indices in reviews/);
   assert.doesNotMatch(request.prompt,/Include every suspicious non-text\/mixed candidate and every candidate with confidence below 0\.9/);
   return {reviews:[16,17,18,19].map(index=>({index,kind:'graphic'})),missingText:[]};
  }
  seen.push(request.localTargets.reviews.slice());
  return {reviews:request.localTargets.reviews.map(index=>({index,kind:'text'})),recoveredText:[]};
 }})(f);
 assert.equal(calls,3);assert.equal(result.evidence.proposed,20);assert.equal(result.evidence.reviewed,20);
 assert.equal(result.ocr.lines.length,20);assert.deepEqual(seen,[Array.from({length:20},(_,i)=>i),Array.from({length:20},(_,i)=>i)]);
});

test('an OCR arrow observes complete neighboring nodes in both calls while local classification stays on its original box',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.ocr.lines=[{text:'X',confidence:.5,box:{x:46,y:40,w:8,h:10}}];let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[{id:'a',regionId:'root',kind:'container',box:{x:15,y:30,w:30,h:30}},
   {id:'b',regionId:'root',kind:'container',box:{x:56,y:25,w:30,h:45}}],relations:[]};
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[{index:0,kind:'uncertain'}]};
  assert.match(request.prompt,/Use cropBox2D to understand the complete physical object/);
  assert.doesNotMatch(request.prompt,/Inspect ONLY candidateBox2D, not neighboring crops/);
  return {reviews:[{index:0,kind:calls===2?'graphic':'text'}],
   recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0}))};
 }})(f);
 assert.equal(calls,3);assert.equal(result.ocr.lines.length,1,'context cannot override conflicting observations');
 const dir=path.join(f.root,fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-')));
 for(const ratio of [0,.7]){
  const m=JSON.parse(fs.readFileSync(path.join(dir,`sheet-${ratio}-mapping.json`))).sourceTargets.find(t=>t.index===0);
  assert.ok(m.cropBox.x<=15&&m.cropBox.y<=25&&m.cropBox.x+m.cropBox.w>=86&&m.cropBox.y+m.cropBox.h>=70);
  assert.equal(m.cropBox.x+m.candidateBox.x,46);assert.equal(m.cropBox.y+m.candidateBox.y,40);
 }
 const allocation=JSON.parse(fs.readFileSync(path.join(dir,'allocation.json'))),evidence=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
 assert.ok(evidence.cropPixels<=allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0));
});

test('graphic materialization uses the independently observed context when a model icon box clips its body',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=20;y<40;y++)for(let x=30;x<50;x++)if(x<35||x>=45||y<25||y>=35)image.rgba.set([40,90,170,255],(y*400+x)*4);
 f.dimensions={widthPx:400,heightPx:300};
 writePng(f.sourceFile,image);f.ocr.lines=[{text:'III',confidence:.76,box:{x:30,y:30,w:8,h:8}}];
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],
  objects:[{id:'icon',regionId:'root',kind:'icon',box:{x:25,y:15,w:22,h:30}}],relations:[]};
 let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[{index:0,kind:'uncertain'}]};
  return {reviews:[{index:0,kind:'graphic'}],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0}))};
 }})(f);
 assert.equal(calls,3);assert.equal(result.ocr.lines.length,0);
 assert.equal(result.graphics.length,1);assert.deepEqual(result.evidence.unresolvedReviewedGraphics,[]);
 assert.ok(result.graphics[0].box.x+result.graphics[0].box.w>=50,'retain the complete observed body, not a clipped fragment');
 const dir=path.join(f.root,fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-')));
 const allocation=JSON.parse(fs.readFileSync(path.join(dir,'allocation.json'))),evidence=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));
 assert.ok(evidence.cropPixels<=allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0));
 assert.ok(evidence.cropPixels<=4000000);
});

test('full global capacity can recover a omitted region in the same two calls after physical alias compaction',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));f.ocr.lines=[];
 const rgba=Buffer.alloc(40000,255);for(let y=10;y<40;y++)for(let x=5;x<30;x++)rgba.set([180,220,240,255],(y*100+x)*4);
 writePng(f.sourceFile,{width:100,height:100,rgba});
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',kind:'section',parentId:null,box:{x:0,y:0,w:100,h:100}},
  {id:'omitted',kind:'card',parentId:'root',box:{x:50,y:10,w:45,h:80}}],
  objects:Array.from({length:64},(_,i)=>({id:'alias-'+i,kind:'container',regionId:'root',box:{x:3,y:8,w:29,h:34},pictorialContent:'absent'})),relations:[]};
 const compiler=require('../packages/slideclone-core/scene-plan/source-scene-compiler');let calls=0;const released=[],sessions=[];
 f.preflightSourceScene=(plan,compilationSession)=>{const out=compiler.preflightSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan,compilationSession,slideSize:{widthPt:100,heightPt:100}});
  released.push(out.physicalInventory.evidence.releasedObjectSlots);sessions.push(out.compilationSession);return out;};
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  assert.deepEqual(request.localTargets.regionInventories?.length,1);assert.equal(request.localTargets.regionObjectCapacity,32);
  const bindings=JSON.parse(request.prompt.split('Targets: ')[1]);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   ...(request.localTargets.structures?{structures:request.localTargets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
   regionInventories:request.localTargets.regionInventories.map(index=>{const b=bindings.find(t=>t.index===index).candidateBox2D;
    return {index,units:[{kind:'container',confidence:.99,box_2d:[Math.round(b[0]+(b[2]-b[0])*.2),Math.round(b[1]+(b[3]-b[1])*.2),Math.round(b[0]+(b[2]-b[0])*.8),Math.round(b[1]+(b[3]-b[1])*.8)]}],relations:[],
     ...(request.localTargets.regionBoundaryIndices?.includes(index)?{boundary:{confidence:0,box_2d:null}}:{})};})};
 }})(f);
 assert.equal(calls,3);assert.deepEqual(released,[63,0]);assert.equal(result.plan.objects.length,2);
 assert.equal(sessions[0],sessions[1],'post-review measurement retains the original compiler ledger');
 assert.equal(result.compilationSession,sessions[0]);
 assert.equal(result.evidence.regionalInventoryReview.added.length,1);assert.equal(result.plan.objects[1].regionId,'region-omitted');
 assert.equal(result.plan.objectBatches.batches[0].members.length,64,'alias compaction never refunds global proposals');
 assert.equal(result.plan.objectBatches.aliases.length,63);
 assert.equal(result.plan.objectBatches.batches[1].members.length,1);
 assert.equal(result.ocr.lines.length,0);assert.ok(result.compilationSession);
});

test('optional compile probes cannot starve missing pictorial inventory in the same two reviews',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));f.ocr.lines=[];
 const compiler=require('../packages/slideclone-core/scene-plan/source-scene-compiler');let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],objects:[
  {id:'a',regionId:'root',kind:'container',box:{x:10,y:10,w:30,h:40}},
  {id:'b',regionId:'root',kind:'container',box:{x:60,y:10,w:30,h:40}}
 ],relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward'}]};
 f.preflightSourceScene=plan=>compiler.preflightSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan,slideSize:{widthPt:100,heightPt:100}});
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(request.localTargets.inventories?.length,2);
  assert.equal(request.localTargets.relations?.length,1);
  assert.ok(Object.values(request.localTargets).flat().length<=32);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   inventories:request.localTargets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   relations:request.localTargets.relations.map(index=>({index,fromId:null,toId:null,direction:'unknown',confidence:0}))};
 }})(f);
 assert.equal(calls,3);assert.equal(result.plan.objects.length,2);assert.equal(result.plan.relations.length,1);
 assert.equal(result.evidence.inventoryReview.proposed,2);assert.equal(result.evidence.inventoryReview.added.length,0);
 const compiled=compiler.compileSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan:result.plan,
  slideSize:{widthPt:100,heightPt:100},compilationSession:result.compilationSession});
 assert.equal(compiled.evidence.resolvedRelations,0);assert.ok(compiled.evidence.unresolved.length>=3);
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);
});
test('full object capacity and optional preflight probes cannot suppress uncovered glyph observation',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.dimensions={widthPx:512,heightPx:512};writePng(f.sourceFile,{width:512,height:512,rgba:Buffer.alloc(512*512*4,255)});
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:512,h:512}}],
  objects:Array.from({length:64},(_,i)=>({id:'obj'+i,regionId:'root',kind:'container',box:{x:10+(i%8)*60,y:10+Math.floor(i/8)*60,w:24,h:24}})),relations:[]};
 f.ocr.lines=scene.objects.slice(0,58).map(o=>({text:'existing',confidence:1,box:{...o.box}}));
 const before=JSON.stringify(f.ocr),sourceBefore=fs.readFileSync(f.sourceFile),compiler=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 let calls=0;const bindings=[];
 f.preflightSourceScene=plan=>compiler.preflightSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan,
  slideSize:{widthPt:100,heightPt:100}});
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  const targets=request.localTargets;assert.equal(targets.missing.length,6);assert.equal(targets.structures.length,26);
  assert.equal(targets.reviews.length+targets.missing.length+targets.structures.length,32);bindings.push(targets);
  return {reviews:[],recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
   structures:targets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))};
 }})(f);
 assert.equal(calls,3);assert.deepEqual(bindings[0],bindings[1]);assert.equal(result.evidence.missingTextProposed,6);
 assert.deepEqual(result.evidence.recoveredMissingText,[],'white artwork cannot become text');
 assert.equal(result.plan.objects.length,64);assert.equal(JSON.stringify(f.ocr),before);assert.deepEqual(fs.readFileSync(f.sourceFile),sourceBefore);
 const dir=path.join(f.root,fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-'))),allocation=JSON.parse(fs.readFileSync(path.join(dir,'allocation.json')));
 const proposals=JSON.parse(fs.readFileSync(path.join(dir,'missing-proposals.json'))).proposals;
 assert.deepEqual(proposals.map(p=>p.objectId),scene.objects.slice(58).map(o=>'object-'+o.id));
 assert.deepEqual(proposals.map(p=>p.index),[58,59,60,61,62,63]);assert.equal(allocation.indices.length,32);
 assert.ok(allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0)<=4000000);
 const evidence=JSON.parse(fs.readFileSync(path.join(dir,'evidence.json')));assert.ok(evidence.cropPixels<=4000000);
 const compiled=compiler.compileSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},plan:result.plan,
  slideSize:{widthPt:100,heightPt:100},compilationSession:result.compilationSession});
 assert.equal(compiled.evidence.resolvedRelations,0);assert.ok(compiled.evidence.unresolved.length>=64,'unrecovered source units remain failed obligations');
});
test('real source preflight failures reach both existing local reviews before final compilation, without extra calls or assets',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));f.ocr.lines=[];
 const compiler=require('../packages/slideclone-core/scene-plan/source-scene-compiler');let calls=0,preflightCalls=0;
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[{id:'missing',regionId:'root',kind:'container',box:{x:20,y:20,w:30,h:40}}],relations:[]};
 f.preflightSourceScene=plan=>{preflightCalls++;assert.equal(calls,1);return compiler.preflightSourceScene({root:f.root,sourceFile:f.sourceFile,
  page:{shapes:[],images:[],textBoxes:[]},plan,slideSize:{widthPt:100,heightPt:100}});};
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(preflightCalls,1);assert.match(request.prompt,/compileFailures/);assert.match(request.prompt,/container-perimeter/);
  assert.equal(request.localTargets.structures.length,1);assert.ok(Object.values(request.localTargets).flat().length<=32);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:request.localTargets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))};
 }})(f);
 assert.equal(calls,3);assert.equal(preflightCalls,1);assert.ok(result.compilationSession);
 assert.equal(fs.existsSync(path.join(f.root,'assets')),false);
 const compiled=compiler.compileSourceScene({root:f.root,sourceFile:f.sourceFile,page:{shapes:[],images:[],textBoxes:[]},
  plan:result.plan,slideSize:{widthPt:100,heightPt:100},compilationSession:result.compilationSession});
 assert.ok(compiled.evidence.unresolved.some(r=>r.id==='object-missing'));assert.ok(compiled.evidence.sourceScanPixels<=4000000);
 const directory=fs.readdirSync(f.root).find(name=>name.startsWith('scene-review-'));
 assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(f.root,directory,'evidence.json')))).includes('compilationSession'),false);
});
test('two existing local calls discover complete pictorial children without new topology or extra object capacity',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));f.ocr.lines=[];let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],objects:[
  {id:'a',regionId:'root',kind:'container',box:{x:10,y:10,w:30,h:40}},{id:'b',regionId:'root',kind:'container',box:{x:60,y:10,w:30,h:40}}],
  relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward'}]};
 const result=await createSourceScenePlanner({recognize:async request=>{
  calls++;if(calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(request.localTargets.inventories.length,2);assert.ok(Object.values(request.localTargets).flat().length<=32);
  assert.match(request.prompt,/COMPLETE independent pictorial icon INSIDE this node/);
  const targets=JSON.parse(request.prompt.split('Targets: ')[1]);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),inventories:request.localTargets.inventories.map(index=>{
   const b=targets.find(p=>p.index===index).candidateBox2D;
   return {index,kind:'icon',confidence:.99,regionId:'region-root',box_2d:[Math.round(b[0]+(b[2]-b[0])*.5),Math.round(b[1]+(b[3]-b[1])*.25),Math.round(b[0]+(b[2]-b[0])*.9),Math.round(b[1]+(b[3]-b[1])*.75)]};
  })};
 }})(f);
 assert.equal(calls,3);assert.equal(result.evidence.inventoryReview.added.length,2);assert.equal(result.plan.objects.length,4);
 assert.ok(result.plan.objects.slice(2).every(o=>o.nativePictorial===true&&o.parentObjectId));
 assert.equal(result.plan.relations.length,1);assert.deepEqual(result.ocr.lines,[]);
});
test("scene planner consumes source-bound full-page and two crop observations before rebuilding text",async()=>{
 const f=fixture();let calls=0;
 const planner=createSourceScenePlanner({recognize:async request=>{assert.equal(request.images.length,calls===0?1:2);assert.ok(Buffer.isBuffer(request.images[0].bytes));
  if(request.task==="classify-ocr"){
   assert.match(request.prompt,/Each target has its own cropBox2D and candidateBox2D/u);
   assert.match(request.prompt,/Gutter numbers are annotations, never source glyphs/u);
   assert.match(request.prompt,/FIRST image \(the atlas\) only/u);
  }
  calls++;return {reviews:[{index:0,kind:calls===1?"mixed":"graphic"}]};}});
 const result=await planner(f);assert.equal(calls,3);assert.deepEqual(result.ocr.lines.map(l=>l.text),["节点"]);
 assert.equal(result.evidence.rejectedOcr.length,1);
});
test("scene planner stops on provider failure or source mutation without accepting OCR removal",async()=>{
 const f=fixture();await assert.rejects(createSourceScenePlanner({recognize:async()=>{throw new Error("provider unavailable");}})(f),/provider unavailable/);
 const g=fixture();await assert.rejects(createSourceScenePlanner({recognize:async()=>{fs.appendFileSync(g.sourceFile,"changed");return {reviews:[]};}})(g));
});
test("validated source-bound plan survives a later local review failure without yielding a successful rebuild",async()=>{
 const f=fixture();let calls=0;
 const planner=createSourceScenePlanner({recognize:async()=>{
  if(++calls>1)throw Object.assign(new Error("local recognition failed"),{code:"SCENE_HTTP_FAILED"});
  return {reviews:[{index:0,kind:"mixed"}],scene:{coordinateSpace:"normalized-1000",regions:[{id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:1000,h:1000}}],objects:[],relations:[]}};
 }});
 // Both independent local observations are dispatched, and both failures are
 // drained before returning. No additional retries or successful artifact.
 await assert.rejects(planner(f),e=>e.code==="SCENE_HTTP_FAILED");assert.equal(calls,3);
 const directory=fs.readdirSync(f.root).find(name=>name.startsWith("scene-review-"));
 const plan=JSON.parse(fs.readFileSync(path.join(f.root,directory,"plan.json")));
 assert.equal(plan.sourceHash,hashSource(f.sourceFile));
 assert.equal(fs.existsSync(path.join(f.root,directory,"evidence.json")),false);
 assert.deepEqual(f.ocr.lines.map(l=>l.text),["Q","节点"]);
});

test("an invalid global OCR review cannot discard an independently validated scene or authorize rebuilding",async()=>{
 const f=fixture();let calls=0;
 const planner=createSourceScenePlanner({recognize:async()=>{calls++;return {reviews:[{index:999,kind:"graphic"}],
  scene:{coordinateSpace:"normalized-1000",regions:[{id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:1000,h:1000}}],objects:[],relations:[]}};}});
 await assert.rejects(planner(f),/Scene review item/);assert.equal(calls,1);
 const directory=fs.readdirSync(f.root).find(name=>name.startsWith("scene-review-"));
 const plan=JSON.parse(fs.readFileSync(path.join(f.root,directory,"plan.json")));
 assert.equal(plan.sourceHash,hashSource(f.sourceFile));
 assert.equal(fs.existsSync(path.join(f.root,directory,"evidence.json")),false);
 assert.deepEqual(f.ocr.lines.map(l=>l.text),["Q","节点"]);
});

test("scene-first envelope validation rejects malformed and hostile provider objects without reading accessors",async()=>{
 let executed=0;const accessor={reviews:[]};Object.defineProperty(accessor,"scene",{get(){executed++;throw Error("private-token");}});
 const proxy=new Proxy({reviews:[]},{getOwnPropertyDescriptor(){executed++;throw Error("private-token");}});
 for(const response of [null,undefined,[],1,"invalid",accessor,proxy]){
  const f=fixture();await assert.rejects(createSourceScenePlanner({recognize:async()=>response})(f),e=>/Scene review response/.test(e.message)&&!e.message.includes("private-token"));
 }
 assert.equal(executed,0);
});
test("scene planner avoids local calls on an empty proposal and refuses mismatched source dimensions",async()=>{
 let calls=0;const planner=createSourceScenePlanner({recognize:async()=>{calls++;return {reviews:[]};}});
 const f=fixture();f.ocr.lines[0].confidence=0.99;f.ocr.lines[0].text="label";assert.equal((await planner(f)).ocr.lines.length,2);assert.equal(calls,1);
 const g=fixture();g.dimensions.widthPx=101;await assert.rejects(planner(g),/dimensions/);assert.equal(calls,1);
});

test("scene planner rejects OCR from another source frame before any provider call",async()=>{
 let calls=0;const planner=createSourceScenePlanner({recognize:async()=>{calls++;return {reviews:[]};}});
 const f=fixture();f.ocr={...f.ocr,dimensions:{widthPx:80,heightPx:90}};
 await assert.rejects(planner(f),/OCR source dimensions/);assert.equal(calls,0);
 const g=fixture();g.ocr.lines[0].confidence=.99;g.ocr.lines[0].text="label";
 g.ocr={...g.ocr,dimensions:{widthPx:100,heightPx:100}};
 const result=await planner(g);assert.equal(calls,1);assert.equal(result.ocr.lines.length,2);
});
test("production rebuild consumes scene-reviewed OCR before emitting the source deck",async()=>{
 const {createRawImageNativeRebuilder}=require("../packages/slideclone-core/team-native-rebuild");
 const f=fixture();let reviewed=false,captured=false;
 const rebuild=createRawImageNativeRebuilder({reviewSourceScene:async input=>{reviewed=true;assert.equal(input.ocr.lines.length,2);return {ocr:{lines:[input.ocr.lines[1]]},evidence:{sourceHash:hashSource(input.sourceFile)}};},
 rebuildDeckFromWorkDir:workDir=>{assert.equal(reviewed,true);const deck=JSON.parse(fs.readFileSync(path.join(workDir,"ir/deck.json"),"utf8"));assert.deepEqual(deck.pages[0].textBoxes.map(t=>t.text),["节点"]);captured=true;throw new Error("captured source deck");}});
 await assert.rejects(rebuild({root:f.root,metadata:{inputFile:f.sourceFile,dimensions:f.dimensions},ocr:f.ocr,isCancellationRequested:f.isCancellationRequested}),/captured source deck/);
 assert.equal(captured,true);
});
function hashSource(file){return require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");}

test('two original local calls correct impossible object ownership and endpoint kind before compiling',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.ocr.lines=[{text:'existing label',confidence:.99,box:{x:25,y:25,w:15,h:8}}];let calls=0;
 const scene={coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
  {id:'wrong',parentId:'root',kind:'diagram',box:{x:0,y:60,w:90,h:30}}],objects:[
  {id:'a',regionId:'wrong',kind:'container',box:{x:20,y:20,w:30,h:20}},
  {id:'b',regionId:'root',kind:'icon',box:{x:65,y:20,w:15,h:20}}],
  relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward'}]};
 const planner=createSourceScenePlanner({recognize:async request=>{
  calls++;if(calls===1)return {scene,reviews:[],missingText:[]};
  assert.equal(request.images.length,4);assert.equal(request.task,'classify-ocr');assert.equal(request.localTargets.structures.length,2);
  assert.equal(request.localTargets.relations.length,1,'wrong ownership and icon endpoint also need a bounded topology observation');
  for(const index of request.localTargets.structures)assert.ok(request.images.some(view=>view.label.startsWith(`Original context for structural index ${index};`)));
  assert.ok(request.localTargets.reviews.length+request.localTargets.missing.length+request.localTargets.structures.length+request.localTargets.relations.length<=32);
  assert.match(request.prompt,/Return ONLY JSON with "reviewsByIndex", "recoveredByIndex", "structuresByIndex" and "relationsByIndex"/);
  assert.match(request.prompt,/Region IDs are metadata, not coordinate frames/);
  assert.equal(request.prompt.includes('Existing source-frame region locations:'),false);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   relations:request.localTargets.relations.map(index=>({index,fromId:null,toId:null,direction:'unknown',confidence:0})),
   structures:request.localTargets.structures.map(index=>({index,kind:'container',confidence:.99,regionId:'region-root',box_2d:null}))};
 }});
 const result=await planner(f);assert.equal(calls,3);assert.equal(result.plan.objects[0].regionId,'region-root');assert.equal(result.plan.objects[1].kind,'container');
 assert.equal(result.evidence.structuralReview.corrected.length,2);assert.deepEqual(result.plan.relations[0].direction,'forward');
 assert.equal(result.evidence.topologyReview.rejected.length,1,'insufficient endpoint observations cannot counterfeit a correction');
 assert.equal(result.ocr.lines.length,1);assert.equal(result.plan.sourceHash,hashSource(f.sourceFile));
});
test("production rebuild binds missing reviewed graphics to the page before candidate composition",async t=>{
 const {createRawImageNativeRebuilder}=require("../packages/slideclone-core/team-native-rebuild");
 const {auditNativeComponentQuality:audit}=require("../packages/slideclone-core/quality/native-component-quality");
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const rebuild=createRawImageNativeRebuilder({reviewSourceScene:async input=>({ocr:input.ocr,evidence:{sourceHash:hashSource(input.sourceFile),unresolvedReviewedGraphics:[0]}}),
  rebuildDeckFromWorkDir:workDir=>JSON.parse(fs.readFileSync(path.join(workDir,"ir/deck.json")))});
 const result=await rebuild({root:f.root,metadata:{inputFile:f.sourceFile,assetPath:"assets/source.png",dimensions:f.dimensions},ocr:f.ocr,isCancellationRequested:f.isCancellationRequested});
 const page=result.deck.pages[0];assert.deepEqual(page.source.sourceSceneReviewedGraphics.unresolvedReviewedGraphics,[0]);
 const composed={pages:[page],meta:{reconstructionMode:"native-hybrid"}};
 assert.equal(audit(composed).checks.find(c=>c.name==="source-scene-completion").passed,false);
});
test("multiple local candidates share one source sheet in each independent observation",async()=>{
 const f=fixture();let calls=0;
 const planner=createSourceScenePlanner({recognize:async request=>{
  calls++;assert.equal(request.images.length,calls===1?1:3);assert.equal(request.task,calls===1?"structure":"classify-ocr");
  if(calls===1)return {reviews:[{index:0,kind:"mixed"},{index:1,kind:"mixed"}]};
  assert.match(request.prompt,/Return ONLY JSON with "reviewsByIndex" and "recoveredByIndex"/u);
  assert.equal(request.prompt.includes('reviews are ['),false);
  assert.equal(request.prompt.includes('recoveredText is ['),false);
  const targets=JSON.parse(request.prompt.split("Targets: ")[1]);
  assert.deepEqual(targets.map(t=>t.index),[0,1]);assert.match(request.prompt,/normalized 0-1000/);
  for(const target of targets){assert.ok(target.candidateBox2D[0]>=target.cropBox2D[0]);assert.ok(target.candidateBox2D[1]>=target.cropBox2D[1]);
   assert.ok(target.candidateBox2D[2]<=target.cropBox2D[2]);assert.ok(target.candidateBox2D[3]<=target.cropBox2D[3]);
   assert.ok(target.cropBox2D.every(n=>Number.isInteger(n)&&n>=0&&n<=1000));}
  return {reviews:[{index:0,kind:"graphic"},{index:1,kind:"text"}]};
 }});
 const result=await planner(f);assert.equal(calls,3);assert.deepEqual(result.ocr.lines.map(l=>l.text),["节点"]);
 const directory=fs.readdirSync(f.root).find(name=>name.startsWith("scene-review-"));
 const evidence=JSON.parse(fs.readFileSync(path.join(f.root,directory,"evidence.json")));
 assert.ok(evidence.cropPixels<=4000000);
});
test("the same global observation supplies the scene plan without extra vision calls or coordinate guessing",async()=>{
 const f=fixture();f.ocr.lines[0].confidence=.99;f.ocr.lines[0].text="label";let calls=0;
 const planner=createSourceScenePlanner({includeOcrHints:true,recognize:async request=>{calls++;assert.match(request.prompt,/packed-v1/);assert.match(request.prompt,/independently observed DIRECT census/);assert.match(request.prompt,/shaftBox/);assert.match(request.prompt,/pictorialContent/);assert.match(request.prompt,/\[ymin,xmin,ymax,xmax\]/);assert.match(request.prompt,/width=100, height=100/);
  assert.match(request.prompt,/emitting scene FIRST/);assert.match(request.prompt,/INCLUDING icons INSIDE/);
  assert.equal(request.prompt.includes('"text":"节点"'),false);
  assert.ok(request.prompt.endsWith(SCENE_INVENTORY_CHECK_PROMPT));
  const anchors=JSON.parse(request.prompt.slice(0,-SCENE_INVENTORY_CHECK_PROMPT.length).split('OCR candidate locations (glyph content is in the source image): ')[1]);
  assert.deepEqual(anchors[1],[1,[500,500,600,700],.99,'节点']);
  assert.deepEqual(anchors[0],[0,[200,200,300,300],.99,'label']);
  assert.match(request.prompt,/use the explicit originalIndex/u);
  assert.match(request.prompt,/OCR hints are bounded location aids/u);
  return {reviews:[],scene:{coordinateSpace:"normalized-1000",regions:[{id:"root",parentId:null,kind:"section",box:{x:0,y:0,w:1000,h:1000}}],objects:[],relations:[]}};}});
 const result=await planner(f);assert.equal(calls,1);assert.equal(result.plan.sourceHash,hashSource(f.sourceFile));
 assert.deepEqual(result.plan.regions[0].box,{x:0,y:0,w:100,h:100});
 const g=fixture();await assert.rejects(createSourceScenePlanner({recognize:async()=>({reviews:[],scene:{coordinateSpace:"pixels",regions:[],objects:[],relations:[]}})})(g),/Scene plan/);
});

test('global OCR indices keep private source bindings when their unused hashes are omitted from the model prompt',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));f.ocr.lines[0].text='source label';f.ocr.lines.forEach(line=>line.confidence=.99);
 const {sourceLabelIdentity}=require('../packages/slideclone-core/scene-plan/source-label-identity');let calls=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  calls++;assert.equal(request.task,'structure');assert.doesNotMatch(request.prompt,/label-[a-f0-9]{24}/u);
  return {reviews:[],missingText:[],scene:{format:'compact-v8',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
   regions:[[0,null,0,[0,0,1000,1000]]],inventory:[[0,0,0,0]],objects:[],relations:[],programs:[[0,[[[1],'Arial',0]]]]}};
 }})(f);
 assert.equal(calls,1);assert.deepEqual(result.plan.regionPrograms[0].labels[0].refs,
  [sourceLabelIdentity(f.ocr.lines[1].box,f.dimensions)]);assert.equal(result.plan.admission.complete,true);
});

test('observed deficits use the original two regional views to propose missing units inside a nonempty connected card',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.ocr.lines=[{text:'label',confidence:.99,box:{x:21,y:21,w:10,h:8}}];let calls=0;
 const scene={format:'compact-v5',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions:[['root',null,'section',[0,0,1000,1000]],['card','root','card',[100,100,900,900]]],
  inventory:[['root',0,0,0],['card',3,1,3]],
  objects:[['a','card','container',[200,200,350,350],'absent'],['b','card','container',[650,650,800,800],'absent']],
  relations:[['ab','card','a','b','forward',[360,360,640,640]]]};
 const planner=createSourceScenePlanner({recognize:async request=>{
  calls++;if(request.task==='structure')return {scene,reviews:[],missingText:[]};
  const indices=request.localTargets.regionInventories;assert.equal(indices.length,1);
  assert.ok(request.localTargets.regionObjectCapacity<=62);assert.equal(request.localTargets.regionRelationCapacity,24);
  require('../packages/slideclone-core/scene-plan/source-scene-local-response').parseLocalTargets(request.localTargets);
  assert.match(request.prompt,/inventoryMissing/);
  const targets=JSON.parse(request.prompt.split('Targets: ')[1]),target=targets.find(row=>row.index===indices[0]);
  const [y,x,bottom,right]=target.candidateBox2D;
  const crop=(lo,hi)=>[Math.round(y+(bottom-y)*lo),Math.round(x+(right-x)*lo),Math.round(y+(bottom-y)*hi),Math.round(x+(right-x)*hi)];
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:[],inventories:[],relations:[],regionInventories:[{index:indices[0],units:[
    {kind:'container',confidence:.99,box_2d:crop(.4,.6)},
    {kind:'icon',confidence:.99,box_2d:crop(.43,.56)}],
    relations:[{from:'object-a',to:0,direction:'forward'},{from:0,to:'object-b',direction:'forward'}]}]};
 }});
 const result=await planner(f);assert.equal(calls,3);assert.equal(result.plan.objects.length,4);assert.equal(result.plan.relations.length,3);
 assert.equal(result.plan.observedInventory[1].containers,3);assert.equal(result.plan.observedInventory[1].icons,1);
 assert.equal(result.evidence.regionalInventoryReview.added.length,2);
});
test("production compilation consumes a reviewed plan and updates the generated page before residual construction",async()=>{
 const {createRawImageNativeRebuilder}=require("../packages/slideclone-core/team-native-rebuild");
 const f=fixture();f.ocr.lines=f.ocr.lines.slice(1);let compiled=false;
 const rebuild=createRawImageNativeRebuilder({reviewSourceScene:async input=>({ocr:input.ocr,evidence:{},plan:{sourceHash:hashSource(input.sourceFile)}}),
  rebuildDeckFromWorkDir:workDir=>{const d=JSON.parse(fs.readFileSync(path.join(workDir,"ir/deck.json")));d.pages[0].images=[];d.pages[0].shapes=[];return d;},
  compileSourceScene:input=>{compiled=true;assert.equal(input.plan.sourceHash,hashSource(input.sourceFile));return {page:{...input.page,source:{...input.page.source,sceneConsumed:true}},evidence:{containers:0,icons:0}};}});
 const result=await rebuild({root:f.root,metadata:{inputFile:f.sourceFile,assetPath:"assets/source.png",dimensions:f.dimensions},ocr:f.ocr,isCancellationRequested:f.isCancellationRequested});
 assert.equal(compiled,true);assert.equal(result.deck.pages[0].source.sceneConsumed,true);assert.deepEqual(result.deck.meta.sourceSceneCompilation,{containers:0,icons:0});
});

test("global scene request prioritizes source topology and keeps badge glyphs separate from physical backgrounds",async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));let calls=0;
 const planner=createSourceScenePlanner({recognize:async request=>{
  calls++;if(request.task==="structure"){
   assert.match(request.prompt,/source paths together in EACH section, including branch, merge, return and embedded subgraphs/u);
   assert.match(request.prompt,/complete endpoint nodes before embedded decoration/u);
   assert.match(request.prompt,/Never use a fixed container\/icon split/u);
   assert.match(request.prompt,/numbered badge or text-only node uses 0; its glyphs stay text/u);
   assert.match(request.prompt,/64 object proposals and 24 relation proposals in THIS global batch/u);
   assert.match(request.prompt,/ONE consensus batch of at most 32 object proposals and 24 relation proposals/u);
   assert.match(request.prompt,/96 explicit objects and 48 relations with source-bound ledgers/u);
   assert.match(request.prompt,/two later local views share ONE consensus batch of at most 32 object proposals and 24/u);
   assert.match(request.prompt,/Keep ALL observed counts even beyond proposal capacity; never reduce them to fit/u);
  }
  return {reviews:request.task==="structure"?[]:[{index:0,kind:"text"}]};
 }});
 const result=await planner(f);assert.equal(calls,3);assert.equal(result.ocr.lines.length,2);
 assert.equal(result.evidence.recoveredMissingText.length,0);
});

test('large private review charges retain a compact IR-safe summary without changing numeric admission',async t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 f.dimensions={widthPx:1100,heightPx:1100};
 writePng(f.sourceFile,{width:1100,height:1100,rgba:Buffer.alloc(1100*1100*4,255)});
 f.ocr.lines=[{text:'node',confidence:.99,box:{x:200,y:200,w:400,h:200}}];let calls=0;
 const planner=createSourceScenePlanner({recognize:async request=>{
  calls++;return {reviews:[{index:0,kind:request.task==='structure'?'mixed':'text'}]};
 }});
 const result=await planner(f);assert.equal(calls,3);assert.equal(result.ocr.lines.length,1);
 assert.deepEqual(result.evidence.reviewAllocation,{retainedTargets:1,deferred:[]});
 const directory=fs.readdirSync(f.root).find(name=>name.startsWith('scene-review-'));
 const allocation=JSON.parse(fs.readFileSync(path.join(f.root,directory,'allocation.json')));
 assert.ok(allocation.sheetPixels>100000&&allocation.reservedPixels>100000);
 assert.ok(allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0)<=4000000);
 const {validateDeckIrTree}=require('../packages/slideclone-core/deck-ir-tree');
 assert.doesNotThrow(()=>validateDeckIrTree({meta:{sourceSceneReview:result.evidence}}));
 assert.throws(()=>validateDeckIrTree({box:{x:allocation.sheetPixels}}),/invalid number/);
});

