'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectRegionalInventoryTargets:select,regionalInventoryPrompt:prompt}=require('../packages/slideclone-core/source-scene-regional-inventory');
function fixture(){
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},{id:'owner',parentId:'root',kind:'diagram',box:{x:10,y:10,w:80,h:80}}],
  objects:[{id:'left',regionId:'owner',kind:'container',box:{x:20,y:20,w:20,h:20}},{id:'right',regionId:'owner',kind:'container',box:{x:60,y:20,w:20,h:20}}],
  relations:[{id:'known',regionId:'owner',fromId:'left',toId:'right',direction:'forward',shaftBox:{x:39,y:27,w:22,h:6}}],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'owner',containers:2,icons:0,relations:2}]};
 const frame={width:200,height:100,sourceTargets:[{index:5,cropBox:{x:10,y:10,w:80,h:80}}],sheetTargets:[{index:5,cropBox:{x:100,y:0,w:80,h:80}}]};
 return {plan,frame};
}
function bindings(value){const text=value.match(/Exact immutable regional bindings: (\[.*\])\. These are inventory proposals/u)?.[1];assert.ok(text);return JSON.parse(text);}
test('a census gap carries existing source-bound relations into the SAME review atlas without changing the plan',()=>{
 const f=fixture(),before=structuredClone(f.plan),target={...select(f.plan,1,0)[0],index:5};
 assert.deepEqual(target.existingRelations,[{id:'known',fromId:'left',toId:'right',direction:'forward',shaftBox:{x:39,y:27,w:22,h:6}}]);
 const text=prompt([target],{objects:0,relations:2},f.frame),row=bindings(text)[0];
 assert.deepEqual(row.existingRelations,[{id:'known',from:'left',to:'right',direction:'forward',shaftBox_2d:[170,645,230,755]}]);
 assert.match(text,/do not propose an already listed physical connector/u);assert.match(text,/distinct physical contacts/u);
 assert.deepEqual(f.plan,before);target.existingRelations[0].shaftBox.x++;assert.deepEqual(f.plan,before);
});
test('relation context exposes only this owner and bound endpoints, and never a speculative missing relation',()=>{
 const f=fixture();f.plan.relations.push({id:'other',regionId:'root',fromId:'left',toId:'right',direction:'both'},
  {id:'unbound',regionId:'owner',fromId:'absent',toId:'right',direction:'forward'});f.plan.observedInventory[1].relations=4;
 const target={...select(f.plan,1,0)[0],index:5};assert.deepEqual(target.existingRelations.map(r=>r.id),['known']);
 const row=bindings(prompt([target],{objects:0,relations:2},f.frame))[0];assert.equal(row.existingRelations.length,1);
});
test('empty legacy context stays absent; missing or clipped shaft hints cannot become a fabricated location',()=>{
 const f=fixture(),target={...select(f.plan,1,0)[0],index:5};delete target.existingRelations;
 assert.equal(Object.hasOwn(bindings(prompt([target],{objects:0,relations:2},f.frame))[0],'existingRelations'),false);
 for(const shaftBox of [undefined,{x:0,y:0,w:5,h:5}]){
  target.existingRelations=[{id:'known',fromId:'left',toId:'right',direction:'forward',...(shaftBox?{shaftBox}:{})}];
  const row=bindings(prompt([target],{objects:0,relations:2},f.frame))[0].existingRelations[0];assert.equal(row.shaftBox_2d,null);
 }
});
test('malformed, accessor, proxy and over-capacity relation context is rejected without evaluating input',()=>{
 const f=fixture(),target={...select(f.plan,1,0)[0],index:5},base={id:'known',fromId:'left',toId:'right',direction:'forward'};let invoked=0;
 const accessor={...base};Object.defineProperty(accessor,'shaftBox',{enumerable:true,get(){invoked++;return null;}});
 const proxy=new Proxy(base,{get(){invoked++;return undefined;}});
 for(const existingRelations of [[accessor],[proxy],[{...base,fromId:'absent'}],[{...base,direction:'bad'}],
  [{...base,shaftBox:{x:NaN,y:0,w:1,h:1}}],Array.from({length:49},()=>base)])
  assert.throws(()=>prompt([{...target,existingRelations}],{objects:0,relations:2},f.frame),TypeError);
 assert.equal(invoked,0);
});
test('the new relation-context regression is in unified unit CI discovery',()=>{
 const {includesSuite}=require('../scripts/test-suites');assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
});
