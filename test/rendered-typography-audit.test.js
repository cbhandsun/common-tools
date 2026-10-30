"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditRenderedTypography}=require("../packages/slideclone-core/typography/rendered-typography-audit");
const deck={slideSize:{widthPt:960,heightPt:540},pages:[{textBoxes:[{id:"p",text:"中文 Ω",box:{x:10,y:10,w:100,h:40},font:{family:"Arial",sizePt:12},style:{textLayout:"paragraph"}}]}]};
const xml=words=>`<html><body><doc><page width="960" height="540">${words}</page></doc></body></html>`;
const word=(text,right=90)=>`<word xMin="12" yMin="12" xMax="${right}" yMax="25">${text}</word>`;
test("actual PDF Unicode coverage and bounds are checked separately from visual pixels",()=>{
 assert.equal(auditRenderedTypography(deck,xml(word("中文 Ω"))).passed,true);
 assert.equal(auditRenderedTypography(deck,xml(word("中文"))).missing,1);
 assert.equal(auditRenderedTypography(deck,xml(word("中文 Ω",120))).overflow,1);
 assert.equal(auditRenderedTypography({...deck,pages:[{textBoxes:[]}]},xml("")).passed,true);
});
test("render evidence rejects wrong page counts, invalid coordinates, extreme data and entity declarations",()=>{
 for(const bad of ["",xml(word("中文 Ω")).replace('xMax="90"','xMax="NaN"'),"x".repeat(8000001),
 '<!ENTITY secret SYSTEM "file:///secret">'+xml(word("中文 Ω")),xml(word("&#x110000;"))]){
  assert.throws(()=>auditRenderedTypography(deck,bad));
 }
});

test("actual overlapping word boxes veto readability while separate lines remain valid",()=>{
 const overlapping=xml(word("中文 Ω")+word("extra"));
 assert.equal(auditRenderedTypography(deck,overlapping).collisions,1);
 assert.equal(auditRenderedTypography(deck,overlapping).passed,false);
 const separate=xml(word("中文 Ω")+word("extra").replace('yMin="12"','yMin="30"').replace('yMax="25"','yMax="42"'));
 assert.equal(auditRenderedTypography(deck,separate).collisions,0);
});

test("same character counts cannot certify reversed PDF reading order",()=>{
 const input=structuredClone(deck);input.pages[0].textBoxes[0].text="AB Ω漢";
 const result=auditRenderedTypography(input,xml(word("BA Ω漢")));
 assert.equal(result.missing,0);assert.equal(result.order,1);assert.equal(result.passed,false);
 assert.equal(auditRenderedTypography(input,xml(word("AB Ω漢"))).order,0);
});

test("overlapping editable frames cannot reuse a single rendered word as two paragraphs",()=>{
 const input=structuredClone(deck);input.pages[0].textBoxes.push({...input.pages[0].textBoxes[0],id:"duplicate"});
 const result=auditRenderedTypography(input,xml(word("中文 Ω")));
 assert.equal(result.paragraphs,2);assert.equal(result.ambiguous,2);assert.ok(result.missing>0);
 assert.equal(result.passed,false);assert.deepEqual(result.measurements,[]);
});

test("rotated paragraphs are explicitly unaudited instead of silently accepted",()=>{
 const input=structuredClone(deck);input.pages[0].textBoxes[0].rotation=90;
 const result=auditRenderedTypography(input,xml(""));
 assert.equal(result.paragraphs,1);assert.equal(result.unverified,1);assert.equal(result.passed,false);
});

test("reading order tolerates whitespace and Unicode normalization without exposing content",()=>{
 const input=structuredClone(deck);input.pages[0].textBoxes[0].text="e\u0301\nΩ漢";
 const result=auditRenderedTypography(input,xml(word("é Ω漢")));
 assert.equal(result.passed,true);assert.doesNotMatch(JSON.stringify(result),/Ω|漢/u);
});

test("ownership search has a finite boundary even for hostile dense pages",()=>{
 const input=structuredClone(deck);input.pages[0].textBoxes=Array.from({length:2001},(_,i)=>({...deck.pages[0].textBoxes[0],id:String(i)}));
 assert.throws(()=>auditRenderedTypography(input,xml(word("中文 Ω").repeat(1000))),/ownership capacity/u);
});

test("numeric audit admission rejects contradictory and illegal coverage evidence",()=>{
 const {parseRenderedTypographyAudit}=require("../packages/slideclone-core/typography/rendered-typography-audit");
 const good={passed:true,paragraphs:1,missing:0,overflow:0,collisions:0};
 for(const key of ['order','unverified','ambiguous']){
  for(const count of [null,-1,1.5,Infinity,10000001])assert.throws(()=>parseRenderedTypographyAudit({...good,[key]:count}));
  assert.throws(()=>parseRenderedTypographyAudit({...good,[key]:1}),/Contradictory/u);
  assert.equal(parseRenderedTypographyAudit({...good,passed:false,[key]:1})[key],1);
 }
});
