"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {textRefinementAuthoritySnapshot:snapshot,assertTextRefinementPreservesAuthority:preserves,textRefinementAuditFailures:failures}=require('../packages/slideclone-core/text-refinement-preservation');
const {includesSuite}=require('../scripts/test-suites');
function deck(){return {slideSize:{widthPt:100,heightPt:100},pages:[{source:{sourceScene:{version:1,unresolved:[{id:'node',reason:'missing'}]}},
 shapes:[],images:[],textBoxes:[{id:'text',text:'中文 Ω',box:{x:1,y:1,w:50,h:20},font:{family:'Arial',sizePt:12,weight:'regular'},
 style:{visibility:'visible'},source:{editable:true,evidenceBox:{x:1,y:1,w:50,h:20}}}]}]};}
test('font and position fitting leave incomplete authority unchanged, including supported diagnostics',()=>{
 const a=deck(),before=structuredClone(a),s=snapshot(a),b=structuredClone(a),t=b.pages[0].textBoxes[0];
 t.font.family='SimHei';t.font.weight='bold';t.box.y=2;t.source.textWeightEvidenceFit={coverageRatio:.5};
 assert.doesNotThrow(()=>preserves(s,b));assert.deepEqual(a,before);
});
test('empty text inventories are safe while missing inventories and out-of-page frames are rejected',()=>{
 const a=deck();a.pages[0].textBoxes=[];assert.doesNotThrow(()=>preserves(snapshot(a),a));
 const b=deck();delete b.pages[0].textBoxes;assert.throws(()=>snapshot(b),TypeError);
 const c=deck();c.pages[0].textBoxes[0].box.x=100;assert.throws(()=>snapshot(c),TypeError);
 const extreme=deck();extreme.pages=Array(51).fill(extreme.pages[0]);assert.throws(()=>snapshot(extreme),TypeError);
});
test('hidden text, changed source frames, forged authority and omitted graphic failures cannot pass',()=>{
 for(const mutate of [t=>{t.style.visibility='hidden';},t=>{t.font.opacity=0;},t=>{t.style.opacity=0;},
  t=>{t.source.evidenceBox.x=2;},t=>{t.source.sourcePhysicalAttachment=true;}]){
  const a=deck(),s=snapshot(a),b=structuredClone(a);mutate(b.pages[0].textBoxes[0]);assert.throws(()=>preserves(s,b),TypeError);
 }
 const a=deck(),s=snapshot(a),b=structuredClone(a);b.pages[0].source.sourceScene.unresolved=[];assert.throws(()=>preserves(s,b),TypeError);
});
test('hostile getters, proxies, cyclic and nonfinite values fail without executing input code',()=>{
 let invoked=0;const getter={};Object.defineProperty(getter,'pages',{get(){invoked++;throw Error('secret');}});
 const proxy=new Proxy(deck(),{get(){invoked++;throw Error('secret');}});
 for(const input of [getter,proxy])assert.throws(()=>snapshot(input),TypeError);
 const checks=[];Object.defineProperty(checks,'0',{get(){invoked++;throw Error('secret');}});checks.length=1;
 assert.throws(()=>failures({checks}),TypeError);assert.equal(invoked,0);
 const cyclic=deck();cyclic.meta=cyclic;assert.throws(()=>snapshot(cyclic),TypeError);
 const invalid=deck();invalid.pages[0].textBoxes[0].font.sizePt=Infinity;assert.throws(()=>snapshot(invalid),TypeError);
});
test('audits retain failure multiplicities and reject malformed checks; new regressions enter CI',()=>{
 assert.deepEqual([...failures({checks:[{name:'missing',passed:false},{name:'missing',passed:false}]})],[['missing',2]]);
 assert.equal(failures({checks:[]}).size,0);
 for(const input of [null,{checks:[{name:'missing',passed:'false'}]}])assert.throws(()=>failures(input),TypeError);
 for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});
