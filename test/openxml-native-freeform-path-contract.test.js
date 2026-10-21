"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {runBuilder,invokeBuilder,createMinimalDeckIr}=require("./helpers/openxml-contract-fixtures");
const {readZipEntry}=require("../packages/ooxml-core/pptx-inventory");
const {compactNativeFreeformPaths}=require("../packages/slideclone-core/native-freeform-path");
function fixture(){const deck=createMinimalDeckIr(""),points=[{type:"moveTo",points:[{x:0,y:0}]},
 {type:"lnTo",points:[{x:1,y:0}]},{type:"cubicBezTo",points:[{x:1,y:.3},{x:.9,y:1},{x:.5,y:1}]},
 {type:"lnTo",points:[{x:0,y:1}]},{type:"close",points:[]}];
 deck.pages[0].shapes=[{id:"node",type:"freeform",box:{x:20,y:30,w:300,h:200},style:{fill:"#123456",stroke:"none",freeformSegments:points}}];return deck;}
test("exact compact geometry produces identical native OpenXML including curve controls",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-path-contract-"));
 const expanded=fixture(),compact=structuredClone(expanded);compactNativeFreeformPaths(compact);
 const results=[];for(const [name,deck]of [["expanded",expanded],["compact",compact]]){
  const file=path.join(root,name+".json"),out=path.join(root,name+".pptx");fs.writeFileSync(file,JSON.stringify(deck));runBuilder(["--ir",file,"--out",out]);
  results.push(readZipEntry(out,"ppt/slides/slide1.xml").toString());}
 assert.equal(results[1],results[0]);assert.match(results[1],/cubicBezTo/);
});
test("native writer rejects corrupt and over-limit compact paths instead of clamping, truncating or selecting conflicting geometry",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-path-invalid-"));
 for(const [index,payload]of ["[[0,0,0],[1,-1,0]]","[[0,0,0],[2,0,0]]","[[\"private-token\"]]","[]","x".repeat(32769)].entries()){
  const deck=fixture(),style=deck.pages[0].shapes[0].style;delete style.freeformSegments;style.freeformPath=payload;
  const file=path.join(root,index+".json");fs.writeFileSync(file,JSON.stringify(deck));const result=invokeBuilder(["--ir",file,"--out",path.join(root,index+".pptx")]);
  assert.notEqual(result.status,0);assert.ok(!(result.stdout+result.stderr).includes("private-token"));}
 const deck=fixture();deck.pages[0].shapes[0].style.freeformPath="[[0,0,0],[4]]";
 const file=path.join(root,"ambiguous.json");fs.writeFileSync(file,JSON.stringify(deck));assert.notEqual(invokeBuilder(["--ir",file,"--out",path.join(root,"ambiguous.pptx")]).status,0);
 const {includesSuite}=require("../scripts/test-suites");assert.ok(includesSuite(__filename,"contract"));assert.ok(includesSuite(__filename,"all"));
});
