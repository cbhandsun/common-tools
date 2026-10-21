"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {createMissingBlobComponentCollector,missingBlobTargetTouchesText}=require("../packages/slideclone-core/missing-blob-components");
const {writePng}=require("../packages/slideclone-core/png");
const collect=createMissingBlobComponentCollector({summarizeColor:()=>"#0066EE",describeGeometry:()=>({
  points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],curve:null,connectorContour:null
})});
function fixture() {
  const width=50,height=50,rgba=Buffer.alloc(width*height*4,255),foreground=new Uint8Array(width*height);
  for(let y=10;y<30;y++) for(let x=10;x<30;x++) {
    if(x>=14&&x<26&&y>=14&&y<26) continue;
    foreground[y*width+x]=1;rgba.set([0,102,238,255],(y*width+x)*4);
  }
  return {source:{width,height,rgba},foreground,left:0,top:0,width,height,scaleX:1,scaleY:1};
}
test("dense missing pictorial components preserve holes instead of filling their convex hull",()=>{
  const input=fixture(),before=structuredClone(input),[component]=collect(input);
  assert.equal(component.pixelCount,256);
  assert.deepEqual(component.box,{x:10,y:10,w:20,h:20});
  assert.ok(component.nativeContour);
  assert.equal(component.nativeContour.segments.filter(s=>s.type==="moveTo").length,2);
  assert.equal(component.nativeContour.segments.filter(s=>s.type==="close").length,2);
  assert.ok(component.nativeContour.segments.length<=120);
  assert.deepEqual(input.source.rgba,Buffer.from(before.source.rgba));
  assert.deepEqual(input.foreground,before.foreground);
});
test("empty and tiny masks do not manufacture editable components",()=>{
  const value=fixture();value.foreground.fill(0);
  assert.deepEqual(collect(value),[]);
  value.foreground[10]=1;assert.deepEqual(collect(value),[]);
});
test("text ownership uses original source evidence after the native text box has moved",()=>{
  const target={box:{x:10,y:10,w:20,h:20}};
  const text={text:"Editable",box:{x:60,y:60,w:20,h:10},source:{evidenceBox:{x:10,y:10,w:20,h:10}}};
  assert.equal(missingBlobTargetTouchesText(target,[text]),true);
  assert.equal(missingBlobTargetTouchesText(target,[{...text,source:{}}]),false);
  assert.equal(missingBlobTargetTouchesText(target,[{...text,text:" "}]),false);
  assert.equal(missingBlobTargetTouchesText(target,[{...text,source:{evidenceBox:{x:30,y:10,w:10,h:10}}}]),false);
  assert.equal(missingBlobTargetTouchesText(target,[]),false);
  for(const [component,texts] of [[{},[]],[target,null],[target,[{}]],[target,[{...text,box:{}}]],
    [{box:{x:1e300,y:1,w:2,h:3}},[]],
    [target,[{...text,source:{evidenceBox:{x:NaN,y:1,w:2,h:3}}}]],[target,new Array(2001)]]) {
    assert.throws(()=>missingBlobTargetTouchesText(component,texts),/missing component text/);
  }
});
test("missing component bounds reject malformed, excessive, nonfinite and inconsistent inputs",()=>{
  for(const value of [null,{}, {...fixture(),source:{}}, {...fixture(),foreground:[]},
    {...fixture(),foreground:new Uint8Array(1)}, {...fixture(),left:-1}, {...fixture(),top:50},
    {...fixture(),scaleX:0}, {...fixture(),scaleY:Infinity}, {...fixture(),width:1.5},
    {...fixture(),maximumComponentAreaPt2:25001}, {...fixture(),maximumComponentAreaPt2:NaN},
    {...fixture(),source:{...fixture().source,width:16385}}]) assert.throws(()=>collect(value),/blob component/);
  const nonbinary=fixture();nonbinary.foreground[0]=2;
  assert.throws(()=>collect(nonbinary),/blob component/);
  assert.throws(()=>createMissingBlobComponentCollector({summarizeColor:null,describeGeometry:()=>({})}),/dependencies/);
});
test("trusted geometry failure propagates instead of fabricating a successful component",()=>{
  const failure=new Error("geometry failed");
  const failing=createMissingBlobComponentCollector({summarizeColor:()=>"#0066EE",describeGeometry:()=>{throw failure;}});
  assert.throws(()=>failing(fixture()),error=>error===failure);
});
test("production missing component fitting emits native multi-path holes and skips text-owned regions",t=>{
  const {fitDeckMissingNativeVisualAtomShapes,validateDeckIr}=require("../packages/slideclone-worker-adapter/team-worker");
  const {auditSemanticEditability}=require("../packages/slideclone-core/semantic-editability-quality");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"missing-blob-contour-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,"source.png"),value=fixture();
  writePng(sourceFile,value.source);
  const deck={version:"1.0",slideSize:{widthPt:100,heightPt:100},pages:[{pageIndex:0,shapes:[],images:[],textBoxes:[]}]};
  const region={id:"isolated",pageIndex:0,kind:"missing",role:"missing-native-component",box:{x:20,y:20,w:40,h:40},
    contributionScore:1000,source:{dominantColor:"#0066EE",missingPixelDensity:0.64}};
  const options={sourceImages:[sourceFile],visualQuality:{componentWorst:[region]},maximumTargets:3,maximumAtoms:10};
  const result=fitDeckMissingNativeVisualAtomShapes(deck,options);
  const shape=result.deck.pages[0].shapes.find(s=>s.source?.detector==="missing-native-blob-freeform-component");
  assert.ok(shape);
  assert.equal(shape.style.freeformSegments.filter(s=>s.type==="moveTo").length,2);
  assert.equal(shape.style.closePath,true);
  assert.equal(auditSemanticEditability(result.deck).passed,true);
  assert.doesNotThrow(()=>validateDeckIr(result.deck,root));
  for(const hint of [{textAdjacent:true},{repairHint:"text"}]) {
    assert.equal(fitDeckMissingNativeVisualAtomShapes(deck,{...options,visualQuality:{componentWorst:[{...region,...hint}]}}).addedShapes,0);
  }
  const ownedDeck=structuredClone(deck);
  ownedDeck.pages[0].textBoxes=[{id:"native-label",text:"Editable",box:{x:70,y:70,w:20,h:10},
    source:{evidenceBox:region.box},font:{family:"Arial",sizePt:10}}];
  assert.equal(fitDeckMissingNativeVisualAtomShapes(ownedDeck,options).addedShapes,0,
    "unmarked stale quality rows cannot turn native text into graphical paths");
});
