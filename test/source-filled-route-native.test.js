'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFilledFringeFixture}=require('./helpers/source-filled-fringe.cjs');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileFilledSourceRoute}=require('../packages/slideclone-core/routing/source-filled-route-compiler');
const {sealSourceNativeNetworks,readSourceNativeFilledRoutes:read}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {finalizeNativeRouteRepresentations:finalize,commitNativeRouteMaterialization:commit}=require('../packages/slideclone-core/routing/source-native-route-finalization');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {buildSceneInventoryEvidence,auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
const {auditFinalRouteMaterialization}=require('../packages/slideclone-core/scene-plan/source-native-route-materialization');
const {compactNativeFreeformPaths,decodeNativeFreeformPath,encodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
function fixture(census=true){
 const f=sourceFilledFringeFixture(),measured=measureSourceSceneRoute(f);assert.ok(measured.fit?.filledBody,measured.reason);
 const slideSize={widthPt:f.image.width,heightPt:f.image.height};
 const nodes=[f.from,f.to].map(n=>({id:n.id,type:'rect',box:{...n.box},style:{fill:'#FFFFFF'},source:{sceneInventoryId:'object-'+n.id}}));
  const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:f.image.width,h:f.image.height}}],
   objects:nodes.map(n=>({id:n.id,regionId:'region',kind:'container',box:n.box,pictorialContent:'absent'})),
   relations:[{id:'curve',regionId:'region',fromId:'a',toId:'b',direction:'forward',shaftBox:f.shaftBox}],inventory:[['region',2,0,1]]},
  {sourceHash:'a'.repeat(64),widthPx:f.image.width,heightPx:f.image.height});
 const relation=plan.relations[0];assert.ok(relation);
 const parts=compileFilledSourceRoute({fit:measured.fit,relation,fromId:'a',toId:'b',widthPx:f.image.width,heightPx:f.image.height,slideSize});
 const page={shapes:[...nodes,...parts],images:[],textBoxes:[],source:{sourceScene:{version:1,sourceHash:'a'.repeat(64),unresolved:[]}}};
 if(census){
  page.source.sourceScene.observedInventory=buildSceneInventoryEvidence(plan,page.shapes,page.images);
 }
 const deck={slideSize,pages:[page]},receipt=sealSourceNativeNetworks(page);
 const input={page,slideSize,receipt,connectorCornerMode:'reroutable-elbow',work:{checks:0}};
 const strict=()=>auditSceneInventory(page.source.sourceScene.observedInventory,page.shapes,page.images,'a'.repeat(64),page.textBoxes);
 const install=out=>{page.shapes=out.page.shapes;page.source=out.page.source;commit({deck,receipt:out.materializationReceipt});};
 return {...f,parts,nodes,page,deck,input,strict,install};
}
test('complete filled source becomes one externally bound native connector after source consumption',()=>{
 const f=fixture(),source=Buffer.from(f.image.rgba),before=structuredClone(f.page),inventory=JSON.stringify(f.page.source.sourceScene.observedInventory);
 assert.deepEqual(f.strict(),[]);assert.equal(f.parts.length,4);
 const result=finalize(f.input);assert.deepEqual(f.page,before,'selection is a copy-on-write output transaction');
 assert.equal(result.report.consolidatedRelations,1);assert.equal(result.report.retiredMembers,4);
 assert.equal(result.report.routeRepresentations.relations[0].objectStructure,'single-native-connector');
 f.install(result);
 const part=f.page.shapes.find(p=>p.source?.sceneRelationId==='relation-curve');assert.equal(part.type,'line');
 assert.equal(f.page.shapes.filter(p=>p.source?.sceneRelationId==='relation-curve').length,1);
 assert.equal(part.style.startAnchor.elementId,'a');assert.equal(part.style.endAnchor.elementId,'b');assert.equal(part.style.endArrow,'triangle');
 assert.equal(part.style.freeformSegments,undefined);assert.equal(part.style.connectorPath,undefined);
 assert.equal(part.source.sourceFootprintVerified,false);assert.equal(part.source.sourceErasure,false);
 assert.ok(f.strict().length,'ordinary strict membership still reports the four-to-one change');
 const quality=auditNativeComponentQuality(f.deck);assert.equal(quality.passed,true,JSON.stringify(quality.findings));
 assert.equal(quality.sourceInventory.passed,false);assert.equal(quality.measuredNativeMaterializations.length,1);
 assert.equal(quality.approvedMaterializations.length,0);assert.equal(JSON.stringify(f.page.source.sourceScene.observedInventory),inventory);
 assert.deepEqual(f.image.rgba,source);assert.ok(f.input.work.checks<=4000000);
});
test('receipt is mandatory and each complete source drawing, source bytes, outside reference and endpoint remains bound',()=>{
 for(const mode of ['missing','duplicate','bare-duplicate','paint','path','endpoint','nan-endpoint','source','outside','order','copied-receipt','no-receipt']){
  const f=fixture(false);
  if(mode==='missing')f.page.shapes.splice(2,1);
  if(mode==='duplicate')f.page.shapes.push({...f.parts[0]});
  if(mode==='bare-duplicate')f.page.shapes.push({id:f.parts[0].id,box:{x:0,y:0,w:1,h:1}});
  if(mode==='paint')f.parts[0].style.fill='#FF0000';
  if(mode==='path')f.parts[0].box.x++;
  if(mode==='endpoint')f.nodes[0].box.w++;
  if(mode==='nan-endpoint')f.nodes[0].box.w=NaN;
  if(mode==='source')f.image.rgba[0]^=1;
  if(mode==='outside')f.page.shapes.push({id:'outside',type:'line',box:{x:1,y:1,w:5,h:5},style:{startAnchor:{elementId:f.parts[0].id}},source:{}});
  if(mode==='order')f.page.shapes=[...f.nodes,...f.parts.slice().reverse()];
  if(mode==='copied-receipt')f.input.receipt=structuredClone(f.input.receipt);
  if(mode==='no-receipt')delete f.input.receipt;
  assert.equal(read(f.input).groups.length,0,mode);
  const out=finalize(f.input);assert.equal(out.report.consolidatedRelations,0,mode);assert.equal(out.report.changed,0,mode);
 }
});

