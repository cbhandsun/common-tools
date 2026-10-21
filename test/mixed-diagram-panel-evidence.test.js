"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const { sourcePanelLayoutEvidence }=require("../packages/slideclone-core/source-panel-layout-evidence");
const { shouldUseMixedDiagramUnderlay }=require("../packages/slideclone-core/graphic-crop-analysis");
function fixture(scale=1,color=[210,220,230]) {
  const width=600*scale,height=400*scale;
  const image={width,height,rgba:Buffer.alloc(width*height*4,255)};
  const textBoxes=[];
  for(let panel=0;panel<3;panel++){
    const x=(20+panel*190)*scale,y=60*scale,w=170*scale,h=260*scale;
    for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set([...color,255],(row*width+col)*4);
    for(let row=0;row<6;row++)textBoxes.push({text:`Label ${panel} ${row}`,box:{x:x+20*scale,y:y+(20+row*35)*scale,w:100*scale,h:15*scale}});
  }
  return {image,textBoxes,slideSize:{widthPt:width,heightPt:height},aggregate:{box:{x:0,y:0,w:width*0.9,h:height}},contentBox:{x:width*0.05,y:height*0.16,w:width*0.9,h:height*0.67},structuralLines:[]};
}
test("text-erased mixed diagram selection survives removal of false connector lines",()=>{
  const input=fixture();
  assert.equal(sourcePanelLayoutEvidence(input).panelCount,3);
  assert.equal(shouldUseMixedDiagramUnderlay(input),true);
});
test("panel evidence survives scale and color changes without wording rules",()=>{
  for(const scale of [1,2])for(const color of [[220,225,230],[180,215,200],[210,185,220]]){
    const input=fixture(scale,color);input.textBoxes.forEach((item,index)=>item.text=`Different ${index}`);
    assert.equal(sourcePanelLayoutEvidence(input).panelCount,3);
  }
});
test("closed panels remain source-bound after translation",()=>{
  const input=fixture(),previous=input.image;
  input.image={width:660,height:440,rgba:Buffer.alloc(660*440*4,255)};
  for(let row=0;row<previous.height;row++)input.image.rgba.set(previous.rgba.subarray(row*previous.width*4,(row+1)*previous.width*4),((row+20)*660+30)*4);
  input.slideSize={widthPt:660,heightPt:440};input.textBoxes.forEach(item=>{item.box.x+=30;item.box.y+=20;});
  assert.equal(sourcePanelLayoutEvidence(input).panelCount,3);
});
test("OCR geometry alone, open fills and empty input never substitute for source boundaries",()=>{
  const input=fixture();input.image.rgba.fill(255);
  assert.equal(sourcePanelLayoutEvidence(input),null);
  assert.equal(shouldUseMixedDiagramUnderlay(input),false);
  assert.equal(sourcePanelLayoutEvidence({...fixture(),textBoxes:[]}),null);
  const open=fixture();for(let y=60;y<320;y++)for(let x=0;x<20;x++)open.image.rgba.set([210,220,230,255],(y*600+x)*4);
  assert.equal(sourcePanelLayoutEvidence(open),null);
});
test("invalid, excessive and hostile storage is rejected without executing callbacks",()=>{
  let calls=0;const getter={get image(){calls++;throw new Error("private");}};
  for(const input of [null,{},getter,new Proxy({},{}),{...fixture(),textBoxes:new Array(1)},{...fixture(),textBoxes:new Array(10001)},
    {...fixture(),image:{width:20000,height:2,rgba:new Uint8Array(0)}},{...fixture(),image:{...fixture().image,rgba:new Uint8Array(0)}}])assert.equal(sourcePanelLayoutEvidence(input),null);
  assert.equal(calls,0);
});
