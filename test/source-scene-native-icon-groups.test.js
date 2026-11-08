const { coreModulePath } = require('./helpers/isolated-core-package.cjs');
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileSceneIcon,sceneNativeIconBinding}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {assembleSourceSceneCompleteGroups:assemble}=require('../packages/slideclone-core/scene-plan/source-scene-complete-groups');
const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {retainedSceneGroupMembers}=require('../packages/slideclone-core/scene-plan/source-scene-group-retention');
const {ungroupHybridOverlayObjects}=require('../packages/slideclone-core/team-native-rebuild');
function fixture(parentObjectId=''){
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},box={x:20,y:20,w:160,h:130};
 for(let y=70;y<121;y++)for(let x=75;x<126;x++)if(Math.hypot(x-100,y-95)<=23)image.rgba.set([230,50,80,255],(y*400+x)*4);
 const slideSize={widthPt:400,heightPt:300},budget={used:0};
 const icon=compileSceneIcon({image,box:{x:76,y:72,w:48,h:47},id:'child',regionId:'region',root:process.cwd(),slideSize,textBoxes:[],budget},
  {preflight:true,nativePictorial:true,parentObjectId});assert.ok(icon.shapes.length);
 const parent={id:'scene-container-parent',type:'rect',box,style:{fill:'#FFFFFF',stroke:'none',opacity:1},source:{editable:true}};
 const label={id:'caption',text:'A',box:{x:50,y:30,w:20,h:14},source:{editable:true,evidenceBox:{x:50,y:30,w:20,h:14}}};
 return {image,slideSize,budget,icon,shapes:[parent,...icon.shapes],images:[],textBoxes:[label],interior:null,geometryChecks:0,nativeIcons:[icon],
  physicalNodes:[{proposalId:'parent',node:{box,portFrame:createMeasuredScenePortFrame(image,{box,fill:'#FFFFFF'})}}],
  plan:{objects:[{id:'parent',regionId:'region',kind:'container',box},
   {id:'child',regionId:'region',kind:'icon',box:{x:76,y:72,w:48,h:47},...(parentObjectId?{parentObjectId}:{})}]}};
}
function pageOf(f,result){return {shapes:result.shapes,images:f.images,textBoxes:result.textBoxes};}
test('actual native pictorial members bind to a unique measured parent without changing source or paint',()=>{
 for(const parent of ['','parent']){
  const f=fixture(parent),before=structuredClone(f.shapes),pixels=Buffer.from(f.image.rgba),used=f.budget.used,r=assemble(f);
  assert.equal(r.completedParents.has('parent'),true);assert.equal(r.evidence.assembledInteriorGroups,1);
  assert.ok(r.shapes.every(s=>s.source.nativeComponentGroupId==='scene-unit-parent'));
  assert.ok(r.shapes.slice(1).every(s=>s.source.sceneParentObjectId==='parent'));
  assert.equal(r.textBoxes[0].source.nativeComponentGroupId,'scene-unit-parent');
  assert.deepEqual(f.shapes,before);assert.deepEqual(f.image.rgba,pixels);assert.equal(f.budget.used,used);
 }
});
test('copied, wrong-source and mutated native output cannot issue membership',()=>{
 const f=fixture();let touched=false;
 for(const token of [{},structuredClone(f.icon),null,new Proxy(f.icon,{get(){touched=true;throw Error('secret');}})])assert.equal(sceneNativeIconBinding(f.image,token),null);
 assert.equal(sceneNativeIconBinding({...f.image,rgba:Buffer.from(f.image.rgba)},f.icon),null);
 f.icon.shapes[0].style.fill='#000000';assert.equal(sceneNativeIconBinding(f.image,f.icon),null);assert.equal(touched,false);
});
test('missing, copied, duplicate, foreign grouped or source-moved parts cannot complete a unit',()=>{
 for(const mode of ['missing','copy','duplicate','foreign','moved']){
  const f=fixture(),part=f.icon.shapes[0];
  if(mode==='missing')f.shapes.splice(1,1);
  if(mode==='copy')f.shapes[1]=structuredClone(part);
  if(mode==='duplicate')f.shapes.push({...part});
  if(mode==='foreign'){part.source.nativeComponentGroupId='child-group';f.shapes.push({...part,id:'foreign'});}
  if(mode==='moved')part.box={...part.box,x:0};
  const r=assemble(f);assert.equal(r.completedParents.size,0,mode);
 }
});
test('equal, crossing, hollow, cross-source and wrong declared parent frames retain rejection',()=>{
 for(const mode of ['equal','crossing','hollow','cross-source','wrong-parent','wrong-region']){
  const f=fixture(mode==='wrong-parent'?'other':'');
  if(mode==='equal')f.physicalNodes.push({...f.physicalNodes[0],proposalId:'other'});
  if(mode==='crossing'){const box={x:60,y:30,w:150,h:120};f.physicalNodes.push({proposalId:'other',node:{box,portFrame:createMeasuredScenePortFrame(f.image,{box,fill:'#FFFFFF'})}});}
  if(mode==='equal'||mode==='crossing')f.plan.objects.push({id:'other',regionId:'region',kind:'container',box:f.physicalNodes[1].node.box});
  if(mode==='hollow')f.physicalNodes[0].node.portFrame={};
  if(mode==='cross-source')f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  if(mode==='wrong-region')f.plan.objects[0].regionId='elsewhere';
  assert.equal(assemble(f).completedParents.size,0,mode);
 }
});
test('existing uniform inner paint joins only its complete source body and original part capacity',()=>{
 for(const mode of ['same','different','outside','capacity']){
  const f=fixture(),inner={id:'inner',type:'rect',box:{x:24,y:24,w:150,h:120},style:{fill:mode==='different'?'#E0E0E0':'#FFFFFF',stroke:'none',opacity:1},source:{editable:true}};
  if(mode==='outside')inner.box={x:0,y:0,w:150,h:120};
  f.shapes.splice(1,0,inner);
  if(mode==='capacity')for(let i=0;i<32;i++)f.shapes.splice(1,0,{...inner,id:'inner-'+i});
  const r=assemble(f);
  if(mode==='same'){assert.equal(r.completedParents.size,1);assert.equal(r.shapes.find(s=>s.id==='inner').source.nativeComponentGroupId,'scene-unit-parent');}
  if(mode==='different'||mode==='outside')assert.equal(r.shapes.find(s=>s.id==='inner').source.nativeComponentGroupId,undefined);
  if(mode==='capacity')assert.equal(r.completedParents.size,0);
 }
});
test('private complete groups survive hybrid output; copied tokens and changed members revoke the whole group',()=>{
 for(const mode of ['actual','no-token','copied-token','copied-member','missing-member','changed-paint','foreign-member']){
  const f=fixture(),r=assemble(f),page=pageOf(f,r),receipt=r.sealGroups(page);let token=receipt;
  if(mode==='no-token')token=undefined;
  if(mode==='copied-token')token=structuredClone(receipt);
  if(mode==='copied-member')page.shapes[1]=structuredClone(page.shapes[1]);
  if(mode==='missing-member')page.shapes.splice(1,1);
  if(mode==='changed-paint')page.shapes[1].style.fill='#000000';
  if(mode==='foreign-member')page.shapes.push({...page.shapes[0],id:'foreign'});
  ungroupHybridOverlayObjects(page,token);
  assert.equal(page.shapes.some(s=>s.source.nativeComponentGroupId==='scene-unit-parent'),mode==='actual',mode);
  assert.equal(page.textBoxes.some(s=>s.source.nativeComponentGroupId==='scene-unit-parent'),mode==='actual',mode);
 }
});
test('original shared geometry exhaustion never grants partial membership or preservation',()=>{
 const f=fixture();f.geometryChecks=3999999;assert.equal(assemble(f).completedParents.size,0);
 const g=fixture(),r=assemble(g),page=pageOf(g,r),token=r.sealGroups(page);
 page.shapes.unshift({id:'foreign-first',type:'rect',box:{x:300,y:200,w:10,h:10},style:{fill:'#000000'},source:{nativeComponentGroupId:'foreign'}});
 page.shapes.push({id:'foreign-last',type:'rect',box:{x:80,y:80,w:30,h:30},style:{fill:'#000000'},source:{nativeComponentGroupId:'foreign'}});
 assert.equal(retainedSceneGroupMembers(page,token).size,0,'ungrouping a foreign atomic layer cannot reverse overlapping native paint');
});
test('new boundary controls reject proxy, getter and sparse lists without reading hostile contents',()=>{
 let reads=0;const trap=()=>{reads++;throw Error('secret');};
 for(const edit of [f=>f.nativeIcons=new Proxy([],{get:trap}),f=>f.nativeIcons=Array(1),
  f=>f.nativeIcons=Array(97).fill(null),f=>f.plan=new Proxy(f.plan,{get:trap}),f=>f.plan.objects=[{get id(){return trap();}}]]){
  const f=fixture();edit(f);assert.throws(()=>assemble(f),TypeError);
 }
 const f=fixture(),r=assemble(f),page=pageOf(f,r),token=r.sealGroups(page);
 Object.defineProperty(page.shapes[1].style,'freeformSegments',{get:trap});assert.equal(retainedSceneGroupMembers(page,token).size,0);
 assert.equal(reads,0);
 ungroupHybridOverlayObjects(new Proxy({},{get:trap}));ungroupHybridOverlayObjects(null);
 assert.equal(reads,0);
});
test('failed icon proposals cannot suppress bounded interior recovery targets',()=>{
 const {selectSceneInteriorTargets}=require('../packages/slideclone-core/scene-plan/source-scene-interior-targets');
 const f=fixture();f.plan.regions=[{id:'region',box:{x:0,y:0,w:400,h:300}}];f.plan.relations=[{fromId:'parent',toId:'other'}];
 assert.equal(selectSceneInteriorTargets(f.plan,[],1).length,1);
 assert.equal(selectSceneInteriorTargets(f.plan,[],1,['parent']).length,0);
 for(const represented of [Array(1),['parent','parent'],['../escape'],[null]])assert.throws(()=>selectSceneInteriorTargets(f.plan,[],1,represented),TypeError);
 let touched=false;assert.throws(()=>selectSceneInteriorTargets(f.plan,[],1,new Proxy([],{get(){touched=true;throw Error('secret');}})),TypeError);assert.equal(touched,false);
});
test('new group modules and regressions are discovered by the unified CI and runtime contract',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(p=>p.file.endsWith('source-scene-native-icon-groups.test.js')));
 for(const name of ['owner','paint','retention','snapshot'])assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/'+coreModulePath('source-scene-group-'+name)));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-native-icon-groups.js'));
});
