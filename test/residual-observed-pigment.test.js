'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileResidualTextMask,compileBoundedResidualTextMask}=require('../packages/slideclone-core/typography/residual-text-mask');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {auditResidualPixelOwnership}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');
function fixture(shift=0,light=false){
 const source={width:70+shift,height:40+shift,rgba:Buffer.alloc((70+shift)*(40+shift)*4,light?0:255)};
 const background=light?[0,0,0]:[255,255,255],pigment=light?[195,235,245]:[60,20,10],native=light?[255,255,255]:[0,0,0];
 for(let i=3;i<source.rgba.length;i+=4)source.rgba[i]=255;
 const put=(x,y,color)=>source.rgba.set([...color,255],((y+shift)*source.width+x+shift)*4);
 const fringe=pigment.map((v,c)=>Math.round(v*.5+background[c]*.5));
 for(let y=13;y<25;y++){for(let x=20;x<23;x++)put(x,y,pigment);put(23,y,fringe);}
 return {source,put,background,pigment,fringe,mask:{x:8+shift,y:6+shift,w:44,h:28,
  textInk:{color:native,polygon:[[18,11],[25,11],[25,27],[18,27]].map(p=>p.map(v=>v+shift))}}};
}
test('source pigment calibrates attached fringe when fitted native paint differs, for dark and light ink',()=>{
 for(const shift of [0,5])for(const light of [false,true]){
  const f=fixture(shift,light),before=Buffer.from(f.source.rgba);
  const plan=compileResidualTextMask(f.source,f.mask,f.mask.textInk);
  assert.equal(plan.corePixels,36);assert.equal(plan.ownedPixels,48);
  const residual=eraseMasks(f.source,[f.mask],{transparent:true});
  for(let y=13;y<25;y++)assert.deepEqual([...residual.rgba.subarray(((y+shift)*f.source.width+23+shift)*4,((y+shift)*f.source.width+23+shift)*4+3)],f.background);
  assert.equal(auditResidualPixelOwnership({source:f.source,residual,masks:[f.mask]}).passed,true);
  assert.deepEqual(f.source.rgba,before);
 }
});
test('observed fringe cannot invent a core or erase unattached, clipped or conflicting graphics',()=>{
 const f=fixture();f.put(38,17,f.fringe);
 let plan=compileResidualTextMask(f.source,f.mask,f.mask.textInk);assert.equal(plan.ownedPixels,48);
 assert.equal(plan.owned[(17-f.mask.y)*f.mask.w+38-f.mask.x],0);
 for(let y=6;y<25;y++)f.put(24,y,f.pigment);
 plan=compileResidualTextMask(f.source,f.mask,f.mask.textInk);
 assert.ok(plan.rejectedBoundaryPixels>0);
 assert.equal(plan.owned[(17-f.mask.y)*f.mask.w+23-f.mask.x],0);
 const empty=fixture();
 for(let y=13;y<25;y++)for(let x=20;x<23;x++)empty.put(x,y,empty.background);
 assert.equal(compileResidualTextMask(empty.source,empty.mask,empty.mask.textInk).ownedPixels,0);
});
test('new fringe consumes the existing entire candidate allowance and preserves unchanged validation',()=>{
 const f=fixture();
 assert.equal(compileBoundedResidualTextMask(f.source,f.mask,f.mask.textInk,{remainingOwned:47,backgroundColor:f.background}),null);
 assert.equal(compileBoundedResidualTextMask(f.source,f.mask,f.mask.textInk,{remainingOwned:48,backgroundColor:f.background}).ownedPixels,48);
 assert.throws(()=>compileResidualTextMask(f.source,{...f.mask,w:262145},f.mask.textInk),/budget/);
 const hostile=new Proxy(f.source,{});assert.throws(()=>compileResidualTextMask(hostile,f.mask,f.mask.textInk),TypeError);
});
