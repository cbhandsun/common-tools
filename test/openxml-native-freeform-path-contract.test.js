"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {runBuilder,invokeBuilder,createMinimalDeckIr}=require("./helpers/openxml-contract-fixtures");
const {readZipEntry}=require("../packages/ooxml-core/pptx-inventory");
const {compactNativeFreeformPaths}=require("../packages/slideclone-core/scene-plan/native-freeform-path");
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

test('native paint separation accounts for the actual writer path-grid rounding',t=>{
 const {nativeFilledPathDisjoint}=require('../packages/slideclone-core/scene-plan/native-filled-path-overlap');
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,'native-path-rounding-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(root)),parent);assert.ok(path.basename(root).startsWith('native-path-rounding-'));
  fs.rmSync(root,{recursive:true,force:true});});
 const deck=createMinimalDeckIr(''),vertices=[{x:.50001,y:0},{x:1,y:0},{x:1,y:1},{x:.50001,y:1}];
 const shape={id:'rounded-grid-surface',type:'freeform',box:{x:0,y:0,w:1000,h:1000},
  style:{fill:'#123456',stroke:'none',strokeWidthPt:0,freeformSegments:[{type:'moveTo',points:[vertices[0]]},
   ...vertices.slice(1).map(p=>({type:'lnTo',points:[p]})),{type:'close',points:[]}]}};
 const query={x:500.001,y:400,w:.001,h:10};
 assert.ok(shape.box.w*vertices[0].x>query.x+query.w,'the floating IR contains a gap');
 assert.equal(nativeFilledPathDisjoint(shape,query,{used:0,exhausted:false}),false);
 deck.pages[0].shapes=[shape];compactNativeFreeformPaths(deck);
 const ir=path.join(root,'deck.json'),out=path.join(root,'deck.pptx');fs.writeFileSync(ir,JSON.stringify(deck));runBuilder(['--ir',ir,'--out',out]);
 const xml=readZipEntry(out,'ppt/slides/slide1.xml').toString();
 const body=[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/gu)].find(m=>m[0].includes('name="rounded-grid-surface"'))?.[0];assert.ok(body);
 assert.match(body,/<a:path w="21600" h="21600"/u);
 const point=/<a:moveTo>\s*<a:pt x="(\d+)" y="(\d+)"/u.exec(body);assert.ok(point);assert.equal(Number(point[1]),10800);
 const extent=/<a:ext cx="(\d+)" cy="(\d+)"/u.exec(body);assert.ok(extent);
 const emittedLeft=Number(point[1])/21600*Number(extent[1])/12700;
 assert.ok(emittedLeft<query.x,'the emitted rectangle paints inside the previously certified gap');
});
