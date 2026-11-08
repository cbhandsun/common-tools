"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateDeckIrEnvelope}=require("../packages/slideclone-core/deck-ir-tree");
const {validateDeckPageStructures}=require("../packages/slideclone-core/deck-ir-structure");
const {projectSourceWordRuns}=require("../packages/slideclone-core/typography/source-word-layout-projection");
function deck(){return {version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,textBoxes:[{
 id:"line",text:"AAAABBBB",box:{x:10,y:10,w:100,h:20},font:{family:"Arial",sizePt:12},wrap:false,
 style:{wrap:false,fit:"none",textWarp:"textPlain"},positionedRuns:[{text:"AAAA",box:{x:12,y:15,w:40,h:10}},{text:"BBBB",box:{x:64,y:15,w:44,h:10}}]
}],shapes:[],images:[],tables:[],charts:[]}]};}
function validate(input){validateDeckIrEnvelope(input);validateDeckPageStructures(input.pages);}
test("compact positioned runs retain full line content and shared parent font inside the original IR envelope",()=>{
 const input=deck();validate(input);assert.equal(input.pages[0].textBoxes.length,1);
 const large=deck(),t=large.pages[0].textBoxes[0];t.text="A".repeat(512);t.box={x:0,y:10,w:960,h:20};
 t.positionedRuns=Array.from({length:512},(_,index)=>({text:"A",box:{x:index,y:15,w:1,h:10}}));validate(large);
});
test("positioned text rejects inconsistent, wrapped, overlapping, empty, extreme, aliased or hostile runs",()=>{
 for(const change of [t=>t.positionedRuns=[],t=>t.positionedRuns=Array(513).fill(t.positionedRuns[0]),
  t=>t.text="PRIVATE",t=>t.wrap=true,t=>t.style.fit="shrink",t=>t.rotation=181,t=>t.runs=[],
  t=>t.positionedRuns[0].box.w=Infinity,t=>t.positionedRuns[0].box.x=-1,t=>t.positionedRuns[1].box.x=40,
  t=>t.positionedRuns[0].text="",t=>t.positionedRuns[0].font={},t=>{t.PositionedRuns=t.positionedRuns;delete t.positionedRuns;},
  t=>t.positionedRuns=new Proxy(t.positionedRuns,{})]){
  const input=deck();change(input.pages[0].textBoxes[0]);assert.throws(()=>validate(input));
 }
 let called=0;const input=deck();Object.defineProperty(input.pages[0].textBoxes[0].positionedRuns[0],"text",{get(){called++;return"PRIVATE";}});
 assert.throws(()=>validate(input));assert.equal(called,0);
});
test("positioned native groups accept bounded signed rotation without changing child geometry",()=>{
 for(const rotation of [-180,-9.38914756133124,0,1.1013080431620998,180]){
  const input=deck(),text=input.pages[0].textBoxes[0];text.rotation=rotation;
  const before=JSON.stringify(text.positionedRuns);validate(input);assert.equal(JSON.stringify(text.positionedRuns),before);
 }
 for(const rotation of [181,-181,Infinity,NaN,"10",null,true,{},1e100]){
  const input=deck();input.pages[0].textBoxes[0].rotation=rotation;assert.throws(()=>validate(input));
 }
});
test("source endpoint projection preserves strict containment across fractional slide units without widening pixel evidence",()=>{
 for(const scale of [960/1312,5/9,1/3,Math.PI]){
  const pixels={x:132,y:519,w:242,h:31},points={x:pixels.x*scale,y:pixels.y*scale,w:pixels.w*scale,h:pixels.h*scale};
  const runs=[{text:"A",box:{x:132,y:525,w:70,h:25}},{text:"B",box:{x:220,y:525,w:154,h:25}}];
  const result=projectSourceWordRuns(runs,pixels,points);
  for(const run of result){assert.ok(run.box.x+run.box.w<=points.x+points.w);assert.ok(run.box.y+run.box.h<=points.y+points.h);}
  assert.deepEqual(result.map(run=>run.text),["A","B"]);
  assert.throws(()=>projectSourceWordRuns([{text:"A",box:{x:131,y:525,w:70,h:25}}],pixels,points),/outside/);
 }
});
