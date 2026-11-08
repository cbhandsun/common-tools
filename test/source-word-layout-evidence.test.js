"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureSourceWordLayout,remeasureSourceWordLayout,proposeIntactSourceWordLayout}=require("../packages/slideclone-core/typography/source-word-layout-evidence");
function fixture(join=false){
 const width=120,height=40,rgba=new Uint8Array(width*height*4).fill(255);
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(join||x<52||x>=64)rgba.set([30,35,40,255],(y*width+x)*4);
 return {image:{width,height,rgba},line:{text:"AAAABBBB",box:{x:10,y:10,w:100,h:20},wordPositionHints:[
  {text:"AAAA",box:{x:10,y:10,w:50,h:20}},{text:"BBBB",box:{x:60,y:10,w:50,h:20}}]},color:"#1E2328",maxScanPixels:4_000_000};
}
function failedSplit(){
 const input=fixture();input.line.text='AABBCC';
 input.line.wordPositionHints=[{text:'AA',box:{x:10,y:10,w:35,h:20}},
  {text:'BB',box:{x:53,y:10,w:5,h:20}},{text:'CC',box:{x:60,y:10,w:50,h:20}}];
 return input;
}
test('a failed spatial split can propose a separately charged intact candidate without changing its rejection',()=>{
 const input=failedSplit(),first=measureSourceWordLayout(input);
 assert.equal(first.reason,'missing-source-unit');assert.equal(first.runs,null);
 const source=input.image.rgba.slice();input.image.rgba.fill(255);
 const candidate=proposeIntactSourceWordLayout(input,4000000);
 assert.equal(candidate.reason,'intact-geometry-candidate');assert.equal(candidate.scannedPixels,first.scannedPixels);
 assert.equal(candidate.runs.length,1);assert.equal(candidate.runs[0].text,'AABBCC');
 assert.deepEqual(candidate.sourceFrame,input.line.box);
 assert.equal(first.runs,null);assert.equal(proposeIntactSourceWordLayout(input,4000000),null);
 input.image.rgba.set(source);assert.equal(measureSourceWordLayout(input).reason,'missing-source-unit');
});
test('intact proposals require private failed observations and preserve budget, empty and censored rejection',()=>{
 const input=failedSplit(),first=measureSourceWordLayout(input);
 assert.equal(proposeIntactSourceWordLayout(structuredClone(input),4000000),null);
 assert.equal(proposeIntactSourceWordLayout(new Proxy(input,{}),4000000),null);
 assert.equal(proposeIntactSourceWordLayout(input,first.scannedPixels-1).reason,'source-budget');
 assert.equal(proposeIntactSourceWordLayout(input,4000000),null);
 const blank=failedSplit();blank.image.rgba.fill(255);measureSourceWordLayout(blank);
 assert.equal(proposeIntactSourceWordLayout(blank,4000000).runs,null);
 const clipped=failedSplit();for(let y=0;y<25;y++)clipped.image.rgba.set([30,35,40,255],(y*120+70)*4);
 assert.equal(measureSourceWordLayout(clipped).reason,'censored-source');
 assert.equal(proposeIntactSourceWordLayout(clipped,4000000),null);
 const success=fixture();measureSourceWordLayout(success);assert.equal(proposeIntactSourceWordLayout(success,4000000),null);
 let calls=0;const hostile=Object.defineProperty({},'line',{get(){calls++;throw Error('PRIVATE');}});
 assert.equal(proposeIntactSourceWordLayout(hostile,4000000),null);assert.equal(calls,0);
 for(const maximum of [-1,Infinity,.5,4000001,'PRIVATE'])assert.throws(()=>proposeIntactSourceWordLayout(input,maximum),e=>e instanceof TypeError&&!e.message.includes('PRIVATE'));
});
test('reusing a request cannot retain stale candidate or snapshot authority after a new observation',()=>{
 const input=failedSplit();measureSourceWordLayout(input);
 delete input.line.wordPositionHints;assert.ok(measureSourceWordLayout(input).runs);
 assert.equal(proposeIntactSourceWordLayout(input,4000000),null);
 input.maxScanPixels=0;assert.equal(measureSourceWordLayout(input).reason,'source-budget');
 assert.equal(remeasureSourceWordLayout(input,'#1E2328',4000000),null);
});

