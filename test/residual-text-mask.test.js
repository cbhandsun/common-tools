"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseResidualTextInk,compileResidualTextMask,compileBoundedResidualTextMask}=require("../packages/slideclone-core/residual-text-mask");
const {eraseMasks}=require("../packages/slideclone-core/residual-primitive-erasure");
const {auditResidualPixelOwnership:audit}=require("../packages/slideclone-core/residual-pixel-ownership");
const {eraseObjectMask}=require("../packages/slideclone-core/full-slide-native-residual");
function fixture(scale=1,shift=0,color=[20,30,40],left=[200,230,210],right=[240,210,230]) {
  const width=100*scale+shift,height=60*scale+shift,source={width,height,rgba:Buffer.alloc(width*height*4,255)};
  for(let y=6*scale+shift;y<54*scale+shift;y++)for(let x=6*scale+shift;x<94*scale+shift;x++) source.rgba.set([...(x<50*scale+shift?left:right),255],(y*width+x)*4);
  const glyphs=[];
  for(const gx of [20,38,56,74])for(let y=22*scale+shift;y<36*scale+shift;y++)for(let x=gx*scale+shift;x<(gx+3)*scale+shift;x++) {
    source.rgba.set([...color,255],(y*width+x)*4);glyphs.push([x,y]);
  }
  const bounds={x:10*scale+shift,y:16*scale+shift,w:80*scale,h:26*scale};
  const ink=parseResidualTextInk({color,polygon:[[18,20],[79,20],[79,38],[18,38]].map(p=>p.map(v=>v*scale+shift))});
  return {source,bounds,ink,glyphs};
}

test('a rare independently witnessed target retains one of the original eight background slots',()=>{
 const source={width:220,height:100,rgba:Buffer.alloc(220*100*4,255)};
 const paint=(x,y,color)=>source.rgba.set([...color,255],(y*220+x)*4);
 for(let band=0;band<8;band++)for(let y=0;y<60;y++)for(let x=band*25;x<(band+1)*25;x++)paint(x,y,[240,240,40+band*24]);
 const fill=[250,180,210];
 for(let y=65;y<92;y++)for(let x=90;x<130;x++)paint(x,y,fill);
 for(let y=72;y<86;y++)for(let x=104;x<108;x++)paint(x,y,[0,0,0]);
 const bounds={x:0,y:0,w:220,h:100},ink={color:[0,0,0],polygon:[[100,70],[112,70],[112,88],[100,88]]},before=Buffer.from(source.rgba);
 const options={remainingOwned:100000,backgroundColor:fill},plan=compileBoundedResidualTextMask(source,bounds,ink,options);
 assert.ok(plan);assert.equal(plan.backgroundModes,8);assert.equal(plan.ownedPixels,56);
 assert.equal(compileBoundedResidualTextMask(source,bounds,ink,{...options,remainingOwned:55}),null);
 assert.equal(compileBoundedResidualTextMask(source,bounds,ink,{...options,backgroundColor:[40,250,70]}),null);
 assert.deepEqual(source.rgba,before);
});

test('bounded paint proofs preserve their complete population and leave other backgrounds unowned',()=>{
 const f=fixture(3),before=Buffer.from(f.source.rgba),original=compileResidualTextMask(f.source,f.bounds,f.ink);
 assert.ok(f.bounds.w*f.bounds.h>original.ownedPixels);
 const options={backgroundColor:[200,230,210],remainingOwned:original.ownedPixels};
 const scoped=compileBoundedResidualTextMask(f.source,f.bounds,f.ink,options);assert.ok(scoped);
 assert.equal(scoped.ownedPixels,original.ownedPixels/2);
 for(const [x,y]of f.glyphs)assert.equal(scoped.owned[(y-f.bounds.y)*f.bounds.w+x-f.bounds.x],x<150?1:0);
 assert.deepEqual(compileBoundedResidualTextMask(f.source,f.bounds,f.ink,{...options,remainingOwned:scoped.ownedPixels}),scoped);
 assert.equal(compileBoundedResidualTextMask(f.source,f.bounds,f.ink,{...options,remainingOwned:scoped.ownedPixels-1}),null);
 assert.equal(compileBoundedResidualTextMask(f.source,f.bounds,f.ink,{...options,remainingOwned:0}),null);
 assert.equal(compileBoundedResidualTextMask(f.source,f.bounds,f.ink,{...options,backgroundColor:[0,0,255]}),null);
 assert.deepEqual(compileResidualTextMask(f.source,f.bounds,f.ink),original);
 assert.deepEqual(f.source.rgba,before);
});

