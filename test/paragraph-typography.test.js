"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {proposeParagraphTypography,assertTypographyContent}=require("../packages/slideclone-core/paragraph-typography");
const {parseTypographyDeck}=require("../packages/slideclone-core/typography-contract");
const {auditTypographyLayout}=require("../packages/slideclone-core/typography-quality");
function fixture(){return {slideSize:{widthPt:960,heightPt:540},pages:[{shapes:[],textBoxes:[
 {id:"a",text:"中文 ΩЖ ",box:{x:10,y:10,w:200,h:20},font:{family:"Arial",sizePt:14,weight:"regular"},source:{sceneRegionId:"panel",evidenceBox:{x:10,y:10,w:200,h:20}}},
 {id:"b",text:"第二行",box:{x:10,y:33,w:190,h:20},font:{family:"Calibri",sizePt:15,weight:"regular"},source:{sceneRegionId:"panel",evidenceBox:{x:10,y:33,w:190,h:20}}}
 ]}]};}
test("paragraphs share style, retain exact Unicode fragments/source frames and are naturally editable",()=>{
 const before=fixture(),snapshot=structuredClone(before),p=proposeParagraphTypography(before);
 assert.deepEqual(before,snapshot);assert.equal(p.report.mergedLines,1);assert.equal(p.deck.pages[0].textBoxes.length,1);
 const t=p.deck.pages[0].textBoxes[0];assert.equal(t.text,"中文 ΩЖ \n第二行");assert.equal(t.positionedRuns,undefined);
 assert.equal(t.wrap,true);assert.equal(t.style.textWarp,undefined);assert.equal(t.source.typographyMembers.length,2);
 assert.deepEqual(t.source.typographyMembers[0].source.evidenceBox,before.pages[0].textBoxes[0].source.evidenceBox);
 assert.equal(assertTypographyContent(before,p.deck),true);assert.equal(auditTypographyLayout(p.deck).passed,true);
 assert.equal(assertTypographyContent(p.deck,proposeParagraphTypography(p.deck).deck),true);
 assert.equal(proposeParagraphTypography(p.deck).report.provisionalRoles,1);
});
test("cross-node, columns, rotated labels and outlined text are not merged",()=>{
 for(const change of [d=>{d.pages[0].textBoxes[0].source.nativeComponentGroupId="node-a";d.pages[0].textBoxes[1].source.nativeComponentGroupId="node-b";},
 d=>{d.pages[0].textBoxes[1].box.x=300;d.pages[0].textBoxes[1].source.evidenceBox.x=300;},d=>{d.pages[0].textBoxes[1].rotation=90;},d=>{d.pages[0].textBoxes[1].style={textOutlineWidthPt:1};}]){
  const d=fixture();change(d);assert.equal(proposeParagraphTypography(d).report.mergedLines,0);
 }
 const d=fixture();d.pages[0].textBoxes.push({...structuredClone(d.pages[0].textBoxes[0]),id:"other",box:{x:50,y:29,w:10,h:4}});
 assert.equal(proposeParagraphTypography(d).report.mergedLines,0);
});
test("title hierarchy and literal list numbering survive; color emphasis remains rich Unicode text",()=>{
 const d=fixture();d.pages[0].textBoxes[0].role="title";
 assert.equal(proposeParagraphTypography(d).report.mergedLines,0);
 d.pages[0].textBoxes[0].role="body";d.pages[0].textBoxes[0].runs=[{text:"中文 ",font:{color:"#FF0000",weight:"bold"}},{text:"ΩЖ "}];
 const p=proposeParagraphTypography(d);assert.equal(p.deck.pages[0].textBoxes[0].runs[0].font.color,"#FF0000");
 assert.equal(p.deck.pages[0].textBoxes[0].runs[0].font.weight,"bold");
 const list=fixture();list.pages[0].textBoxes[0].text="1. 第一项";list.pages[0].textBoxes[1].text="2. 第二项";
 assert.equal(proposeParagraphTypography(list).deck.pages[0].textBoxes[0].style.typographyRole,"list");
});
test("empty input is valid; malformed, excessive and executable inputs fail without reading getters",()=>{
 const d=fixture();d.pages[0].textBoxes=[];assert.equal(proposeParagraphTypography(d).report.outputTexts,0);
 for(const change of [d=>{d.pages[0].textBoxes[0].font.sizePt=NaN;},d=>{d.pages[0].textBoxes[0].font.family="Arial;url(secret)";},
 d=>{d.pages[0].textBoxes[1].id="a";},d=>{d.pages[0].textBoxes[0].text="x".repeat(16001);},d=>{d.pages[0].textBoxes[0].box.x=-1;},
 d=>{d.pages[0].textBoxes[0].runs=[{text:"different"}];}]){const bad=fixture();change(bad);assert.throws(()=>parseTypographyDeck(bad));}
 let reads=0;const bad=fixture();Object.defineProperty(bad,"secret",{enumerable:true,get(){reads++;return "secret";}});
 assert.throws(()=>parseTypographyDeck(bad));assert.equal(reads,0);
 assert.throws(()=>parseTypographyDeck(new Proxy(fixture(),{})));
 const cyclic=fixture();cyclic.circular=cyclic;assert.throws(()=>parseTypographyDeck(cyclic));
});
test("content audit rejects deletions, duplicated lineage and changed paragraph order",()=>{
 const before=fixture(),p=proposeParagraphTypography(before).deck;
 for(const change of [d=>{d.pages[0].textBoxes=[];},d=>{d.pages[0].textBoxes[0].source.typographyMembers.reverse();},
 d=>{d.pages[0].textBoxes[0].source.typographyMembers[1].id="a";},d=>{d.pages[0].textBoxes[0].text="lost";d.pages[0].textBoxes[0].runs=[{text:"lost"}];}]){
  const d=structuredClone(p);change(d);assert.throws(()=>assertTypographyContent(before,d));
 }
});

