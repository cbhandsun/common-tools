'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {writePng}=require('../packages/slideclone-core/png');
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {paintPrimitive}=require('./helpers/scene-primitive-program-fixture.cjs');
const {parsePrimitiveCandidate}=require('../packages/slideclone-core/scene-plan/source-scene-primitive-candidate');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');

async function pipelineFixture(t,withPaths=false,withChildren=false,interiorOnly=false,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-program-pipeline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:500,height:200,rgba:Buffer.alloc(500*200*4,255)},regions=[],inventory=[],objects=[],relations=[],programs=[],lines=[];
 const put=(x,y,color)=>image.rgba.set([...color,255],(y*image.width+x)*4);
 const normalized=(x,y,w,h)=>[y*5,x*2,(y+h)*5,(x+w)*2];
 for(const [index,offset] of [[0,0],[1,250]]){
  const regionId=index+1,fromId=10+index*2,toId=fromId+1;
  regions.push([regionId,null,3,normalized(offset,0,250,200)]);inventory.push([regionId,2,0,1]);
  for(const [id,x] of [[fromId,20+offset],[toId,170+offset]]){
   objects.push([id,regionId,0,normalized(x,20,50,40),0,...(options.nativeGeometry?[[3,.2]]:[])]);
   if(options.nativeGeometry)paintPrimitive(image,parsePrimitiveCandidate({id:'fixture-'+id,kind:'cylinder',capRatio:.2,
    box:{x,y:20,w:50,h:40},fill:'#D2E6F5',stroke:'#0F0F0F',strokeWidthPx:2}));
   else for(let y=20;y<60;y++)for(let px=x;px<x+50;px++)put(px,y,px<x+2||px>=x+48||y<22||y>=58?[15,15,15]:[210,230,245]);
  }
  for(let x=70+offset;x<=168+offset;x++)for(let dy=-1;dy<=1;dy++)put(x,40+dy,[30,60,90]);
  for(let x=163+offset;x<=168+offset;x++)for(let dy=-(168+offset-x);dy<=168+offset-x;dy++)put(x,40+dy,[30,60,90]);
  const relation=[20+index,regionId,fromId,toId,0,normalized(70+offset,34,99,13)];
  // A declared reversal inside the hint cannot nominate a straight shaft.
  if(withPaths)relation.push([[2*(70+offset),200],[2*(160+offset),200],[2*(80+offset),225],[2*(168+offset),200]]);
  relations.push(relation);
  if(withChildren||interiorOnly){
   objects.find(o=>o[0]===fromId)[4]=1;inventory[index][2]=1;
   if(withChildren)objects.push([40+index,options.regionalChild?regionId:fromId,1,normalized(45+offset,43,14,12),2]);
   for(let y=43;y<55;y++)for(let x=45+offset;x<59+offset;x++)if(x<49+offset||y>=51)put(x,y,[30,60,90]);
  }
  programs.push([regionId,[[[index*2,index*2+1],'KaiTi',1]]]);
  for(const [labelIndex,x] of [30+offset,180+offset].entries())lines.push({text:options.regionalChild?'A':'editable label '+lines.length,
   box:options.interiorTextCollision&&labelIndex===0?{x:44+offset,y:42,w:16,h:14}:
    options.nativeGeometry?{x,y:31,w:20,h:8}:{x,y:28,w:20,h:10},confidence:.99});
 }
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);let globalCalls=0,localCalls=0;
 const reviewSourceScene=createSourceScenePlanner({recognize:async request=>{
  if(request.task==='classify-ocr'){
   assert.ok(++localCalls<=2);const targets=request.localTargets;
   return {reviews:targets.reviews.map(index=>({index,kind:'text'})),
    recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
    ...(targets.structures?{structures:targets.structures.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
    ...(targets.inventories?{inventories:targets.inventories.map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null}))}:{}),
    ...(targets.relations?{relations:targets.relations.map(index=>({index,fromId:null,toId:null,direction:'unknown',confidence:0}))}:{}),
    ...(targets.regionInventories?{regionInventories:targets.regionInventories.map(index=>({index,units:[],relations:[]}))}:{})};
  }
  assert.equal(request.task,'structure');globalCalls++;
  const skeleton=JSON.parse(request.prompt.match(/Return "scene":(\{[^}]*\})/u)?.[1]??'null');assert(skeleton);
  // Speak the production format, including positional IDs. Merely accepting
  // packed syntax in an isolated parser cannot prove the real factory path.
  const packed=skeleton.format==='packed-v1',programmed=skeleton.format==='compact-v8';
  const ids=new Map([...regions.map((r,i)=>[r[0],i]),...objects.map((o,i)=>[o[0],100+i])]);
  const styles=new Map(programs.map(([owner,labels])=>[owner,labels.map(([refs,family,weight])=>[refs,weight,family])]));
  const scene=packed?{...skeleton,
   regions:regions.map((r,i)=>[r[1]===null?null:ids.get(r[1]),r[2],r[3],inventory[i].slice(1)]),
   objects:objects.map(o=>[ids.get(o[1]),o[2]*3+o[4],o[3],...(o[5]?[o[5]]:[])]),
   relations:relations.map(r=>[ids.get(r[1]),ids.get(r[2]),ids.get(r[3]),r[5],r[4],...(r.length===7?[r[6]]:[])]),
   programs:regions.map(r=>styles.get(r[0]))}:programmed?{...skeleton,regions,inventory,objects,relations,programs}:
   {...skeleton,regions:regions.map(r=>[r[0],r[1],'diagram',r[3]]),inventory,
    objects:objects.map(o=>[o[0],o[1],'container',o[3],'absent']),
    relations:relations.map(r=>[r[0],r[1],r[2],r[3],'forward',r[5]])};
  return {scene,reviews:[],missingText:[]};
 }});
 const rebuild=createRawImageNativeRebuilder({reviewSourceScene,compileSourceScene:input=>{
  const compiled=compileSourceScene(input);
  if(options.nativeGeometry&&!input.preflight){
   const retained=retainedSceneGroupMembers(compiled.page,compiled.groupReceipt);
   const members=[...compiled.page.shapes,...compiled.page.textBoxes].filter(s=>s.source?.nativeComponentGroupId);
   assert.ok(members.length);assert.ok(members.every(s=>retained.has(s)),'all multi-face parents, native pictures and styled labels need private retention');
  }
  return compiled;
 },
  ...(options.residual?{createFullSlideResidual:async ({objects})=>({erasedObjects:objects.length})}:{}),rebuildDeckFromWorkDir:work=>{
  const deck=JSON.parse(fs.readFileSync(path.join(work,'ir','deck.json'),'utf8'));
  if(options.regionalChild)deck.pages[0].shapes=[];
  deck.pages[0].textBoxes=deck.pages[0].textBoxes.map(text=>({...text,font:{...text.font,opacity:1},style:{...text.style,visibility:'visible',opacity:1}}));return deck;
 }});
 const result=await rebuild({root,metadata:{inputFile:sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:500,heightPx:200}},ocr:{lines},isCancellationRequested:async()=>false});
 assert.equal(globalCalls,1);assert.ok(localCalls<=2);return result;
}

