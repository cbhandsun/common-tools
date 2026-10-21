"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {runBuilder,invokeBuilder}=require("./helpers/openxml-contract-fixtures");
const {readZipEntry}=require("../packages/ooxml-core/pptx-inventory");
function fixture(){return {version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{pageIndex:0,shapes:[],images:[],tables:[],charts:[],textBoxes:[
 {id:"paragraph",text:"中文 ΩЖ\n第二行",box:{x:10,y:10,w:200,h:60},font:{family:"Arial",sizePt:16,lineHeightMultiple:1.2},wrap:true,
 style:{textLayout:"paragraph",fit:"none"},runs:[{text:"中文 ",font:{weight:"bold",color:"#FF0000"}},{text:"ΩЖ\n第二行"}]}]}]};}
test("one editable native paragraph has rich Unicode and real breaks, without warp or hidden fragments",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"native-paragraph-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ir=path.join(root,"deck.json"),pptx=path.join(root,"deck.pptx");fs.writeFileSync(ir,JSON.stringify(fixture()));runBuilder(["--ir",ir,"--out",pptx]);
 const xml=readZipEntry(pptx,"ppt/slides/slide1.xml").toString("utf8");assert.equal((xml.match(/<p:sp>/gu)||[]).length,1);
 assert.match(xml,/<a:br>/u);assert.match(xml,/wrap="square"/u);assert.match(xml,/<a:t>中文 <\/a:t>/u);assert.match(xml,/<a:t>ΩЖ<\/a:t>/u);
 assert.match(xml,/<a:t>第二行<\/a:t>/u);assert.match(xml,/val="FF0000"/u);assert.match(xml,/b="1"/u);assert.doesNotMatch(xml,/prstTxWarp|<p:grpSp>|<p:pic\b/u);
 const outlined=fixture();Object.assign(outlined.pages[0].textBoxes[0].style,{textOutlineColor:"#123456",textOutlineWidthPt:.4});
 const {validateDeckPageStructures}=require("../packages/slideclone-core/deck-ir-structure");
 assert.doesNotThrow(()=>validateDeckPageStructures(outlined.pages));
 fs.writeFileSync(ir,JSON.stringify(outlined));runBuilder(["--ir",ir,"--out",pptx]);
 const painted=readZipEntry(pptx,"ppt/slides/slide1.xml").toString("utf8");
 assert.match(painted,/val="123456"/u);assert.match(painted,/<a:br>/u);assert.doesNotMatch(painted,/prstTxWarp/u);
 for(const change of [d=>{d.pages[0].textBoxes[0].wrap=false;},d=>{d.pages[0].textBoxes[0].text="missing";},
 d=>{d.pages[0].textBoxes[0].runs=Array.from({length:513},()=>({text:""}));}]){
  const bad=fixture();change(bad);fs.writeFileSync(ir,JSON.stringify(bad));assert.notEqual(invokeBuilder(["--ir",ir,"--out",pptx]).status,0);}
});
