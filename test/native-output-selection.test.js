'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
const {parseNativeOutputPolicy:parse,selectNativeOutputImages:select}=require('../packages/slideclone-core/quality/native-output-selection');
const {writePng}=require('../packages/slideclone-core/png');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {auditSemanticEditability}=require('../packages/slideclone-core/quality/semantic-editability-quality');
function fixture(t){
 const root=createTemp('native-output-');
 t.after(()=>removeTemp(root));
 const image={width:200,height:120,rgba:Buffer.alloc(200*120*4,255)};
 for(const left of [20,120])for(let y=25;y<85;y++)for(let x=left;x<left+50;x++)image.rgba.set([200,225,245,255],(y*200+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',
  regions:[{id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:200,h:120}}],
  objects:[{id:'a',regionId:'root',kind:'container',box:{x:20,y:25,w:50,h:60}},
   {id:'b',regionId:'root',kind:'container',box:{x:120,y:25,w:50,h:60}}],relations:[],
  inventory:[['root',2,0,0]],programs:[{regionId:'root',objects:['a','b'],relations:[],labels:[]}]},
 {sourceHash,widthPx:200,heightPx:120,labelRefs:[]});
 const slideSize={widthPt:200,heightPt:120};
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,root,sourceFile,slideSize});
 assert.equal(compiled.evidence.regionPrograms.coverage.regions.completed,1);
 const residual={id:'residual',assetPath:'assets/residual.png',box:{x:0,y:0,w:200,h:120},
  source:{editable:false,residualCrop:true,fullSlideResidual:true,nativeObjectsErased:true,pageImage:'assets/source.png'}};
 compiled.page.images.push(residual);
 return {root,sourceFile,image,plan,residual,deck:{slideSize,pages:[compiled.page],meta:{sourceSceneCompilation:compiled.evidence}}};
}
test('policy is explicit and default fidelity selection reads or changes no deck',()=>{
 assert.equal(parse(undefined),'source-fidelity');assert.equal(parse('semantic-native'),'semantic-native');
 for(const input of [null,'',{},true,1,'native',new String('semantic-native')])assert.throws(()=>parse(input),/native-output-policy-invalid/);
 let calls=0;const hostile={get pages(){calls++;throw Error('secret-key');}};
 assert.equal(select(hostile,undefined),null);assert.equal(calls,0);
});

