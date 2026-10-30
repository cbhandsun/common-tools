'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {primitiveImage}=require('./helpers/scene-primitive-program-fixture.cjs');
const {compileScenePrimitiveProgram,primitiveSceneParentMembers}=require('../packages/slideclone-core/scene-plan/source-scene-primitive-program');
const {parseSceneNativeGeometry}=require('../packages/slideclone-core/scene-plan/source-scene-native-geometry');
const {admitSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const {recordSceneLocalObjectBatch}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
const {sourceSceneCompileFeedback}=require('../packages/slideclone-core/scene-plan/source-scene-compile-feedback');
const {selectStructuralReviewTargets}=require('../packages/slideclone-core/scene-plan/source-scene-structural-review');
function request(fixture,budget={used:0}){return {image:fixture.image,
 object:{id:'object-unit',regionId:'region-root',kind:'container',box:fixture.box,nativeGeometry:fixture.nativeGeometry},
 textMasks:[],budget,slideSize:{widthPt:fixture.image.width,heightPt:fixture.image.height}};}
for(const kind of ['ellipse','roundRect','quad','cylinder','handFrame'])test('source program really emits all '+kind+' members before legacy detectors',()=>{
 const fixture=primitiveImage(kind),input=request(fixture),result=compileScenePrimitiveProgram(input);
 assert.equal(result.failure,null,JSON.stringify(result));assert.ok(result.shapes.length>0);
 assert.equal(result.shapes.length,kind==='cylinder'?4:1);
 assert.ok(result.portFrame);assert.ok(input.budget.used>0&&input.budget.used<=4000000);
 assert.deepEqual(primitiveSceneParentMembers(fixture.image,result.parentPaint,input.object.id,result.shapes),result.shapes);
});
test('a missing cylinder divider rejects the entire composed unit',()=>{
 const result=compileScenePrimitiveProgram(request(primitiveImage('cylinder',{missingSeam:true})));
 assert.ok(result.failure);assert.equal(result.constructed,4);assert.equal(result.shapes,undefined);assert.equal(result.portFrame,undefined);
});

test('a missing cap or a glyph mask across a required boundary cannot publish remaining faces',()=>{
 const absent=compileScenePrimitiveProgram(request(primitiveImage('cylinder',{missingCap:true})));
 assert.ok(absent.failure);assert.equal(absent.shapes,undefined);
 const input=request(primitiveImage());input.textMasks=[{x:28,y:45,w:8,h:20}];
 const masked=compileScenePrimitiveProgram(input);assert.ok(masked.failure);assert.equal(masked.shapes,undefined);
});

test('large complete units use bounded reads without changing the per-read cap or shared scan allowance',()=>{
 const f=primitiveImage('quad',{dimensions:{width:620,height:620},box:{x:30,y:30,w:540,h:540}}),input=request(f),r=compileScenePrimitiveProgram(input);
 assert.equal(r.failure,null,JSON.stringify(r));assert.equal(r.shapes.length,1);
 assert.equal(input.budget.used,564*564);assert.ok(input.budget.used<=4000000);
 const budget={used:3900000},denied=compileScenePrimitiveProgram(request(f,budget));
 assert.equal(denied.failure,'primitive-source-budget');assert.equal(budget.used,3900000);assert.equal(denied.shapes,undefined);
});
test('source paint inside a larger patch cannot forge a primitive physical boundary',()=>{
 const f=primitiveImage('ellipse');for(let y=12;y<155;y++)for(let x=12;x<145;x++)f.image.rgba.set([60,90,140,255],(y*f.image.width+x)*4);
 const result=compileScenePrimitiveProgram(request(f));assert.ok(result.failure);assert.equal(result.shapes,undefined);
});
test('source budget exhaustion constructs but never publishes, charges or refunds an incomplete unit',()=>{
 const fixture=primitiveImage(),budget={used:4000000},result=compileScenePrimitiveProgram(request(fixture,budget));
 assert.equal(result.constructed,4);assert.equal(result.failure,'primitive-source-budget');assert.equal(result.shapes,undefined);assert.equal(budget.used,4000000);
});
test('no private source receipt survives serialization, changed source, changed paint or missing faces',()=>{
 const fixture=primitiveImage(),input=request(fixture),result=compileScenePrimitiveProgram(input);assert.equal(result.failure,null);
 assert.equal(primitiveSceneParentMembers(fixture.image,{},input.object.id,result.shapes),null);
 assert.equal(primitiveSceneParentMembers({...fixture.image,rgba:Buffer.from(fixture.image.rgba)},result.parentPaint,input.object.id,result.shapes),null);
 assert.equal(primitiveSceneParentMembers(fixture.image,result.parentPaint,input.object.id,result.shapes.slice(1)),null);
 result.shapes[0].style.fill='#FFFFFF';assert.equal(primitiveSceneParentMembers(fixture.image,result.parentPaint,input.object.id,result.shapes),null);
});
test('packed geometry survives the real parser and ledger without extra proposal slots or unknown passthrough',()=>{
 const plan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,[150,100,600,400],[3,.2,null,[.4,.7]]]],relations:[],programs:[[]]},
  {sourceHash:'a'.repeat(64),widthPx:360,heightPx:200,labelRefs:[]});
 assert.equal(plan.objects.length,1);assert.equal(plan.objects[0].nativeGeometry.kind,'cylinder');
 assert.deepEqual(plan.objects[0].nativeGeometry.seams,[.4,.7]);assert.equal(plan.objectBatches.batches[0].members.length,1);
 const changed={...plan,objects:plan.objects.map(o=>({...o,nativeGeometry:{...o.nativeGeometry,seams:[.5,.7]}}))};
 assert.throws(()=>recordSceneLocalObjectBatch(plan,changed,[]),/membership/u);
 const charged=recordSceneLocalObjectBatch(plan,changed,[],[plan.objects[0].id]);assert.equal(charged.objectBatches.batches[1].reviewed.length,1);
 const invalid={...changed,objects:changed.objects.map(o=>({...o,nativeGeometry:{kind:'cylinder',seams:[.8,.4]}}))};
 assert.throws(()=>recordSceneLocalObjectBatch(plan,invalid,[],[plan.objects[0].id]),/native geometry/u);
 const wrongOwner={...changed,objects:changed.objects.map(o=>({...o,kind:'icon'}))};
 assert.throws(()=>recordSceneLocalObjectBatch(plan,wrongOwner,[],[plan.objects[0].id]),/geometry owner/u);
});
test('native geometry boundary rejects unsafe, empty, invalid and extreme proposals before getters execute',()=>{
 for(const value of [null,[],{},'cylinder',{kind:'unknown'},{kind:'cylinder',seams:[.7,.4]},
  {kind:'cylinder',capRatio:0},{kind:'ellipse',radiusRatio:Infinity},{kind:'ellipse',sourceAuthorized:true},
  {kind:'quad',corners:[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]}])assert.throws(()=>parseSceneNativeGeometry(value),TypeError);
 let calls=0;const value={};Object.defineProperty(value,'kind',{get(){calls++;return 'cylinder';},enumerable:true});
 assert.throws(()=>parseSceneNativeGeometry(value),TypeError);assert.equal(calls,0);
 assert.throws(()=>parseSceneNativeGeometry(new Proxy({kind:'cylinder'},{get(){calls++;throw Error('trap');}})),TypeError);assert.equal(calls,0);
 const symbolValue={kind:'cylinder'};Object.defineProperty(symbolValue,Symbol('unsafe'),{enumerable:true,get(){calls++;throw Error('symbol trap');}});
 assert.throws(()=>parseSceneNativeGeometry(symbolValue),TypeError);assert.equal(calls,0);
 assert.equal(parseSceneNativeGeometry(undefined),undefined);
});
test('actual source compiler consumes packed multi-face construction, seals the entire native unit and completes its region',t=>{
 const fixture=primitiveImage(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-native-program-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,fixture.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const b=fixture.box,normalized=[b.y*5,Math.round(b.x*1000/360),(b.y+b.h)*5,Math.round((b.x+b.w)*1000/360)];
 const plan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,normalized,[3,.2,null,[.4,.7]]]],relations:[],programs:[[]]},
  {sourceHash,widthPx:360,heightPx:200,labelRefs:[]});
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:360,heightPt:200}});
 assert.equal(compiled.evidence.nativeProgram.admitted,1,JSON.stringify(compiled.evidence));
 assert.equal(compiled.evidence.nativeProgram.parts,4);assert.equal(compiled.evidence.regionPrograms.completed,1);
 assert.equal(compiled.page.shapes.length,4);assert.equal(compiled.page.images.length,0);assert.deepEqual(compiled.evidence.unresolved,[]);
 // Text-free multi-face units must retain their physical group too.
 assert.equal(retainedSceneGroupMembers(compiled.page,compiled.groupReceipt).size,4);
});