test("outlined paragraph proposals preserve the admitted paint contract",()=>{
 const {parseNativeTextOutline}=require("../packages/slideclone-core/native-text-outline");
 const d=fixture();d.pages[0].textBoxes[0].style={textWarp:"textPlain",textOutlineWidthPt:.4,textOutlineColor:"#123456"};
 const result=proposeParagraphTypography(d).deck.pages[0].textBoxes[0];
 assert.deepEqual(parseNativeTextOutline(result.style),{widthPt:.4,color:"#123456"});
 assert.equal(result.style.textLayout,"paragraph");assert.equal(result.positionedRuns,undefined);
 assert.equal(auditTypographyLayout(proposeParagraphTypography(d).deck).passed,true);
});

test("shared font proposals replace all script channels on text and runs",()=>{
 const d=fixture();for(const t of d.pages[0].textBoxes){Object.assign(t.font,{latinFamily:'Old Latin',eastAsianFamily:'Old CJK',complexScriptFamily:'Old Script'});
  t.runs=[{text:t.text,font:{eastAsianFamily:'Old Run CJK',latinFamily:'Old Run Latin',complexScriptFamily:'Old Run Script',color:'#FF0000'}}];}
 const paragraph=proposeParagraphTypography(d,{family:'DengXian'}).deck.pages[0].textBoxes[0];
 for(const font of [paragraph.font,...paragraph.runs.filter(r=>r.font).map(r=>r.font)]){
  for(const key of ['family','latinFamily','eastAsianFamily','complexScriptFamily'])assert.equal(font[key],'DengXian');}
 assert.equal(paragraph.runs[0].font.color,'#FF0000');
});

