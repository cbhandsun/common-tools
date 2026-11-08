'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {completeOpenSceneOwners:complete,retainedOpenSceneOwnerTransaction:retained}=require('../packages/slideclone-core/scene-plan/source-scene-open-owner-transaction');
const {prepareSceneSourceMeasurements}=require('../packages/slideclone-core/scene-plan/source-scene-source-controls');
function fixture(){
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4)},slideSize={widthPt:64,heightPt:64},budget={used:0};
 for(let i=0;i<64*64;i++)image.rgba.set([245,249,255,255],i*4);
 for(let x=8;x<56;x++)image.rgba.set([210,220,230,255],(8*64+x)*4);
 for(const cell of [30*64+25,30*64+26])image.rgba.set([210,215,220,255],cell*4);
 const owner={id:'region-owner',parentId:null,kind:'container',box:{x:8,y:8,w:48,h:48},nativeGeometry:{kind:'openPaths',paths:[
  {filled:false,segments:[{type:'moveTo',points:[{x:.5/48,y:.5/48}]},{type:'lnTo',points:[{x:47.5/48,y:.5/48}]}]}]}};
 const plan={version:1,widthPx:64,heightPx:64,sourceHash:'1'.repeat(64),regions:[owner],objects:[],relations:[],
  regionPrograms:[{regionId:owner.id,objects:[],relations:[],labels:[]}],observedInventory:[{regionId:owner.id,containers:0,icons:0,relations:0}]};
 const page={shapes:[{id:'existing',type:'rect',box:{x:1,y:1,w:1,h:1},style:{fill:'#FFFFFF'},source:{preserveResidualInterior:true}}],images:[],textBoxes:[]};
 const controls=prepareSceneSourceMeasurements(image,[],slideSize,budget,false);
 const completion={page,plan,slideSize,preflight:false,objects:new Map(),relations:new Map(),interiorParents:new Set(),recoveries:[],
  unresolved:[{id:owner.id,reason:'native-program-source-evidence'}],labelEvidence:{prepared:1,rejected:[]}};
 return {image,plan,page,slideSize,budget,glyph:controls.glyphOcclusion,textMasks:controls.textMasks,measurements:controls.measurements,completion,owners:[owner]};
}
test('transparent transaction commits complete source, literal residuals and unchanged original members after final census',()=>{
 const f=fixture(),before=JSON.stringify(f.page),result=complete(f);
 assert.equal(result.failure,null,JSON.stringify(result));assert.equal(result.completed.evidence.completed,1);
 assert.equal(result.evidence.counts[0].unaccounted,0);assert.equal(result.evidence.counts[0].literal,2);
 assert.equal(result.unresolved.length,0);assert.equal(f.completion.objects.has('region-owner'),false);
 assert.equal(result.objects.get('region-owner').length,2);assert.equal(JSON.stringify(f.page),before);
 assert.equal(result.page.shapes.filter(s=>s.id==='existing')[0],f.page.shapes[0]);
 assert.equal(retained(result.receipt,result.page).completed,1);
 for(const key of ['portsAuthorized','opaqueBodyAuthorized','erasureAuthorized'])assert.equal(result.evidence[key],false);
 assert.ok(f.budget.used<=4000000);
});
test('failed final census rolls back paint, maps, source metadata and original typography without hiding failures',()=>{
 for(const mode of ['unknown','mismatch','unresolved','child','budget','endpoint','kind']){
  const f=fixture();
  if(mode==='unknown')f.plan.observedInventory[0].icons=null;
  if(mode==='mismatch')f.plan.observedInventory[0].containers=1;
  if(mode==='unresolved')f.completion.unresolved.push({id:'region-owner',reason:'region-containment'});
  if(mode==='child'){
   f.plan.regions.push({id:'child',parentId:'region-owner',kind:'card',box:{x:20,y:20,w:10,h:10}});
   f.plan.regionPrograms.push({regionId:'child',objects:[],relations:[],labels:[]});
  }
  if(mode==='budget')f.budget.used=4000000;
  if(mode==='endpoint')f.plan.relations.push({id:'edge',regionId:'region-owner',fromId:'region-owner',toId:'region-owner'});
  if(mode==='kind')f.owners[0].kind='card';
  const before=JSON.stringify(f.page),source=f.page.shapes[0].source,unresolved=JSON.stringify(f.completion.unresolved),result=complete(f);
  assert.ok(result.failure,mode);assert.equal(result.receipt,undefined,mode);assert.equal(result.page,undefined,mode);
  assert.equal(JSON.stringify(f.page),before,mode);assert.equal(f.page.shapes[0].source,source,mode);
  assert.equal(f.completion.objects.size,0,mode);assert.equal(JSON.stringify(f.completion.unresolved),unresolved,mode);
 }
});
test('private final seal rejects copied tokens, reordered or mutated outputs, and changed source or plan',()=>{
 for(const mode of ['token','order','style','source','plan','replace','font']){
  const f=fixture(),result=complete(f);assert.equal(result.failure,null);let token=result.receipt;
  if(mode==='token')token=structuredClone(token);
  if(mode==='order')result.page.shapes.reverse();
  if(mode==='style')result.page.shapes[0].style.fill='#000000';
  if(mode==='source')f.image.rgba=Buffer.from(f.image.rgba);
  if(mode==='plan')f.plan.observedInventory[0].icons=1;
  if(mode==='replace')result.page.shapes[0]=structuredClone(result.page.shapes[0]);
  if(mode==='font')result.page.textBoxes.push({text:'changed',box:{x:1,y:1,w:2,h:2},font:{family:'Arial'}});
  assert.equal(retained(token,result.page),null,mode);
 }
});
test('empty transactions are rejected and unified CI discovers these regression tests',()=>{
 const f=fixture();f.owners=[];assert.throws(()=>complete(f),TypeError);
 assert.equal(retained({},f.page),null);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
});