test('retry observes the last blank row before a neighboring half-open OCR box',()=>{
 const image={width:64,height:64,rgba:new Uint8Array(64*64*4).fill(255)};
 for(let y=16;y<=28;y++)for(let x=14;x<26;x++)image.rgba.set([30,35,40,255],(y*64+x)*4);
 for(let y=31;y<40;y++)for(let x=14;x<26;x++)image.rgba.set([30,35,40,255],(y*64+x)*4);
 const line={text:'TEST',box:{x:10,y:10,w:20,h:16}},neighbor={x:10,y:30,w:20,h:12};
 const input={image,line,color:'#1E2328',neighborBoxes:[line.box,neighbor],maxScanPixels:4000000};
 const actual=measureSourceWordLayout(input);
 assert.ok(actual.runs);assert.deepEqual(actual.runs,[{text:'TEST',box:{x:14,y:16,w:12,h:13}}]);
 assert.equal(actual.scannedPixels,24*20+24*22);
 assert.ok(actual.sourceFrame.y+actual.sourceFrame.h<neighbor.y);
 // The newly observed row is evidence, not a bypass for connected foreign ink.
 for(let y=29;y<=31;y++)image.rgba.set([30,35,40,255],(y*64+14)*4);
 assert.equal(measureSourceWordLayout(input).runs,null);
 const bounded=measureSourceWordLayout({...input,maxScanPixels:24*20});
 assert.equal(bounded.runs,null);assert.equal(bounded.scannedPixels,24*20);
});
test("same-inference word centers propose splits but only source blank columns produce disjoint glyph bounds",()=>{
 const input=fixture(),before=input.image.rgba.slice(),result=measureSourceWordLayout(input);
 assert.equal(result.reason,"source-gap-confirmed");assert.equal(result.scannedPixels,104*24);
 assert.deepEqual(result.runs,[{text:"AAAA",box:{x:12,y:15,w:40,h:10}},{text:"BBBB",box:{x:64,y:15,w:44,h:10}}]);
 assert.ok(Object.isFrozen(result.runs[0].box));assert.deepEqual(input.image.rgba,before);
 const connected=measureSourceWordLayout(fixture(true));assert.equal(connected.runs.length,1);assert.equal(connected.runs[0].text,"AAAABBBB");
});

test("an independent border outside the recognition seed cannot discard complete word geometry",()=>{
 const input=fixture(),expected=measureSourceWordLayout(input);
 for(let y=8;y<32;y++)input.image.rgba.set([30,35,40,255],(y*120+8)*4);
 const before=input.image.rgba.slice(),result=measureSourceWordLayout(input);
 assert.equal(result.reason,"source-gap-confirmed");assert.deepEqual(result.runs,expected.runs);
 assert.equal(result.scannedPixels,expected.scannedPixels);assert.deepEqual(input.image.rgba,before);
});

test('neighbor OCR ownership closes a dense line without erasing shared strokes or adding a scan',()=>{
 const input=fixture(),expected=measureSourceWordLayout(input);
 for(let y=0;y<9;y++)for(let x=20;x<30;x++)input.image.rgba.set([30,35,40,255],(y*120+x)*4);
 assert.equal(measureSourceWordLayout(input).reason,'censored-source');
 input.neighborBoxes=[input.line.box,{x:20,y:0,w:10,h:9}];
 const before=input.image.rgba.slice(),actual=measureSourceWordLayout(input);
 assert.deepEqual(actual.runs,expected.runs);assert.equal(actual.scannedPixels,expected.scannedPixels);
 assert.deepEqual(input.image.rgba,before);
 const cached=remeasureSourceWordLayout(input,input.color,4000000);
 assert.deepEqual(cached.runs,expected.runs);assert.equal(cached.scannedPixels,expected.scannedPixels);
 for(let y=9;y<16;y++)input.image.rgba.set([30,35,40,255],(y*120+20)*4);
 assert.equal(measureSourceWordLayout(input).reason,'censored-source');
});

