"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {selectSourceSceneReviewTargets:select}=require('../packages/slideclone-core/scene-plan/source-scene-review-targets');
const {selectSourceSceneMissingReviewTargets:selectMissing}=require('../packages/slideclone-core/scene-plan/source-scene-review-targets');
function fixture(){
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:1000,heightPx:1000,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1000,h:1000}}],
  objects:Array.from({length:8},(_,i)=>({id:'node-'+i,regionId:'root',kind:'container',box:{x:10+i*100,y:10,w:60,h:80}})),
  relations:Array.from({length:7},(_,i)=>({id:'edge-'+i,regionId:'root',fromId:'node-'+i,toId:'node-'+(i+1),direction:'forward'}))};
 return {plan,evidence:{unresolved:plan.objects.map(o=>({id:o.id,reason:'container-perimeter'}))}};
}

test('measured standalone icon endpoints do not monopolize mandatory structural review',()=>{
 const f=fixture();for(const o of f.plan.objects)o.kind='icon';
 assert.equal(select(f.plan,8).structures.filter(p=>!p.compileProbe).length,8,'unknown source keeps its old review obligations');
 assert.equal(select(f.plan,8,{unresolved:[]}).structures.length,0,'supported source-proven kind is not a contradiction');
 const related={unresolved:f.plan.relations.map(r=>({id:r.id,reason:'relation-source-evidence',detailCode:'shaft-support'}))};
 assert.ok(select(f.plan,8,related).structures.every(p=>p.compileProbe),'failed shafts do not turn supported icon kinds into mandatory corrections');
 const conflict={unresolved:[{id:f.plan.objects[0].id,reason:'icon-isolation',detailCode:'icon-source-text'}]};
 assert.equal(select(f.plan,8,conflict).structures[0].compileProbe,false);
 f.plan.objects[1].parentObjectId=f.plan.objects[0].id;
 assert.ok(select(f.plan,8,{unresolved:[]}).structures.some(p=>p.objectId===f.plan.objects[1].id&&!p.compileProbe));
});
test('unproven pictorial enclosures retain a kind review before speculative child and glyph discovery',()=>{
 for(const detailCode of ['outline-no-closed-component','outline-exterior-unstable','outline-open-topology']){
  const f=fixture();f.plan.objects[7].pictorialContent='present';
  f.evidence.unresolved=[{id:'node-7',reason:'container-perimeter',detailCode}];
  const before=JSON.stringify(f),selected=select(f.plan,4,f.evidence);
  assert.equal(selected.structures.length,1);assert.equal(selected.structures[0].objectId,'node-7');
  assert.equal(selected.structures[0].compileProbe,false);
  const discovery=selectMissing(f.plan,[],[],selected,4);
  assert.equal(discovery.structures.length,1);
  assert.equal(discovery.missing.length+discovery.structures.length+selected.inventories.length,4);
  assert.equal(JSON.stringify(f),before);
  for(const pictorialContent of ['absent','unknown',undefined]){
   const other=structuredClone(f);other.plan.objects[7].pictorialContent=pictorialContent;
   assert.ok(select(other.plan,4,other.evidence).structures.every(t=>t.compileProbe));
  }
 }
});

test('missing children receive shared targets before optional probes without altering failed evidence',()=>{
 const f=fixture(),before=JSON.stringify(f),result=select(f.plan,4,f.evidence);
 assert.equal(result.inventories.length,4);assert.equal(result.structures.length,0);
 assert.equal(JSON.stringify(f),before);assert.ok(result.inventories.every(t=>t.regionId==='root'));
 result.inventories[0].box.x=999;assert.equal(select(f.plan,4,f.evidence).inventories[0].box.x,10);
});
test('mandatory ownership and endpoint kind contradictions retain their slots',()=>{
 const f=fixture();f.plan.objects[0].regionId='wrong';f.plan.objects[1].kind='unknown';
 const result=select(f.plan,4,f.evidence);
 assert.equal(result.structures.length,2);assert.ok(result.structures.every(t=>!t.compileProbe));
 assert.deepEqual(new Set(result.structures.map(t=>t.objectId)),new Set(['node-0','node-1']));
 assert.equal(result.inventories.length,2);
 assert.ok(result.inventories.every(t=>!['node-0','node-1'].includes(t.objectId)));
 const limited=select(f.plan,1,f.evidence);assert.equal(limited.structures.length,1);assert.equal(limited.inventories.length,0);
});