test('production reconstruction consumes the complete owner seal before composing an independent source band',async t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {writePng}=require('../packages/slideclone-core/png');
 const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-band-order-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(),old=f.image;f.image={width:128,height:128,rgba:Buffer.alloc(128*128*4,255)};
 for(let y=0;y<64;y++)for(let x=0;x<64;x++)f.image.rgba.set(old.rgba.subarray((y*64+x)*4,(y*64+x)*4+4),(y*128+x)*4);
 for(let y=120;y<128;y++)for(let x=0;x<128;x++)f.image.rgba.set([34,68,102,255],(y*128+x)*4);
 f.slideSize={widthPt:128,heightPt:128};f.plan.widthPx=128;f.plan.heightPx=128;f.completion.slideSize=f.slideSize;
 f.page.shapes.push({id:'backplate',type:'roundRect',box:{x:20,y:121,w:40,h:4},style:{fill:'#224466',stroke:'none'},source:{editable:true,nativeRebuild:true,detector:'sampled-text-backplate'}});
 const controls=prepareSceneSourceMeasurements(f.image,[],f.slideSize,f.budget,false);
 f.glyph=controls.glyphOcclusion;f.textMasks=controls.textMasks;f.measurements=controls.measurements;
 const input=path.join(root,'source.png');writePng(input,f.image);let sealed=false;
 const ocr={lines:[]};
 const rebuild=createRawImageNativeRebuilder({reviewSourceScene:async()=>({ocr,plan:f.plan}),
  rebuildDeckFromWorkDir:()=>({version:'1.0',meta:{},slideSize:f.slideSize,pages:[{shapes:[],images:[],textBoxes:[]}]}),
  compileSourceScene:()=>{const r=complete(f);assert.equal(r.failure,null);sealed=true;return {page:r.page,openOwnerReceipt:r.receipt,evidence:{}};},
  createFullSlideResidual:async ({objects})=>({erasedObjects:objects.length})});
 const result=await rebuild({root,metadata:{inputFile:input,assetPath:'assets/source.png',dimensions:{widthPx:128,heightPx:128}},ocr,isCancellationRequested:async()=>false});
 assert.equal(sealed,true);assert.equal(result.deck.meta.sourceTextBands.backgrounds,1);
 assert.equal(result.deck.pages[0].shapes.filter(s=>s.source?.detector==='source-text-band-background').length,1);
 assert.ok(result.deck.pages[0].shapes.some(s=>s.source?.detector==='source-scene-open-paint'&&s.source.nativeComponentRole));
});
test('legacy overlay cleanup retains the complete private open owner and rejects stale or forged tokens before mutation',()=>{
 const {ungroupSourceNativeOverlays}=require('../packages/slideclone-core/scene-plan/source-native-finalization');
 const f=fixture(),result=complete(f);assert.equal(result.failure,null);
 const paint=result.page.shapes.find(s=>s.source?.detector==='source-scene-open-paint');
 assert.ok(paint);const role=paint.source.nativeComponentRole;
 ungroupSourceNativeOverlays(result.page,undefined,result.receipt);
 assert.equal(paint.source.nativeComponentRole,role);
 // Unrelated legacy groups retain the existing cleanup behavior.
 assert.equal(retained(result.receipt,result.page).completed,1);
 for(const mode of ['forged','changed']){
  const g=fixture(),r=complete(g);let receipt=r.receipt;
  if(mode==='forged')receipt=structuredClone(receipt);else r.page.shapes.reverse();
  const before=JSON.stringify(r.page);
  assert.throws(()=>ungroupSourceNativeOverlays(r.page,undefined,receipt),/binding is invalid/u);
  assert.equal(JSON.stringify(r.page),before);
 }
});
