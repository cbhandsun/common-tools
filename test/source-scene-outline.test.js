"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {measureOutlinedSceneContainer,outlineOwnsAxisLine}=require("../packages/slideclone-core/scene-plan/source-scene-outline");
const {withSceneFillRasterCache:withCache,readSceneFillRaster:read,sceneFillRasterReadCost:cost}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
function fixture(){const image={width:800,height:800,rgba:Buffer.alloc(800*800*4,255)},hint={x:80,y:80,w:600,h:600};
 const put=(x,y)=>image.rgba.set([30,70,90,255],(y*800+x)*4);
 for(let n=80;n<=680;n++)for(let d=0;d<4;d++){put(n,80+d);put(n,677+d);put(80+d,n);put(677+d,n);}
 return {image,hint,budget:{used:0}};}
const ringWindows=[{x:52,y:52,w:656,h:56},{x:52,y:652,w:656,h:56},
 {x:52,y:108,w:56,h:544},{x:652,y:108,w:56,h:544}];

test('cached perimeter cells remain usable at the total ceiling with the same source proof',()=>{
 const f=fixture(),expected=measureOutlinedSceneContainer(f.image,f.hint,[],{used:0});
 withCache(f.image,f.budget,()=>{
  for(const window of ringWindows)read(f.image,window,f.budget);
  f.budget.used=4000000;
  assert.deepEqual(measureOutlinedSceneContainer(f.image,f.hint,[],f.budget),expected);
  assert.equal(f.budget.used,4000000);
 });
});

test('partial perimeter reuse charges exactly the unread disjoint strips',()=>{
 const f=fixture();withCache(f.image,f.budget,()=>{
  read(f.image,ringWindows[0],f.budget);
  const remaining=ringWindows.slice(1).reduce((sum,window)=>sum+cost(f.image,window,f.budget),0);
  assert.equal(remaining,656*656-544*544-656*56);
  f.budget.used=4000000-remaining;
  assert.ok(measureOutlinedSceneContainer(f.image,f.hint,[],f.budget));
  assert.equal(f.budget.used,4000000);
 });
});

test('a genuine perimeter overrun fails atomically before any strip is read',()=>{
 const f=fixture();withCache(f.image,f.budget,()=>{
  read(f.image,ringWindows[0],f.budget);
  const beforeCosts=ringWindows.map(window=>cost(f.image,window,f.budget));
  f.budget.used=4000001-beforeCosts.reduce((sum,value)=>sum+value,0);
  const before=f.budget.used;
  assert.throws(()=>measureOutlinedSceneContainer(f.image,f.hint,[],f.budget),RangeError);
  assert.equal(f.budget.used,before);
  assert.deepEqual(ringWindows.map(window=>cost(f.image,window,f.budget)),beforeCosts);
 });
});

test('a fully cached dense window still runs its complete outline predicate',()=>{
 const image={width:200,height:180,rgba:Buffer.alloc(200*180*4,255)},hint={x:40,y:40,w:100,h:80};
 for(let y=40;y<=120;y++)for(let x=40;x<=140;x++)
  if(x<43||x>137||y<43||y>117)image.rgba.set([30,70,90,255],(y*200+x)*4);
 const expected=measureOutlinedSceneContainer(image,hint,[],{used:0});assert.ok(expected);
 const budget={used:0};withCache(image,budget,()=>{
  read(image,{x:32,y:32,w:116,h:96},budget);budget.used=4000000;
  assert.deepEqual(measureOutlinedSceneContainer(image,hint,[],budget),expected);
  assert.equal(budget.used,4000000);
 });
});

