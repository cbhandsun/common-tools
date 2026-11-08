'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileSceneIcon,sceneNativeIconNode}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {assembleSourceSceneCompleteGroups:assemble}=require('../packages/slideclone-core/scene-plan/source-scene-complete-groups');
const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
const {ungroupHybridOverlayObjects}=require('../packages/slideclone-core/team-native-rebuild');
function fixture(){
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},box={x:20,y:20,w:160,h:130};
 for(let y=70;y<121;y++)for(let x=75;x<126;x++)if(Math.hypot(x-100,y-95)<=23)image.rgba.set([230,50,80,255],(y*400+x)*4);
 const slideSize={widthPt:400,heightPt:300},budget={used:0};
 const icon=compileSceneIcon({image,box:{x:76,y:72,w:48,h:47},id:'child',regionId:'region',root:process.cwd(),slideSize,textBoxes:[],budget},
  {preflight:true,nativePictorial:true,preferSourceCrop:true,parentObjectId:'parent'});
 assert.ok(icon.icon);assert.equal(icon.shapes.length,0);
 const parent={id:'scene-container-parent',type:'rect',box,style:{fill:'#FFFFFF',stroke:'none'},source:{editable:true}};
 const label={id:'caption',text:'A',box:{x:50,y:30,w:20,h:14},source:{editable:true,evidenceBox:{x:50,y:30,w:20,h:14}}};
 return {image,slideSize,budget,icon,shapes:[parent],images:[icon.icon],textBoxes:[label],interior:null,geometryChecks:0,nativeIcons:[icon],
  physicalNodes:[{proposalId:'parent',node:{box,portFrame:createMeasuredScenePortFrame(image,{box,fill:'#FFFFFF'})}}],
  plan:{objects:[{id:'parent',regionId:'region',kind:'container',box},
   {id:'child',regionId:'region',kind:'icon',parentObjectId:'parent',box:{x:76,y:72,w:48,h:47}}]}};
}
const pageOf=r=>({shapes:r.shapes,images:r.images,textBoxes:r.textBoxes});
test('source-isolated picture, measured body and label become one complete card without changing paint or editability',()=>{
 const f=fixture(),before=structuredClone({shapes:f.shapes,images:f.images,textBoxes:f.textBoxes}),pixels=Buffer.from(f.image.rgba),used=f.budget.used;
 const r=assemble(f);assert.equal(r.completedParents.has('parent'),true);
 const page=pageOf(r);for(const item of [...page.shapes,...page.images,...page.textBoxes])assert.equal(item.source.nativeComponentGroupId,'scene-unit-parent');
 assert.equal(page.images[0].source.editable,false);assert.equal(sceneNativeIconNode(f.image,f.icon),null);
 assert.equal(page.images[0].assetPath,f.images[0].assetPath);assert.deepEqual(page.images[0].box,f.images[0].box);
 assert.deepEqual({shapes:f.shapes,images:f.images,textBoxes:f.textBoxes},before);assert.deepEqual(f.image.rgba,pixels);assert.equal(f.budget.used,used);
 ungroupHybridOverlayObjects(page,r.sealGroups(page));assert.equal(page.images[0].source.nativeComponentGroupId,'scene-unit-parent');
});
test('copied receipts, copied or substituted images, changed paths and geometry grant no crop membership',()=>{
 for(const mode of ['copied-token','proxy-token','copy','missing','duplicate','asset','geometry','cross-source']){
  const f=fixture();let touched=false;
  if(mode==='copied-token')f.nativeIcons=[structuredClone(f.icon)];
  if(mode==='proxy-token')f.nativeIcons=[new Proxy(f.icon,{get(){touched=true;throw Error('secret');}})];
  if(mode==='copy')f.images=[structuredClone(f.images[0])];
  if(mode==='missing')f.images=[];
  if(mode==='duplicate')f.images.push({...f.images[0]});
  if(mode==='asset')f.images[0].assetPath='assets/other.png';
  if(mode==='geometry')f.images[0].box={...f.images[0].box,x:0};
  if(mode==='cross-source')f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  assert.equal(assemble(f).completedParents.size,0,mode);assert.equal(touched,false);
 }
});
test('a crop parent must be declared, same-region and uniquely source measured',()=>{
 for(const mode of ['wrong-parent','wrong-region','missing','unmeasured','ambiguous']){
  const f=fixture();
  if(mode==='wrong-parent')f.plan.objects[1].parentObjectId='other';
  if(mode==='wrong-region')f.plan.objects[0].regionId='elsewhere';
  if(mode==='missing')f.physicalNodes=[];
  if(mode==='unmeasured')f.physicalNodes[0].node.portFrame={};
  if(mode==='ambiguous')f.physicalNodes.push(f.physicalNodes[0]);
  assert.equal(assemble(f).completedParents.size,0,mode);
 }
});
test('foreign members, overlapping intervening paint and work exhaustion cannot merge a card',()=>{
 for(const mode of ['foreign','paint','budget','capacity']){
  const f=fixture();
  if(mode==='foreign'){f.images[0].source.nativeComponentGroupId='foreign';f.images.push({...f.images[0],id:'foreign-image'});}
  if(mode==='paint')f.shapes.push({id:'intervening',type:'rect',box:f.images[0].box,source:{editable:true},style:{fill:'#000000'}});
  if(mode==='budget')f.geometryChecks=3999999;
  if(mode==='capacity')for(let i=0;i<32;i++)f.shapes.push({...f.shapes[0],id:'part-'+i,source:{sceneOutlinePaintOwnerId:'scene-container-parent'}});
  assert.equal(assemble(f).completedParents.size,0,mode);
 }
});
test('missing, copied, changed or foreign final picture revokes every card member after assembly',()=>{
 for(const mode of ['actual','copy','path','missing','foreign','no-token']){
  const f=fixture(),r=assemble(f);assert.equal(r.completedParents.size,1);
  const page=pageOf(r),token=r.sealGroups(page);
  if(mode==='copy')page.images[0]=structuredClone(page.images[0]);
  if(mode==='path')page.images[0].assetPath='assets/changed.png';
  if(mode==='missing')page.images=[];
  if(mode==='foreign')page.images.push({...page.images[0],id:'foreign'});
  ungroupHybridOverlayObjects(page,mode==='no-token'?undefined:token);
  assert.equal([...page.shapes,...page.images,...page.textBoxes].some(p=>p.source.nativeComponentGroupId==='scene-unit-parent'),mode==='actual',mode);
 }
});
test('picture grouping rejects hostile image lists and source fields without evaluating accessors',()=>{
 let touched=false;const trap=()=>{touched=true;throw Error('secret');};
 for(const edit of [f=>f.images=new Proxy([],{get:trap}),f=>f.images=Array(1),
  f=>Object.defineProperty(f.images[0],'assetPath',{get:trap}),f=>f.images[0].source=new Proxy({},{get:trap})]){
  const f=fixture();edit(f);assert.throws(()=>assemble(f),TypeError);
 }assert.equal(touched,false);
});
test('empty crop input is a no-op and regressions enter the unified CI',()=>{
 const f=fixture();f.nativeIcons=[];f.images=[];const r=assemble(f);assert.equal(r.completedParents.size,0);assert.deepEqual(r.images,[]);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(p=>p.file.endsWith('source-scene-crop-card-groups.test.js')));
});
