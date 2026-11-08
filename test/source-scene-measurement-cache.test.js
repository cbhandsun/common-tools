"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSceneMeasurementCache:create}=require("../packages/slideclone-core/scene-plan/source-scene-measurement-cache");
const {hasMeasuredScenePortFrame,measuredScenePortFill}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
function fixture(){
 const image={width:200,height:180,rgba:Buffer.alloc(200*180*4,255)},hint={x:50,y:40,w:100,h:100},budget={used:0};
 for(let y=40;y<140;y++)for(let x=50;x<150;x++)image.rgba.set([140,190,230,255],(y*200+x)*4);
 return {image,hint,budget};
}

test('valid narrow proposals reject only the unsupported outline path without scanning or granting ports',()=>{
 for(const hint of [{x:20,y:20,w:8.64,h:18.432},{x:20,y:20,w:18.432,h:8.64},
  {x:20,y:20,w:0.001,h:12},{x:20,y:20,w:12,h:11.999}]){
  const f=fixture();f.image.rgba.fill(255);const cache=create(f.image,[],f.budget);
  assert.equal(cache.outline(hint),null);assert.equal(f.budget.used,0);
  assert.equal(cache.failure(hint),'outline-hint-below-minimum');
  assert.deepEqual(cache.failureDetails(hint),[{path:'outline',code:'outline-hint-below-minimum',attempts:1}]);
  assert.equal(cache.outline({...hint}),null);assert.equal(f.budget.used,0);
  assert.equal(cache.portFrame(hint),null);
  assert.deepEqual(cache.surface(hint),{outline:null,measured:null});
  assert.equal(cache.portFrame(hint),null);assert.ok(f.budget.used<=4000000);
 }
 const f=fixture(),cache=create(f.image,[],f.budget);
 for(const hint of [{x:20,y:20,w:0,h:12},{x:20,y:20,w:NaN,h:12},{x:199,y:20,w:2,h:8}])
  assert.throws(()=>cache.outline(hint),TypeError);
 assert.equal(f.budget.used,0);assert.ok(cache.surface(f.hint).measured);
});

