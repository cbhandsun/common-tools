"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const {auditResidualPixelOwnership:audit}=require("../packages/slideclone-core/scene-plan/residual-pixel-ownership");
const {eraseMasks}=require("../packages/slideclone-core/scene-plan/residual-primitive-erasure");
function fixture() {
  const source={width:40,height:30,rgba:Buffer.alloc(40*30*4,255)};
  for(let y=10;y<14;y++) for(let x=10;x<14;x++) source.rgba.fill(20,(y*40+x)*4,(y*40+x)*4+3);
  return {source,masks:[{x:8,y:8,w:8,h:8}]};
}
test("actual owned foreground is removed, independent of claimed object counters",()=>{
  const f=fixture(), result=audit({...f,residual:eraseMasks(f.source,f.masks),erasedObjects:999});
  assert.equal(result.passed,true); assert.equal(result.ownedForegroundPixels,16); assert.equal(result.remainingOwnedForegroundPixels,0);
  const noOp=audit({...f,residual:f.source,erasedObjects:999});
  assert.equal(noOp.passed,false); assert.equal(noOp.remainingOwnedForegroundPixels,16);
  const almostNoOp=structuredClone(f.source); almostNoOp.rgba[10*40*4+10*4]++;
  assert.equal(audit({...f,residual:almostNoOp}).passed,false);
});
test("transparent erasure passes while changes outside owned masks fail",()=>{
  const f=fixture(), residual=structuredClone(f.source);
  for(let y=8;y<16;y++) for(let x=8;x<16;x++) residual.rgba[(y*40+x)*4+3]=0;
  assert.equal(audit({...f,residual}).passed,true);
  residual.rgba[0]=0;
  assert.equal(audit({...f,residual}).unownedChangedPixels,1);
});
test("overlapping erasures never reintroduce a native panel fill from the original source",()=>{
  const source={width:80,height:60,rgba:Buffer.alloc(80*60*4,255)}, panel={x:20,y:15,w:40,h:30}, text={x:30,y:25,w:15,h:8};
  for(let y=15;y<45;y++) for(let x=20;x<60;x++) {const o=(y*80+x)*4; source.rgba[o]=40; source.rgba[o+1]=80; source.rgba[o+2]=160;}
  const masks=[panel,text], before=Buffer.from(source.rgba);
  assert.equal(audit({source,residual:eraseMasks(source,masks),masks}).passed,false);
  const residual=eraseMasks(source,masks,{sampleErasedBackground:true});
  assert.equal(audit({source,residual,masks}).passed,true);
  const transparent=eraseMasks(source,masks,{transparent:true});
  assert.equal(audit({source,residual:transparent,masks}).passed,true);
  assert.equal(transparent.rgba[(25*80+30)*4+3],0);
  assert.equal(transparent.rgba[3],255);
  assert.deepEqual(source.rgba,before);
  assert.throws(()=>eraseMasks(source,masks,{sampleErasedBackground:"yes"}),/invalid/);
});
test("empty and overlapping masks count unique owned pixels; malformed inputs fail closed",()=>{
  const f=fixture();
  assert.equal(audit({...f,residual:f.source,masks:[]}).passed,true);
  assert.equal(audit({...f,residual:eraseMasks(f.source,f.masks),masks:[...f.masks,...f.masks]}).ownedForegroundPixels,16);
  for(const input of [null,{}, {...f,residual:f.source,masks:[{x:NaN,y:0,w:1,h:1}]},{...f,residual:f.source,masks:[{x:0,y:0,w:-1,h:1}]}, {...f,residual:{...f.source,width:41}}]) assert.throws(()=>audit(input),/invalid|differ/);
  const hostile={}; Object.defineProperty(hostile,"source",{get(){throw new Error("private-token");},enumerable:true});
  assert.throws(()=>audit(hostile),/masks are invalid/);
  assert.throws(()=>audit({...f,residual:f.source,masks:Array(30001).fill(f.masks[0])}),/invalid/);
});