test('actual rejected multi-face program reaches source-bound review and remains incomplete',t=>{
 const fixture=primitiveImage('cylinder',{missingSeam:true}),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-program-feedback-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,fixture.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),b=fixture.box;
 const normalized=[b.y*5,Math.round(b.x*1000/360),(b.y+b.h)*5,Math.round((b.x+b.w)*1000/360)];
 const plan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,normalized,[3,.2,null,[.4,.7]]]],relations:[],programs:[[]]},
  {sourceHash,widthPx:360,heightPx:200,labelRefs:[]});
 const before=JSON.stringify(plan),compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,
  slideSize:{widthPt:360,heightPt:200}}),owner=plan.objects[0].id;
 assert.equal(compiled.evidence.nativeProgram.constructed,1);assert.equal(compiled.evidence.nativeProgram.admitted,0);
 assert.equal(compiled.evidence.regionPrograms.completed,0);assert.equal(compiled.page.shapes.length,0);
 const failed=compiled.evidence.unresolved.find(row=>row.id===owner&&row.reason==='native-program-source-evidence');assert.ok(failed);
 const code=`${failed.reason}:${failed.detailCode}`;
 assert.deepEqual(sourceSceneCompileFeedback(plan,compiled.evidence).get(owner),[code]);
 const targets=selectStructuralReviewTargets(plan,1,compiled.evidence);
 assert.equal(targets.length,1);assert.equal(targets[0].objectId,owner);assert.deepEqual(targets[0].compileFailures,[code]);
 assert.equal(targets[0].compileProbe,false);assert.deepEqual(targets[0].box,plan.objects[0].box);
 assert.equal(JSON.stringify(plan),before);assert.ok(compiled.evidence.sourceScanPixels<=4000000);
});