test("one exact recognition unit can retain independently measured source geometry without inventing a split",()=>{
 const input=fixture();input.line.wordPositionHints=[{text:input.line.text,box:{...input.line.box}}];
 const result=measureSourceWordLayout(input);
 assert.deepEqual(result.runs,[{text:'AAAABBBB',box:{x:12,y:15,w:96,h:10}}]);
 assert.equal(result.scannedPixels,104*24);assert.equal(result.runs.length,1);
 const blank={...input,image:{...input.image,rgba:new Uint8Array(input.image.rgba.length).fill(255)}};
 assert.equal(measureSourceWordLayout(blank).reason,'missing-source-unit');
 const limited={...input,maxScanPixels:104*24-1};assert.equal(measureSourceWordLayout(limited).scannedPixels,0);
 input.image.rgba.set([30,35,40,255],(8*120+12)*4);
  assert.equal(measureSourceWordLayout(input).reason,'source-gap-confirmed');
  // A mark on the final observed boundary is still censored; another window
  // must not silently turn an unobserved continuation into a complete glyph.
  input.image.rgba.set([30,35,40,255],(5*120+12)*4);
 assert.equal(measureSourceWordLayout(input).reason,'censored-source');
});

test("a spatial split with an empty source unit cannot bind the whole phrase to partial ink",()=>{
 const input=fixture();input.image.rgba.fill(255);
 for(let y=15;y<25;y++)for(let x=32;x<108;x++)input.image.rgba.set([30,35,40,255],(y*120+x)*4);
 input.line.wordPositionHints=[{text:'AAAA',box:{x:10,y:10,w:10,h:20}},
  {text:'BBBB',box:{x:20,y:10,w:90,h:20}}];
 const before=input.image.rgba.slice(),result=measureSourceWordLayout(input);
 assert.equal(result.reason,'missing-source-unit');
 assert.equal(result.runs,null);
 assert.equal(result.scannedPixels,104*24);assert.deepEqual(input.image.rgba,before);
 assert.equal(result.sourceFrame,undefined);
 // An optional split failure cannot authorize empty or censored source ink.
 input.image.rgba.fill(255);assert.equal(measureSourceWordLayout(input).reason,'missing-source-unit');
 for(let y=5;y<25;y++)input.image.rgba.set([30,35,40,255],(y*120+32)*4);
 assert.equal(measureSourceWordLayout(input).reason,'censored-source');
});

test("an empty middle unit rejects a partial measurement without extra scanning",()=>{
 const input=fixture();input.line.text='AABBCC';input.image.rgba.fill(255);
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<42||x>=64)input.image.rgba.set([30,35,40,255],(y*120+x)*4);
 input.line.wordPositionHints=[{text:'AA',box:{x:10,y:10,w:35,h:20}},
  {text:'BB',box:{x:45,y:10,w:10,h:20}},{text:'CC',box:{x:55,y:10,w:55,h:20}}];
 const result=measureSourceWordLayout(input);
 assert.equal(result.reason,'missing-source-unit');
 assert.equal(result.runs,null);
 assert.equal(result.scannedPixels,104*24);
 assert.equal(measureSourceWordLayout({...input,maxScanPixels:104*24-1}).reason,'source-budget');
});

test("an admitted whitespace position is spacing evidence and cannot discard intact line geometry",()=>{
 const input=fixture();input.line.text='AAAA BBBB';input.line.wordPositionHints=[
  {text:'AAAA',box:{x:10,y:10,w:42,h:20}},
  {text:' ',box:{x:52,y:10,w:12,h:20}},
  {text:'BBBB',box:{x:64,y:10,w:46,h:20}}];
 const before=input.image.rgba.slice(),result=measureSourceWordLayout(input);
 assert.equal(result.reason,'source-gap-confirmed');
 assert.deepEqual(result.runs,[{text:'AAAA ',box:{x:12,y:15,w:40,h:10}},{text:'BBBB',box:{x:64,y:15,w:44,h:10}}]);
 assert.equal(result.runs.map(run=>run.text).join(''),input.line.text);
 assert.equal(result.scannedPixels,104*24);assert.deepEqual(input.image.rgba,before);
 const illegal={...input,line:{...input.line,wordPositionHints:input.line.wordPositionHints.map((h,i)=>i===1?{...h,text:'\t'}:h)}};
 assert.throws(()=>measureSourceWordLayout(illegal),/OCR word position/);
 const empty={...input,line:{...input.line,text:'   ',wordPositionHints:undefined}};
 assert.equal(measureSourceWordLayout(empty).scannedPixels,0);
});

