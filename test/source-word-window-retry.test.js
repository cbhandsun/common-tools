"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceWordWindowRetry}=require("../packages/slideclone-core/source-word-window-retry");
const {measureSourceWordLayout}=require("../packages/slideclone-core/source-word-layout-evidence");
function fixture(){
 const width=120,height=40,rgba=new Uint8Array(width*height*4).fill(255);
 // The complete stroke extends past the first window, but closes before the
 // next one. Recognition supplies no permission to cut its top off.
 for(let y=7;y<25;y++)for(let x=12;x<50;x++)rgba.set([30,35,40,255],(y*width+x)*4);
 return {image:{width,height,rgba},line:{text:"Text",box:{x:10,y:10,w:100,h:20},wordPositionHints:[
  {text:"Text",box:{x:10,y:10,w:100,h:20}}]},color:"#1E2328",maxScanPixels:4_000_000};
}
test("censored ink closes in one bounded observation, charging both windows without changing the source",()=>{
 const input=fixture(),before=input.image.rgba.slice(),result=measureSourceWordLayout(input);
 assert.equal(result.reason,"source-gap-confirmed");
 assert.deepEqual(result.runs,[{text:"Text",box:{x:12,y:7,w:38,h:18}}]);
 assert.deepEqual(result.sourceFrame,{x:10,y:7,w:100,h:23});
 assert.equal(result.scannedPixels,104*24+104*27);assert.deepEqual(input.image.rgba,before);
 assert.ok(Object.isFrozen(result.runs[0].box));
});
test("remaining budget must pay for the complete retry; no partial window or extra scan is granted",()=>{
 for(const maximum of [104*24,104*24+104*27-1]){
  const result=measureSourceWordLayout({...fixture(),maxScanPixels:maximum});
  assert.equal(result.reason,"censored-source");assert.equal(result.runs,null);assert.equal(result.scannedPixels,104*24);
 }
 const request={height:16384,maximumPixels:4_000_000,scannedPixels:262144};
 assert.deepEqual(sourceWordWindowRetry(request),{margin:64,remainingPixels:3737856});
 assert.equal(sourceWordWindowRetry({...request,scannedPixels:4_000_000}),null);
 assert.equal(sourceWordWindowRetry({...request,height:8}),null);
});
test("larger observations still reject neighboring owners, transparency, and continuing clipped strokes",()=>{
 const occupied=measureSourceWordLayout({...fixture(),neighborBoxes:[{x:10,y:6,w:40,h:4}]});
 assert.equal(occupied.reason,"censored-source");assert.equal(occupied.runs,null);
 const transparent=fixture();transparent.image.rgba[(6*120+12)*4+3]=0;
 assert.equal(measureSourceWordLayout(transparent).reason,"transparent-source");
 const clipped=fixture();for(let y=5;y<7;y++)for(let x=12;x<50;x++)clipped.image.rgba.set([30,35,40,255],(y*120+x)*4);
 const result=measureSourceWordLayout(clipped);assert.equal(result.reason,"censored-source");assert.equal(result.runs,null);
 assert.equal(result.scannedPixels,104*24+104*27);
});
test("missing positions retain one fully charged unit; empty ink and unchanged successful measurements cannot start a retry",()=>{
 const input=fixture();delete input.line.wordPositionHints;
 const unsplit=measureSourceWordLayout(input);
 assert.equal(unsplit.reason,'source-gap-confirmed');assert.equal(unsplit.runs.length,1);
 assert.equal(unsplit.scannedPixels,104*24+104*27);
 const empty=fixture();delete empty.line.wordPositionHints;empty.line.text='';
 assert.deepEqual(measureSourceWordLayout(empty),{runs:null,scannedPixels:0,reason:'no-position-sequence'});
 const blank=fixture();blank.image.rgba.fill(255);
 assert.equal(measureSourceWordLayout(blank).scannedPixels,104*24);
 const normal=fixture();for(let y=7;y<10;y++)for(let x=12;x<50;x++)normal.image.rgba.set([255,255,255,255],(y*120+x)*4);
 assert.equal(measureSourceWordLayout(normal).scannedPixels,104*24);
});
test("invalid, extreme, accessor and proxy controls fail without executing user code or exposing content",()=>{
 let calls=0;const valid={height:20,maximumPixels:4000,scannedPixels:2496};
 const accessor=Object.defineProperty({...valid},"height",{get(){calls++;throw Error("PRIVATE");}});
 for(const value of [null,[],{},accessor,new Proxy(valid,{}),{...valid,height:Infinity},{...valid,height:16385},
  {...valid,height:0},{...valid,maximumPixels:4_000_001},{...valid,scannedPixels:-1},{...valid,scannedPixels:4001},
  {...valid,scannedPixels:1.5},{...valid,extra:"PRIVATE"}])
  assert.throws(()=>sourceWordWindowRetry(value),error=>error instanceof TypeError&&!error.message.includes("PRIVATE"));
 assert.equal(calls,0);
});
test("the retry regressions are included in unified unit CI",()=>{
 assert.equal(require("../scripts/test-suites").includesSuite(__filename,"unit"),true);
});
test("a closed large glyph cannot be censored by foreign ink introduced through symmetric window growth",()=>{
 const width=300,height=300,rgba=new Uint8Array(width*height*4).fill(255);
 for(let y=80;y<231;y++)for(let x=100;x<183;x++)rgba.set([30,35,40,255],(y*width+x)*4);
 // The former symmetric retry brought in this neighboring label and clipped
 // it at the right boundary. Its presence supplies no text ownership rights.
 for(let y=80;y<111;y++)for(let x=195;x<222;x++)rgba.set([30,35,40,255],(y*width+x)*4);
 const input={image:{width,height,rgba},line:{text:'G',box:{x:80,y:60,w:100,h:160}},color:'#1E2328',maxScanPixels:4000000,
  neighborBoxes:[{x:190,y:65,w:40,h:80}]},before=rgba.slice();
 const result=measureSourceWordLayout(input);
 assert.equal(result.reason,'source-gap-confirmed');
 assert.deepEqual(result.runs,[{text:'G',box:{x:100,y:80,w:83,h:151}}]);
 // Retry reads [78,190): column 189 is outside the neighbor at 190. The
 // former inclusive-end subtraction incorrectly left that column unseen.
 assert.equal(result.scannedPixels,104*164+112*202);assert.deepEqual(rgba,before);
 const shortBudget=measureSourceWordLayout({...input,maxScanPixels:104*164+112*202-1});
 assert.equal(shortBudget.reason,'censored-source');assert.equal(shortBudget.runs,null);
 assert.equal(shortBudget.scannedPixels,104*164);
 const clipped=measureSourceWordLayout({...input,neighborBoxes:[{x:180,y:65,w:50,h:80}]});
 assert.equal(clipped.reason,'censored-source');assert.equal(clipped.runs,null);
});
