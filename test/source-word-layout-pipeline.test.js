"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {writePng}=require("../packages/slideclone-core/png");
const {createRawImageNativeRebuilder}=require("../packages/slideclone-core/team-native-rebuild");
async function fixture(t,mutate=()=>{},hints=true,content='AAAABBBB',prepare=()=>{},createFullSlideResidual){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'word-layout-pipeline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:120,height:40,rgba:Buffer.alloc(120*40*4,255)};
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)image.rgba.set([17,17,17,255],(y*120+x)*4);
 const line={text:content,box:{x:10,y:10,w:100,h:20},confidence:.99,...(hints?{wordPositionHints:[
  {text:'AAAA',box:{x:10,y:10,w:50,h:20}},{text:'BBBB',box:{x:60,y:10,w:50,h:20}}
 ]}:{})};
 prepare(image,line);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const rebuild=createRawImageNativeRebuilder({
  ...(createFullSlideResidual?{createFullSlideResidual}:{}),
  rebuildDeckFromWorkDir:work=>{
   const deck=JSON.parse(fs.readFileSync(path.join(work,'ir','deck.json')));
   deck.pages[0].textBoxes=deck.pages[0].textBoxes.map(text=>({...text,font:{...text.font,opacity:1},style:{...text.style,visibility:'visible',opacity:1,wrap:false,fit:'none'},wrap:false}));
   mutate(deck.pages[0].textBoxes[0]);
   return deck;
  }
 });
 const result=await rebuild({root,metadata:{inputFile:sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:120,heightPx:40}},
  ocr:{lines:[line]},isCancellationRequested:async()=>false});
 assert.deepEqual(fs.readFileSync(sourceFile),fs.readFileSync(path.join(root,'native-work','normalized','001.png')));
 return result;
}

test('measured color children retain independent word layout through late expansion and source copying',async t=>{
 const result=await fixture(t,text=>{text.source.overlayVisibility='visible';text.runs=text.runs.map(run=>({...run,font:{...run.font,opacity:1}}));},true,'AAAABBBB',(image)=>{
  for(let y=15;y<25;y++)for(let x=64;x<108;x++)image.rgba.set([180,43,5,255],(y*120+x)*4);
 });
 const texts=result.deck.pages[0].textBoxes;
 assert.equal(texts.length,2);assert.equal(texts.map(t=>t.text).join(''),'AAAABBBB');
 assert.ok(texts.every(t=>t.positionedRuns?.length===1));
 assert.equal(result.deck.meta.sourceWordLayout.layouts,2);
 assert.deepEqual(texts.map(t=>t.font.color),['#111111','#B42B05']);
 assert.ok(texts.every(t=>t.source.segmentedOcrLineId==='p0-ocr-001'));
});
test('final opposite-polarity text keeps its baseline and offers only a privately observed whole-line candidate',async t=>{
 const result=await fixture(t,text=>{text.font.color='#FFFFFF';},true,'AABBCC',(image,line)=>{
  for(let i=0;i<image.rgba.length;i+=4)image.rgba.set([30,60,90,255],i);
  for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)image.rgba.set([255,255,255,255],(y*120+x)*4);
  line.wordPositionHints=[{text:'AA',box:{x:10,y:10,w:35,h:20}},
   {text:'BB',box:{x:53,y:10,w:5,h:20}},{text:'CC',box:{x:60,y:10,w:50,h:20}}];
 });
 const page=result.deck.pages[0],text=page.textBoxes.find(t=>t.text==='AABBCC');
 assert.equal(text.positionedRuns,undefined);assert.equal(text.font.color,'#FFFFFF');assert.equal(result.deck.meta.sourceWordLayout,undefined);
 const {planIntactSourceWordLayouts}=require('../packages/slideclone-core/typography/source-word-layout-registry');
 const candidate=planIntactSourceWordLayouts(page);
 assert.equal(candidate.changes.length,1);const next=candidate.textBoxes.find(t=>t.id===text.id);
 assert.equal(next.positionedRuns.length,1);assert.equal(next.positionedRuns[0].text,'AABBCC');
 assert.deepEqual(next.source,text.source);assert.deepEqual(next.font,text.font);assert.equal(text.positionedRuns,undefined);
 assert.equal(planIntactSourceWordLayouts(page).changes.length,0);
});