test('spacing never invents a physical cut or drops an unobserved word',()=>{
 for(const spacing of [' ', '  ', '\u00a0']){
  for(const joined of [false,true]){
   const input=fixture(joined);input.line.text='AAAA'+spacing+'BBBB';input.line.wordPositionHints=[
    {text:'AAAA',box:{x:10,y:10,w:42,h:20}},
    {text:spacing,box:{x:52,y:10,w:12,h:20}},
    {text:'BBBB',box:{x:64,y:10,w:46,h:20}}];
   const before=structuredClone(input),result=measureSourceWordLayout(input);
   assert.equal(result.runs.length,joined?1:2);assert.equal(result.runs.map(r=>r.text).join(''),input.line.text);
   assert.deepEqual(input,before);assert.equal(result.scannedPixels,104*24);
   assert.equal(measureSourceWordLayout({...input,maxScanPixels:104*24-1}).reason,'source-budget');
   for(let y=15;y<25;y++)for(let x=64;x<108;x++)input.image.rgba.set([255,255,255,255],(y*120+x)*4);
   if(!joined)assert.equal(measureSourceWordLayout(input).reason,'missing-source-unit');
  }
 }
});
test("antialiased source strokes retain complete glyph bounds instead of shrinking to isolated dark cores",()=>{
 const input=fixture();
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)
  input.image.rgba.set([150,153,155,255],(y*120+x)*4);
 for(const x of [30,80])input.image.rgba.set([30,35,40,255],(20*120+x)*4);
 const result=measureSourceWordLayout(input);
 assert.deepEqual(result.runs,[{text:"AAAA",box:{x:12,y:15,w:40,h:10}},{text:"BBBB",box:{x:64,y:15,w:44,h:10}}]);
 // A different-colored mark cannot acquire text ownership through contrast alone.
 input.image.rgba.set([200,60,60,255],(12*120+15)*4);
 assert.deepEqual(measureSourceWordLayout(input).runs,result.runs);
});

