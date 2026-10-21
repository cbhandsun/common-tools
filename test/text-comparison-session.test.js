"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writePng}=require('../packages/slideclone-core/png');
const {writeStoredZipAtomic}=require('../packages/slideclone-core/pptx-zip');
const {comparePageFiles}=require('../packages/slideclone-core/diff-pixel-png');
const {createRawImageRenderQualityVerifier}=require('../packages/slideclone-worker-adapter/team-render-quality');
const {rollbackRegressedNativeTexts}=require('../packages/slideclone-worker-adapter/text-candidate-rollback');
const {pairedTextMetrics,createTextComparisonSession}=require('../packages/slideclone-worker-adapter/text-comparison-session');
function fixture(t,compare=comparePageFiles){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'paired-text-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'assets'));
 const sourceImage=path.join(root,'assets','source.png'),width=80,height=40,rgba=Buffer.alloc(width*height*4,255);
 const fill=(bytes,x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)bytes.set([17,17,17,255],(yy*width+xx)*4);};
 fill(rgba,12,12,14,6);writePng(sourceImage,{width,height,rgba});const pixels=Buffer.from(rgba);fill(pixels,42,12,8,6);
 const baselineDeck={slideSize:{widthPt:80,heightPt:40},pages:[{sourceImage:'assets/source.png',textBoxes:[{id:'text',text:'WORD',box:{x:10,y:10,w:20,h:10},font:{color:'#111111'},source:{evidenceBox:{x:10,y:10,w:20,h:10}}}],shapes:[]}]};
 const candidateDeck=structuredClone(baselineDeck);candidateDeck.pages[0].textBoxes[0].box.w=45;
 const file=label=>{const file=path.join(root,label+'.pptx');writeStoredZipAtomic(file,[{name:'[Content_Types].xml',data:Buffer.from('<Types/>')},{name:'ppt/presentation.xml',data:Buffer.from('<presentation/>')},{name:'ppt/slides/slide1.xml',data:Buffer.from('<slide>'+label+'</slide>')}]);return file;};
 let renders=0;const verify=createRawImageRenderQualityVerifier({comparePageFiles:compare,renderPresentation:async(_input,context)=>{
  renders++;fs.mkdirSync(context.outputDir,{recursive:true});const image=path.join(context.outputDir,'page.png');writePng(image,{width,height,rgba:pixels});return {ok:true,data:{renderedPages:[{image}]}};
 }});
 const baselineFile=file('baseline'),candidateFile=file('candidate');
 const run=(deck,pptxFile,referenceQuality)=>verify({root,sourceImage,deck,pptxFile,referenceQuality});
 return {root,sourceImage,rgba,pixels,fill,baselineDeck,candidateDeck,baselineFile,candidateFile,run,renders:()=>renders};
}
test('same rendered pixels cannot regress merely because the native parent frame expands',async t=>{
 const f=fixture(t),baselineQuality=await f.run(f.baselineDeck,f.baselineFile),candidateQuality=await f.run(f.candidateDeck,f.candidateFile,baselineQuality);
 assert.equal(candidateQuality.checks[0].passed,true);
 assert.ok(candidateQuality.componentLocalMetrics[0].pixelDiffRatio>baselineQuality.componentLocalMetrics[0].pixelDiffRatio,'ordinary per-deck regions remain diagnostic');
 const result=rollbackRegressedNativeTexts({...f,baselineQuality,candidateQuality,strictMetrics:true});
 assert.equal(result.rolledBackTextBoxes,0);assert.equal(f.renders(),2,'paired comparison must reuse rendered snapshots');
 const pair=pairedTextMetrics(baselineQuality,candidateQuality);assert.deepEqual(pair.before,pair.after);
 assert.deepEqual(pair.before[0].box,{x:10,y:10,w:45,h:10});
});
test('changed source ink, moved glyphs and pollution in the expanded region still trigger strict rollback',async t=>{
 for(const mode of ['missing','moved','neighbor']){const f=fixture(t),baselineQuality=await f.run(f.baselineDeck,f.baselineFile);
  if(mode==='missing'||mode==='moved'){f.pixels.set(f.rgba);for(let y=12;y<18;y++)for(let x=12;x<26;x++)f.pixels.set([255,255,255,255],(y*80+x)*4);}
  if(mode==='moved')f.fill(f.pixels,35,12,14,6);
  if(mode==='neighbor')f.fill(f.pixels,42,11,12,8);
  const candidateQuality=await f.run(f.candidateDeck,f.candidateFile,baselineQuality);
  assert.equal(candidateQuality.checks[0].passed,true,mode);
  assert.equal(rollbackRegressedNativeTexts({...f,baselineQuality,candidateQuality,strictMetrics:true}).rolledBackTextBoxes,1,mode);
 }
});
test('cache hits preserve the private reference binding and never trust copied numeric evidence',async t=>{
 const f=fixture(t),base=await f.run(f.baselineDeck,f.baselineFile),first=await f.run(f.candidateDeck,f.candidateFile,base);
 const cached=await f.run(f.candidateDeck,f.candidateFile,base),cachedBase=await f.run(f.baselineDeck,f.baselineFile);
 const replayedChain=await f.run(f.candidateDeck,f.candidateFile,cachedBase);
 assert.equal(replayedChain.metrics['quality-verification-cache-hit'],1);
 assert.ok(pairedTextMetrics(cachedBase,replayedChain));
 assert.equal(rollbackRegressedNativeTexts({...f,baselineQuality:cachedBase,candidateQuality:replayedChain,strictMetrics:true}).rolledBackTextBoxes,0);
 assert.equal(f.renders(),2);assert.ok(pairedTextMetrics(cachedBase,cached));assert.equal(rollbackRegressedNativeTexts({...f,baselineQuality:cachedBase,candidateQuality:cached,strictMetrics:true}).rolledBackTextBoxes,0);
 assert.equal(pairedTextMetrics(structuredClone(base),first),null);assert.equal(pairedTextMetrics(base,structuredClone(first)),null);
 assert.throws(()=>rollbackRegressedNativeTexts({...f,baselineQuality:base,candidateQuality:structuredClone(first),strictMetrics:true}),/not comparable/);
 fs.writeFileSync(f.baselineFile,Buffer.from('changed'));
 assert.throws(()=>pairedTextMetrics(base,first),/stale/);
 const stale=await f.run(f.candidateDeck,f.candidateFile,base);assert.equal(stale.checks[0].passed,false);assert.equal(f.renders(),2);
});
test('source identity, shared comparison work limit, malformed inputs and hostile accessors fail closed',async t=>{
 const f=fixture(t),base=await f.run(f.baselineDeck,f.baselineFile);writePng(f.sourceImage,{width:80,height:40,rgba:Buffer.alloc(80*40*4,255)});
 assert.equal((await f.run(f.candidateDeck,f.candidateFile,base)).checks[0].passed,false);
 let comparisons=0;const heavy=fixture(t,input=>{const result=comparePageFiles(input);if(++comparisons===2)result.componentQuality={...result.componentQuality,evaluatedPixels:100000000};return result;});
 const before=await heavy.run(heavy.baselineDeck,heavy.baselineFile),after=await heavy.run(heavy.candidateDeck,heavy.candidateFile,before);
 assert.equal(after.checks[0].passed,false);assert.equal(heavy.renders(),2);
 let calls=0;const hostile={get componentLocalMetrics(){calls++;throw Error('private-content');}};
 assert.equal(pairedTextMetrics(hostile,{}),null);assert.equal(pairedTextMetrics({},new Proxy({},{})),null);
 for(const options of [null,{},new Proxy({},{}),{get settings(){calls++;throw Error('private-content');}},
  {snapshotCache:{replay(){}},settings:{threshold:25,foregroundTolerancePx:2,foregroundToleranceDelta:54}}])
  assert.throws(()=>createTextComparisonSession(options),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.equal(calls,0);assert.equal(require('../scripts/test-suites').classifyTestFile(__filename),'unit');
});
