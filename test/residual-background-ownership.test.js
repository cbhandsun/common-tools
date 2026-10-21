"use strict";
const assert=require("node:assert/strict"),test=require("node:test"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const { readPng,writePng }=require("../packages/slideclone-core/png");
const { eraseMasks }=require("../packages/slideclone-core/residual-primitive-erasure");
const { auditResidualPixelOwnership }=require("../packages/slideclone-core/residual-pixel-ownership");
const { createFullSlideResidualBuilder,eraseObjectMask }=require("../packages/slideclone-core/full-slide-native-residual");
const { residualEraseObjects }=require("../packages/slideclone-core/team-native-rebuild");
const { parseResidualFill }=require("../packages/slideclone-core/residual-background-mask");
function fixture(){
  const source={width:40,height:30,rgba:Buffer.alloc(40*30*4,255)};
  for(let y=4;y<26;y++)for(let x=4;x<36;x++)source.rgba.set([210,220,230,255],(y*40+x)*4);
  for(let y=10;y<18;y++)for(let x=10;x<16;x++)source.rgba.set([30,40,50,255],(y*40+x)*4);
  const background={id:"panel",type:"rect",box:{x:4,y:4,w:32,h:22},style:{fill:"#D2DCE6",stroke:"none"},source:{editable:true,preserveResidualInterior:true,residualBackgroundFill:true}};
  return {source,background,mask:eraseObjectMask(background,source,{w:40,h:30})};
}
test("background erasure preserves unowned text and icons while making the fill editable",async t=>{
  const {source,background}=fixture();const root=fs.mkdtempSync(path.join(os.tmpdir(),"background-ownership-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,"source.png"),outputFile=path.join(root,"residual.png");writePng(sourceFile,source);
  const objects=residualEraseObjects({shapes:[background],textBoxes:[]});assert.equal(objects.length,1);
  const build=createFullSlideResidualBuilder({readPng,writePng,eraseMasks});
  const result=await build({sourceFile,outputFile,objects,slideSize:{x:0,y:0,w:40,h:30}}),residual=readPng(outputFile);
  assert.equal(result.pixelOwnership.passed,true);
  assert.equal(residual.rgba[(12*40+12)*4+3],255,"unreconstructed foreground survives");
  assert.equal(residual.rgba[(6*40+6)*4+3],0,"native background can be recolored visibly");
  assert.deepEqual(residual.rgba.subarray(0,16),source.rgba.subarray(0,16),"no padding leaks outside the panel");
});
test("overlapping native text and backgrounds use immutable source ownership",()=>{
  const {source,mask}=fixture(),text={x:10,y:10,w:6,h:8};
  const first=eraseMasks(source,[mask,text],{transparent:true}),second=eraseMasks(source,[text,mask],{transparent:true});
  assert.deepEqual(first,second);assert.equal(first.rgba[(12*40+12)*4+3],0);
  assert.equal(auditResidualPixelOwnership({source,residual:first,masks:[text,mask]}).passed,true);
});
test("the audit rejects both a no-op and whole-box erasure of a background",()=>{
  const {source,mask}=fixture();
  assert.equal(auditResidualPixelOwnership({source,residual:source,masks:[mask]}).passed,false);
  const legacy=eraseMasks(source,[{x:mask.x,y:mask.y,w:mask.w,h:mask.h}],{transparent:true});
  const audit=auditResidualPixelOwnership({source,residual:legacy,masks:[mask]});
  assert.equal(audit.passed,false);assert.equal(audit.unownedChangedPixels,48);
});
test("source fill tolerance remains 16 and transparent source pixels remain untouched",()=>{
  const {source,mask}=fixture();source.rgba.set([226,220,230,255],(6*40+6)*4);source.rgba.set([227,220,230,255],(6*40+7)*4);source.rgba.set([210,220,230,0],(6*40+8)*4);
  const residual=eraseMasks(source,[mask],{transparent:true});
  assert.equal(residual.rgba[(6*40+6)*4+3],0);assert.equal(residual.rgba[(6*40+7)*4+3],255);
  assert.deepEqual(residual.rgba.subarray((6*40+8)*4,(6*40+8)*4+4),source.rgba.subarray((6*40+8)*4,(6*40+8)*4+4));
});
test("invalid fill, geometry and hostile arrays fail without reading content",()=>{
  let calls=0;const getter=[];Object.defineProperty(getter,"0",{get(){calls++;return 0;}});getter.length=3;
  for(const value of [null,"private",[],[1,2],[1,2,NaN],[-1,2,3],[1,2,256],new Array(3),getter,new Proxy([1,2,3],{})])assert.throws(()=>parseResidualFill(value),error=>/fill/.test(error.message)&&!error.message.includes("private"));
  assert.equal(calls,0);assert.equal(parseResidualFill(undefined),undefined);
  const {source,background}=fixture();assert.throws(()=>eraseObjectMask({...background,style:{fill:"private"}},source,{w:40,h:30}),/background/);
  assert.throws(()=>eraseObjectMask({...background,box:{x:0,y:0,w:41,h:30}},source,{w:40,h:30}),/geometry/);
});

test("source-measured freeform backgrounds erase only their path and matching fill, preserving pictorial foreground", () => {
  const {source,background}=fixture();
  background.type="freeform";
  background.style.freeformSegments=[
    {type:"moveTo",points:[{x:0,y:0}]},{type:"lnTo",points:[{x:1,y:0}]},
    {type:"lnTo",points:[{x:0,y:1}]},{type:"close",points:[]}
  ];
  const masks=eraseObjectMask(background,source,{w:40,h:30});
  assert.ok(Array.isArray(masks));assert.ok(masks.every(m=>m.sourceFill.join(",")==="210,220,230"));
  const residual=eraseMasks(source,masks,{transparent:true});
  assert.equal(residual.rgba[(6*40+6)*4+3],0);
  assert.equal(residual.rgba[(24*40+34)*4+3],255,"external corners are not owned by the enclosing box");
  assert.equal(residual.rgba[(12*40+12)*4+3],255,"contrasting foreground is retained");
  assert.equal(auditResidualPixelOwnership({source,residual,masks}).passed,true);
  background.style.freeformSegments.pop();
  assert.throws(()=>eraseObjectMask(background,source,{w:40,h:30}),/loop/);
});
