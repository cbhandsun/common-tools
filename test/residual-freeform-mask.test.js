"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freeformResidualMasks}=require("../packages/slideclone-core/scene-plan/residual-freeform-mask");
const {freeformBackgroundResidualMasks}=require("../packages/slideclone-core/scene-plan/residual-freeform-mask");
const {eraseObjectMask}=require("../packages/slideclone-core/archetypes/full-slide-native-residual");
const {eraseMasks}=require("../packages/slideclone-core/scene-plan/residual-primitive-erasure");
const {auditResidualPixelOwnership}=require("../packages/slideclone-core/scene-plan/residual-pixel-ownership");
const point=(x,y)=>({x,y}),loop=points=>[{type:"moveTo",points:[points[0]]},...points.slice(1).map(p=>({type:"lnTo",points:[p]})),{type:"close",points:[]}];

test('cubic row intersections retain degenerate linear edges, horizontal tangencies and reverse winding',()=>{
 const {cubicRowCrossings}=require('../packages/slideclone-core/routing/residual-bezier-crossings');
 const line=[point(0,0),point(10,10),point(20,20),point(30,30)];
 assert.deepEqual(cubicRowCrossings(line,15),[{x:15,delta:1}]);
 assert.deepEqual(cubicRowCrossings([...line].reverse(),15),[{x:15,delta:-1}]);
 assert.deepEqual(cubicRowCrossings([point(0,5),point(10,5),point(20,5),point(30,5)],5),[]);
 const arch=[point(0,0),point(10,30),point(20,30),point(30,0)];
 assert.deepEqual(cubicRowCrossings(arch,22.5),[]);
 assert.equal(cubicRowCrossings(arch,22).length,2);assert.equal(cubicRowCrossings(arch,23).length,0);
});

test('malformed cubic controls fail without executing accessors or erasing any source cells',()=>{
 const shape={type:'freeform',box:{x:0,y:0,w:20,h:20},style:{stroke:'none',fill:'#204060',freeformSegments:[
  {type:'moveTo',points:[point(0,0)]},{type:'cubicBezTo',points:[point(.3,1),point(.7,1),point(1,0)]},
  {type:'lnTo',points:[point(0,0)]},{type:'close',points:[]}]}};
 let calls=0;const hostile={};Object.defineProperty(hostile,'x',{get(){calls++;throw Error('private');}});
 for(const invalid of [hostile,new Proxy(point(.3,1),{}),point(Infinity,0),point(-1,0),point(0,2)]){
  const candidate=structuredClone(shape);candidate.style.freeformSegments[1].points[0]=invalid;
  assert.throws(()=>freeformResidualMasks(candidate,{width:20,height:20},{w:20,h:20}),TypeError);
 }
 const missing=structuredClone(shape);missing.style.freeformSegments[1].points.pop();
 assert.throws(()=>freeformResidualMasks(missing,{width:20,height:20},{w:20,h:20}),TypeError);assert.equal(calls,0);
});

test('source-measured cubic background paths rasterize their actual interior without owning the bounding box',()=>{
 const shape={type:'freeform',box:{x:0,y:0,w:100,h:100},style:{stroke:'none',fill:'#204060',freeformSegments:[
  {type:'moveTo',points:[point(0,0)]},{type:'cubicBezTo',points:[point(1/3,1),point(2/3,1),point(1,0)]},
  {type:'lnTo',points:[point(0,0)]},{type:'close',points:[]}]}};
 const masks=freeformResidualMasks(shape,{width:100,height:100},{w:100,h:100});
 assert.equal(masks.length,75);
 for(const m of masks){const root=Math.sqrt(1-4*(m.y+.5)/300),left=100*(1-root)/2,right=100*(1+root)/2;
  assert.equal(m.x,Math.max(0,Math.ceil(left-.5)));assert.equal(m.x+m.w,Math.ceil(right-.5));}
 assert.ok(masks.reduce((s,m)=>s+m.w,0)<10000);assert.ok(masks.every(m=>m.h===1));
});
test('opposite cubic winding preserves a real curved hole and leaves outside source pixels unchanged',()=>{
 const k=.5522847498307936,segments=[...loop([point(0,0),point(1,0),point(1,1),point(0,1)]),
  {type:'moveTo',points:[point(.5,.1)]},
  {type:'cubicBezTo',points:[point(.5-.4*k,.1),point(.1,.5-.4*k),point(.1,.5)]},
  {type:'cubicBezTo',points:[point(.1,.5+.4*k),point(.5-.4*k,.9),point(.5,.9)]},
  {type:'cubicBezTo',points:[point(.5+.4*k,.9),point(.9,.5+.4*k),point(.9,.5)]},
  {type:'cubicBezTo',points:[point(.9,.5-.4*k),point(.5+.4*k,.1),point(.5,.1)]},{type:'close',points:[]}];
 const shape={type:'freeform',box:{x:5,y:5,w:25,h:25},style:{stroke:'none',fill:'#204060',freeformSegments:segments}};
 const image={width:40,height:40,rgba:Buffer.alloc(6400,255)},masks=freeformResidualMasks(shape,image,{w:40,h:40});
 const residual=eraseMasks(image,masks,{transparent:true});assert.equal(residual.rgba[(17*40+17)*4+3],255);
 assert.equal(residual.rgba[(5*40+5)*4+3],0);assert.equal(residual.rgba[3],255);
 assert.equal(auditResidualPixelOwnership({source:image,residual,masks}).passed,true);
});
function fixture(){return {type:"freeform",box:{x:5,y:5,w:20,h:20},style:{stroke:"none",fill:"#204060",freeformSegments:[
 ...loop([point(0,0),point(1,0),point(1,1),point(0,1)]),...loop([point(.2,.2),point(.2,.8),point(.8,.8),point(.8,.2)])]}};}