test('a rejected optional residual preserves source layouts and remains a failed final candidate',async t=>{
 const {residualOwnershipRejection}=require('../packages/slideclone-core/scene-plan/residual-branch-result');
 const failed={passed:false,scannedPixels:100,ownedPixels:12,ownedForegroundPixels:12,remainingOwnedForegroundPixels:0,
  remainingOwnedBackgroundPixels:0,unownedChangedPixels:0,remainingTextCorePixels:2,incorrectTextBackgroundPixels:0,unresolvedTextMasks:0};
 const result=await fixture(t,()=>{},true,'AAAABBBB',()=>{},async()=>{throw residualOwnershipRejection(failed);});
 assert.equal(result.deck.meta.sourceWordLayout.layouts,1);assert.equal(result.deck.pages[0].textBoxes[0].positionedRuns.length,2);
 assert.deepEqual(result.deck.meta.residualBranchRejected.pixelOwnership,failed);
 assert.equal(result.deck.meta.residualDeduplication.erasedObjects,0);
 assert.ok(result.deck.pages[0].images.every(image=>image.id!=='full-slide-residual'));
 assert.equal(result.nativeComponentQuality.passed,false);
 assert.equal(result.nativeComponentQuality.checks.find(c=>c.name==='residual-omission-integrity').passed,false);
});

test('composition does not convert cancellation or an untrusted residual error into a candidate',async t=>{
 for(const failure of [new Error('editable job was cancelled'),new RangeError('residual scan exceeds budget'),
  new Error('full-slide residual retains owned foreground or changes unowned pixels')])
  await assert.rejects(fixture(t,()=>{},true,'AAAABBBB',()=>{},async()=>{throw failure;}),e=>e===failure);
});
test("real raw-image composition applies measured word layout before portable source paths replace its binding",async t=>{
 const result=await fixture(t);
 assert.equal(result.deck.meta.sourceWordLayout?.layouts,1);
 assert.equal(result.deck.meta.sourceWordLayout.runs,2);
 const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAABBBB');
 assert.equal(text.positionedRuns.length,2);assert.equal(text.style.textWarp,'textPlain');
 assert.equal(text.source.pageImage,'assets/source.png');assert.equal(result.deck.pages[0].sourceImage,'assets/source.png');
 assert.equal(text.positionedRuns.map(run=>run.text).join(''),'AAAABBBB');
 assert.equal(text.source.editable,true);
 // The compact native contract omits redundant opaque defaults. The shared
 // child font still resolves to fully opaque, as verified by OpenXML tests.
 assert.equal(Object.hasOwn(text.font,'opacity'),false);assert.equal(text.font.opacity??1,1);
 assert.equal(Object.hasOwn(text.style,'opacity'),false);
});

test("real composition keeps a complete native line when a narrow glyph defeats per-character color consensus",async t=>{
 const result=await fixture(t,()=>{},false,'ABCDEFGHIJKLMNOP',(image,line)=>{
  image.rgba.fill(255);line.box={x:10,y:10,w:96,h:20};
  for(let char=0;char<16;char++)for(let x=10+char*6+1;x<10+char*6+(char===2?2:5);x++)for(let y=14;y<28;y++){
   const core=char<8?y<17:y<24;image.rgba.set(core?[20,20,20,255]:[180,180,180,255],(y*image.width+x)*4);
  }
 });
 const texts=result.deck.pages[0].textBoxes;
 assert.equal(texts.length,1);assert.equal(texts[0].text,'ABCDEFGHIJKLMNOP');
 assert.equal(texts[0].source?.positionedMixedColorTextSegments,undefined);
 assert.equal(texts[0].source?.editable,true);assert.equal(texts[0].style?.visibility,'visible');
});