test('an outline rejected as source text releases its temporary claims but keeps source observation costs',()=>{
 const f=fixture(),glyph=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 f.image.rgba.fill(255);
 for(let y=40;y<140;y++)for(let x=50;x<150;x++)if(x<53||x>=147||y<43||y>=137)f.image.rgba.set([0,0,0,255],(y*200+x)*4);
 const mask={x:45,y:35,w:110,h:110},texts=[{text:'frame-looking-label',box:mask,font:{color:'#000000'}}],size={widthPt:200,heightPt:180},before=Buffer.from(f.image.rgba);
 const directBudget={used:0},directToken=glyph.createSceneGlyphOcclusion(f.image,texts,size,directBudget);
 const direct=require('../packages/slideclone-core/scene-plan/source-scene-outline').measureOutlinedSceneContainerDetailed(f.image,f.hint,[mask],directBudget,directToken);
 assert.equal(direct.outline,null);assert.ok(glyph.sceneGlyphOcclusionEvidence(directToken).glyphOwnedPixels>0);
 const token=glyph.createSceneGlyphOcclusion(f.image,texts,size,f.budget),cache=create(f.image,[mask],f.budget,token);
 assert.equal(cache.outline(f.hint),null);assert.equal(glyph.sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
 assert.ok(f.budget.used>0);const scan=f.budget.used;assert.equal(cache.outline(f.hint),null);assert.equal(f.budget.used,scan);
 assert.deepEqual(f.image.rgba,before);
});

function mixedBody(){
 const image={width:180,height:180,rgba:Buffer.alloc(180*180*4,255)},hint={x:30,y:40,w:100,h:80},budget={used:0};
 for(let y=40;y<120;y++)for(let x=30;x<130;x++)image.rgba.set([30,60,90,255],(y*180+x)*4);
 for(let y=42;y<118;y++)for(let x=32;x<128;x++)image.rgba.set([210,230,245,255],(y*180+x)*4);
 for(let y=48;y<112;y++)for(let x=45;x<82;x++)image.rgba.set([30,60,90,255],(y*180+x)*4);
 return {image,hint,budget};
}
test("an accepted hollow ring no longer skips its independent admitted interior fill",()=>{
 const f=mixedBody(),cache=create(f.image,[],f.budget),initial=cache.outline(f.hint);
 assert.ok(initial);assert.equal(initial.fill,"none");const result=cache.surface(f.hint);
 assert.ok(result.outline);assert.equal(result.outline.fill,"#D2E6F5");assert.equal(result.measured,null);
 assert.deepEqual(result.outline.box,initial.box);assert.deepEqual(result.outline.segments,initial.segments);
 assert.ok(result.outline.bodySegments.length<=120);assert.ok(cache.portFrame(f.hint));
 const used=f.budget.used;f.budget.used=4000000;assert.deepEqual(cache.surface(f.hint),result);assert.equal(f.budget.used,4000000);assert.ok(used<=4000000);
});
test("an optional interior fill cannot exhaust the budget or discard an accepted perimeter",()=>{
 const f=mixedBody(),cache=create(f.image,[],f.budget),outline=cache.outline(f.hint);assert.ok(outline);
 f.budget.used=3999999;const result=cache.surface(f.hint);
 assert.deepEqual(result.outline,outline);assert.equal(result.measured,null);assert.equal(f.budget.used,3999999);
 assert.equal(cache.evidence.independentFillSkippedBudget,1);
 const frame=cache.portFrame(f.hint);assert.ok(hasMeasuredScenePortFrame(f.image,frame,outline.box));
 assert.equal(measuredScenePortFill(f.image,frame,outline.box),null,'the accepted ring cannot spend depleted scans or invent a fill');
 assert.equal(f.budget.used,3999999);
});
test("physical identity requires independently admitted source cells and ignores returned control mutation",()=>{
 const f=fixture(),cache=create(f.image,[],f.budget),second={...f.hint,x:49,w:102};
 assert.equal(cache.sameSurface(f.hint,second),false);cache.fill(f.hint);
 assert.equal(cache.sameSurface(f.hint,second),false);const fit=cache.fill(second),used=f.budget.used;
 fit.box.x=0;fit.fill="#000000";
 assert.equal(cache.sameSurface(f.hint,second),true);assert.equal(f.budget.used,used);
 assert.equal(cache.sameSurface(f.hint,{x:0,y:0,w:30,h:30}),false);
 const blank=fixture();blank.image.rgba.fill(255);const empty=create(blank.image,[],blank.budget);empty.fill(blank.hint);
 assert.equal(empty.sameSurface(blank.hint,blank.hint),false);
 let calls=0;const hostile={};Object.defineProperty(hostile,"x",{get(){calls++;throw Error("private");}});
 assert.throws(()=>cache.sameSurface(hostile,second),TypeError);assert.equal(calls,0);
});
test("equal colors and dimensions cannot merge two distinct physical source components",()=>{
 const image={width:400,height:180,rgba:Buffer.alloc(400*180*4,255)},budget={used:0};
 const first={x:30,y:40,w:100,h:100},second={x:210,y:40,w:100,h:100};
 for(const hint of [first,second])for(let y=hint.y;y<hint.y+hint.h;y++)for(let x=hint.x;x<hint.x+hint.w;x++)image.rgba.set([140,190,230,255],(y*400+x)*4);
 const cache=create(image,[],budget),a=cache.fill(first),b=cache.fill(second);
 assert.ok(a);assert.ok(b);assert.equal(a.fill,b.fill);assert.equal(a.box.w,b.box.w);
 b.box={...a.box};const used=budget.used;
 assert.equal(cache.sameSurface(first,second),false);assert.equal(cache.sameSurface(first,first),true);assert.equal(budget.used,used);
});
test("an exact repeated physical query reads no further source pixels and returns independent fit controls",()=>{
 const f=fixture(),cache=create(f.image,[],f.budget),first=cache.fill(f.hint),used=f.budget.used;
 assert.ok(first);assert.equal(used,19600);first.box.x=0;
 const next=cache.fill({...f.hint});assert.equal(next.box.x,50);assert.equal(f.budget.used,used);assert.equal(cache.evidence.fillReuses,1);
 cache.fill({...f.hint,x:49,w:101});assert.ok(f.budget.used>used);
});
test("null proofs can be reused, while failed scans are retried and keep the original cap",()=>{
 const f=fixture();f.image.rgba.fill(255);const cache=create(f.image,[],f.budget);
 assert.equal(cache.fill(f.hint),null);const used=f.budget.used;assert.equal(cache.fill(f.hint),null);assert.equal(f.budget.used,used);
 const g=fixture();g.budget.used=4000000;const exhausted=create(g.image,[],g.budget);
 assert.throws(()=>exhausted.fill(g.hint),RangeError);assert.equal(g.budget.used,4000000);
 g.budget.used=0;assert.ok(exhausted.fill(g.hint));assert.equal(exhausted.evidence.fillReuses,0);
});
test("source and text ownership cannot leak between compilation cache instances",()=>{
 const f=fixture(),a=create(f.image,[],f.budget);assert.ok(a.fill(f.hint));
 const changed=fixture();changed.image.rgba.fill(255);const b=create(changed.image,[],changed.budget);
 assert.equal(b.fill(changed.hint),null);assert.ok(changed.budget.used>0);
 const c=fixture(),masks=[{x:50,y:40,w:100,h:100}],owned=create(c.image,masks,c.budget);masks.length=0;
 assert.equal(owned.fill(c.hint),null);
});
test("shared pixels, sparse masks, proxy controls and hostile hints fail before any scan",()=>{
 let calls=0;const f=fixture(),getter={};Object.defineProperty(getter,"x",{get(){calls++;throw Error("secret");}});
 const cache=create(f.image,[],f.budget);
 for(const hint of [null,{},getter,new Proxy(f.hint,{}),{...f.hint,x:-1},{...f.hint,w:Infinity}]){
  assert.throws(()=>cache.fill(hint),TypeError);assert.throws(()=>cache.portFrame(hint),TypeError);
 }
 for(const masks of [new Array(1),new Proxy([],{}),[getter]])assert.throws(()=>create(f.image,masks,f.budget),TypeError);
 assert.throws(()=>create(new Proxy(f.image,{}),[],f.budget),TypeError);
 assert.throws(()=>create({...f.image,rgba:new Uint8Array(new SharedArrayBuffer(200*180*4))},[],f.budget),TypeError);
 assert.equal(calls,0);assert.equal(f.budget.used,0);
});

test("one physical surface shares observed outline strips with its fill and preserves the independent fill proof",()=>{
 const f=fixture(),cache=create(f.image,[],f.budget),result=cache.surface(f.hint);
 assert.equal(result.outline,null);assert.ok(result.measured);assert.equal(result.measured.fill,"#8CBEE6");
 // The outline's 6400 cells are inside the fill's 19600-cell window. They
 // are copied from the same owned snapshot rather than read from source again.
 assert.equal(f.budget.used,19600);
 const standalone=fixture(),expected=create(standalone.image,[],standalone.budget).fill(standalone.hint);
 assert.deepEqual(result.measured,expected);
 const used=f.budget.used;assert.deepEqual(cache.surface({...f.hint}),result);assert.equal(f.budget.used,used);
 cache.surface({...f.hint,x:49,w:101});assert.ok(f.budget.used>=used+19600);
});

test("a loose semantic hint preserves the physical fill and recovers its independent complete outer ring",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=76;y<144;y++)for(let x=76;x<184;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 const masks=[{x:100,y:92,w:60,h:30}];
 for(let y=92;y<122;y++)for(let x=100;x<160;x++)if(x%12<5)image.rgba.set([30,60,90,255],(y*400+x)*4);
 const budget={used:0},cache=create(image,masks,budget),result=cache.surface({x:78,y:55,w:104,h:68});
 assert.deepEqual(result.measured.box,{x:80,y:80,w:100,h:60});
 assert.ok(result.outline);assert.deepEqual(result.outline.box,{x:76,y:76,w:108,h:68});
 assert.equal(result.measured.fill,'#D2E6F5');assert.equal(result.outline.fill,'#D2E6F5');
 assert.ok(budget.used<23048);assert.ok(budget.used<=4000000);
 budget.used=4000000;assert.deepEqual(cache.surface({x:78,y:55,w:104,h:68}),result);assert.equal(budget.used,4000000);
});