test('unpainted native anchors validate their winding but erase no source cells',()=>{
 const shape=fixture();shape.style.fill='none';const before=structuredClone(shape);
 const image={width:30,height:30,rgba:Buffer.alloc(3600,255)},size={w:30,h:30};
 assert.deepEqual(freeformResidualMasks(shape,image,size),[]);assert.deepEqual(eraseObjectMask(shape,image,size),[]);
 assert.deepEqual(eraseMasks(image,eraseObjectMask(shape,image,size),{transparent:true}).rgba,image.rgba);
 assert.deepEqual(shape,before);
 for(const mutate of [s=>s.style.freeformSegments.pop(),s=>s.style.freeformSegments[0].points[0].x=Infinity,
  s=>s.box.x=-1,s=>s.style.stroke='#204060',s=>s.style.fill='transparent']){
  const bad=structuredClone(shape);mutate(bad);assert.throws(()=>freeformResidualMasks(bad,image,size),TypeError);
 }
 let reads=0;const bad=structuredClone(shape);Object.defineProperty(bad.style,'fill',{get(){reads++;throw Error('private-token');}});
 assert.throws(()=>freeformResidualMasks(bad,image,size),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.equal(reads,0);
});
test('stroked freeform backgrounds erase only source-matching filled winding, preserving borders, holes and foreground',()=>{
 for(const fill of ['#204060','#8a4e21'])for(const scale of [1,2]){
  const item=fixture();item.style.fill=fill;item.style.stroke='#192633';item.style.strokeWidthPt=2;
  item.source={residualBackgroundFill:true};const before=structuredClone(item);
  const rgb=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16)),width=30*scale;
  const image={width,height:width,rgba:Buffer.alloc(width*width*4,255)};
  for(let y=5*scale;y<25*scale;y++)for(let x=5*scale;x<25*scale;x++){
   const ring=!(x>=9*scale&&x<21*scale&&y>=9*scale&&y<21*scale);
   if(ring)image.rgba.set([...rgb,255],(y*width+x)*4);
  }
  image.rgba.set([25,38,51,255],(5*scale*width+6*scale)*4);
  image.rgba.set([255,255,255,255],(6*scale*width+6*scale)*4);
  const masks=eraseObjectMask(item,image,{w:30,h:30}),residual=eraseMasks(image,masks,{transparent:true});
  assert.deepEqual(item,before);assert.ok(masks.every(m=>m.h===1&&m.w>0&&m.sourceFill.join()===rgb.join()));
  assert.equal(residual.rgba[(5*scale*width+6*scale)*4+3],255,'border survives');
  assert.equal(residual.rgba[(6*scale*width+6*scale)*4+3],255,'unowned foreground survives');
  assert.equal(residual.rgba[(7*scale*width+7*scale)*4+3],0,'matching background is erased');
  assert.equal(residual.rgba[(15*scale*width+15*scale)*4+3],255,'interior hole survives');
  assert.equal(residual.rgba[3],255,'outside pixels survive');
  assert.equal(auditResidualPixelOwnership({source:image,residual,masks}).passed,true);
  assert.throws(()=>freeformResidualMasks(item,image,{w:30,h:30}),TypeError,'ordinary filled masks still reject border ownership');
 }
});
test('freeform background projection retains geometry limits and rejects absent, malformed and unsafe evidence',()=>{
 const image={width:30,height:30},size={w:30,h:30};
 for(const change of [i=>{delete i.source;},i=>{i.source.residualBackgroundFill=false;},
  i=>{i.style.stroke='private-value';},i=>{i.style.fill='none';},i=>{i.style.freeformSegments=[];},
  i=>{i.style.freeformSegments.pop();},i=>{i.box.w=100;},
  i=>{i.style.freeformSegments=Array(121).fill(i.style.freeformSegments[0]);}]){
  const item=fixture();item.source={residualBackgroundFill:true};change(item);
  assert.throws(()=>freeformBackgroundResidualMasks(item,image,size),e=>!e.message.includes('private-value'));
 }
 for(const item of [null,{},new Proxy({}, {})])assert.throws(()=>freeformBackgroundResidualMasks(item,image,size),TypeError);
 let calls=0;const item=fixture();Object.defineProperty(item,'source',{get(){calls++;throw Error('private');}});
 assert.throws(()=>freeformBackgroundResidualMasks(item,image,size),TypeError);assert.equal(calls,0);
 const empty=fixture();empty.source={residualBackgroundFill:true};empty.box={x:0,y:0,w:.01,h:.01};
 assert.deepEqual(freeformBackgroundResidualMasks(empty,image,size),[]);
 const extreme=fixture();extreme.source={residualBackgroundFill:true};extreme.box={x:0,y:0,w:100,h:16000};
 extreme.style.freeformSegments=[...loop([point(0,0),point(1,0),point(1,1),point(0,1)])];
 for(const x of [.1,.4,.7])extreme.style.freeformSegments.push(...loop([point(x,.1),point(x,.9),point(x+.1,.9),point(x+.1,.1)]));
 assert.throws(()=>freeformBackgroundResidualMasks(extreme,{width:100,height:16000},{w:100,h:16000}),/count exceeds/);
});
test("native hollow paths own only their filled winding and preserve all interior source graphics",()=>{
 const item=fixture(),image={width:30,height:30,rgba:Buffer.alloc(30*30*4,255)},masks=eraseObjectMask(item,image,{w:30,h:30});
 assert.ok(Array.isArray(masks));assert.equal(masks.reduce((n,m)=>n+m.w*m.h,0),256);
 for(let y=5;y<25;y++)for(let x=5;x<25;x++)image.rgba.set(x>=9&&x<21&&y>=9&&y<21?[220,60,90,255]:[32,64,96,255],(y*30+x)*4);
 const residual=eraseMasks(image,masks,{transparent:true});
 for(let y=0;y<30;y++)for(let x=0;x<30;x++){
  const ring=x>=5&&x<25&&y>=5&&y<25&&!(x>=9&&x<21&&y>=9&&y<21),i=(y*30+x)*4;
  if(ring)assert.equal(residual.rgba[i+3],0);else assert.deepEqual(residual.rgba.subarray(i,i+4),image.rgba.subarray(i,i+4));
 }
 assert.equal(auditResidualPixelOwnership({source:image,residual,masks}).passed,true);
});
test("filled and opposite nested winding follow the native nonzero rule under source scaling",()=>{
 const item=fixture();item.style.freeformSegments=item.style.freeformSegments.slice(0,5);
 assert.equal(freeformResidualMasks(item,{width:60,height:60},{w:30,h:30}).reduce((n,m)=>n+m.w*m.h,0),1600);
 const empty=fixture();empty.style.freeformSegments=[];assert.throws(()=>freeformResidualMasks(empty,{width:30,height:30},{w:30,h:30}),/loop/);
});
test("open, curved, overflow and unsafe freeform inputs fail without guessing bounding ownership",()=>{
 for(const change of [v=>v.style.freeformSegments.pop(),v=>v.style.freeformSegments[0].type="cubicBezTo",
  v=>v.style.freeformSegments[0].points[0].x=Infinity,v=>v.style.freeformSegments[0].points[0].x=-1,
  v=>v.style.freeformSegments=Array(121).fill(v.style.freeformSegments[0]),v=>v.box.w=100,v=>v.style.stroke="#000000",v=>v.style.fill="private-token"]){
  const item=fixture();change(item);assert.throws(()=>freeformResidualMasks(item,{width:30,height:30},{w:30,h:30}),e=>!e.message.includes("private-token"));
 }
 let calls=0;const item=fixture();Object.defineProperty(item.style.freeformSegments[0],"type",{get(){calls++;throw Error("private-token");}});
 assert.throws(()=>freeformResidualMasks(item,{width:30,height:30},{w:30,h:30}),/invalid/);assert.equal(calls,0);
 const proxied=fixture();proxied.style.freeformSegments=new Proxy(proxied.style.freeformSegments,{});
 assert.throws(()=>freeformResidualMasks(proxied,{width:30,height:30},{w:30,h:30}),/invalid/);
});
test("freeform row masks retain the existing total mask ceiling for extreme hollow geometry",()=>{
 const item=fixture();item.box={x:0,y:0,w:100,h:16000};
 item.style.freeformSegments=[...loop([point(0,0),point(1,0),point(1,1),point(0,1)])];
 for(const x of [.1,.4,.7])item.style.freeformSegments.push(...loop([point(x,.1),point(x,.9),point(x+.1,.9),point(x+.1,.1)]));
 assert.throws(()=>freeformResidualMasks(item,{width:100,height:16000},{w:100,h:16000}),/count exceeds/);
});
