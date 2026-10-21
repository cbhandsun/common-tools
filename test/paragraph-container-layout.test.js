"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {proposeContainerParagraphLayout}=require("../packages/slideclone-core/paragraph-container-layout");
function fixture(){return {slideSize:{widthPt:200,heightPt:100},pages:[{shapes:[],textBoxes:[
 {id:'body',text:'第一行\n第二行',box:{x:10,y:10,w:60,h:20},font:{family:'Arial',sizePt:12},style:{textLayout:'paragraph',typographyRole:'body'},source:{typographyContainerBox:{x:0,y:0,w:200,h:100}}},
 {id:'next',text:'下一段',box:{x:10,y:60,w:100,h:20},font:{family:'Arial',sizePt:12}}]}]};}
test('container whitespace expands output only, bounded by the next paragraph',()=>{
 const d=fixture(),before=structuredClone(d),result=proposeContainerParagraphLayout(d);
 assert.deepEqual(d,before);assert.equal(result.report.expanded,1);assert.deepEqual(result.deck.pages[0].textBoxes[0].box,{x:10,y:10,w:188,h:48});
 assert.deepEqual(result.deck.pages[0].textBoxes[0].source,before.pages[0].textBoxes[0].source);
 assert.equal(result.deck.pages[0].textBoxes[0].text,before.pages[0].textBoxes[0].text);
});
test('physical owners, missing containers and crossing objects prevent expansion',()=>{
 const d=fixture();d.pages[0].textBoxes[0].source.nativeComponentGroupId='node';assert.equal(proposeContainerParagraphLayout(d).report.expanded,0);
 delete d.pages[0].textBoxes[0].source.nativeComponentGroupId;delete d.pages[0].textBoxes[0].source.typographyContainerBox;
 assert.equal(proposeContainerParagraphLayout(d).report.expanded,0);
 const obstructed=fixture();obstructed.pages[0].shapes=[{id:'graphic',box:{x:80,y:0,w:20,h:40}}];
 assert.equal(proposeContainerParagraphLayout(obstructed).deck.pages[0].textBoxes[0].box.w,68);
});
test('empty, invalid and hostile container boundaries are explicit',()=>{
 const empty=fixture();empty.pages=[];assert.equal(proposeContainerParagraphLayout(empty).report.expanded,0);
 for(const b of [{x:0,y:0,w:5,h:5},{x:0,y:0,w:500,h:100},{x:0,y:0,w:NaN,h:100}]){
  const d=fixture();d.pages[0].textBoxes[0].source.typographyContainerBox=b;assert.throws(()=>proposeContainerParagraphLayout(d));}
 let reads=0;const d=fixture();Object.defineProperty(d.pages[0].textBoxes[0].source,'typographyContainerBox',{get(){reads++;return {};}});
 assert.throws(()=>proposeContainerParagraphLayout(d));assert.equal(reads,0);
});