test('opt-in complete cage uses source paths while missing declared dividers still fail',t=>{
 const fixture=primitiveImage(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-cage-compile-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,fixture.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),b=fixture.box;
 const normalized=[b.y*5,Math.round(b.x*1000/360),(b.y+b.h)*5,Math.round((b.x+b.w)*1000/360)];
 const plan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,normalized,[3,.1,null,[.4,.7]]]],relations:[],programs:[[]]},
  {sourceHash,widthPx:360,heightPx:200,labelRefs:[]});
 const input={page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:360,heightPt:200}};
 const baseline=compileSourceScene(input),candidate=compileSourceScene({...input,cageProgram:true});
 assert.equal(baseline.evidence.nativeProgram.admitted,0);
 assert.equal(candidate.evidence.nativeProgram.admitted,1,JSON.stringify(candidate.evidence));
 assert(candidate.page.shapes.some(s=>s.source.detector==='source-scene-cage-program'));
 assert.equal(retainedSceneGroupMembers(candidate.page,candidate.groupReceipt).size,candidate.page.shapes.length);
 assert.equal(candidate.evidence.regionPrograms.completed,1);
 assert(candidate.evidence.nativeProgram.sourceAlternatives.some(r=>r.reason==='primitive-source-geometry'));
 assert.throws(()=>compileSourceScene({...input,cageProgram:'yes'}),/cage control/u);
 const missing=primitiveImage('cylinder',{missingSeam:true});writePng(sourceFile,missing.image);
 const missingHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const missingPlan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,normalized,[3,.1,null,[.4,.7]]]],relations:[],programs:[[]]},
  {sourceHash:missingHash,widthPx:360,heightPx:200,labelRefs:[]});
 const failed=compileSourceScene({...input,plan:missingPlan,cageProgram:true});
 assert.equal(failed.evidence.nativeProgram.admitted,0);assert.equal(failed.evidence.regionPrograms.completed,0);
 assert(failed.evidence.nativeProgram.rejected.some(r=>r.reason==='cage-topology-mismatch'));
 assert(failed.evidence.nativeProgram.rejected.some(r=>r.reason==='cage-topology-mismatch'&&r.observedFaces===3));
 assert(sourceSceneCompileFeedback(missingPlan,failed.evidence).get(missingPlan.objects[0].id).includes('native-program-source-evidence:cage-topology-mismatch'));
});