test('cached blank, open and text-owned rings keep their original rejection at the ceiling',()=>{
 for(const mode of ['blank','open','owned']){
  const f=fixture();if(mode==='blank')f.image.rgba.fill(255);
  if(mode==='open')for(let y=75;y<90;y++)for(let x=300;x<315;x++)f.image.rgba.set([255,255,255,255],(y*800+x)*4);
  withCache(f.image,f.budget,()=>{
   for(const window of ringWindows)read(f.image,window,f.budget);
   f.budget.used=4000000;
   assert.equal(measureOutlinedSceneContainer(f.image,f.hint,mode==='owned'?[{x:80,y:100,w:4,h:30}]:[],f.budget),null);
   assert.equal(f.budget.used,4000000);
  });
 }
});
test("a closed source ring above dense ROI size fits within the original narrow-scan and path budgets",()=>{
 const f=fixture(),result=measureOutlinedSceneContainer(f.image,f.hint,[],f.budget);
 assert.ok(result);assert.equal(result.segments.filter(s=>s.type==="moveTo").length,2);assert.ok(result.segments.length<=120);
 assert.ok(f.budget.used<=262144);assert.deepEqual(result.box,{x:80,y:80,w:601,h:601});assert.equal(result.fill,"#FFFFFF");
});
test("blank, open, source-text-owned and boundary-clipped components cannot become panels",()=>{
 const empty=fixture();empty.image.rgba.fill(255);assert.equal(measureOutlinedSceneContainer(empty.image,empty.hint,[],empty.budget),null);
 const open=fixture();for(let y=75;y<90;y++)for(let x=300;x<315;x++)open.image.rgba.set([255,255,255,255],(y*800+x)*4);
 assert.equal(measureOutlinedSceneContainer(open.image,open.hint,[],open.budget),null);
 const text=fixture();assert.equal(measureOutlinedSceneContainer(text.image,text.hint,[{x:80,y:100,w:4,h:30}],text.budget),null);
 const cut=fixture();cut.hint={x:108,y:108,w:544,h:544};assert.equal(measureOutlinedSceneContainer(cut.image,cut.hint,[],cut.budget),null);
});
test("shared scan exhaustion, invalid and hostile inputs fail without accepting partial contours",()=>{
 const f=fixture();assert.throws(()=>measureOutlinedSceneContainer(f.image,f.hint,[],{used:3999999}),/budget/);
 for(const hint of [{...f.hint,x:-1},{...f.hint,w:Infinity},{...f.hint,w:0}])assert.throws(()=>measureOutlinedSceneContainer(f.image,hint,[],{used:0}),/invalid/);
 let calls=0;const bad={get x(){calls++;throw Error("private-token");}};
 assert.throws(()=>measureOutlinedSceneContainer(f.image,bad,[],{used:0}),/invalid/);
 assert.throws(()=>measureOutlinedSceneContainer(new Proxy(f.image,{}),f.hint,[],{used:0}),/invalid/);assert.equal(calls,0);
});
test("outline masks and pixel stores reject hostile or shared views without invoking user accessors",()=>{
 const f=fixture();let calls=0;const mask={get x(){calls++;throw Error("private-token");}};
 for(const masks of [[mask],new Array(1),new Proxy([],{}),[{x:0,y:0,w:Infinity,h:5}]])
  assert.throws(()=>measureOutlinedSceneContainer(f.image,f.hint,masks,{used:0}),e=>!e.message.includes("private-token"));
 const rgba=Buffer.from(f.image.rgba);Object.defineProperty(rgba,"length",{get(){calls++;throw Error("private-token");}});
 assert.ok(measureOutlinedSceneContainer({...f.image,rgba},f.hint,[],{used:0}));assert.equal(calls,0);
 assert.throws(()=>measureOutlinedSceneContainer({...f.image,rgba:Buffer.from(new SharedArrayBuffer(800*800*4))},f.hint,[],{used:0}),/invalid/);
 const big={width:3000,height:3000,rgba:Buffer.alloc(3000*3000*4,255)},budget={used:0};
 assert.equal(measureOutlinedSceneContainer(big,{x:50,y:50,w:2900,h:2900},[],budget),null);assert.equal(budget.used,0);
});
test("heterogeneous interiors admit only a hollow source outline and never authorize a guessed solid fill",()=>{
 const f=fixture();for(let y=120;y<640;y++)for(let x=120;x<640;x++)f.image.rgba.set(x%20<10?[90,160,220,255]:[220,160,90,255],(y*800+x)*4);
 const result=measureOutlinedSceneContainer(f.image,f.hint,[],f.budget);assert.ok(result);assert.equal(result.fill,"none");assert.equal(result.segments.filter(s=>s.type==="moveTo").length,2);
 const noisy=fixture();noisy.image.rgba.set([0,0,0,255],(52*800+52)*4);
 for(let y=120;y<640;y++)for(let x=120;x<640;x++)noisy.image.rgba.set(x%20<10?[90,160,220,255]:[220,160,90,255],(y*800+x)*4);
 assert.ok(measureOutlinedSceneContainer(noisy.image,noisy.hint,[],noisy.budget));
});

