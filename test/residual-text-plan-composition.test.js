"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {eraseMasks}=require("../packages/slideclone-core/residual-primitive-erasure");
const {residualTextPlans}=require("../packages/slideclone-core/residual-text-erasure");
const {auditResidualPixelOwnership:audit}=require("../packages/slideclone-core/residual-pixel-ownership");
const {eraseObjectMask}=require("../packages/slideclone-core/full-slide-native-residual");
function fixture(scale=1,shift=0){
 const width=80*scale+shift,height=50*scale+shift,source={width,height,rgba:Buffer.alloc(width*height*4,255)};
 const paint=(x,y,w,h,color)=>{for(let py=y*scale+shift;py<(y+h)*scale+shift;py++)for(let px=x*scale+shift;px<(x+w)*scale+shift;px++)source.rgba.set([...color,255],(py*width+px)*4);};
 paint(4,4,72,42,[240,240,240]);paint(25,18,3,12,[20,20,20]);paint(28,18,1,12,[210,210,210]);
 const text={x:12*scale+shift,y:10*scale+shift,w:40*scale,h:28*scale,textInk:{color:[20,20,20],polygon:[[23,16],[32,16],[32,32],[23,32]].map(p=>p.map(v=>v*scale+shift))}};
 return {source,paint,text,scale,shift};
}
test("optional glyph context cannot exceed the existing region budget or erase unresolved connected ink",()=>{
 const source={width:1000,height:600,rgba:Buffer.alloc(1000*600*4,255)};
 for(let x=0;x<1000;x++)for(let y=250;y<253;y++)source.rgba.set([20,20,20,255],(y*1000+x)*4);
 const mask={x:100,y:100,w:600,h:400,textInk:{color:[20,20,20],polygon:[[150,200],[650,200],[650,400],[150,400]]}};
 const before=Buffer.from(source.rgba),plans=residualTextPlans(source,[mask]);
 assert.equal(plans.length,1);assert.deepEqual(plans[0].bounds,{x:100,y:100,w:600,h:400});
 assert.equal(plans[0].contextExtension.reason,"region-budget");assert.equal(plans[0].contextExtension.accepted,false);
 assert.ok(plans[0].rejectedBoundaryPixels>0);assert.equal(plans[0].ownedPixels,0);assert.deepEqual(source.rgba,before);
 assert.equal(plans[0].scannedPixels,340000);
});
test("touching measured text rows provide complete context without granting graphics ownership",()=>{
 const source={width:100,height:80,rgba:Buffer.alloc(32000,255)};
 const paint=(x,y,w,h)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)source.rgba.set([20,20,20,255],(j*100+i)*4);};
 paint(30,20,40,4);paint(40,24,3,16);
 const upper={x:27,y:17,w:46,h:10,textInk:{color:[20,20,20],polygon:[[29,19],[71,19],[71,25],[29,25]]}};
 const lower={x:36,y:26,w:12,h:18,textInk:{color:[20,20,20],polygon:[[39,27],[44,27],[44,42],[39,42]]}};
 const first=eraseMasks(source,[upper,lower],{transparent:true}),second=eraseMasks(source,[lower,upper],{transparent:true});
 assert.equal(audit({source,residual:first,masks:[upper,lower]}).passed,true);
 assert.deepEqual(first,second);
 paint(0,21,100,2);
 const connected=eraseMasks(source,[upper,lower],{transparent:true});
 assert.equal(audit({source,residual:connected,masks:[upper,lower]}).passed,false);
});
test("source-backed text antialias has priority over a nearby panel fill color",()=>{
 for(const [scale,shift] of [[1,0],[2,5]]){
  const f=fixture(scale,shift),panel={x:4*scale+shift,y:4*scale+shift,w:72*scale,h:42*scale,sourceFill:[200,200,200]};
  const result=eraseMasks(f.source,[panel,f.text],{transparent:true});
  const o=((20*scale+shift)*f.source.width+28*scale+shift)*4;
  assert.deepEqual([...result.rgba.subarray(o,o+4)],[240,240,240,255],"a similar source fringe is not evidence that a panel owns its background");
  assert.equal(audit({source:f.source,residual:result,masks:[panel,f.text]}).passed,true);
  assert.deepEqual(result,eraseMasks(f.source,[f.text,panel],{transparent:true}));
 }
});
test("overlapping text plans assign each pixel once independent of input order",()=>{
 const f=fixture();f.paint(48,4,28,42,[230,235,240]);
 const second={...f.text,x:24,w:44,textInk:{...f.text.textInk,polygon:[[24,15],[36,15],[36,33],[24,33]]}};
 const forward=eraseMasks(f.source,[f.text,second],{transparent:true}),reverse=eraseMasks(f.source,[second,f.text],{transparent:true});
 assert.deepEqual(forward,reverse);
 for(const masks of [[f.text,second],[second,f.text]]){
  const owned=new Set();
  for(const plan of residualTextPlans(f.source,masks))for(let i=0;i<plan.owned.length;i++)if(plan.owned[i]){
   const index=(plan.bounds.y+Math.floor(i/plan.bounds.w))*f.source.width+plan.bounds.x+i%plan.bounds.w;
   assert.equal(owned.has(index),false,"two plans must not publish different values for one pixel");owned.add(index);
  }
  assert.equal(audit({source:f.source,residual:forward,masks}).passed,true);
 }
});
test("matching native backgrounds still own text holes and forged visible fringe fails audit",()=>{
 const f=fixture(),panel={x:4,y:4,w:72,h:42,sourceFill:[240,240,240]},masks=[f.text,panel];
 const result=eraseMasks(f.source,masks,{transparent:true}),o=(20*f.source.width+28)*4;
 assert.equal(result.rgba[o+3],0);assert.equal(audit({source:f.source,residual:result,masks}).passed,true);
 result.rgba.set(f.source.rgba.subarray(o,o+4),o);
 assert.equal(audit({source:f.source,residual:result,masks}).passed,false);
});
test("neighboring colored text cannot nominate itself as the background of another line",()=>{
 const source={width:70,height:50,rgba:Buffer.alloc(70*50*4,255)};
 const paint=(x,y,w,h,c)=>{for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)source.rgba.set([...c,255],(py*70+px)*4);};
 paint(15,10,30,8,[100,150,200]);paint(22,19,5,12,[20,20,20]);
 const upper={x:8,y:4,w:45,h:22,textInk:{color:[100,150,200],polygon:[[14,9],[46,9],[46,18],[14,18]]}};
 const lower={x:12,y:12,w:38,h:27,textInk:{color:[20,20,20],polygon:[[21,19],[28,19],[28,32],[21,32]]}};
 const result=eraseMasks(source,[upper,lower],{transparent:true});
 for(let y=19;y<31;y++)for(let x=22;x<27;x++)assert.deepEqual([...result.rgba.subarray((y*70+x)*4,(y*70+x)*4+4)],[255,255,255,255]);
 assert.equal(audit({source,residual:result,masks:[upper,lower]}).passed,true);
});
test("bounded local context follows a truncated glyph while an unbounded connector remains unresolved",()=>{
 for(const scale of [1,2]){
  const width=200*scale,height=90*scale,source={width,height,rgba:Buffer.alloc(width*height*4,255)};
  const draw=(right)=>{for(let y=27*scale;y<42*scale;y++)for(let x=68*scale;x<right*scale;x++)source.rgba.set([20,20,20,255],(y*width+x)*4);};
  draw(86);
  const item={text:"Text",font:{color:"#141414"},box:{x:50*scale,y:20*scale,w:24*scale,h:30*scale}};
  const mask=eraseObjectMask(item,source,{w:width,h:height}),result=eraseMasks(source,[mask],{transparent:true});
  assert.equal(audit({source,residual:result,masks:[mask]}).passed,true);
  assert.deepEqual([...result.rgba.subarray((30*scale*width+84*scale)*4,(30*scale*width+84*scale)*4+4)],[255,255,255,255]);
  draw(199);
  const rejected=eraseMasks(source,[mask],{transparent:true});
  assert.equal(audit({source,residual:rejected,masks:[mask]}).passed,false);
  assert.deepEqual(rejected.rgba,source.rgba);
 }
});
test("plan input admission rejects accessors and proxy masks without reading caller code",()=>{
 const f=fixture();let reads=0;const hostile={};Object.defineProperty(hostile,"textInk",{get(){reads++;throw Error("private-token");},enumerable:true});
 for(const masks of [null,{},new Proxy([f.text],{}),[hostile],[new Proxy(f.text,{})],[{...f.text,x:NaN}],Array(30001).fill(f.text)]){
  assert.throws(()=>residualTextPlans(f.source,masks),e=>/invalid|limit/.test(e.message)&&!e.message.includes("private"));
 }
 assert.equal(reads,0);assert.deepEqual(residualTextPlans(f.source,[]),[]);
});
