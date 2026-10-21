"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {boundedOcrSourceDeck}=require("../packages/slideclone-core/ocr-source-deck");
const {applySourceWordLayouts,registerSourceWordLayout,planIntactSourceWordLayouts,rebindIntactSourceWordLayouts}=require("../packages/slideclone-core/source-word-layout-registry");
function source(join=false,extend=false,single=false){const width=120,height=40,rgba=new Uint8Array(width*height*4).fill(255);for(let y=15;y<25;y++)for(let x=extend?9:12;x<108;x++)if(join||x<52||x>=64)rgba.set([17,17,17,255],(y*width+x)*4);
return boundedOcrSourceDeck({metadata:{dimensions:{widthPx:width,heightPx:height}},sourceImage:"assets/source.png",sourceRaster:{width,height,rgba},
ocr:{lines:[{text:"AAAABBBB",box:{x:10,y:10,w:100,h:20},confidence:.99,wordPositionHints:single?[{text:'AAAABBBB',box:{x:10,y:10,w:100,h:20}}]:[{text:"AAAA",box:{x:10,y:10,w:50,h:20}},{text:"BBBB",box:{x:60,y:10,w:50,h:20}}]}]}});}
function failedCandidate(){
 const width=120,height=40,rgba=new Uint8Array(width*height*4).fill(255);
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)rgba.set([30,35,40,255],(y*width+x)*4);
 const line={text:'AABBCC',confidence:.99,box:{x:10,y:10,w:100,h:20},wordPositionHints:[
  {text:'AA',box:{x:10,y:10,w:35,h:20}},{text:'BB',box:{x:53,y:10,w:5,h:20}},{text:'CC',box:{x:60,y:10,w:50,h:20}}]};
 const text={id:'failed-split',text:line.text,box:{...line.box},font:{color:'#1E2328',family:'Arial',sizePt:12},style:{wrap:false},source:{pageImage:'assets/source.png'}},budget={remaining:4000000};
 registerSourceWordLayout(text,line,{width,height,rgba},budget,[line.box]);
 const page=applySourceWordLayouts({textBoxes:[text]},[text]).page;
 return {page,budget,cost:104*24};
}
test('failed split retains ordinary text and offers only a private, once-only separately budgeted alternative',()=>{
 const {page,budget,cost}=failedCandidate(),before=structuredClone(page);
 assert.equal(page.textBoxes[0].positionedRuns,undefined);assert.equal(budget.remaining,4000000-cost);
 assert.equal(planIntactSourceWordLayouts(structuredClone(page)).changes.length,0);
 const candidate=planIntactSourceWordLayouts(page);
 assert.deepEqual(page,before);assert.equal(candidate.changes.length,1);assert.equal(candidate.textBoxes[0].positionedRuns.length,1);
 assert.equal(candidate.textBoxes[0].positionedRuns[0].text,'AABBCC');assert.deepEqual(candidate.textBoxes[0].source,page.textBoxes[0].source);
 assert.deepEqual(candidate.textBoxes[0].font,page.textBoxes[0].font);assert.equal(budget.remaining,4000000-cost*2);
 assert.equal(planIntactSourceWordLayouts(page).changes.length,0);
});
test('candidate geometry rejects stale text, styles, exhausted budget and hostile nested controls',()=>{
 for(const mutate of [t=>t.text='OTHER',t=>t.box.x++,t=>t.font.color='#FFFFFF',t=>t.rotation=90,t=>t.style.wrap=true,t=>t.positionedRuns=[]]){
  const {page}=failedCandidate();mutate(page.textBoxes[0]);assert.equal(planIntactSourceWordLayouts(page).changes.length,0);
 }
 const empty=failedCandidate();empty.budget.remaining=0;assert.equal(planIntactSourceWordLayouts(empty.page).changes.length,0);assert.equal(empty.budget.remaining,0);
 let calls=0;const {page}=failedCandidate();Object.defineProperty(page.textBoxes[0].font,'family',{get(){calls++;throw Error('PRIVATE');}});
 assert.equal(planIntactSourceWordLayouts(page).changes.length,0);assert.equal(calls,0);
});
test('only the trusted asset-copy boundary can transfer an unchanged private candidate to its rewritten object',()=>{
 const {page}=failedCandidate(),rewritten=structuredClone(page),paths=new Map([['assets/source.png','assets/page-001/source.png']]);
 rewritten.textBoxes[0].source.pageImage='assets/page-001/source.png';
 assert.equal(planIntactSourceWordLayouts(rewritten).changes.length,0);
 rebindIntactSourceWordLayouts(structuredClone(page),rewritten,paths);
 assert.equal(planIntactSourceWordLayouts(rewritten).changes.length,0);
 rebindIntactSourceWordLayouts(page,rewritten,paths);
 assert.equal(planIntactSourceWordLayouts(page).changes.length,0);
 const candidate=planIntactSourceWordLayouts(rewritten);assert.equal(candidate.changes.length,1);
 assert.equal(candidate.textBoxes[0].source.pageImage,'assets/page-001/source.png');
});
test('asset-copy rebinding cannot transfer changed text, geometry, source path or hostile controls',()=>{
 for(const change of [t=>t.text='OTHER',t=>t.box.x++,t=>t.source.pageImage='assets/other.png',t=>t.font=new Proxy(t.font,{})]){
  const {page}=failedCandidate(),rewritten=structuredClone(page);change(rewritten.textBoxes[0]);
  rebindIntactSourceWordLayouts(page,rewritten,new Map());assert.equal(planIntactSourceWordLayouts(rewritten).changes.length,0);
  assert.equal(planIntactSourceWordLayouts(page).changes.length,1);
 }
});
test("only original source-measured objects can provide late positioned layouts; rendering style and native text remain editable",()=>{
 const d=source(),originals=d.pages[0].textBoxes,page=structuredClone(d.pages[0]);page.textBoxes[0].font.weight="bold";page.textBoxes[0].font.color="#1A2633";
 const changed=applySourceWordLayouts(page,originals);assert.equal(changed.layouts,1);assert.equal(changed.runs,2);
 assert.equal(changed.page.textBoxes[0].font.weight,"bold");assert.equal(changed.page.textBoxes[0].font.color,"#1A2633");
 assert.equal(changed.page.textBoxes[0].text,"AAAABBBB");assert.equal(changed.page.textBoxes[0].positionedRuns.length,2);
 assert.equal(page.textBoxes[0].positionedRuns,undefined);assert.equal(applySourceWordLayouts(page,structuredClone(originals)).layouts,0);
 assert.equal(applySourceWordLayouts(page,originals.map(original=>new Proxy(original,{}))).layouts,0);
 for(const change of [t=>t.text="OTHER",t=>t.source.pageImage="assets/other.png",t=>t.source.segmentedOcrLineId="parent"]){const p=structuredClone(page);change(p.textBoxes[0]);assert.equal(applySourceWordLayouts(p,originals).layouts,0);}
});
test("the actual OCR factory projects a complete measured frame and its runs together within source bounds",()=>{
 const d=source(false,true),original=d.pages[0].textBoxes[0];
 const result=applySourceWordLayouts(structuredClone(d.pages[0]),d.pages[0].textBoxes),text=result.page.textBoxes[0];
 assert.equal(original.box.x,80);assert.equal(text.box.x,72);assert.equal(text.box.w,808);
 assert.equal(text.positionedRuns[0].box.x,72);assert.equal(text.positionedRuns[0].box.w,344);
 assert.equal(original.positionedRuns,undefined);
});