test('a failed single-face geometry hypothesis does not veto an independently measured complete labeled source surface',t=>{
 const fixture=primitiveImage('roundRect'),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-program-alternative-'));
 const labelBox={x:52,y:65,w:16,h:15};
 // Known source label, inside the physical node and away from its boundary.
 for(let y=65;y<80;y++)for(let x=52;x<68;x++)if(Math.abs(x-60)<=Math.max(1,Math.round((y-65)/5))||y===73)
  fixture.image.rgba.set([24,24,24,255],(y*fixture.image.width+x)*4);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,fixture.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),b=fixture.box;
 const normalized=[b.y*5,Math.round(b.x*1000/360),(b.y+b.h)*5,Math.round((b.x+b.w)*1000/360)];
 const wire={format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,normalized,[0]]],relations:[],programs:[[]]};
 const source={sourceHash,widthPx:360,heightPx:200,labelRefs:[]},plan=admitSourceScenePlan(wire,source),before=JSON.stringify(plan);
 const text={id:'source-label',text:'A',box:labelBox,font:{family:'Arial',sizePt:14,color:'#181818'},source:{editable:true,evidenceBox:labelBox}};
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[text]},plan,sourceFile,root,slideSize:{widthPt:360,heightPt:200}});
 assert.equal(compiled.evidence.nativeProgram.admitted,0,'the unsupported ellipse must remain rejected');
 assert.equal(compiled.evidence.nativeProgram.rejected.length,1);
 assert.ok(compiled.page.shapes.length>0,'the complete measured rounded surface must survive');
 assert.equal(compiled.evidence.regionPrograms.completed,1);
 assert.ok(compiled.page.shapes.every(s=>s.source.detector!=='source-scene-native-program'));
 assert.deepEqual(compiled.evidence.unresolved,[]);
 assert.equal(retainedSceneGroupMembers(compiled.page,compiled.groupReceipt).size,compiled.page.shapes.length+1);
 assert.equal(compiled.page.textBoxes[0].text,'A');assert.deepEqual(compiled.page.textBoxes[0].box,labelBox);
 assert.equal(JSON.stringify(plan),before);assert.ok(compiled.evidence.sourceScanPixels<=4000000);
 assert.equal(plan.objectBatches.batches[0].members.length,1);
});

test('single-face source alternatives cannot manufacture a node on an empty source',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-program-empty-alternative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:120,height:100,rgba:Buffer.alloc(120*100*4,255)},sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,[200,200,800,800],[0]]],relations:[],programs:[[]]},
  {sourceHash,widthPx:120,heightPx:100,labelRefs:[]});
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:120,heightPt:100}});
 assert.equal(compiled.evidence.nativeProgram.admitted,0);assert.equal(compiled.evidence.nativeProgram.sourceAlternatives.length,1);
 assert.equal(compiled.page.shapes.length,0);assert.equal(compiled.evidence.regionPrograms.completed,0);
 assert.ok(compiled.evidence.unresolved.some(row=>row.id===plan.objects[0].id));
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);assert.equal(compiled.evidence.glyphOwnedPixels,0);
});