function compilationDetails(result){
 const summary=result.deck.meta.sourceSceneCompilation,details=result.deck.pages[0].source.sourceScene;
 assert.equal(summary.details,'pages[0].source.sourceScene');
 assert.deepEqual(summary.unresolved,details.unresolved);assert.deepEqual(summary.regionPrograms,details.regionPrograms);
 return {...details,observedInventory:require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec').unpackSceneInventoryMembers(details.observedInventory)};
}

test('the default production observation carries complete region labels into actual native compilation',async t=>{
 const result=await pipelineFixture(t),evidence=compilationDetails(result);
 assert.equal(evidence.regionPrograms?.completed,2,JSON.stringify(evidence));
 assert.equal(evidence.resolvedRelations,2);assert.deepEqual(evidence.unresolved,[]);
 assert.ok(evidence.sourceScanPixels<=4000000);assert.ok(evidence.glyphOwnedPixels<=100000);
 for(const text of result.deck.pages[0].textBoxes){assert.equal(text.font.family,'KaiTi');assert.equal(text.font.weight,'bold');
  assert.match(text.source.ocrLabelRef,/^label-[a-f0-9]{24}$/u);assert.equal(text.source.pageImage,'assets/source.png');assert.equal(text.source.editable,true);}
});

test('a declared path rejected by the original source consumers cannot commit regional styles or fall back silently',async t=>{
 const result=await pipelineFixture(t,true),evidence=compilationDetails(result);
 assert.equal(evidence.regionPrograms?.completed,0);assert.equal(evidence.resolvedRelations,0);
 assert.equal(evidence.regionProgramLabels.prepared,2);
 assert.equal(evidence.unresolved.filter(r=>r.detailCode==='visible-path-program').length,2);
 assert.ok(result.deck.pages[0].textBoxes.every(text=>text.font.family==='Microsoft YaHei'&&text.source.sceneRegionProgramId===undefined));
});

test('production compact programs preserve native embedded children and close their real parent dependencies',async t=>{
 const result=await pipelineFixture(t,false,true),compiled=compilationDetails(result);
 assert.equal(compiled.regionPrograms.completed,2,JSON.stringify(compiled));assert.deepEqual(compiled.unresolved,[]);
 assert.equal(compiled.icons,2);assert.equal(compiled.resolvedRelations,2);
 for(const parent of ['object-n100','object-n103']){
  const children=result.deck.pages[0].shapes.filter(s=>s.source?.sceneParentObjectId===parent);
  assert.ok(children.length);assert.ok(children.every(s=>s.type==='freeform'&&s.source.editable===true&&s.source.sceneInventoryId));
 }
 assert.ok(compiled.sourceScanPixels<=4000000);assert.ok(compiled.glyphOwnedPixels<=100000);
});

test('production factory constructs complete multi-face parents with editable labels, pictorial children and attached relations',async t=>{
 const result=await pipelineFixture(t,false,true,false,{nativeGeometry:true,residual:true}),compiled=compilationDetails(result),page=result.deck.pages[0];
 assert.equal(compiled.nativeProgram.admitted,4,JSON.stringify(compiled));assert.equal(compiled.nativeProgram.parts,8);
 assert.equal(compiled.regionPrograms.completed,2,JSON.stringify(compiled));assert.equal(compiled.resolvedRelations,2);assert.deepEqual(compiled.unresolved,[]);
 for(const parent of ['object-n100','object-n103']){
  const faces=page.shapes.filter(s=>s.source?.sceneInventoryId===parent&&s.source.detector==='source-scene-native-program');
  assert.equal(faces.length,2);assert.ok(faces.every(s=>s.source.nativeComponentGroupId==='scene-unit-'+parent));
  assert.ok(page.shapes.some(s=>s.source?.sceneParentObjectId===parent&&s.source.nativeComponentGroupId==='scene-unit-'+parent));
  assert.ok(page.textBoxes.some(s=>s.source?.nativeComponentGroupId==='scene-unit-'+parent&&s.text&&s.font.family==='KaiTi'));
 }
 const relations=page.shapes.filter(s=>s.source?.detector==='source-scene-relation');
 assert.equal(relations.length,2);assert.ok(relations.every(s=>s.source.editable===true));
 for(const edge of relations)for(const key of ['startAnchor','endAnchor']){
  assert.ok(page.shapes.some(s=>s.id===edge.style[key].elementId&&s.source?.detector==='source-scene-native-program'));
 }
 assert.ok(compiled.sourceScanPixels<=4000000);assert.ok(compiled.glyphOwnedPixels<=100000);
});

test('unproposed embedded icons cannot complete programs when source isolation fails',async t=>{
 // Missing proposals alone no longer imply failed source isolation. Exercise
 // an actual foreground/OCR ownership collision; its whole component must fail.
 const result=await pipelineFixture(t,false,false,true,{interiorTextCollision:true}),compiled=compilationDetails(result);
 assert.equal(compiled.regionPrograms.completed,0);
 assert.equal(compiled.interiorGroups,0);
 assert.equal(compiled.resolvedRelations,2);
 assert.equal(compiled.regionPrograms.rejected.length,2);
 assert.ok(compiled.regionPrograms.rejected.every(r=>r.missing.includes('observed-icons')));
 assert.ok(result.deck.pages[0].textBoxes.every(t=>t.source.sceneRegionProgramId===undefined));
 assert.equal(compiled.observedInventory.units.filter(u=>u.origin==='proposal'&&u.kind==='icon').length,0);
 assert.equal(compiled.observedInventory.units.filter(u=>u.origin==='interior'&&u.kind==='icon').length,0);
 assert.ok(compiled.sourceScanPixels<=4000000);assert.ok(compiled.glyphOwnedPixels<=100000);
});
test('declared embedded pictures close complete production programs without requiring separate icon or edge proposals',async t=>{
 const result=await pipelineFixture(t,false,false,true),compiled=compilationDetails(result);
 assert.equal(compiled.regionPrograms.completed,2,JSON.stringify(compiled.regionPrograms));
 assert.equal(compiled.interiorGroups,2);assert.equal(compiled.resolvedRelations,2);
 const recovered=compiled.observedInventory.units.filter(u=>u.origin==='interior'&&u.kind==='icon');
 assert.equal(recovered.length,2);assert.ok(recovered.every(u=>u.members.length&&u.members.every(m=>m.type==='shape')));
 assert.equal(compiled.observedInventory.units.filter(u=>u.origin==='proposal'&&u.kind==='icon').length,0);
 assert.ok(compiled.sourceScanPixels<=4000000);assert.ok(compiled.glyphOwnedPixels<=100000);
});

test('regional icon proposals bind to their unique measured parent and survive the production residual boundary',async t=>{
 const result=await pipelineFixture(t,false,true,false,{regionalChild:true,residual:true});
 const compiled=compilationDetails(result),page=result.deck.pages[0];
 assert.equal(compiled.regionPrograms.completed,2,JSON.stringify(compiled));
 for(const parent of ['object-n100','object-n103']){
  const body=page.shapes.find(s=>s.id==='scene-container-'+parent);
  const group='scene-unit-'+parent;
  const children=page.shapes.filter(s=>s.source?.sceneParentObjectId===parent);
  assert.ok(children.length,'the actual native icon must join its measured parent');
  assert.equal(body.source.nativeComponentGroupId,group);
  assert.ok(children.every(s=>s.source.nativeComponentGroupId===group));
  assert.ok(page.textBoxes.some(s=>s.source.nativeComponentGroupId===group));
 }
 assert.ok(compiled.sourceScanPixels<=4000000);assert.ok(compiled.glyphOwnedPixels<=100000);
});