test("a dark source mask cannot warp newly identified light text using unrelated background strokes",()=>{
 const d=source(),page=structuredClone(d.pages[0]);page.textBoxes[0].font.color='#FFFFFF';
 const result=applySourceWordLayouts(page,d.pages[0].textBoxes);
 assert.equal(result.layouts,0);assert.equal(result.runs,0);assert.equal(result.page.textBoxes[0],page.textBoxes[0]);
 assert.equal(result.page.textBoxes[0].positionedRuns,undefined);
 assert.equal(result.page.textBoxes[0].font.color,'#FFFFFF');
});
test("untrusted font controls cannot activate measured layouts or invoke accessors",()=>{
 const d=source();let calls=0;const accessor={};Object.defineProperty(accessor,'color',{get(){calls++;throw Error('private-token');}});
 for(const font of [null,accessor,Object.create(accessor),Object.create({color:'#111111'}),new Proxy({},{get(){calls++;throw Error('private-token');}}),{color:'private-token'}]){
  const page=structuredClone(d.pages[0]);page.textBoxes[0].font=font;
  assert.equal(applySourceWordLayouts(page,d.pages[0].textBoxes).layouts,0);
 }assert.equal(calls,0);
});
test("a complete unsplit source line keeps its measured geometry rather than returning to an OCR font estimate",()=>{
 const d=source(true),result=applySourceWordLayouts(structuredClone(d.pages[0]),d.pages[0].textBoxes);
 assert.equal(result.layouts,1);assert.equal(result.runs,1);
 assert.equal(result.page.textBoxes[0].positionedRuns[0].text,"AAAABBBB");
 assert.equal(result.page.textBoxes[0].style.fit,"none");
 assert.equal(result.page.textBoxes[0].positionedRuns[0].box.w,96*8);
});