test("isolated exterior corner artifacts cannot veto a complete ring with four consistent corner patches",()=>{
 const f=fixture();for(let y=120;y<640;y++)for(let x=120;x<640;x++)f.image.rgba.set(x%20<10?[90,160,220,255]:[220,160,90,255],(y*800+x)*4);
 for(const [x,y] of [[52,52],[707,52],[52,707],[707,707]])f.image.rgba.set([30,70,90,255],(y*800+x)*4);
 const result=measureOutlinedSceneContainer(f.image,f.hint,[],f.budget);
 assert.ok(result);assert.equal(result.fill,"none");assert.equal(result.segments.filter(s=>s.type==="moveTo").length,2);
 assert.equal(result.color,"#1e465a");assert.deepEqual(result.box,{x:80,y:80,w:601,h:601});
 assert.equal(f.budget.used,656*656-544*544);
});

test("a different or transparent corner patch fails even when the other three agree",()=>{
 for(const color of [[30,70,90,255],[255,255,255,0]]){
  const f=fixture();for(let y=120;y<640;y++)for(let x=120;x<640;x++)f.image.rgba.set(x%20<10?[90,160,220,255]:[220,160,90,255],(y*800+x)*4);
  for(let y=52;y<61;y++)for(let x=52;x<61;x++)f.image.rgba.set(color,(y*800+x)*4);
  assert.equal(measureOutlinedSceneContainer(f.image,f.hint,[],f.budget),null);
 }
});

test("a closed ring retains its source identity across independently uniform exterior colors",()=>{
 const f=fixture();
 for(let y=0;y<800;y++)for(let x=0;x<800;x++)
  if(x<80||x>680||y<80||y>680)f.image.rgba.set(y<400?[252,230,240,255]:[230,252,240,255],(y*800+x)*4);
 const result=measureOutlinedSceneContainer(f.image,f.hint,[],f.budget);
 assert.ok(result);assert.equal(result.fill,"#FFFFFF");
 assert.deepEqual(result.box,{x:80,y:80,w:601,h:601});
 assert.equal(result.segments.filter(s=>s.type==="moveTo").length,2);
 assert.equal(f.budget.used,656*656-544*544);
 const open=fixture();
 for(let y=0;y<800;y++)for(let x=0;x<800;x++)
  if(x<80||x>680||y<80||y>680)open.image.rgba.set(y<400?[252,230,240,255]:[230,252,240,255],(y*800+x)*4);
 for(let y=75;y<90;y++)for(let x=300;x<315;x++)open.image.rgba.set([255,255,255,255],(y*800+x)*4);
 assert.equal(measureOutlinedSceneContainer(open.image,open.hint,[],open.budget),null);
});

test("heterogeneous exterior palettes require opaque uniform patches and cannot authorize their own ink",()=>{
 for(const mode of ['transparent','mixed','ring-color']){
  const f=fixture();
  for(let y=0;y<800;y++)for(let x=0;x<800;x++)
   if(x<80||x>680||y<80||y>680)f.image.rgba.set(y<400?[252,230,240,255]:[230,252,240,255],(y*800+x)*4);
  for(let y=52;y<61;y++)for(let x=52;x<61;x++)f.image.rgba.set(mode==='transparent'?[252,230,240,0]:mode==='ring-color'?[30,70,90,255]:(x+y)%2?[252,230,240,255]:[80,150,210,255],(y*800+x)*4);
  assert.equal(measureOutlinedSceneContainer(f.image,f.hint,[],f.budget),null);
 }
});