test("a recovered outer node keeps a port frame bound to that exact admitted surface rather than its inner paint",()=>{
 const {measuredScenePortFill}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=76;y<144;y++)for(let x=76;x<184;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 const hint={x:78,y:55,w:104,h:68},budget={used:0},cache=create(image,[],budget),result=cache.surface(hint);
 assert.ok(result.outline);assert.ok(result.measured);assert.ok(result.outline.bodySegments);
 const used=budget.used,outer={...result.outline.box},inner={...result.measured.box},token=cache.portFrame(hint);
 assert.deepEqual(measuredScenePortFill(image,token,outer),[210,230,245]);
 assert.equal(measuredScenePortFill(image,token,inner),null);
 result.outline.box.x=0;result.outline.bodySegments.length=0;
 assert.deepEqual(measuredScenePortFill(image,cache.portFrame({...hint}),outer),[210,230,245]);
 assert.equal(measuredScenePortFill(image,structuredClone(token),outer),null);
 assert.equal(measuredScenePortFill({...image,rgba:Buffer.from(image.rgba)},token,outer),null);
 assert.equal(budget.used,used);
});

test("an incomplete enclosing stroke never gains a perimeter from its measured fill",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=76;y<144;y++)for(let x=76;x<184;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 for(let y=76;y<80;y++)for(let x=125;x<135;x++)image.rgba.set([255,255,255,255],(y*400+x)*4);
 const result=create(image,[],{used:0}).surface({x:78,y:55,w:104,h:68});
 assert.ok(result.measured);assert.equal(result.outline,null);
});