test('lossless production path compaction preserves the measured filled replacement and final audit',()=>{
 const f=fixture(),before=structuredClone(f.parts),source=Buffer.from(f.image.rgba);
 compactNativeFreeformPaths(f.deck);
 assert.ok(f.parts.some(p=>p.style.freeformPath));
 for(let i=0;i<f.parts.length;i++){
  const part=f.parts[i];
  if(part.style.freeformPath)assert.deepEqual(decodeNativeFreeformPath(part.style.freeformPath),before[i].style.freeformSegments);
 }
 assert.equal(read(f.input).groups.length,1);
 const out=finalize({...f.input,work:{checks:0}});assert.equal(out.report.consolidatedRelations,1,JSON.stringify(out.report.rejected));
 f.install(out);assert.equal(auditNativeComponentQuality(f.deck).passed,true);
 assert.deepEqual(f.image.rgba,source);
});

test('compacted filled receipts reject changed geometry, ambiguous paths, hostile data and exhausted work',()=>{
 for(const mode of ['coordinate','command','order','winding','paint','anchor','closed','rotation','ambiguous','malformed','empty','oversized','getter','proxy','budget']){
  const f=fixture(false);compactNativeFreeformPaths(f.deck);
  const part=f.parts.find(p=>p.style.freeformPath),segments=decodeNativeFreeformPath(part.style.freeformPath);
  if(mode==='coordinate')segments[0].points[0].x=segments[0].points[0].x===0?.001:0;
  if(mode==='command')segments[1]={type:'moveTo',points:segments[1].points.slice(0,1)};
  if(mode==='order')[segments[1],segments[2]]=[segments[2],segments[1]];
  if(mode==='winding')segments.splice(1,segments.length-2,...segments.slice(1,-1).reverse());
  if(['coordinate','command','order','winding'].includes(mode))part.style.freeformPath=encodeNativeFreeformPath(segments);
  if(mode==='paint')part.style.fill='#FF0000';
  if(mode==='anchor')f.parts.find(p=>p.style.startAnchor).style.startAnchor.elementId='b';
  if(mode==='closed')part.style.closed=!part.style.closed;
  if(mode==='rotation')part.rotation=90;
  if(mode==='ambiguous')part.style.freeformSegments=segments;
  if(mode==='malformed')part.style.freeformPath='private malformed data';
  if(mode==='empty')part.style.freeformPath='[]';
  if(mode==='oversized')part.style.freeformPath=' '.repeat(32769);
  let calls=0;const get=()=>{calls++;throw Error('private');};
  if(mode==='getter')Object.defineProperty(part.style,'freeformPath',{enumerable:true,get});
  if(mode==='proxy')part.style.freeformPath=new Proxy({},{get});
  if(mode==='budget')f.input.work.checks=4000000;
  if(mode==='getter'){assert.throws(()=>read(f.input),TypeError);assert.equal(calls,0,mode);continue;}
  const result=read(f.input);assert.equal(result.groups.length,0,mode);assert.equal(result.status,'invalid',mode);
  assert.equal(calls,0,mode);
 }
});
test('detached template reads cannot mutate the private measured route',()=>{
 const f=fixture(false),first=read(f.input);assert.equal(first.groups.length,1);
 first.groups[0].template.box.x++;first.groups[0].template.style.startAnchor.elementId='b';
 const next=read({...f.input,work:{checks:0}});assert.equal(next.groups[0].template.style.startAnchor.elementId,'a');
 assert.equal(finalize({...f.input,work:{checks:0}}).report.consolidatedRelations,1);
});
test('a declared relation with no emitted members remains unmet in the final native-mode report',()=>{
 const f=fixture();f.page.shapes=f.nodes.slice();
 const out=finalize(f.input);assert.deepEqual(out.report.unmetRelationIds,['relation-curve']);
 assert.equal(out.report.status,'partial');assert.equal(out.report.routeRepresentations.relations[0].wholeNativeObject,false);
});
test('changed, cloned, missing, reintroduced and uncommitted output cannot satisfy final materialization',()=>{
 for(const mode of ['uncommitted','clone','output','endpoint','inventory','retired','reference']){
  const f=fixture(),out=finalize(f.input);if(mode!=='uncommitted')f.install(out);else{f.page.shapes=out.page.shapes;f.page.source=out.page.source;}
  const part=f.page.shapes.find(p=>p.source?.nativeFilledRoute);
  if(mode==='clone')f.deck.pages[0]=structuredClone(f.page);
  if(mode==='output')part.style.stroke='#FF0000';
  if(mode==='endpoint')f.nodes[0].box.x++;
  if(mode==='inventory')f.page.source.sourceScene.observedInventory.units[0].members=[];
  if(mode==='retired')f.page.shapes.push(f.parts[0]);
  if(mode==='reference')f.page.shapes.push({id:'outside',type:'line',box:{x:1,y:1,w:5,h:5},style:{endAnchor:{elementId:f.parts[0].id}},source:{}});
  assert.equal(auditNativeComponentQuality(f.deck).passed,false,mode);
 }
 const f=fixture(),out=finalize(f.input);f.install(out);assert.throws(()=>commit({deck:f.deck,receipt:out.materializationReceipt}),TypeError);
});
test('native audit scopes cannot leak into async continuations or waive unrelated source members',async()=>{
 const f=fixture(),out=finalize(f.input);f.install(out);
 const result=auditFinalRouteMaterialization(f.deck,f.page,()=>Promise.resolve(f.strict()));assert.equal(result.status,'invalid');
 let deferred;const later=auditFinalRouteMaterialization(f.deck,f.page,()=>{deferred=Promise.resolve().then(f.strict);return [];});
 assert.equal(later.status,'verified');assert.ok((await deferred).length);
 assert.ok(f.strict().length);const before=auditNativeComponentQuality(f.deck);assert.equal(before.passed,true);
 f.page.shapes=f.page.shapes.filter(p=>p!==f.nodes[1]);assert.equal(auditNativeComponentQuality(f.deck).passed,false);
});
test('public selectors and detached metadata cannot fabricate a measured final-audit capability',()=>{
 const {selectFilledNativeRoute:select}=require('../packages/slideclone-core/routing/source-filled-route-native');
 const {prepareNativeRouteMaterialization:prepare}=require('../packages/slideclone-core/scene-plan/source-native-route-materialization');
 const f=fixture(),group=read(f.input).groups[0];
 assert.throws(()=>select(structuredClone(group),{checks:0}),TypeError);
 group.template.source.sourceErasure=true;assert.throws(()=>select(group,{checks:0}),TypeError);
 const valid=read({...f.input,work:{checks:0}}).groups[0],selection=select(valid,{checks:0});assert.ok(selection);
 const input={page:f.page,shapes:[...f.nodes,selection.output],slideSize:f.deck.slideSize,selections:[selection],work:{checks:0}};
 assert.throws(()=>prepare({...input,selections:[{...selection}]}),TypeError);
 selection.output.style.stroke='#FF0000';assert.throws(()=>prepare({...input,work:{checks:0}}),TypeError);
 assert.throws(()=>prepare({...input,selections:[{parts:f.parts,output:structuredClone(selection.output)}],work:{checks:0}}),TypeError);
});
test('empty pages, hostile values, exhausted work and packaging retain safe boundaries',()=>{
 const f=fixture(false);let calls=0;const get=()=>{calls++;throw Error('private');};
 for(const input of [new Proxy({},{get}),Object.defineProperty({},'page',{get}),{...f.input,page:{...f.page,shapes:new Proxy([],{get})}},
  ...['style','source','box'].map(key=>({...f.input,page:{...f.page,shapes:[...f.page.shapes,{id:'hostile',box:{x:0,y:0,w:1,h:1},[key]:new Proxy({},{get})}]}}))])assert.throws(()=>read(input),TypeError);
 assert.equal(calls,0);
 const spent={...f.input,work:{checks:4000000}};assert.equal(read(spent).status,'invalid');
 assert.throws(()=>finalize({...f.input,work:{checks:4000000}}),TypeError);
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-filled-route-native.test.js'));
 for(const file of ['routing/source-filled-route-native.js','routing/source-native-route-receipts.js','scene-plan/source-native-route-materialization.js'])
  assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/'+file));
});
test('the scene compiler seals filled alternatives on its published source identity',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const f=sourceFilledFringeFixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'filled-native-scene-'));
 t.after(()=>{const target=fs.realpathSync(root),parent=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(target),parent);fs.rmSync(target,{recursive:true,force:true});});
 const sourceFile=path.join(root,'source.png');require('../packages/slideclone-core/png').writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:f.image.width,h:f.image.height}}],
  objects:[f.from,f.to].map(n=>({id:n.id,regionId:'region',kind:'container',box:n.box,pictorialContent:'absent'})),
  relations:[{id:'curve',regionId:'region',fromId:'a',toId:'b',direction:'forward',shaftBox:f.shaftBox}],inventory:[['region',2,0,1]]},
 {sourceHash,widthPx:f.image.width,heightPx:f.image.height});
 const slideSize={widthPt:f.image.width,heightPt:f.image.height},compiled=require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene({
  root,sourceFile,plan,slideSize,page:{shapes:[],images:[],textBoxes:[]},connectorCornerMode:'reroutable-elbow',deferNativeRoutes:true});
 const input={page:compiled.page,slideSize,receipt:compiled.nativeRouteReceipt,connectorCornerMode:'reroutable-elbow',work:{checks:0}};
 assert.equal(read(input).status,'verified');assert.equal(read({...input,work:{checks:0}}).groups.length,1);
 const out=finalize({...input,work:{checks:0}});assert.equal(out.report.consolidatedRelations,1,JSON.stringify(out.report.rejected));
 const deck={slideSize,pages:[compiled.page]};compiled.page.shapes=out.page.shapes;compiled.page.source=out.page.source;commit({deck,receipt:out.materializationReceipt});
 assert.equal(auditNativeComponentQuality(deck).passed,true);assert.equal(compiled.page.source.sourceScene.sourceHash,sourceHash);
});

