'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeOpenScenePaint}=require('../packages/slideclone-core/scene-plan/source-scene-open-paint');
const {observeSceneLiteralPaint}=require('../packages/slideclone-core/scene-plan/source-scene-literal-paint');
const {observeOpenSceneOwnerMembers}=require('../packages/slideclone-core/scene-plan/source-scene-open-owner-members');
const {observeOpenSceneOwnerInventory:observe,retainedOpenSceneOwnerInventory:retained}=require('../packages/slideclone-core/scene-plan/source-scene-open-owner-inventory');
const {createSceneGlyphOcclusion}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
const {hasMeasuredScenePortFrame,measuredSceneOpaqueSurface}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
function fixture({omitLiteral=false,extraLiteral=false,unknownAlpha=false}={}){
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4)},size={widthPt:64,heightPt:64},budget={used:0};
 for(let i=0;i<64*64;i++)image.rgba.set([245,249,255,255],i*4);
 for(let x=8;x<56;x++)image.rgba.set([210,220,230,255],(8*64+x)*4);
 const cells=new Set([30*64+25,30*64+26]);
 for(const cell of cells)image.rgba.set([210,215,220,255],cell*4);
 if(unknownAlpha)image.rgba[(35*64+40)*4+3]=0;
 const box={x:8,y:8,w:48,h:48},glyph=createSceneGlyphOcclusion(image,[],size,budget);
 const paint=observeOpenScenePaint({image,slideSize:size,budget,textMasks:[],foreignFrames:[],relationParts:[],
  recipe:{id:'region-owner',kind:'openPaths',box,fill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1,
   paths:[{filled:false,segments:[{type:'moveTo',points:[{x:.5/48,y:.5/48}]},{type:'lnTo',points:[{x:47.5/48,y:.5/48}]}]}]}});
 if(unknownAlpha)return {image,size,budget,glyph,paint};
 assert.equal(paint.failure,null,JSON.stringify(paint));
 if(omitLiteral)cells.delete(30*64+26);if(extraLiteral)cells.add(40*64+40);
 const literal=observeSceneLiteralPaint({id:'residual',image,window:{x:0,y:0,w:64,h:64},cells,budget,slideSize:size});
 assert.equal(literal.failure,null,JSON.stringify(literal));
 const plan={version:1,widthPx:64,heightPx:64,sourceHash:'1'.repeat(64),regions:[{id:'region-owner',parentId:null,kind:'container',box}],
  objects:[],relations:[],regionPrograms:[{regionId:'region-owner',objects:[],relations:[],labels:[]}]};
 const page={shapes:[...paint.parts,...literal.parts],images:[],textBoxes:[]};
 const members=observeOpenSceneOwnerMembers({image,slideSize:size,plan,ownerId:'region-owner',page,paintReceipt:paint.receipt,paintParts:paint.parts,
  literalPaint:{receipt:literal.receipt,parts:literal.parts},objects:new Map(),relations:new Map(),unresolved:[{id:'region-owner',reason:'container-perimeter'}]});
 assert.equal(members.failure,'open-owner-source-unresolved');assert.equal(members.membershipComplete,true);
 return {image,plan,page,slideSize:size,budget,glyph,membersReceipt:members.receipt,paintReceipt:paint.receipt,paintParts:paint.parts,
  literalPaint:{receipt:literal.receipt,parts:literal.parts},foreignFrames:[],relationParts:[]};
}

test('full transparent inventory accounts source and all native members without inventing a closed body',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=observe(f);assert.equal(result.failure,null,JSON.stringify(result));
 assert.equal(result.sourceComplete,true);assert.equal(result.counts.unaccounted,0);assert.equal(result.counts.literal,2);
 assert.equal(result.counts.paint,48);assert.ok(result.geometryChecks<=4000000);assert.deepEqual(f.image.rgba,before);
 for(const name of ['ownerCompleted','portsAuthorized','opaqueBodyAuthorized','erasureAuthorized'])assert.equal(result[name],false);
 assert.equal(retained(f.image,result.receipt,f.plan,f.page).sourceComplete,true);
 assert.equal(hasMeasuredScenePortFrame(f.image,result.receipt,f.plan.regions[0].box),false);assert.equal(measuredSceneOpaqueSurface(f.image,result.receipt),null);
});

test('unpreserved residuals stay failures; extra paint cannot cover another unit or background',()=>{
 const missing=observe(fixture({omitLiteral:true}));assert.equal(missing.failure,'open-owner-inventory-unaccounted');
 assert.equal(missing.counts.unaccounted,1);assert.equal(missing.receipt,undefined);
 assert.deepEqual([...missing.unaccountedCells],[30*64+26]);
 const extra=observe(fixture({extraLiteral:true}));assert.equal(extra.failure,'open-owner-inventory-extra-literal');assert.equal(extra.receipt,undefined);
 const f=fixture();delete f.literalPaint;const result=observe(f);assert.equal(result.failure,'open-owner-inventory-unaccounted');assert.equal(result.counts.unaccounted,2);
});