test('bounded glyph controls reject invalid, sparse and hostile input without reading getters',()=>{
 const f=fixture();let calls=0;const hostile={get remainingOwned(){calls++;throw Error('secret');}};
 const good={remainingOwned:100000,backgroundColor:[200,230,210]};
 for(const options of [null,{},hostile,new Proxy(good,{}),{...good,remainingOwned:100001},{...good,remainingOwned:-1},
  {...good,remainingOwned:Infinity},{...good,remainingOwned:.5},{...good,backgroundColor:new Array(3)},
  {...good,backgroundColor:new Proxy([200,230,210],{})},{...good,extra:true}])
  assert.throws(()=>compileBoundedResidualTextMask(f.source,f.bounds,f.ink,options),TypeError);
 assert.equal(calls,0);
});

test('a large sparse glyph window keeps the unchanged owned population limit',()=>{
 const source={width:500,height:250,rgba:Buffer.alloc(500*250*4,255)};
 for(let y=80;y<160;y++)for(let x=200;x<204;x++)source.rgba.set([0,0,0,255],(y*500+x)*4);
 const bounds={x:0,y:0,w:500,h:250},ink={color:[0,0,0],polygon:[[190,70],[220,70],[220,170],[190,170]]};
 const original=compileResidualTextMask(source,bounds,ink);
 assert.equal(original.ownedPixels,320);
 assert.deepEqual(compileBoundedResidualTextMask(source,bounds,ink,{remainingOwned:320,backgroundColor:[255,255,255]}),original);
 assert.equal(compileBoundedResidualTextMask(source,bounds,ink,{remainingOwned:319,backgroundColor:[255,255,255]}),null);
});