test("a secondary perimeter query cannot spend the shared compiler reserve or erase the admitted body",()=>{
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=76;y<144;y++)for(let x=76;x<184;x++)image.rgba.set([30,60,90,255],(y*400+x)*4);
 for(let y=80;y<140;y++)for(let x=80;x<180;x++)image.rgba.set([210,230,245,255],(y*400+x)*4);
 const hint={x:78,y:55,w:104,h:68},budget={used:0};const first=create(image,[],budget).surface(hint);
 const limited={used:4000000-budget.used},cache=create(image,[],limited),result=cache.surface(hint);
 assert.deepEqual(result.measured,first.measured);assert.equal(result.outline,null);
 assert.equal(cache.evidence.measuredBoundarySkippedBudget,1);assert.ok(limited.used<=4000000);
});

test("a valid tiny physical fill cannot trigger an out-of-contract secondary outline query",()=>{
 const image={width:60,height:60,rgba:Buffer.alloc(60*60*4,255)};
 for(let y=22;y<38;y++)for(let x=25;x<35;x++)image.rgba.set([140,190,230,255],(y*60+x)*4);
 const result=create(image,[],{used:0}).surface({x:24,y:20,w:12,h:20});
 assert.ok(result.measured);assert.equal(result.measured.box.w,10);assert.equal(result.outline,null);
});