test("typographic coverage is separate from complete physical glyph bounds, split proof and scan accounting",()=>{
 const input=fixture();
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64){
  const edge=y===15||y===24||x===12||x===51||x===64||x===107;
  input.image.rgba.set(edge?[199,200,201,255]:[30,35,40,255],(y*120+x)*4);
 }
 const before=input.image.rgba.slice(),result=measureSourceWordLayout(input);
 assert.deepEqual(result.runs,[{text:"AAAA",box:{x:12,y:15,w:40,h:10}},{text:"BBBB",box:{x:64,y:15,w:44,h:10}}]);
 assert.equal(result.reason,"source-gap-confirmed");assert.equal(result.scannedPixels,104*24);
 assert.ok(result.typographicRuns);assert.deepEqual(result.typographicRuns.map(run=>run.text),["AAAA","BBBB"]);
 for(let i=0;i<result.runs.length;i++){assert.ok(result.typographicRuns[i].box.w<result.runs[i].box.w);assert.ok(result.typographicRuns[i].box.h<result.runs[i].box.h);}
 assert.deepEqual(input.image.rgba,before);
});
test("complete source ink may define its own frame inside the existing scan window without an OCR containment tolerance",()=>{
 const input=fixture();
 for(let y=15;y<25;y++)for(let x=9;x<12;x++)input.image.rgba.set([30,35,40,255],(y*120+x)*4);
 const result=measureSourceWordLayout(input);
 assert.equal(result.reason,"source-gap-confirmed");
 assert.deepEqual(result.sourceFrame,{x:9,y:10,w:101,h:20});
 assert.deepEqual(result.runs[0].box,{x:9,y:15,w:43,h:10});
 assert.equal(result.scannedPixels,104*24);
 const occupied=measureSourceWordLayout({...input,neighborBoxes:[{x:8,y:14,w:3,h:12}]});
 assert.equal(occupied.runs,null);assert.equal(occupied.reason,"source-frame-ownership");
});
test("word layout rejects censored, transparent, missing and insufficient-budget evidence",()=>{
 const transparent=fixture();transparent.image.rgba[3]=0; // Outside the charged window cannot affect ownership.
 assert.equal(measureSourceWordLayout(transparent).reason,"source-gap-confirmed");
 transparent.image.rgba[(10*120+10)*4+3]=0;assert.equal(measureSourceWordLayout(transparent).reason,"transparent-source");
 const missing=fixture();missing.image.rgba.fill(255);assert.equal(measureSourceWordLayout(missing).reason,"missing-source-unit");
 const censored=fixture();censored.image.rgba.set([30,35,40,255],(5*120+12)*4);
 censored.image.rgba.set([30,35,40,255],(8*120+12)*4);assert.equal(measureSourceWordLayout(censored).reason,"censored-source");
 const short=fixture();short.maxScanPixels=2495;assert.deepEqual(measureSourceWordLayout(short),{runs:null,scannedPixels:0,reason:"source-budget"});
});
test("missing alignment retains one complete source unit, and illegal/extreme/hostile inputs fail safely",()=>{
 const empty=fixture();delete empty.line.wordPositionHints;
 assert.deepEqual(measureSourceWordLayout(empty).runs,[{text:'AAAABBBB',box:{x:12,y:15,w:96,h:10}}]);
 let calls=0;const hostile=Object.defineProperty({},"image",{get(){calls++;return fixture().image;}});
 for(const value of [null,{},hostile,Object.create(hostile),Object.create(fixture()),new Proxy(fixture(),{}),{...fixture(),maxScanPixels:Infinity},{...fixture(),maxScanPixels:-1},{...fixture(),maxScanPixels:4_000_001}])
  assert.throws(()=>measureSourceWordLayout(value),/source word layout/);
 assert.equal(calls,0);
 const stale=fixture();stale.line.wordPositionHints[0].text="PRIVATE";assert.throws(()=>measureSourceWordLayout(stale),error=>!error.message.includes("PRIVATE"));
 const neighborGetter=[];Object.defineProperty(neighborGetter,"0",{get(){calls++;throw Error("PRIVATE");}});neighborGetter.length=1;
 for(const neighborBoxes of [null,[{}],new Array(1),neighborGetter,new Proxy([],{}),Array(10001).fill({x:0,y:0,w:1,h:1}),[{x:119,y:0,w:2,h:1}]])
  assert.throws(()=>measureSourceWordLayout({...fixture(),neighborBoxes}),/source word layout/);
 assert.equal(calls,0);
});
test("unsegmented source observation cannot bypass empty, clipped, budget or neighboring-owner rejection",()=>{
 const input=fixture();delete input.line.wordPositionHints;
 const blank={...input,line:{...input.line,text:'   '}};
 assert.equal(measureSourceWordLayout(blank).scannedPixels,0);
 assert.equal(measureSourceWordLayout({...input,maxScanPixels:2495}).reason,'source-budget');
 const missing={...input,image:{...input.image,rgba:new Uint8Array(input.image.rgba.length).fill(255)}};
 assert.equal(measureSourceWordLayout(missing).reason,'missing-source-unit');
 for(let y=15;y<25;y++)for(let x=9;x<12;x++)input.image.rgba.set([30,35,40,255],(y*120+x)*4);
 assert.equal(measureSourceWordLayout({...input,neighborBoxes:[{x:8,y:14,w:3,h:12}]}).reason,'source-frame-ownership');
 input.image.rgba.set([30,35,40,255],(8*120+12)*4);
 input.image.rgba.set([30,35,40,255],(5*120+12)*4);
 assert.equal(measureSourceWordLayout(input).reason,'censored-source');
});
test("absent alignment never replaces illegal or stale supplied alignment and control text is rejected safely",()=>{
 const input=fixture();delete input.line.wordPositionHints;
 for(const wordPositionHints of [null,[],[{text:'OTHER',box:{...input.line.box}}]])
  assert.throws(()=>measureSourceWordLayout({...input,line:{...input.line,wordPositionHints}}),/OCR word position/);
 for(const text of ['PRIVATE\u0000','PRIVATE\t','PRIVATE\u007f','X'.repeat(513)])
  assert.throws(()=>measureSourceWordLayout({...input,line:{...input.line,text}}),error=>error instanceof TypeError&&!error.message.includes('PRIVATE'));
});

