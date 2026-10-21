"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {compileSceneInteriorParts,sceneInteriorBindings}=require('../packages/slideclone-core/source-scene-interior-parts');
const {assembleSourceSceneCompleteGroups:assemble}=require('../packages/slideclone-core/source-scene-complete-groups');
const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/source-scene-port-evidence');
function fixture(){
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},box={x:20,y:20,w:160,h:130};
 for(let y=70;y<121;y++)for(let x=75;x<126;x++){
  const radius=Math.hypot(x-100,y-95);if(radius<=23)image.rgba.set(radius>19?[20,20,20,255]:[230,50,80,255],(y*400+x)*4);
 }
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:400,heightPx:300,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:400,h:300}}],
  objects:[{id:'first',kind:'container',regionId:'region',box},
   {id:'second',kind:'container',regionId:'region',box:{x:220,y:20,w:160,h:130}}],
  relations:[{id:'link',regionId:'region',fromId:'first',toId:'second',direction:'forward'}]};
 const budget={used:0},slideSize={widthPt:400,heightPt:300},label={id:'label',text:'Caption',box:{x:60,y:30,w:80,h:14},
  source:{editable:true,evidenceBox:{x:60,y:30,w:80,h:14},nativeComponentGroupId:'scene-unit-first'}};
 const interior=compileSceneInteriorParts({image,plan,root:process.cwd(),slideSize,textBoxes:[label],shapes:[],images:[],budget,capacity:2});
 assert.ok(interior.parts.length>0);
 const parent={id:'scene-container-first',type:'rect',box,source:{editable:true,nativeComponentGroupId:'scene-unit-first'}};
 return {image,slideSize,shapes:[parent,...interior.parts],images:[],textBoxes:[label],interior,geometryChecks:32,budget,
  physicalNodes:[{proposalId:'first',node:{box,portFrame:createMeasuredScenePortFrame(image,{box,fill:'#FFFFFF'})}}]};
}
test('whole generated subgroups join the existing physical unit without changing any drawable or source pixels',()=>{
 const f=fixture(),before=structuredClone({shapes:f.shapes,textBoxes:f.textBoxes}),pixels=Buffer.from(f.image.rgba),used=f.budget.used;
 const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,1);
 assert.equal(result.evidence.assembledInteriorParts,f.interior.parts.length);
 assert.ok(result.shapes.every(s=>s.source.nativeComponentGroupId==='scene-unit-first'));
 const withoutGroup=shapes=>shapes.map(s=>({...s,source:{...s.source,nativeComponentGroupId:undefined}}));
 assert.deepEqual(withoutGroup(result.shapes),withoutGroup(f.shapes));
 assert.deepEqual({shapes:f.shapes,textBoxes:f.textBoxes},before);assert.deepEqual(f.image.rgba,pixels);assert.equal(f.budget.used,used);
 assert.ok(result.evidence.physicalGroupGeometryChecks>f.geometryChecks);
});
test('empty, copied, proxy or wrong-raster interior receipts cannot acquire physical membership',()=>{
 const f=fixture();let touched=false;
 for(const interior of [null,{},structuredClone(f.interior),new Proxy(f.interior,{get(){touched=true;throw Error('private');}})]){
  const result=assemble({...f,interior});assert.equal(result.evidence.assembledInteriorGroups,0);assert.deepEqual(result.shapes,f.shapes);
 }
 assert.deepEqual(sceneInteriorBindings({...f.image,rgba:Buffer.from(f.image.rgba)},f.interior),[]);assert.equal(touched,false);
});
test('a missing or copied native part and foreign child members reject the complete subgroup',()=>{
 for(const mode of ['missing','copy','foreign-shape','foreign-text','foreign-image','style-text']){
  const f=fixture(),member=f.interior.parts[0];
  if(mode==='missing')f.shapes.splice(1,1);
  if(mode==='copy')f.shapes[1]=structuredClone(member);
  if(mode==='foreign-shape')f.shapes.push({...member,id:'foreign'});
  if(mode==='foreign-text')f.textBoxes.push({id:'foreign',box:member.box,source:{nativeComponentGroupId:'scene-interior-first'}});
  if(mode==='foreign-image')f.images.push({id:'foreign',box:member.box,source:{nativeComponentGroupId:'scene-interior-first'}});
  if(mode==='style-text')f.textBoxes.push({id:'foreign',box:member.box,style:{nativeComponentGroupId:'scene-interior-first'}});
  const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,0,mode);
  assert.equal(result.evidence.interiorAssemblyRejected[0].reason,'interior-membership',mode);assert.deepEqual(result.shapes,f.shapes);
 }
});
test('unmeasured, cross-source, copied and ambiguous parent frames grant no grouping',()=>{
 for(const mode of ['missing','copy','cross-source','ambiguous']){
  const f=fixture();
  if(mode==='missing')f.physicalNodes=[];
  if(mode==='copy')f.physicalNodes[0].node.portFrame={};
  if(mode==='cross-source')f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  if(mode==='ambiguous')f.physicalNodes.push(f.physicalNodes[0]);
  const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,0,mode);assert.deepEqual(result.shapes,f.shapes);
 }
});
test('whole parent membership, the original 32-part cap and native bounds remain required',()=>{
 for(const mode of ['no-group','foreign-shape','foreign-image','foreign-text','parts-cap','outside-part']){
  const f=fixture(),parent=f.shapes[0];
  if(mode==='no-group')delete parent.source.nativeComponentGroupId;
  if(mode==='foreign-shape')f.shapes.push({...parent,id:'foreign'});
  if(mode==='foreign-image')f.images.push({...parent,id:'foreign'});
  if(mode==='foreign-text')f.textBoxes[0].source.nativeComponentGroupId=parent.source.nativeComponentGroupId='scene-paint-scene-container-first';
  if(mode==='parts-cap')for(let i=0;i<32;i++)f.shapes.push({...parent,id:'scene-container-first-paint-'+i,
   source:{...parent.source,sceneOutlinePaintOwnerId:parent.id}});
  if(mode==='outside-part')f.interior.parts[0].box={x:0,y:0,w:20,h:20};
  const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,0,mode);assert.deepEqual(result.shapes,f.shapes);
 }
});
test('intervening paint and a reordered own label prevent merges; disjoint paint preserves ordering',()=>{
 for(const mode of ['shape','image','text','own-label','disjoint']){
  const f=fixture(),external={id:'external',type:'rect',box:{x:90,y:85,w:10,h:10}};
  if(mode==='shape'||mode==='disjoint')f.shapes.splice(1,0,{...external,...(mode==='disjoint'?{box:{x:300,y:250,w:10,h:10}}:{})});
  if(mode==='image')f.images.push({...external,source:{nativeComponentGroupId:'scene-unit-first'}});
  if(mode==='text')f.textBoxes.push({...external,text:'Other',source:{nativeComponentGroupId:'scene-unit-first'}});
  if(mode==='own-label')f.textBoxes[0].box=external.box;
  const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,mode==='disjoint'?1:0,mode);
  if(mode==='shape'||mode==='own-label')assert.equal(result.evidence.interiorAssemblyRejected[0].reason,'paint-order');
 }
});
test('the measured complete picture cannot cross a concave notch or uncertain source border',()=>{
 for(const mode of ['notch','touch']){
  const f=fixture(),box={x:20,y:20,w:160,h:130};
  if(mode==='touch')box.x=78;
  const segments=[{type:'moveTo',points:[{x:0,y:0}]},...[[1,0],[1,1],[.7,1],[.7,.4],[.3,.4],[.3,1],[0,1]]
   .map(([x,y])=>({type:'lnTo',points:[{x,y}]})),{type:'close',points:[]}];
  f.physicalNodes[0].node={box,portFrame:createMeasuredScenePortFrame(f.image,{box,fill:'#FFFFFF',...(mode==='notch'?{segments}:{})})};
  const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,0,mode);
  assert.equal(result.evidence.interiorAssemblyRejected[0].reason,'source-containment');
 }
});
test('shared geometry exhaustion is explicit and cannot grant a partial merge',()=>{
 const f=fixture(),used=f.budget.used;f.geometryChecks=3999999;
 const result=assemble(f);assert.equal(result.evidence.assembledInteriorGroups,0);
 assert.equal(result.evidence.interiorAssemblyRejected[0].reason,'geometry-budget');
 assert.equal(result.evidence.physicalGroupGeometryChecks,3999999);assert.equal(f.budget.used,used);
 assert.deepEqual(result.shapes,f.shapes);
});
test('invalid boundary input rejects getters, proxies, sparse lists and illegal work before access',()=>{
 let touched=false;
 for(const edit of [f=>f.shapes=new Proxy([],{get(){touched=true;throw Error('private');}}),
  f=>f.shapes=[{get id(){touched=true;throw Error('private');}}],f=>f.shapes=new Array(2),
  f=>f.geometryChecks=NaN,f=>f.geometryChecks=4000001,f=>f.geometryChecks=-1,f=>f.slideSize.widthPt=0,
  f=>f.shapes[0].source=new Proxy({},{get(){touched=true;throw Error('private');}}),
  f=>f.shapes[0].box={get x(){touched=true;throw Error('private');}},
  f=>f.physicalNodes[0].node={get box(){touched=true;throw Error('private');}},
  f=>f.shapes.push(f.shapes[0]),f=>f.image.width=0,f=>f.image.height=NaN,
  f=>f.image.rgba=new Uint8Array(4),f=>f.image={get rgba(){touched=true;throw Error('private');}}]){
  const f=fixture();edit(f);assert.throws(()=>assemble(f),TypeError);
 }assert.equal(touched,false);
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(p=>p.file.endsWith('source-scene-complete-groups.test.js')));
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-scene-complete-groups.js'));
});