function paleNodeFixture(){
 const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
 const file=path.join(__dirname,'fixtures/source-physical-body/pale-node.png');
 const metadata=JSON.parse(fs.readFileSync(file.replace('.png','.json'),'utf8'));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),metadata.fixtureSha256);
 return {...metadata,image:require('../packages/slideclone-core/png').readPng(file)};
}

test('a successful interior fill cannot hide its independently measured physical body and port perimeter',()=>{
 const f=paleNodeFixture(),budget={used:0},cache=create(f.image,f.masks,budget,undefined,true);
 const before=Buffer.from(f.image.rgba),fill=cache.fill(f.hint),result=cache.surface(f.hint);
 assert.deepEqual(fill.box,f.innerBox);assert.ok(fill.segments);assert.equal(result.outline,null);
 assert.deepEqual(result.measured.box,f.bodyBox);assert.notDeepEqual(f.bodyBox,f.innerBox);
 assert.ok(result.measured.paint?.segments.length);assert.ok(result.measured.perimeterPixels.length);
 const token=cache.portFrame(f.hint),used=budget.used;
 assert.ok(hasMeasuredScenePortFrame(f.image,token,f.bodyBox));
 assert.equal(hasMeasuredScenePortFrame(f.image,token,f.innerBox),false);
 const {measuredScenePortOwnsCell}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
 assert.ok(result.measured.perimeterPixels.some(cell=>measuredScenePortOwnsCell(f.image,token,f.bodyBox,cell)));
 assert.equal(hasMeasuredScenePortFrame(f.image,structuredClone(token),f.bodyBox),false);
 assert.equal(hasMeasuredScenePortFrame({...f.image,rgba:Buffer.from(f.image.rgba)},token,f.bodyBox),false);
 assert.equal(cache.sameSurface(f.hint,{...f.hint}),true);
 assert.equal(cache.sameSurface(f.hint,{...f.hint,x:f.hint.x+1}),false);
 const original=structuredClone(result);result.measured.box.y=0;result.measured.paint.segments.length=0;
 assert.deepEqual(cache.surface({...f.hint}),original);assert.equal(budget.used,used);
 assert.deepEqual(cache.fill(f.hint),fill);assert.deepEqual(f.image.rgba,before);
 assert.ok(cache.failureDetails(f.hint).some(failure=>failure.path==='outline'));
});

test('an optional physical-body recovery preserves the admitted paint when its scan budget is depleted',()=>{
 const f=paleNodeFixture(),budget={used:0},cache=create(f.image,f.masks,budget,undefined,true);
 assert.equal(cache.outline(f.hint),null);const fill=cache.fill(f.hint);
 assert.equal(cache.outline(fill.box),null);budget.used=4000000;
 assert.deepEqual(cache.surface(f.hint),{outline:null,measured:fill});assert.equal(budget.used,4000000);
 assert.ok(hasMeasuredScenePortFrame(f.image,cache.portFrame(f.hint),fill.box));
 assert.equal(hasMeasuredScenePortFrame(f.image,cache.portFrame(f.hint),f.bodyBox),false);
});

test('masked physical edges cannot replace a successful inner component with a proposed rectangle',()=>{
 const f=paleNodeFixture(),masks=[...f.masks,{x:38,y:36,w:49,h:5}],budget={used:0};
 const cache=create(f.image,masks,budget,undefined,true),result=cache.surface(f.hint);
 assert.equal(result.outline,null);assert.ok(result.measured);assert.equal(result.measured.perimeterPixels,undefined);
 assert.equal(hasMeasuredScenePortFrame(f.image,cache.portFrame(f.hint),f.bodyBox),false);
 const used=budget.used;assert.deepEqual(cache.surface(f.hint),result);assert.equal(budget.used,used);
});

test('physical body cache regressions are included in the unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(entry=>entry.file.replaceAll('\\','/')==='test/source-scene-measurement-cache.test.js'));
});