test('candidate populations above the original 100000 ceiling are rejected whole',()=>{
 const source={width:600,height:300,rgba:Buffer.alloc(600*300*4,255)};
 for(let y=30;y<230;y++)for(let x=20;x<580;x++)source.rgba.set([0,0,0,255],(y*600+x)*4);
 const bounds={x:0,y:0,w:600,h:300},ink={color:[0,0,0],polygon:[[15,25],[585,25],[585,235],[15,235]]};
 assert.equal(compileResidualTextMask(source,bounds,ink).ownedPixels,112000);
 assert.equal(compileBoundedResidualTextMask(source,bounds,ink,{remainingOwned:100000,backgroundColor:[255,255,255]}),null);
});
test("antialias between two admitted glyph strokes is erased without authorizing a graphic tie",()=>{
 const source={width:30,height:24,rgba:Buffer.alloc(30*24*4,255)};
 const put=(x,y,v)=>source.rgba.set([v,v,v,255],(y*30+x)*4);
 for(let y=9;y<15;y++){put(12,y,20);put(13,y,150);put(14,y,20);}
 const mask={x:3,y:3,w:24,h:18,textInk:{color:[20,20,20],polygon:[[10,7],[17,7],[17,17],[10,17]]}};
 const result=eraseMasks(source,[mask],{transparent:true});
 for(let y=9;y<15;y++)assert.equal(result.rgba[(y*30+13)*4],255);
 for(let y=0;y<15;y++)put(14,y,20);
 const rejected=eraseMasks(source,[mask],{transparent:true});
 assert.equal(rejected.rgba[(11*30+13)*4],150,"a rejected graphic witness must preserve the tie");
 assert.equal(audit({source,residual:rejected,masks:[mask]}).passed,false);
});
test("text owns measured glyph ink across multiple backgrounds, not its bounding rectangle",()=>{
  for(const variant of [[1,0],[2,3],[3,7]]){
    const f=fixture(...variant),plan=compileResidualTextMask(f.source,f.bounds,f.ink);
    assert.equal(plan.ownedPixels,f.glyphs.length);
    for(const [x,y] of f.glyphs) assert.equal(plan.owned[(y-f.bounds.y)*f.bounds.w+x-f.bounds.x],1);
    assert.ok(plan.backgroundModes>=2);assert.equal(plan.rejectedBoundaryPixels,0);
    const index=(26*variant[0]+variant[1]-f.bounds.y)*f.bounds.w+30*variant[0]+variant[1]-f.bounds.x;
    assert.equal(plan.owned[index],0,"background between glyphs is unowned");
  }
});
test("measured ownership is invariant to font and background color changes including white ink",()=>{
  for(const colors of [[[210,220,230],[20,40,60],[50,40,20]],[[30,80,130],[230,230,240],[220,240,220]]]){
    const f=fixture(1,0,...colors),plan=compileResidualTextMask(f.source,f.bounds,f.ink);
    assert.equal(plan.ownedPixels,f.glyphs.length);
  }
});
test("antialias belongs to seeded glyphs while unrelated and boundary-connected ink stays intact",()=>{
  const f=fixture();
  for(let y=22;y<36;y++)f.source.rgba.set([110,130,125,255],(y*f.source.width+23)*4);
  for(let y=17;y<19;y++)for(let x=30;x<33;x++)f.source.rgba.set([20,30,40,255],(y*f.source.width+x)*4);
  for(let x=10;x<90;x++)f.source.rgba.set([20,30,40,255],(39*f.source.width+x)*4);
  const plan=compileResidualTextMask(f.source,f.bounds,f.ink);
  assert.equal(plan.ownedPixels,f.glyphs.length+14);
  assert.equal(plan.owned[(17-f.bounds.y)*f.bounds.w+30-f.bounds.x],0);
  assert.equal(plan.owned[(39-f.bounds.y)*f.bounds.w+25-f.bounds.x],0);
});
test("empty or unsupported ink produces no invented ownership",()=>{
  const f=fixture();f.source.rgba.fill(255);
  const plan=compileResidualTextMask(f.source,f.bounds,f.ink);assert.equal(plan.ownedPixels,0);
  assert.equal(parseResidualTextInk(undefined),undefined);
  assert.throws(()=>compileResidualTextMask(f.source,{x:0,y:0,w:40000001,h:1},f.ink),/budget/);
});
test("invalid and hostile text evidence fails without executing accessors or exposing content",()=>{
  let calls=0;const hostile={};Object.defineProperty(hostile,"polygon",{get(){calls++;throw Error("private-token");},enumerable:true});
  const valid={color:[0,0,0],polygon:[[1,1],[8,1],[8,8],[1,8]]};
  for(const value of [null,{},hostile,new Proxy(valid,{}),{...valid,color:[-1,0,0]},{...valid,polygon:[[1,1],[8,1],[8,8],[Infinity,8]]},{...valid,polygon:[[1,1],[1,1],[1,1],[1,1]]}]){
    assert.throws(()=>parseResidualTextInk(value),e=>/invalid/.test(e.message)&&!e.message.includes("private"));
  }
  assert.equal(calls,0);
});
test("production text masks preserve background and the audit rejects legacy rectangle erasure",()=>{
  const f=fixture(),text={text:"Editable",font:{color:"#141E28"},box:{x:18,y:20,w:61,h:18},source:{evidenceBox:{x:18,y:20,w:61,h:18}}};
  const mask=eraseObjectMask(text,f.source,{w:100,h:60}),residual=eraseMasks(f.source,[mask],{transparent:true});
  const offset=(27*100+30)*4;
  assert.deepEqual(residual.rgba.subarray(offset,offset+4),f.source.rgba.subarray(offset,offset+4));
  assert.equal(audit({source:f.source,residual,masks:[mask]}).passed,true);
  assert.equal(audit({source:f.source,residual:f.source,masks:[mask]}).passed,false);
  const legacy=eraseMasks(f.source,[{x:mask.x,y:mask.y,w:mask.w,h:mask.h}],{transparent:true});
  const report=audit({source:f.source,residual:legacy,masks:[mask]});
  assert.equal(report.passed,false);assert.ok(report.unownedChangedPixels>0);
});
test("text over a native background becomes transparent in either mask order",()=>{
  const f=fixture(),text={...f.bounds,textInk:f.ink},panel={x:6,y:6,w:44,h:48,sourceFill:[200,230,210]};
  const first=eraseMasks(f.source,[text,panel],{transparent:true}),second=eraseMasks(f.source,[panel,text],{transparent:true});
  assert.deepEqual(first,second);assert.equal(first.rgba[(26*100+20)*4+3],0);
  assert.equal(first.rgba[(26*100+56)*4+3],255);
  assert.equal(audit({source:f.source,residual:first,masks:[text,panel]}).passed,true);
});