test('measured icon text conflicts survive speculative glyph discovery without authorizing a correction',()=>{
 const f=fixture();f.plan.relations=[];
 f.plan.objects=f.plan.objects.map(o=>({...o,kind:'icon'}));
 f.evidence.unresolved=[{id:'node-7',reason:'icon-isolation',detailCode:'icon-source-text'}];
 const before=JSON.stringify(f),selected=select(f.plan,4,f.evidence);
 assert.equal(selected.structures.length,1);assert.equal(selected.structures[0].objectId,'node-7');
 assert.equal(selected.structures[0].compileProbe,false);
 const result=selectMissing(f.plan,[],[],selected,4);
 assert.equal(result.structures.length,1);assert.equal(result.structures[0].objectId,'node-7');
 assert.equal(result.missing.length,3);assert.equal(result.missing.length+result.structures.length,4);
 assert.equal(JSON.stringify(f),before);assert.equal(f.plan.objects[7].kind,'icon');
 assert.equal(f.evidence.unresolved.length,1);
 assert.deepEqual(select(f.plan,0,f.evidence),{structures:[],inventories:[]});
 for(const detail of [undefined,'icon-source-empty','untrusted-code']){
  const evidence={unresolved:[{id:'node-7',reason:'icon-isolation',...(detail?{detailCode:detail}:{})}]};
  assert.ok(select(f.plan,4,evidence).structures.every(t=>t.compileProbe));
 }
 const container=structuredClone(f);container.plan.objects[7].kind='container';
 assert.ok(select(container.plan,4,container.evidence).structures.every(t=>t.compileProbe));
});

test('clipped source icons retain paired geometry review before speculative glyph discovery',()=>{
 for(const detailCode of ['icon-source-clipped-component','icon-source-fringe-boundary']){
  const f=fixture();f.plan.relations=[];f.plan.objects=f.plan.objects.map(o=>({...o,kind:'icon'}));
  f.evidence.unresolved=[{id:'node-7',reason:'icon-isolation',detailCode}];
  const before=JSON.stringify(f),selected=select(f.plan,4,f.evidence);
  assert.equal(selected.structures.length,1);assert.equal(selected.structures[0].objectId,'node-7');
  assert.equal(selected.structures[0].compileProbe,false);
  const discovery=selectMissing(f.plan,[],[],selected,4);
  assert.equal(discovery.structures.length,1);assert.equal(discovery.missing.length,3);
  assert.equal(JSON.stringify(f),before);
 }
});