test('normal semantic rebuild validates the private measured route transaction before image selection and again at final audit',async t=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
 const {writePng}=require('../packages/slideclone-core/png');
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');
 const f=sourceFilledFringeFixture(),root=createTemporaryTestDirectory('semantic-measured-route-');t.after(()=>removeTemporaryTestDirectory(root));
 // Match the normal 960pt slide scale while retaining the measured test ink.
 const canvas={width:960,height:720,rgba:Buffer.alloc(960*720*4,255)};
 for(let y=0;y<f.image.height;y++)f.image.rgba.copy(canvas.rgba,y*canvas.width*4,y*f.image.width*4,(y+1)*f.image.width*4);
 f.image=canvas;
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const {initializeSceneObjectBatches}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
 const plan=initializeSceneObjectBatches(parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:f.image.width,h:f.image.height}}],
  objects:[f.from,f.to].map(n=>({id:n.id,regionId:'region',kind:'container',box:n.box,pictorialContent:'absent'})),
  relations:[{id:'curve',regionId:'region',fromId:'a',toId:'b',direction:'forward',shaftBox:f.shaftBox}],inventory:[['region',2,0,1]],
  relationObservationUnit:'logical-relations-v1',programs:[{regionId:'region',objects:['a','b'],relations:['curve'],labels:[]}]},
  {sourceHash,widthPx:f.image.width,heightPx:f.image.height,labelRefs:[]}));
 const rebuild=createRawImageNativeRebuilder({outputPolicy:'semantic-native',connectorCornerMode:'reroutable-elbow',preserveLocalFidelityImages:true,
  rebuildDeckFromWorkDir:work=>{const deck=JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json')));deck.pages[0].shapes=[];deck.pages[0].images=[];return deck;},
  reviewSourceScene:async request=>({plan,ocr:request.ocr,evidence:{},graphics:[]}),compileSourceScene,
  createFullSlideResidual:async({objects,outputFile})=>{writePng(outputFile,f.image);return {erasedObjects:objects.length};}});
 const result=await rebuild({root,metadata:{inputFile:sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:f.image.width,heightPx:f.image.height}},ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.equal(result.nativeComponentQuality.passed,true,JSON.stringify(result.nativeComponentQuality.findings));
 assert.equal(result.deck.meta.nativeRouteSelection.consolidatedRelations,1);
 assert.equal(result.deck.meta.nativeOutputSelection.policy,'semantic-native');
 assert.equal(result.deck.meta.nativeOutputSelection.semanticEditability.passed,true);
 assert.equal(result.nativeComponentQuality.sourceInventory.passed,false,'the original four-member source census stays strict');
 assert.equal(result.nativeComponentQuality.measuredNativeMaterializations.length,1);
 const page=result.deck.pages[0],inspect=()=>auditSceneInventory(page.source.sourceScene.observedInventory,page.shapes,page.images,sourceHash,page.textBoxes);
 assert.equal(auditFinalRouteMaterialization(result.deck,page,inspect).status,'verified');
 const {selectNativeOutputImages}=require('../packages/slideclone-core/quality/native-output-selection');
 assert.equal(selectNativeOutputImages(result.deck,'semantic-native').report.semanticEditability.passed,true);
 assert.throws(()=>selectNativeOutputImages(structuredClone(result.deck),'semantic-native'),/semantic-native-output-unverified/,
  'serialized metadata cannot impersonate the private measured transaction');
 const endpoint=page.shapes.find(s=>s.id===page.shapes.find(s=>s.source?.sceneRelationId).style.startAnchor.elementId);endpoint.box.x++;
 assert.equal(auditFinalRouteMaterialization(result.deck,page,inspect).status,'invalid','a post-selection endpoint edit invalidates the final receipt');
 assert.throws(()=>selectNativeOutputImages(result.deck,'semantic-native'),/semantic-native-output-unverified/);
});