test("a native panel corroborates background hidden by an entire OCR polygon",()=>{
 const source={width:80,height:50,rgba:Buffer.alloc(80*50*4,255)},fill=[220,170,205];
 for(let y=15;y<35;y++)for(let x=20;x<60;x++)source.rgba.set([...fill,255],(y*80+x)*4);
 for(let y=19;y<31;y++)for(let x=36;x<40;x++)source.rgba.set([20,20,20,255],(y*80+x)*4);
 const text={x:14,y:9,w:52,h:32,textInk:{color:[20,20,20],polygon:[[20,15],[60,15],[60,35],[20,35]]}};
 const panel={x:20,y:15,w:40,h:20,sourceFill:fill},before=Buffer.from(source.rgba);
 const first=eraseMasks(source,[text,panel],{transparent:true}),second=eraseMasks(source,[panel,text],{transparent:true});
 assert.equal(first.rgba[(25*80+38)*4+3],0,"a white glyph-shaped backplate must not cover the independently rebuilt pink panel");
 assert.deepEqual(first,second);assert.deepEqual(source.rgba,before);
 assert.equal(audit({source,residual:first,masks:[text,panel]}).passed,true);
});
test("boundary-connected source core is rejected by the audit even if erasure reports success",()=>{
  const f=fixture();for(let x=10;x<90;x++)f.source.rgba.set([20,30,40,255],(25*100+x)*4);
  const mask={...f.bounds,textInk:f.ink},residual=eraseMasks(f.source,[mask],{transparent:true}),report=audit({source:f.source,residual,masks:[mask]});
  assert.equal(report.passed,false);assert.ok(report.remainingTextCorePixels>0);
});
test("faint antialias bridges do not merge independent text and boundary-connected graphics",()=>{
 const source={width:80,height:60,rgba:Buffer.alloc(80*60*4,255)};
 const put=(x,y,v)=>source.rgba.set([v,v,v,255],(y*80+x)*4);
 for(let y=20;y<30;y++)for(let x=30;x<35;x++)put(x,y,20);
 for(let x=5;x<75;x++)put(x,12,20);
 for(let y=13;y<20;y++)put(32,y,236);
 const mask={x:5,y:5,w:70,h:45,textInk:{color:[20,20,20],polygon:[[28,18],[38,18],[38,32],[28,32]]}};
 const residual=eraseMasks(source,[mask],{transparent:true});
 assert.equal(residual.rgba[(24*80+32)*4],255,"real glyph must be removed");
 for(let x=5;x<75;x++)assert.equal(residual.rgba[(12*80+x)*4],20,"graphic line must stay intact");
 assert.equal(audit({source,residual,masks:[mask]}).passed,true);
 for(let y=13;y<20;y++)put(32,y,20);
 const connected=eraseMasks(source,[mask],{transparent:true});
 assert.equal(audit({source,residual:connected,masks:[mask]}).passed,false,"solid connections still require an independent owner");
});
test("text context rejects malformed, oversized, shared and hostile buffers without getters",()=>{
 const f=fixture();let calls=0;const hostile={};Object.defineProperty(hostile,"buffer",{get(){calls++;throw Error("private-token");}});
 for(const value of [null,[],hostile,new Proxy(new Uint8Array(6000),{}),new Uint8Array(1),new Uint8Array(new SharedArrayBuffer(6000))]){
  assert.throws(()=>compileResidualTextMask(f.source,f.bounds,f.ink,value),e=>/context is invalid/.test(e.message)&&!e.message.includes("private"));
 }
 assert.equal(calls,0);
 const bytes=Buffer.from(f.source.rgba),context=new Uint8Array(6000),before=context.slice();
 compileResidualTextMask(f.source,f.bounds,f.ink,context);
 assert.deepEqual(f.source.rgba,bytes);assert.deepEqual(context,before);
});