test("source ring ownership supersedes matching axis fragments while preserving interior and crossing lines",()=>{
 const f=fixture(),outline=measureOutlinedSceneContainer(f.image,f.hint,[],f.budget);assert.ok(outline);
 const line={type:"line",box:{x:81,y:110,w:0,h:500},style:{strokeWidthPt:2},source:{detector:"long-axis-line"}};
 assert.equal(outlineOwnsAxisLine(line,outline,800,{x:1,y:1}),true);
 assert.equal(outlineOwnsAxisLine({...line,box:{x:110,y:81,w:500,h:0}},outline,800,{x:1,y:1}),true);
 for(const box of [{x:200,y:110,w:0,h:500},{x:10,y:81,w:700,h:0},{x:81,y:110,w:40,h:500},{x:81,y:110,w:0,h:0}])
  assert.equal(outlineOwnsAxisLine({...line,box},outline,800,{x:1,y:1}),false);
 assert.equal(outlineOwnsAxisLine({...line,source:{detector:"connector"}},outline,800,{x:1,y:1}),false);
 assert.equal(outlineOwnsAxisLine({...line,style:{strokeWidthPt:Infinity}},outline,800,{x:1,y:1}),false);
 assert.equal(outlineOwnsAxisLine({...line,style:{strokeWidthPt:100}},outline,800,{x:1,y:1}),false);
 assert.equal(outlineOwnsAxisLine(line,outline,800,{x:NaN,y:1}),false);
});

test("colored node interiors and exterior backgrounds stay out of the same closed perimeter ink",()=>{
 const f=fixture();for(let y=84;y<677;y++)for(let x=84;x<677;x++)f.image.rgba.set([210,235,245,255],(y*800+x)*4);
 const result=measureOutlinedSceneContainer(f.image,f.hint,[],f.budget);
 assert.ok(result);assert.equal(result.fill,"#D2EBF5");assert.deepEqual(result.box,{x:80,y:80,w:601,h:601});
 assert.equal(result.segments.filter(s=>s.type==="moveTo").length,2);
 assert.ok(result.sourcePixels.every(n=>f.image.rgba[n*4]===30));
 const open=fixture();for(let y=84;y<677;y++)for(let x=84;x<677;x++)open.image.rgba.set([210,235,245,255],(y*800+x)*4);
 for(let y=75;y<90;y++)for(let x=300;x<315;x++)open.image.rgba.set([255,255,255,255],(y*800+x)*4);
 assert.equal(measureOutlinedSceneContainer(open.image,open.hint,[],open.budget),null);
});

test("unobserved scan interiors cannot fabricate a hollow perimeter from a filled surface",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)},hint={x:80,y:50,w:200,h:150};
 for(let y=50;y<200;y++)for(let x=80;x<280;x++)image.rgba.set([180,220,240,255],(y*400+x)*4);
 // This is a solid surface with internal content, not a separately drawn ring.
 // The content prevents the whole-hint uniform fill proposal.
 for(let y=85;y<165;y++)for(let x=120;x<240;x++)image.rgba.set(x%20<10?[10,10,10,255]:[240,80,80,255],(y*400+x)*4);
 const budget={used:0};assert.equal(measureOutlinedSceneContainer(image,hint,[],budget),null);
 assert.ok(budget.used>0&&budget.used<=262144);
});
test("glyph occlusion allows interior background seed exclusion when an OCR box covers a closed ring",()=>{
 const {measureOutlinedSceneContainerSpatial}=require("../packages/slideclone-core/scene-plan/source-scene-outline");
 const {createSceneGlyphOcclusion}=require("../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion");
 const image={width:120,height:80,rgba:Buffer.alloc(120*80*4,255)},hint={x:20,y:20,w:30,h:30};
 for(let y=20;y<50;y++)for(let x=20;x<50;x++){
  const edge=x<23||x>=47||y<23||y>=47;
  image.rgba.set(edge?[70,90,120,255]:[200,220,245,255],(y*120+x)*4);
 }
 for(let y=26;y<44;y++)for(let x=70;x<76;x++)image.rgba.set([15,15,15,255],(y*120+x)*4);
 const text={text:"I",box:{x:18,y:18,w:70,h:34},font:{color:"#0F0F0F"}},budget={used:0};
 const token=createSceneGlyphOcclusion(image,[text],{widthPt:120,heightPt:80},budget);
 assert.equal(measureOutlinedSceneContainerSpatial(image,hint,[text.box],{used:0}).outline,null);
 assert.ok(measureOutlinedSceneContainerSpatial(image,hint,[text.box],budget,token).outline);
});
