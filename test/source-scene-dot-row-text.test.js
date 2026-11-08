'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {readPng}=require('../packages/slideclone-core/png');
const {acceptMissingSceneText}=require('../packages/slideclone-core/scene-plan/source-scene-missing-text');
function fixture(){
 const image=readPng(path.join(__dirname,'fixtures/source-dot-row/three-dot-source.png'));
 const proposal={index:0,text:null,confidence:0,box:{x:0,y:0,w:26,h:13}};
 const observation={index:0,text:'...',confidence:.98,box:{x:3,y:3,w:19,h:7},contextBox:proposal.box,color:'#8AA69C'};
 return {image,proposal,observation};
}
test('three complete dots include their contrast-supported halos instead of testing only provider-color cores',()=>{
 for(const text of['...','…']){
  const f=fixture(),observation={...f.observation,text},budget={used:0},before=Buffer.from(f.image.rgba);
  const result=acceptMissingSceneText([f.proposal],[[observation],[{...observation}]],f.image,budget);
  assert.deepEqual(result.rejected,[]);assert.equal(result.lines.length,1);assert.equal(result.lines[0].text,text);
  assert.deepEqual(result.lines[0].box,{x:4,y:4,w:18,h:5});
  assert.ok(budget.used>0&&budget.used<=4000000);assert.deepEqual(f.image.rgba,before);
 }
});
test('dot recovery preserves invalid-coordinate, confidence, unrelated transcription and existing OCR boundaries',()=>{
 const f=fixture(),a=f.observation;
 for(const b of[{...a,rejection:'source-unit'},{...a,confidence:.89},{...a,text:'..'}, {...a,text:'abc'}]){
  const budget={used:0},r=acceptMissingSceneText([f.proposal],[[a],[b]],f.image,budget);
  assert.equal(r.lines.length,0);assert.equal(r.rejected.length,1);
  if(b.rejection||b.confidence<.9)assert.equal(budget.used,0);
 }
 const overlap=acceptMissingSceneText([f.proposal],[[a],[a]],f.image,{used:0},[{text:'existing',confidence:1,box:a.box}]);
 assert.equal(overlap.lines.length,0);assert.equal(overlap.rejected[0].reason,'existing-ocr-overlap');
});

test('unknown ellipsis spellings agree only through the same complete source glyph in both pixel-cell localizations',()=>{
 const f=fixture(),a={...f.observation,text:'...',confidence:.94,box:{x:4.04,y:4.015,w:17.92,h:4.935}},
  b={...f.observation,text:'…',confidence:.95,box:{x:3.976,y:4.12,w:18.048,h:4.755}},before=Buffer.from(f.image.rgba);
 for(const observations of[[[a],[b]],[[b],[a]]]){
  const budget={used:0},r=acceptMissingSceneText([f.proposal],observations,f.image,budget);
  assert.deepEqual(r.rejected,[]);assert.deepEqual(r.lines,[{text:'…',confidence:.94,box:{x:4,y:4,w:18,h:5}}]);
  assert.ok(budget.used>0&&budget.used<=4000000);
 }
 assert.deepEqual(f.image.rgba,before);
});

test('source equivalence cannot repair clipped cells, mismatched punctuation, a blank source or existing text',()=>{
 const f=fixture(),a=f.observation,b={...a,text:'…'};
 for(const other of[{...b,text:'..'},{...b,text:'. . .'},{...b,text:'⋯'},
  {...b,box:{x:6,y:4,w:18,h:5}},{...b,box:{x:4,y:4,w:18,h:4}}]){
  const r=acceptMissingSceneText([f.proposal],[[a],[other]],f.image,{used:0});
  assert.equal(r.lines.length,0);assert.equal(r.rejected[0].reason,'transcription-disagreement');
 }
 const known=acceptMissingSceneText([{...f.proposal,text:'...',confidence:1}],[[a],[b]],f.image,{used:0});
 assert.equal(known.lines.length,0);assert.equal(known.rejected[0].reason,'transcription-disagreement');
 const blank={...f.image,rgba:Buffer.from(f.image.rgba)};
 for(let i=0;i<blank.rgba.length;i+=4)blank.rgba.set([240,240,240,255],i);
 assert.equal(acceptMissingSceneText([f.proposal],[[a],[b]],blank,{used:0}).rejected[0].reason,'transcription-disagreement');
 const overlap=acceptMissingSceneText([f.proposal],[[a],[b]],f.image,{used:0},[{text:'existing',confidence:1,box:a.box}]);
 assert.equal(overlap.lines.length,0);assert.equal(overlap.rejected[0].reason,'existing-ocr-overlap');
 const budget={used:4000000};assert.throws(()=>acceptMissingSceneText([f.proposal],[[a],[b]],f.image,budget),/pixel budget/);
 assert.equal(budget.used,4000000);
});