test('missing scene and inventory evidence report incomplete semantic output without changing the deck',()=>{
 for(const source of [undefined,{}, {sourceScene:{}}]){
  const deck={pages:[{shapes:[],images:[],textBoxes:[],...(source===undefined?{}:{source})}]},before=structuredClone(deck);
  assert.throws(()=>select(deck,'semantic-native'),/^TypeError: semantic-native-output-incomplete$/u);
  assert.deepEqual(deck,before);
 }
});
test('complete measured scenes can omit erased residuals without changing source assets, text or drawing',t=>{
 const f=fixture(t),before=structuredClone(f.deck),bytes=fs.readFileSync(f.sourceFile),page=f.deck.pages[0];
 const selected=select(f.deck,'semantic-native');
 assert.equal(selected.page,page);assert.deepEqual(selected.report.omittedResidualIds,['residual']);
 assert.equal(selected.report.sourceFidelitySemantic.passed,false);assert.equal(selected.report.sourcePixelsChanged,0);
 assert.equal(selected.report.strictSourceEquivalent,false);assert.equal(selected.report.editingBehaviorVerified,false);
 assert.equal(selected.report.wholeProductAcceptance,false);assert.deepEqual(f.deck,before);
 assert.deepEqual(fs.readFileSync(f.sourceFile),bytes);
 const candidate={...f.deck,pages:[{...page,images:selected.images}]};
 assert.equal(auditSemanticEditability(candidate).passed,true);
 assert.equal(candidate.pages[0].shapes,page.shapes);assert.equal(candidate.pages[0].textBoxes,page.textBoxes);
});
test('unknown images, protected units, groups and incomplete erasures cannot be discarded',t=>{
 const f=fixture(t),page=f.deck.pages[0];
 for(const [index,source]of [undefined,{editable:false},{...f.residual.source,protectedMinimumUnit:true,cropEvidenceRequired:true},
  {...f.residual.source,nativeObjectsErased:false},
  {...f.residual.source,nativeComponentGroupId:'retained'},{...f.residual.source,fullSlideResidual:false,primitiveErased:false},
  {...f.residual.source,intentionalMinimumUnitCrop:true}].entries()){
  const item={...f.residual,id:'keep-'+index,box:{x:0,y:0,w:2,h:2},...(source?{source}:{source:undefined})};page.images.push(item);
 }
 const selected=select(f.deck,'semantic-native');assert.deepEqual(selected.report.omittedResidualIds,['residual']);
 assert.deepEqual(selected.images,page.images.slice(1));
});
test('missing native members, unknown observations and incomplete regions fail without mutation',t=>{
 const f=fixture(t);
 for(const change of [deck=>deck.pages[0].shapes.pop(),
  deck=>deck.meta.sourceSceneCompilation.regionPrograms.coverage.rows[0].complete=false,
  deck=>deck.meta.sourceSceneCompilation.regionPrograms.coverage.regions.completed=0,
  deck=>deck.pages[0].source.sourceScene.unresolved.push({id:'missing',reason:'container-perimeter'}),
  deck=>{delete deck.pages[0].source.sourceScene.observedInventory;}]){
  const deck=structuredClone(f.deck);change(deck);const before=structuredClone(deck);
  assert.throws(()=>select(deck,'semantic-native'),/semantic-native-output-(?:unverified|incomplete|invalid)/);assert.deepEqual(deck,before);
 }
});
test('duplicate IDs and private receipt or approval claims cannot become selection authority',t=>{
 const f=fixture(t),page=f.deck.pages[0];
 page.images.push({...f.residual});assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-unverified/);
 page.images.pop();f.residual.source.sceneInventoryId='another-unit';
 assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-unverified/);
 delete f.residual.source.sceneInventoryId;page.shapes[0].source.detector='approved-native-route-approximation';
 assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-unverified/);
});
test('a retained unproven page-sized residual prevents semantic publication rather than receiving a success label',t=>{
 const f=fixture(t);f.residual.source.nativeObjectsErased=false;const before=structuredClone(f.deck);
 assert.throws(()=>select(f.deck,'semantic-native'),/semantic-native-output-unverified/);assert.deepEqual(f.deck,before);
});
test('hostile, empty, sparse and extreme input reject before provider code executes',t=>{
 const f=fixture(t);let calls=0;const hostile={get pages(){calls++;throw Error('secret-key');}};
 const sparse=structuredClone(f.deck);delete sparse.pages[0].images[0];
 const extreme=structuredClone(f.deck);extreme.pages[0].images=Array(10001).fill(f.residual);
 for(const value of [null,{},hostile,new Proxy(f.deck,{}),sparse,extreme,{...f.deck,pages:[]}])
  assert.throws(()=>select(value,'semantic-native'),/semantic-native-output-/);
 assert.equal(calls,0);
});
test('normal raw rebuild selects semantic images before final quality audit while fidelity output remains available',async t=>{
 const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');
 for(const outputPolicy of ['source-fidelity','semantic-native']){
  const f=fixture(t);
  const rebuild=createRawImageNativeRebuilder({outputPolicy,preserveLocalFidelityImages:true,
   rebuildDeckFromWorkDir:work=>{
    const deck=JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));
    deck.pages[0].shapes=[];deck.pages[0].images=[];return deck;
   },reviewSourceScene:async request=>({plan:f.plan,ocr:request.ocr,evidence:{},graphics:[]}),compileSourceScene,
   createFullSlideResidual:async({objects,outputFile})=>{writePng(outputFile,f.image);return {erasedObjects:objects.length};}});
  const result=await rebuild({root:f.root,metadata:{inputFile:f.sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:200,heightPx:120}},
   ocr:{lines:[]},isCancellationRequested:async()=>false});
  assert.equal(result.nativeComponentQuality.passed,true);
  if(outputPolicy==='semantic-native'){
   assert.deepEqual(result.deck.meta.nativeOutputSelection.omittedResidualIds,['full-slide-residual']);
   assert.equal(result.deck.pages[0].images.length,0);assert.equal(auditSemanticEditability(result.deck).passed,true);
   assert.equal(result.deck.meta.nativeOutputSelection.sourceFidelitySemantic.passed,false);
  }else{
   assert.equal(result.deck.meta.nativeOutputSelection,undefined);
   assert.ok(result.deck.pages[0].images.some(image=>image.source?.fullSlideResidual));
  }
 }
});
test('server factory rejects unknown output policy before loading runtime dependencies',()=>{
 const {createNativeRebuilder}=require('../packages/remote-mcp-server/image-native-rebuilder');let calls=0;
 assert.throws(()=>createNativeRebuilder({}, {outputPolicy:'skip-evidence',loadImplementation(){calls++;throw Error('private');}}),/native-output-policy-invalid/);
 assert.equal(calls,0);
});
test('semantic output selection regressions enter the unified CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.endsWith('native-output-selection.test.js')));
});