test("real composition uses continuous typography bounds without changing the complete source frame",async t=>{
 const result=await fixture(t,()=>{},true,'AAAABBBB',image=>{
  for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64){
   const edge=y===15||y===24||x===12||x===51||x===64||x===107;
   image.rgba.set(edge?[195,195,195,255]:[17,17,17,255],(y*120+x)*4);
  }
 });
 const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAABBBB');
 assert.equal(result.deck.meta.sourceWordLayout.layouts,1);assert.equal(text.positionedRuns.length,2);
 assert.deepEqual(text.source.evidenceBox,{x:80,y:80,w:800,h:160});
 assert.deepEqual(text.box,{x:80,y:80,w:800,h:160});
 assert.ok(text.positionedRuns[0].box.x>12*8);assert.ok(text.positionedRuns[0].box.w<40*8);
 assert.ok(text.positionedRuns[0].box.y>15*8);assert.ok(text.positionedRuns[0].box.h<10*8);
 assert.equal(text.positionedRuns.map(run=>run.text).join(''),'AAAABBBB');
 assert.equal(text.source.editable,true);assert.equal(text.style.textWarp,'textPlain');
});

test("real composition retains ordinary editable full text after a physically empty source unit",async t=>{
 const result=await fixture(t,()=>{},true,'AAAABBBB',(image,line)=>{
  image.rgba.fill(255);for(let y=15;y<25;y++)for(let x=32;x<108;x++)image.rgba.set([17,17,17,255],(y*120+x)*4);
  line.wordPositionHints=[{text:'AAAA',box:{x:10,y:10,w:10,h:20}},
   {text:'BBBB',box:{x:20,y:10,w:90,h:20}}];
 });
 const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAABBBB');
 assert.equal(result.deck.meta.sourceWordLayout,undefined);
 assert.equal(text.positionedRuns,undefined);
 assert.deepEqual(text.source.evidenceBox,{x:10*8,y:10*8,w:100*8,h:20*8});
 assert.equal(text.source.editable,true);assert.equal(text.style.fit,'none');
});

test("real composition preserves editable word layout when antialias coverage falsely suggests gray paint",async t=>{
 const result=await fixture(t,()=>{},true,'ABCDEFGHIJKLMNOP',(image,line)=>{
  image.rgba.fill(255);
  for(let char=0;char<16;char++)for(let x=12+char*6;x<17+char*6;x++)for(let y=15;y<25;y++){
   const core=char<8?y<18:y<23;
   image.rgba.set(core?[20,20,20,255]:[180,180,180,255],(y*120+x)*4);
  }
  line.wordPositionHints=[{text:'ABCDEFGH',box:{x:10,y:10,w:50,h:20}},
   {text:'IJKLMNOP',box:{x:60,y:10,w:50,h:20}}];
 });
 const texts=result.deck.pages[0].textBoxes;
 assert.equal(texts.length,1);
 const text=texts[0];
 assert.equal(text.text,'ABCDEFGHIJKLMNOP');assert.equal(text.source.editable,true);
 assert.equal(text.source.segmentedOcrLineId,undefined);
 assert.ok(text.positionedRuns.length>0);
 assert.equal(text.positionedRuns.map(run=>run.text).join(''),text.text);
 assert.equal(result.deck.meta.sourceWordLayout.layouts,1);
 assert.equal(text.source.pageImage,'assets/source.png');
});