test("one regional family spans different size and role bands while other regions stay independent",()=>{
 const d=fixture();d.pages[0].textBoxes[0].font.family='Calibri';
 d.pages[0].textBoxes.push({...structuredClone(d.pages[0].textBoxes[0]),id:'heading',text:'Heading',role:'title',
  box:{x:10,y:70,w:200,h:40},font:{family:'Arial',sizePt:30,weight:'bold'}});
 d.pages[0].textBoxes.push({...structuredClone(d.pages[0].textBoxes[0]),id:'other-region',
  box:{x:400,y:10,w:200,h:20},font:{family:'DengXian',sizePt:14},source:{sceneRegionId:'other'}});
 const result=proposeParagraphTypography(d,{merge:false});
 for(const t of result.deck.pages[0].textBoxes){
  assert.equal(t.font.family,t.id==='other-region'?'DengXian':'Calibri');
  assert.equal(t.font.latinFamily,t.font.family);assert.equal(t.font.eastAsianFamily,t.font.family);
 }
 assert.equal(result.deck.pages[0].textBoxes.find(t=>t.id==='heading').font.sizePt,30);
 assert.equal(result.deck.pages[0].textBoxes.find(t=>t.id==='heading').font.weight,'bold');
 assert.deepEqual(d.pages[0].textBoxes.map(t=>t.font.family),['Calibri','Calibri','Arial','DengXian']);
});

test('original OCR frames determine style bands and paragraph order after output distortion',()=>{
 const d=fixture();d.pages[0].textBoxes[0].box={x:100,y:100,w:200,h:80};
 d.pages[0].textBoxes[1].box={x:40,y:60,w:190,h:10};
 const before=structuredClone(d),result=proposeParagraphTypography(d);
 assert.equal(result.report.sharedStyles,1);assert.equal(result.report.mergedLines,1);
 const text=result.deck.pages[0].textBoxes[0];
 assert.equal(text.text,'中文 ΩЖ \n第二行');assert.equal(text.style.typographyRole,'body');
 assert.deepEqual(text.box,{x:40,y:60,w:260,h:120});
 assert.deepEqual(text.source.typographyMembers.map(m=>m.source.evidenceBox),before.pages[0].textBoxes.map(t=>t.source.evidenceBox));
 assert.deepEqual(d,before);
});

test('a source-backed paragraph cannot absorb an unobserved legacy output row',()=>{
 const d=fixture();delete d.pages[0].textBoxes[1].source.evidenceBox;
 const result=proposeParagraphTypography(d);assert.equal(result.report.mergedLines,0);
 assert.equal(result.deck.pages[0].textBoxes[1].source.evidenceBox,undefined);
 delete d.pages[0].textBoxes[0].source.evidenceBox;
 assert.equal(proposeParagraphTypography(d).report.mergedLines,1);
});

test('both original and output obstacles prevent paragraph merging',()=>{
 for(const sourceObstacle of [true,false]){
  const d=fixture();const blocker={...structuredClone(d.pages[0].textBoxes[0]),id:'blocker',role:'title',
   box:sourceObstacle?{x:400,y:400,w:10,h:4}:{x:50,y:29,w:10,h:4},
   source:{evidenceBox:sourceObstacle?{x:50,y:29,w:10,h:4}:{x:400,y:400,w:10,h:4}}};
  d.pages[0].textBoxes.push(blocker);assert.equal(proposeParagraphTypography(d).report.mergedLines,0);
 }
});

test('invalid source geometry and region identities fail before producing a proposal',()=>{
 for(const value of [null,{}, {x:0,y:0,w:0,h:1},{x:0,y:0,w:960,h:541},{x:-1,y:0,w:1,h:1}]){
  const d=fixture();d.pages[0].textBoxes[0].source.evidenceBox=value;assert.throws(()=>proposeParagraphTypography(d));
 }
 for(const value of ['',null,42]){const d=fixture();d.pages[0].textBoxes[0].source.sceneRegionProgramId=value;
  assert.throws(()=>proposeParagraphTypography(d));}
 const d=fixture();d.pages[0].textBoxes[0].source.evidenceBox={x:0,y:0,w:960,h:540};
 assert.doesNotThrow(()=>proposeParagraphTypography(d,{merge:false}));
});