test('failed declared multi-face members precede optional inventories and discovery without promoting other source failures',()=>{
 const f=fixture();f.plan.objects[7].nativeGeometry={kind:'cylinder',capRatio:.2,seams:[.4,.7]};
 f.evidence.unresolved.push({id:'node-7',reason:'native-program-source-evidence',detailCode:'primitive-source-geometry'});
 const before=JSON.stringify(f),one=select(f.plan,1,f.evidence);
 assert.deepEqual(one.structures.map(t=>t.objectId),['node-7']);assert.equal(one.structures[0].compileProbe,false);
 assert.equal(one.inventories.length,0);assert.equal(selectMissing(f.plan,[],[],one,1).structures.length,1);
 assert.equal(selectMissing(f.plan,[],[],one,1).missing.length,0);
 const mixed=select(f.plan,4,f.evidence);assert.equal(mixed.structures.length,1);assert.equal(mixed.inventories.length,3);
 assert.ok(mixed.inventories.every(t=>t.objectId!=='node-7'));
 assert.equal(JSON.stringify(f),before);
 const noTypedMember=structuredClone(f);delete noTypedMember.plan.objects[7].nativeGeometry;
 assert.ok(select(noTypedMember.plan,1,noTypedMember.evidence).structures.every(t=>t.compileProbe));
 assert.deepEqual(select(f.plan,0,f.evidence),{structures:[],inventories:[]});
});
test('the original object ceiling limits discovery and each parent has exactly one review role',()=>{
 const f=fixture();f.plan.objects.push(...Array.from({length:55},(_,i)=>({id:'existing-'+i,kind:'icon',regionId:'root',box:{x:950,y:950,w:2,h:2}})));
 const result=select(f.plan,4,f.evidence);assert.equal(result.inventories.length,1);assert.equal(result.structures.length,3);
 assert.equal(new Set([...result.inventories,...result.structures].map(t=>t.objectId)).size,4);
 f.plan.objects.push({id:'last',kind:'icon',regionId:'root',box:{x:950,y:950,w:2,h:2}});
 const full=select(f.plan,32,f.evidence);assert.equal(full.inventories.length,0);assert.equal(full.structures.length,8);
 assert.ok(full.structures.every(t=>t.compileProbe));assert.equal(f.evidence.unresolved.length,8);
});
test('empty and exhausted target capacity returns no work and never reads optional feedback',()=>{
 const f=fixture();let calls=0;const hostile={get unresolved(){calls++;throw Error('secret');}};
 assert.deepEqual(select(undefined,32),{structures:[],inventories:[]});
 assert.deepEqual(select(f.plan,0,hostile),{structures:[],inventories:[]});
 assert.deepEqual(select({...f.plan,objects:[],relations:[]},32,{unresolved:[]}),{structures:[],inventories:[]});
 assert.equal(calls,0);
});
test('invalid capacities and hostile feedback fail without invoking getters or leaking content',()=>{
 const f=fixture();let calls=0;const hostile={get unresolved(){calls++;throw Error('secret');}};
 for(const capacity of [-1,33,Infinity,NaN,.5,null,'32'])assert.throws(()=>select(f.plan,capacity,f.evidence),RangeError);
 for(const evidence of [hostile,new Proxy(f.evidence,{}),{unresolved:new Array(1)},null])
  assert.throws(()=>select(f.plan,32,evidence),error=>error instanceof TypeError&&!error.message.includes('secret'));
 assert.equal(calls,0);
});

test('uncovered glyph candidates share the original target capacity before optional compile probes',()=>{
 const f=fixture();f.plan.objects=Array.from({length:64},(_,i)=>({id:'node-'+i,regionId:'root',kind:'container',
  box:{x:10+(i%8)*100,y:10+Math.floor(i/8)*100,w:30,h:30}}));
 f.plan.relations=[];f.evidence.unresolved=f.plan.objects.map(o=>({id:o.id,reason:'container-perimeter'}));
 const lines=f.plan.objects.slice(0,58).map(o=>({text:'existing',confidence:1,box:{...o.box}}));
 const selected=select(f.plan,32,f.evidence),before=JSON.stringify({f,lines,selected});
 assert.equal(selected.structures.length,32);assert.equal(selected.inventories.length,0);
 const result=selectMissing(f.plan,lines,[],selected,32);
 assert.deepEqual(result.missing.map(p=>p.objectId),f.plan.objects.slice(58).map(o=>o.id));
 assert.deepEqual(result.missing.map(p=>p.index),[58,59,60,61,62,63]);
 assert.equal(result.structures.length,26);assert.ok(result.structures.every(p=>p.compileProbe));
 assert.equal(result.missing.length+result.structures.length,32);assert.ok(result.missing.every(p=>p.text===null));
 assert.equal(JSON.stringify({f,lines,selected}),before);
 const covered=f.plan.objects.map(o=>({text:'existing',confidence:1,box:{...o.box}}));
 assert.deepEqual(selectMissing(f.plan,covered,[],selected,32),{missing:[],structures:selected.structures});
 const required={...selected,structures:selected.structures.map(p=>({...p,compileProbe:false}))};
 assert.deepEqual(selectMissing(f.plan,lines,[],required,32),{missing:[],structures:required.structures});
 assert.deepEqual(selectMissing(undefined,[],[],{structures:[],inventories:[]},0),{missing:[],structures:[]});
 for(const capacity of [-1,33,Infinity,.5,'32'])assert.throws(()=>selectMissing(f.plan,lines,[],selected,capacity),RangeError);
 assert.throws(()=>selectMissing(f.plan,lines,[],required,31),RangeError);
});