test('a bounded two-phase transaction derives literal cells from its full check and reuses charged source windows',()=>{
 const {createSceneFillRasterScope,withSceneFillRasterScope}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
 const f=fixture(),oldParts=new Set(f.literalPaint.parts);delete f.literalPaint;
 const initialBudget=f.budget.used;
 withSceneFillRasterScope(f.image,f.budget,createSceneFillRasterScope(f.image,f.budget),()=>{
  const first=observe(f);assert.equal(first.failure,'open-owner-inventory-unaccounted');assert.equal(first.unaccountedCells.size,2);
  const afterFirst=f.budget.used;assert.ok(afterFirst>initialBudget);
  const literal=observeSceneLiteralPaint({id:'preserved-residual',image:f.image,window:{x:0,y:0,w:64,h:64},cells:first.unaccountedCells,budget:f.budget,slideSize:f.slideSize});
  assert.equal(literal.failure,null);assert.equal(f.budget.used,afterFirst);
  f.literalPaint={receipt:literal.receipt,parts:literal.parts};f.page={...f.page,shapes:[...f.page.shapes.filter(p=>!oldParts.has(p)),...literal.parts]};
  const members=observeOpenSceneOwnerMembers({image:f.image,slideSize:f.slideSize,plan:f.plan,ownerId:'region-owner',page:f.page,
   paintReceipt:f.paintReceipt,paintParts:f.paintParts,literalPaint:f.literalPaint,objects:new Map(),relations:new Map(),unresolved:[{id:'region-owner',reason:'container-perimeter'}]});
  assert.equal(members.failure,'open-owner-source-unresolved');f.membersReceipt=members.receipt;
  const final=observe(f);assert.equal(final.failure,null,JSON.stringify(final));assert.equal(final.counts.unaccounted,0);
  assert.equal(f.budget.used,afterFirst);assert.equal(final.ownerCompleted,false);
 });
});

test('missing or forged source units and members cannot become complete through copied JSON or claimed source flags',()=>{
 for(const mode of ['members','paint','literal','glyph','child','relation','paint-member']){
  const f=fixture();
  if(mode==='members')f.membersReceipt=structuredClone(f.membersReceipt);
  if(mode==='paint')f.paintReceipt=structuredClone(f.paintReceipt);
  if(mode==='literal')f.literalPaint.receipt=structuredClone(f.literalPaint.receipt);
  if(mode==='glyph')f.glyph=structuredClone(f.glyph);
  if(mode==='child')f.foreignFrames=[{id:'fake',token:{sourceProven:true},box:{x:20,y:20,w:10,h:10}}];
  if(mode==='relation')f.relationParts=[{id:'fake',source:{sceneRelationId:'fake'}}];
  if(mode==='paint-member')f.page.shapes=f.page.shapes.slice(1);
  if(mode==='child')assert.throws(()=>observe(f),TypeError);else {const result=observe(f);assert.ok(result.failure,mode);assert.equal(result.receipt,undefined,mode);}
 }
});

test('source and final tree identity, output order, fonts, topology and paint snapshots remain bound',()=>{
 for(const mode of ['source','copy','plan','geometry','style','order','metadata','receipt']){
  const f=fixture(),result=observe(f);assert.equal(result.failure,null);let image=f.image,receipt=result.receipt;
  if(mode==='source')image={...image,rgba:Buffer.from(image.rgba)};
  if(mode==='copy')f.page.shapes[0]=structuredClone(f.page.shapes[0]);
  if(mode==='plan')f.plan.regions[0].kind='section';
  if(mode==='geometry')f.page.shapes[0].box.w++;
  if(mode==='style')f.page.shapes[0].style.fill='#FFFFFF';
  if(mode==='order')f.page.shapes.reverse();
  if(mode==='metadata')f.page.shapes[0].source.detector='claimed';
  if(mode==='receipt')receipt=structuredClone(receipt);
  assert.equal(retained(image,receipt,f.plan,f.page),null,mode);
 }
});

test('empty and hostile inputs, unknown alpha and exhausted source budgets fail without partial authority',()=>{
 let reads=0;
 for(const mode of ['null','getter','unknown','proxy']){
  let f=fixture();if(mode==='null')f=null;
  if(mode==='getter')Object.defineProperty(f,'foreignFrames',{get(){reads++;throw Error('private');}});
  if(mode==='unknown')f.ownerCompleted=true;
  if(mode==='proxy')f.foreignFrames=new Proxy([],{get(){reads++;throw Error('private');}});
  assert.throws(()=>observe(f),TypeError);
 }
 assert.equal(reads,0);
 const alpha=fixture({unknownAlpha:true});assert.equal(alpha.paint.failure,'open-source-alpha');
 const changed=fixture();changed.image.rgba[3]=0;
 assert.equal(observe(changed).failure,'open-owner-inventory-source-alpha');
 const f=fixture();f.budget.used=4000000;const result=observe(f);assert.equal(result.failure,'open-owner-inventory-source-budget');assert.equal(result.receipt,undefined);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});