test("real composition keeps internal spaces when admitted OCR spacing has no source glyph",async t=>{
 const result=await fixture(t,()=>{},true,'AAAA BBBB',(_image,line)=>{
  line.wordPositionHints=[{text:'AAAA',box:{x:10,y:10,w:42,h:20}},
   {text:' ',box:{x:52,y:10,w:12,h:20}},{text:'BBBB',box:{x:64,y:10,w:46,h:20}}];
 });
 const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAA BBBB');
 assert.equal(result.deck.meta.sourceWordLayout.layouts,1);assert.equal(result.deck.meta.sourceWordLayout.runs,2);
 assert.deepEqual(text.positionedRuns,[{text:'AAAA ',box:{x:12*8,y:15*8,w:40*8,h:10*8}},{text:'BBBB',box:{x:64*8,y:15*8,w:44*8,h:10*8}}]);
 assert.equal(text.positionedRuns.map(run=>run.text).join(''),text.text);
 assert.equal(text.source.editable,true);assert.equal(text.style.fit,'none');
});
test("portable normalization cannot authorize a layout whose reconstruction changed the source binding",async t=>{
 const result=await fixture(t,text=>{text.source.pageImage='normalized/other.png';});
 assert.equal(result.deck.meta.sourceWordLayout,undefined);
 assert.equal(result.deck.pages[0].textBoxes[0].positionedRuns,undefined);
 assert.equal(result.deck.pages[0].textBoxes[0].source.pageImage,'assets/source.png');
});
test("missing word alignment keeps one source-measured native line through the full composition",async t=>{
 const result=await fixture(t,()=>{},false);
 assert.equal(result.deck.meta.sourceWordLayout.layouts,1);
 assert.equal(result.deck.meta.sourceWordLayout.runs,1);
 assert.equal(result.deck.pages[0].textBoxes[0].positionedRuns.length,1);
 assert.equal(result.deck.pages[0].textBoxes[0].positionedRuns[0].text,'AAAABBBB');
 assert.equal(result.deck.pages[0].textBoxes[0].text,'AAAABBBB');
 assert.equal(result.deck.pages[0].textBoxes[0].source.pageImage,'assets/source.png');
});
test("source layout cannot replace a rotated native line with unsupported axis-aligned runs",async t=>{
 const result=await fixture(t,text=>{text.rotation=2;},false);
 assert.equal(result.deck.meta.sourceWordLayout,undefined);
 const text=result.deck.pages[0].textBoxes[0];
 assert.equal(text.positionedRuns,undefined);assert.equal(text.rotation,2);
 assert.equal(text.text,'AAAABBBB');assert.equal(text.source.pageImage,'assets/source.png');
});
test("ordinary multiline native text bypasses positioned layouts; oversized OCR remains rejected",async t=>{
 const content='first\nsecond',result=await fixture(t,()=>{},false,content);
 assert.equal(result.deck.meta.sourceWordLayout,undefined);
 const text=result.deck.pages[0].textBoxes.find(item=>item.text===content);
 assert.ok(text);assert.equal(text.positionedRuns,undefined);assert.equal(text.source.editable,true);
 await assert.rejects(()=>fixture(t,()=>{},false,'X'.repeat(513)),/native image rebuild OCR result is invalid/);
});

test("real composition measures final source ink instead of applying stale default-color geometry",async t=>{
 const result=await fixture(t,text=>{text.font.color='#0D4783';},true,'AAAABBBB',image=>{
  for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)
   image.rgba.set([13,71,131,255],(y*120+x)*4);
 });
 const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAABBBB');
 assert.equal(result.deck.meta.sourceWordLayout.layouts,1);assert.equal(text.positionedRuns.length,2);
 assert.deepEqual(text.positionedRuns,[{text:'AAAA',box:{x:12*8,y:15*8,w:40*8,h:10*8}},
  {text:'BBBB',box:{x:64*8,y:15*8,w:44*8,h:10*8}}]);
 assert.equal(text.font.color,'#0D4783');assert.equal(text.source.editable,true);
});

test("word layout uses the actual unrotated native representation for slight OCR quadrilaterals",async t=>{
 for(const slope of [-.1,.1]){
  const result=await fixture(t,()=>{},true,'AAAABBBB',(_image,line)=>{
   line.polygon=slope>0?[[10,10],[110,10+slope],[110,30],[10,30-slope]]
    :[[10,10-slope],[110,10],[110,30+slope],[10,30]];
  });
  const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAABBBB');
  assert.equal(text.rotation??0,0);
  assert.equal(result.deck.meta.sourceWordLayout?.layouts,1);
  assert.equal(text.positionedRuns.length,2);
  assert.equal(text.positionedRuns.map(run=>run.text).join(''),'AAAABBBB');
  assert.deepEqual(text.source.evidenceBox,{x:80,y:80,w:800,h:160});
  assert.equal(text.source.ocrPolygonPt.length,4);
 }
});

test("word layout does not flatten rotated or unresolved perspective native representations",async t=>{
 for(const polygon of [[[10,12],[110,10],[110,28],[10,30]],[[10,10],[110,10],[95,30],[25,30]]]){
  const result=await fixture(t,()=>{},true,'AAAABBBB',(_image,line)=>{line.polygon=polygon;});
  const text=result.deck.pages[0].textBoxes.find(item=>item.text==='AAAABBBB');
  assert.equal(result.deck.meta.sourceWordLayout,undefined);
  assert.equal(text.positionedRuns,undefined);
  assert.deepEqual(text.source.evidenceBox,{x:80,y:80,w:800,h:160});
  assert.equal(text.source.ocrPolygonPt.length,4);
 }
});
