"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fitParagraphRenderFeedback}=require('../packages/slideclone-core/paragraph-render-feedback');
function fixture(){return {slideSize:{widthPt:200,heightPt:100},pages:[{textBoxes:[0,1].map(i=>({id:`t${i}`,text:'中文 Ω',box:{x:0,y:i*30,w:100,h:12},font:{family:'Arial',sizePt:20},style:{textLayout:'paragraph',typographyStyleId:'body'},source:{evidenceBox:{x:0,y:i*30,w:100,h:12}},runs:[{text:'中文 Ω',font:{color:'#FF0000',sizePt:20}}]}))}]};}
test('actual renderer height adjusts every member of a shared style without changing source or content',()=>{
 const d=fixture(),before=structuredClone(d),r=fitParagraphRenderFeedback(d,{measurements:[{pageIndex:0,textIndex:0,height:16}]});
 assert.deepEqual(d,before);assert.equal(r.report.changed,2);
 for(const t of r.deck.pages[0].textBoxes){assert.equal(t.font.sizePt,15);assert.equal(t.runs[0].font.sizePt,15);assert.equal(t.runs[0].font.color,'#FF0000');}
 assert.deepEqual(r.deck.pages[0].textBoxes[0].source,before.pages[0].textBoxes[0].source);
});
test('empty and implausible feedback has no effect; malformed and borrowed indices are rejected',()=>{
 assert.equal(fitParagraphRenderFeedback(fixture(),{measurements:[]}).report.changed,0);
 assert.equal(fitParagraphRenderFeedback(fixture(),{measurements:[{pageIndex:0,textIndex:0,height:100}]}).report.changed,0);
 const row={pageIndex:0,textIndex:0,height:16};
 for(const measurements of [[row,row],[{...row,height:NaN}],[{...row,pageIndex:1}],[{...row,textIndex:.5}],new Array(1)])assert.throws(()=>fitParagraphRenderFeedback(fixture(),{measurements}));
 let reads=0;assert.throws(()=>fitParagraphRenderFeedback(fixture(),{get measurements(){reads++;return [];}}));assert.equal(reads,0);
 const legacy=fixture();for(const t of legacy.pages[0].textBoxes)delete t.source.evidenceBox;
 assert.equal(fitParagraphRenderFeedback(legacy,{measurements:[row]}).report.changed,0);
});