test("the real OCR factory retains a complete single-unit source layout with its original text and font",()=>{
 const d=source(false,false,true),result=applySourceWordLayouts(structuredClone(d.pages[0]),d.pages[0].textBoxes);
 assert.equal(result.layouts,1);assert.equal(result.runs,1);
 const text=result.page.textBoxes[0];assert.equal(text.text,d.pages[0].textBoxes[0].text);
 assert.deepEqual(text.font,d.pages[0].textBoxes[0].font);
 assert.equal(text.positionedRuns[0].text,'AAAABBBB');assert.equal(text.positionedRuns[0].box.w,96*8);
 assert.equal(text.wrap,false);assert.equal(text.style.textWarp,'textPlain');assert.equal(text.style.fit,'none');
 assert.equal(applySourceWordLayouts(d.pages[0],structuredClone(d.pages[0].textBoxes)).layouts,0);
});

test("all final-ink remeasurements debit the factory's shared unchanged allowance",()=>{
 const width=40,height=20,rgba=new Uint8Array(width*height*4).fill(255);
 for(let y=6;y<14;y++)for(let x=12;x<20;x++)rgba.set([13,71,131,255],(y*width+x)*4);
 const line={text:'WORD',confidence:.99,box:{x:10,y:4,w:12,h:12}},windowPixels=16*16;
 const original={id:'one',text:'WORD',box:{...line.box},font:{color:'#111111'},source:{pageImage:'assets/source.png'}};
 const budget={remaining:windowPixels*2};
 registerSourceWordLayout(original,line,{width,height,rgba},budget,[line.box]);
 assert.equal(budget.remaining,windowPixels);
 const page={textBoxes:[{...structuredClone(original),font:{color:'#0D4783'}}]};
 const result=applySourceWordLayouts(page,[original]);assert.equal(result.layouts,1);
 assert.equal(budget.remaining,0);assert.equal(result.page.textBoxes[0].positionedRuns[0].text,'WORD');
 const exhausted=applySourceWordLayouts(page,[original]);assert.equal(exhausted.layouts,0);
 assert.equal(exhausted.page.textBoxes[0],page.textBoxes[0]);assert.equal(budget.remaining,0);
});

test("source layout refinement preserves the existing native font identity at exact text spans",()=>{
 const d=source(),page=structuredClone(d.pages[0]),text=page.textBoxes[0];
 text.positionedRuns=[{text:'AAAABBBB',box:{...text.box},fontOverride:{family:'SimHei',weight:'regular'}}];
 const before=structuredClone(page),result=applySourceWordLayouts(page,d.pages[0].textBoxes);
 assert.equal(result.layouts,1);assert.equal(result.runs,2);
 for(const run of result.page.textBoxes[0].positionedRuns)assert.deepEqual(run.fontOverride,{family:'SimHei',weight:'regular'});
 assert.deepEqual(page,before);
});

test("source layout refinement keeps the previous text when a new word would cross different font spans",()=>{
 const d=source(),page=structuredClone(d.pages[0]),text=page.textBoxes[0];
 text.positionedRuns=[{text:'AA',box:{x:80,y:80,w:100,h:160},fontOverride:{family:'SimHei'}},
 {text:'AABBBB',box:{x:200,y:80,w:680,h:160},fontOverride:{family:'KaiTi'}}];
 const result=applySourceWordLayouts(page,d.pages[0].textBoxes);
 assert.equal(result.layouts,0);assert.equal(result.page.textBoxes[0],text);
});
