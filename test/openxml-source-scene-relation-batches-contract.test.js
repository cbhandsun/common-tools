'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {sourceArrowChain}=require('./helpers/scene-arrow-chain.cjs');
const {writePng}=require('../packages/slideclone-core/png');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {recordSceneLocalRelationBatch}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {buildOpenXmlDecksSync}=require('../packages/slideclone-core/pptx-openxml-dotnet');
const {readZipEntryText}=require('../packages/ooxml-core/pptx-zip');

test('26 source-measured relations retain both actual native endpoint identities in the emitted PPTX', {timeout:120000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-batch-openxml-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {image,scene,relations}=sourceArrowChain(),sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const source={sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:image.width,heightPx:image.height};
 const original=parseSourceScenePlan(scene,source);
 const local=relations.slice(24).map(r=>({...r,id:'relation-'+r.id,regionId:'region-root',fromId:'object-'+r.fromId,toId:'object-'+r.toId}));
 const plan=recordSceneLocalRelationBatch(original,{...original,relations:[...original.relations,...local]},local.map(r=>r.id));
 const compiled=compileSourceScene({root,sourceFile,plan,page:{shapes:[],textBoxes:[],images:[]},slideSize:{widthPt:1640,heightPt:100}});
 assert.equal(compiled.evidence.resolvedRelations,26);assert.equal(compiled.page.images.length,0);
 const irFile=path.join(root,'deck.json'),outFile=path.join(root,'deck.pptx');
 fs.writeFileSync(irFile,JSON.stringify({version:'1.0',slideSize:{widthPt:1640,heightPt:100},pages:[{...compiled.page,pageIndex:0,tables:[],charts:[]}]}));
 buildOpenXmlDecksSync([{irFile,outFile}],{skillRoot:path.join(__dirname,'..','skills/pd-hifi-slideclone'),config:{openXmlBuilder:{cache:false}}});
 const xml=readZipEntryText(outFile,'ppt/slides/slide1.xml'),drawings=[...xml.matchAll(/<p:(sp|cxnSp)>.*?<\/p:\1>/gs)].map(m=>m[0]);
 const nativeId=name=>drawings.find(d=>d.includes('name="'+name+'"'))?.match(/<p:cNvPr id="(\d+)"/u)?.[1];
 const arrows=compiled.page.shapes.filter(s=>s.source?.detector==='source-scene-relation');
 assert.equal((xml.match(/<p:cxnSp>/gu)??[]).length,26);assert.doesNotMatch(xml,/<p:pic>/u);
 for(const arrow of arrows){
  const drawing=drawings.find(d=>d.includes('name="'+arrow.id+'"'));assert.ok(drawing);
  for(const [tag,anchor]of [['stCxn',arrow.style.startAnchor],['endCxn',arrow.style.endAnchor]]){
   const actual=nativeId(anchor.elementId);assert.ok(actual);
   assert.match(drawing,new RegExp('<a:'+tag+' id="'+actual+'" idx="\\d+"'));
  }
 }
});
test('26-edge OpenXML regression is included in the contract and complete CI suites',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 for(const suite of ['contract','all'])assert.equal(includesSuite(__filename,suite),true);
});