test("final ink remeasurement recovers complete units from the same immutable observed pixels",()=>{
 const input=fixture();
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)
  input.image.rgba.set([13,71,131,255],(y*120+x)*4);
 input.color='#111111';
 const first=measureSourceWordLayout(input);assert.equal(first.reason,'missing-source-unit');
 const expected=[{text:'AAAA',box:{x:12,y:15,w:40,h:10}},{text:'BBBB',box:{x:64,y:15,w:44,h:10}}];
 // Neither raster nor recognition mutations may rewrite the captured evidence.
 input.image.rgba.fill(255);input.line.text='PRIVATE';input.line.box.x=0;
 input.line.wordPositionHints[0].text='PRIVATE';
 const result=remeasureSourceWordLayout(input,'#0D4783',4_000_000-first.scannedPixels);
 assert.equal(result.reason,'source-gap-confirmed');assert.deepEqual(result.runs,expected);
 assert.equal(result.scannedPixels,first.scannedPixels);
 assert.deepEqual(result.sourceFrame,{x:10,y:10,w:100,h:20});
 assert.equal(remeasureSourceWordLayout({...input},'#0D4783',4_000_000),null);
 assert.equal(remeasureSourceWordLayout(new Proxy(input,{}),'#0D4783',4_000_000),null);
});

test("snapshot remeasurement preserves own-seed identity and rejects a distinct overlapping owner",()=>{
 const input=fixture();
 for(let y=15;y<25;y++)for(let x=9;x<12;x++)input.image.rgba.set([30,35,40,255],(y*120+x)*4);
 input.neighborBoxes=[input.line.box];
 const first=measureSourceWordLayout(input),result=remeasureSourceWordLayout(input,'#20252A',4_000_000);
 assert.equal(result.reason,'source-gap-confirmed');assert.deepEqual(result.sourceFrame,first.sourceFrame);
 const distinct={...input,neighborBoxes:[input.line.box,{...input.line.box}]};
 assert.equal(measureSourceWordLayout(distinct).reason,'source-frame-ownership');
 assert.equal(remeasureSourceWordLayout(distinct,'#20252A',4_000_000).reason,'source-frame-ownership');
});

test("snapshot remeasurement charges the full window and cannot invent unobserved context",()=>{
 const input=fixture(),first=measureSourceWordLayout(input);
 assert.deepEqual(remeasureSourceWordLayout(input,'#20252A',first.scannedPixels-1),
  {runs:null,scannedPixels:0,reason:'source-budget'});
 assert.equal(remeasureSourceWordLayout(input,'#20252A',first.scannedPixels).scannedPixels,first.scannedPixels);
 const unobserved=fixture();unobserved.maxScanPixels=0;
 assert.equal(measureSourceWordLayout(unobserved).reason,'source-budget');
 assert.equal(remeasureSourceWordLayout(unobserved,'#20252A',4_000_000),null);
 const censored=fixture();
 // Initially unseen blue boundary cannot request a new window on color change.
 for(let y=8;y<25;y++)censored.image.rgba.set([13,71,131,255],(y*120+70)*4);
 measureSourceWordLayout(censored);
 const result=remeasureSourceWordLayout(censored,'#0D4783',4_000_000);
 assert.equal(result.reason,'censored-source');assert.equal(result.scannedPixels,104*24);
});

test("remeasurement rejects illegal controls without reading hostile properties or leaking input",()=>{
 const input=fixture();measureSourceWordLayout(input);
 for(const [color,maximum] of [['PRIVATE',1],['#20252A',-1],['#20252A',Infinity],
  ['#20252A',4_000_001],['#20252A',.5]])
  assert.throws(()=>remeasureSourceWordLayout(input,color,maximum),e=>e instanceof TypeError&&!e.message.includes('PRIVATE'));
 let calls=0;const hostile=Object.defineProperty({},'image',{get(){calls++;throw Error('PRIVATE');}});
 assert.equal(remeasureSourceWordLayout(hostile,'#20252A',0),null);
 assert.equal(remeasureSourceWordLayout(null,'#20252A',0),null);assert.equal(calls,0);
});
