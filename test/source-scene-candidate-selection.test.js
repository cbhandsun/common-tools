'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectSceneCandidates:select}=require('../packages/slideclone-core/scene-plan/source-scene-candidate-selection');
const sourceHash='a'.repeat(64);
const id=i=>'candidate-'+i.toString(16).padStart(24,'0');
const cand=(i,x,y,w,h,ink=Math.max(1,Math.floor(w*h/4)))=>({id:id(i),box:{x,y,w,h},inkPixels:ink,touchesFrame:false});
const catalog=candidates=>({sourceHash,widthPx:400,heightPx:400,candidates});

test('stratified selection keeps small pictograms that area-first ranking would starve',()=>{
 // Twelve large envelopes in one corner, two small icons elsewhere.
 const large=Array.from({length:12},(_,i)=>cand(i+1,(i%4)*20,Math.floor(i/4)*20,90,90));
 const small=[cand(100,300,300,20,20),cand(101,300,40,30,30)];
 const result=select(catalog([...large,...small]),{budget:4,textBoxes:[]});
 const ids=result.catalog.candidates.map(c=>c.id);
 assert.ok(ids.includes(id(100))&&ids.includes(id(101)));
 assert.equal(result.catalog.candidates.length,4);assert.equal(result.evidence.sourceAuthorized,false);
});

test('OCR-covered candidates are deferred but never removed, using geometry only',()=>{
 const text=cand(1,10,10,40,10),icon=cand(2,200,200,30,30);
 const deferred=select(catalog([text,icon]),{budget:2,textBoxes:[{x:5,y:5,w:60,h:20}]});
 assert.deepEqual(deferred.catalog.candidates.map(c=>c.id),[id(2),id(1)]);assert.equal(deferred.evidence.textDeferred,1);
 // Partial (<90%) overlap is not deferred.
 const partial=select(catalog([cand(3,10,10,40,40),icon]),{budget:2,textBoxes:[{x:10,y:10,w:40,h:20}]});
 assert.equal(partial.evidence.textDeferred,0);
});

test('selection is deterministic, order-independent and does not mutate its input',()=>{
 const rows=Array.from({length:40},(_,i)=>cand(i+1,(i*37)%300,(i*53)%300,10+(i%5)*12,10+(i%7)*9));
 const input=catalog(rows),snapshot=JSON.stringify(input);
 const a=select(input,{budget:16,textBoxes:[{x:0,y:0,w:100,h:30}]});
 const b=select(catalog([...rows].reverse()),{budget:16,textBoxes:[{x:0,y:0,w:100,h:30}]});
 assert.deepEqual(a,b);assert.equal(JSON.stringify(input),snapshot);
 a.catalog.candidates[0].box.x=999;assert.equal(JSON.stringify(input),snapshot);
 assert.equal(select(input,{budget:256,textBoxes:[]}).catalog.candidates.length,40);
});

test('selection rejects invalid budgets, text boxes and catalogs before work',()=>{
 const ok=catalog([cand(1,0,0,10,10)]);
 for(const budget of [0,257,1.5,'4',NaN,undefined])assert.throws(()=>select(ok,{budget,textBoxes:[]}),/budget/);
 for(const textBoxes of [null,{},[{x:0,y:0,w:0,h:1}],[{x:-1,y:0,w:2,h:2}],[{x:0,y:0,w:401,h:1}],[{x:0.5,y:0,w:2,h:2}],
  Array.from({length:513},()=>({x:0,y:0,w:1,h:1})),[new Proxy({x:0,y:0,w:1,h:1},{get(){throw Error('private');}})]])
  assert.throws(()=>select(ok,{budget:1,textBoxes}),/text boxes/);
 assert.throws(()=>select({...ok,sourceHash:'x'},{budget:1,textBoxes:[]}),/catalog/);
 assert.throws(()=>select(catalog([cand(1,0,0,10,10),cand(1,20,20,10,10)]),{budget:1,textBoxes:[]}),/entry/);
});
