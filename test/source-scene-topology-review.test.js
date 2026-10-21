"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {selectTopologyReviewTargets:select,readTopologyObservations:read,applyTopologyReview:apply,sceneEndpointWithinScope:inside,topologyReviewPrompt:prompt}=require('../packages/slideclone-core/source-scene-topology-review');
function fixture(){return parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
 {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
 {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:95,h:100}},
 {id:'right',parentId:'root',kind:'diagram',box:{x:100,y:0,w:100,h:100}}],objects:[
 {id:'a',regionId:'left',kind:'container',box:{x:5,y:20,w:20,h:20}},
 {id:'b',regionId:'left',kind:'container',box:{x:35,y:20,w:20,h:20}},
 {id:'c',regionId:'left',kind:'container',box:{x:65,y:20,w:20,h:20}},
 {id:'u',regionId:'right',kind:'container',box:{x:110,y:20,w:20,h:20}},
 {id:'v',regionId:'right',kind:'container',box:{x:150,y:20,w:20,h:20}},
 {id:'icon',regionId:'left',kind:'icon',box:{x:10,y:60,w:10,h:10}}],relations:[
 {id:'ab',regionId:'left',fromId:'u',toId:'v',direction:'forward'},
 {id:'bc',regionId:'left',fromId:'v',toId:'u',direction:'forward'}]},
 {sourceHash:'a'.repeat(64),widthPx:200,heightPx:100});}
function targets(p){return select(p,32).map((t,i)=>({...t,index:20+i}));}
function rows(){return [{index:20,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99},
 {index:21,fromId:'object-b',toId:'object-c',direction:'forward',confidence:.99}];}

test('legal endpoint references with physical source failures receive the original paired topology review',()=>{
 const p=fixture();p.relations=[{id:'relation-ab',regionId:'region-left',fromId:'object-a',toId:'object-b',direction:'forward'}];
 const before=structuredClone(p),evidence={unresolved:[{id:'relation-ab',reason:'relation-source-evidence',detailCode:'missing-native-node'}]};
 assert.deepEqual(select(p,32),[]);
 const selected=select(p,32,evidence).map(t=>({...t,index:20}));assert.equal(selected.length,1);
 assert.deepEqual(select(p,0,evidence),[]);assert.equal(selected[0].relationId,'relation-ab');
 const observation=[{index:20,fromId:'object-b',toId:'object-c',direction:'forward',confidence:.99}];
 const accepted=apply(p,selected,[observation,structuredClone(observation)]);
 assert.equal(accepted.plan.relations[0].fromId,'object-b');assert.equal(accepted.plan.relations[0].toId,'object-c');
 assert.deepEqual(p,before);assert.deepEqual(accepted.plan.objects,p.objects);
 const disagreement=structuredClone(observation);disagreement[0].toId='object-a';
 assert.deepEqual(apply(p,selected,[observation,disagreement]).plan.relations,p.relations);
 for(const detailCode of ['private provider content','shaft-width','source-scan-budget'])
  assert.deepEqual(select(p,32,{unresolved:[{...evidence.unresolved[0],detailCode}]}),[]);
 assert.deepEqual(select(p,32,{unresolved:[{...evidence.unresolved[0],id:'foreign'}]}),[]);
 assert.equal(select(p,1,{unresolved:[...evidence.unresolved,...evidence.unresolved]}).length,1);
 assert.throws(()=>select(p,32,{unresolved:[{id:1,reason:'relation-source-evidence'}]}),TypeError);
});

test('independent consensus may propose explicit undirected topology while unknown stays rejected',()=>{
 const p=fixture(),t=targets(p),a=rows(),b=rows();a[0].direction=b[0].direction='undirected';
 const before=structuredClone(p),result=apply(p,t,[a,b]);
 assert.equal(result.plan.relations[0].direction,'undirected');assert.deepEqual(p,before);
 b[0].direction='unknown';assert.deepEqual(apply(p,t,[a,b]).plan.relations[0],p.relations[0]);
 b[0].direction='forward';assert.deepEqual(apply(p,t,[a,b]).plan.relations[0],p.relations[0]);
});

test('relations may retain genuine pictorial endpoints without substituting their containing panels',()=>{
 const p=fixture();p.regions[1].kind='card';p.regions[2].kind='container';
 p.objects.push({id:'object-icon-right',regionId:'region-right',kind:'icon',box:{x:120,y:60,w:10,h:10}});
 p.relations=[{id:'relation-icons',regionId:'region-root',fromId:'object-icon',toId:'object-icon-right',direction:'forward'}];
 const before=structuredClone(p);assert.deepEqual(targets(p),[]);assert.equal(inside(p,'region-root','object-icon'),true);
 p.relations[0].fromId='region-root';const t=targets(p);assert.equal(t.length,1);
 assert(t[0].endpoints.some(e=>e.id==='region-left'));assert(t[0].endpoints.some(e=>e.id==='region-right'));
 assert(t[0].endpoints.some(e=>e.id==='object-icon'));assert(t[0].endpoints.some(e=>e.id==='object-icon-right'));
 assert(!t[0].endpoints.some(e=>e.id==='region-root'));
 const a=[{index:20,fromId:'object-icon',toId:'object-icon-right',direction:'forward',confidence:.99}];
 const out=apply(p,t,[a,structuredClone(a)]);assert.equal(out.evidence.corrected.length,1);
 assert.equal(out.plan.relations[0].fromId,'object-icon');assert.equal(out.plan.relations[0].toId,'object-icon-right');
 assert.deepEqual(out.plan.objects,before.objects);assert.deepEqual(out.plan.regions,before.regions);
 const disagreement=structuredClone(a);disagreement[0].toId='object-u';
 assert.deepEqual(apply(p,t,[a,disagreement]).plan.relations,p.relations);
});

test('semantic region references cannot be accepted as physical endpoints; physical regions keep hierarchy and containment guards',()=>{
 const p=fixture();p.relations=[{...p.relations[0],regionId:'region-root',fromId:'region-left',toId:'region-right'}];
 for(const kind of ['section','diagram','table','unknown']){
  p.regions[1].kind=kind;p.regions[2].kind=kind;assert.equal(inside(p,'region-root','region-left'),false);
  const t=targets(p);assert.equal(t.length,1);assert(!t[0].endpoints.some(e=>e.id==='region-left'||e.id==='region-right'));
  const a=[{index:20,fromId:'region-left',toId:'region-right',direction:'forward',confidence:1}];
  assert.deepEqual(apply(p,t,[a,a]).plan.relations,p.relations);
 }
 for(const kind of ['card','container']){p.regions[1].kind=kind;p.regions[2].kind=kind;assert.equal(inside(p,'region-root','region-left'),true);assert.deepEqual(select(p,32),[]);}
 p.regions[1].box.x=-1;assert.equal(inside(p,'region-root','region-left'),false);
 p.regions[1].box.x=0;p.regions[1].parentId='region-right';assert.equal(inside(p,'region-root','region-left'),false);
 assert.deepEqual(select(undefined,0),[]);
});
test('wrong-card references can be rebound by two observations without object capacity or geometry changes',()=>{
 const p=fixture(),before=JSON.stringify(p),t=targets(p),a=rows();
 const result=apply(p,t,[read({relations:a},t),read({relations:structuredClone(a)},t)]);
 assert.equal(result.evidence.corrected.length,2);assert.equal(result.plan.relations.length,2);
 assert.deepEqual(result.plan.objects,p.objects);assert.deepEqual(result.plan.regions,p.regions);assert.equal(result.plan.sourceHash,p.sourceHash);
 assert.equal(JSON.stringify(p),before);assert.deepEqual(result.plan.relations.map(r=>[r.id,r.fromId,r.toId]),[
  ['relation-ab','object-a','object-b'],['relation-bc','object-b','object-c']]);
 assert.deepEqual(t[0].endpoints.map(e=>e.id),['object-a','object-b','object-c','object-icon']);
 t[0].endpoints[0].box.x=500;assert.equal(select(p,1)[0].endpoints[0].box.x,5);
});
test('common-ancestor relations legitimately connect different child regions',()=>{
 const p=fixture();p.relations=[{...p.relations[0],regionId:'region-root',fromId:'object-a',toId:'object-u'}];
 assert.deepEqual(select(p,32),[]);assert.equal(inside(p,'region-root','object-a'),true);assert.equal(inside(p,'region-root','object-u'),true);
 assert.equal(inside(p,'region-left','object-u'),false);assert.equal(inside(p,'region-left','object-icon'),true);
 const icon=p.objects.find(o=>o.id==='object-icon');icon.parentObjectId='object-a';assert.equal(inside(p,'region-left','object-icon'),false);delete icon.parentObjectId;
 p.objects[0].regionId='region-right';assert.equal(inside(p,'region-root','object-a'),false);
 p.objects[0].regionId='region-left';p.regions[1].parentId='region-left';assert.equal(inside(p,'region-root','object-a'),false);
});
test('unknown, disagreement, low confidence, self links, unknown-kind and wrong-owner endpoints remain failed',()=>{
 for(const mutate of [r=>r.confidence=.89,r=>r.direction='unknown',r=>r.fromId=null,r=>r.fromId='object-b',
  r=>r.fromId='object-icon',r=>r.fromId='object-u',r=>r.toId='object-missing']){
  const p=fixture();p.objects.find(o=>o.id==='object-icon').kind='unknown';const t=targets(p),a=rows(),b=rows();mutate(a[0]);mutate(b[0]);
  const result=apply(p,t,[a,b]);assert.deepEqual(result.plan.relations[0],p.relations[0]);assert.ok(result.evidence.rejected.some(r=>r.id==='relation-ab'));
 }
 const p=fixture(),a=rows(),b=rows();b[0].direction='backward';assert.deepEqual(apply(p,targets(p),[a,b]).plan.relations[0],p.relations[0]);
 assert.throws(()=>apply(p,targets(p),[a]),/consensus/);
});
test('the same physical arrow cannot fill multiple relation slots or an already valid relation',()=>{
 const p=fixture(),t=targets(p),a=rows();a[1]={...a[0],index:21};
 let result=apply(p,t,[a,a]);assert.deepEqual(result.plan.relations,p.relations);assert.equal(result.evidence.corrected.length,0);
 assert.equal(result.evidence.rejected.filter(r=>r.reason==='duplicate-source-relation').length,2);
 a[1]={...a[0],index:21,fromId:a[0].toId,toId:a[0].fromId,direction:'backward'};
 assert.deepEqual(apply(p,t,[a,a]).plan.relations,p.relations);
 p.relations.push({id:'existing',regionId:'region-left',fromId:'object-a',toId:'object-b',direction:'forward'});
 result=apply(p,t,[rows(),rows()]);assert.equal(result.evidence.corrected.length,1);assert.deepEqual(result.plan.relations[0],p.relations[0]);
});
test('rollback collisions reject dependent corrections until the original inventory is stable',()=>{
 const p=fixture();
 p.relations[1]={...p.relations[1],regionId:'region-right',fromId:'object-a',toId:'object-b'};
 p.relations.push({...p.relations[0],id:'relation-third',fromId:'object-v',toId:'object-u'});
 const t=targets(p),a=[rows()[0],{index:21,fromId:'object-u',toId:'object-v',direction:'forward',confidence:.99},
  {...rows()[0],index:22}];
 const result=apply(p,t,[a,structuredClone(a)]);
 assert.deepEqual(result.plan.relations,p.relations);
 assert.equal(result.evidence.corrected.length,0);
 assert.equal(result.evidence.rejected.filter(r=>r.reason==='duplicate-source-relation').length,3);
 // Input enumeration must not choose a winning duplicate or affect rollback.
 p.relations.reverse();
 const reordered=apply(p,targets(p),[a.map(r=>({...r,index:42-r.index})),a.map(r=>({...r,index:42-r.index}))]);
 assert.deepEqual(reordered.plan.relations,p.relations);
});
test('empty, full object capacity and original target ceilings preserve bounded review',()=>{
 const p=fixture();p.objects.push(...Array.from({length:58},(_,i)=>({id:'extra-'+i,kind:'icon',regionId:'region-root',box:{x:1,y:1,w:1,h:1}})));
 assert.equal(select(p,32).length,2);assert.equal(select(p,1).length,1);assert.deepEqual(select(p,0),[]);assert.deepEqual(select(undefined,32),[]);
 assert.deepEqual(read({},[]),[]);assert.deepEqual(apply(p,[],[[],[]]).plan,p);assert.equal(prompt([],undefined),'');
 for(const n of [-1,33,.1,Infinity,NaN,null,'2'])assert.throws(()=>select(p,n),RangeError);
});
test('external observations reject malformed, extreme and hostile inputs without invoking code or leaking content',()=>{
 const t=targets(fixture());
 for(const mutate of [a=>a.pop(),a=>a.push(a[0]),a=>a[0].index=99,a=>a[0].confidence=NaN,a=>a[0].confidence=1.1,
  a=>a[0].fromId='../../secret',a=>a[0].direction='exec',a=>a[0].extra=true,a=>delete a[0].toId]){
  const a=rows();mutate(a);assert.throws(()=>read({relations:a},t),e=>e instanceof TypeError&&!e.message.includes('secret'));
 }
 let calls=0;const hostile={get relations(){calls++;throw Error('private content');}};
 for(const bad of [null,hostile,new Proxy({relations:rows()},{}),{relations:new Array(2)},
  {relations:new Proxy(rows(),{})},{relations:[{...rows()[0],get confidence(){calls++;throw Error('private content');}},rows()[1]]}])
  assert.throws(()=>read(bad,t),e=>e instanceof TypeError&&!e.message.includes('private content'));
 assert.equal(calls,0);
});
test('endpoint annotation coordinates bind to each exact source crop and sheet frame',()=>{
 const t=targets(fixture()).slice(0,1),frame={width:200,height:200,sourceTargets:[{index:20,cropBox:{x:0,y:10,w:100,h:50}}],
  sheetTargets:[{index:20,cropBox:{x:10,y:30,w:100,h:50}}]};
 const value=prompt(t,frame);assert.ok(value.includes('"id":"object-a","box_2d":[200,75,300,175]'));
 assert.match(value,/actual shaft and arrowheads/);assert.match(value,/DISTINCT visible connectors/);
 assert.throws(()=>prompt(t,undefined),/binding/);assert.throws(()=>prompt(t,{...frame,sheetTargets:[]}),/binding/);
});
test('an arrow location survives endpoint consensus and binds to the exact local sheet frame',()=>{
 const p=fixture();p.relations[0].shaftBox={x:28,y:26,w:5,h:8};
 const t=targets(p),frame={width:200,height:200,sourceTargets:[{index:20,cropBox:{x:0,y:10,w:100,h:50}}],
  sheetTargets:[{index:20,cropBox:{x:10,y:30,w:100,h:50}}]};
 assert.match(prompt(t.slice(0,1),frame),/"shaftBox2D":\[230,190,270,215\]/);
 assert.match(prompt(t.slice(0,1),frame),/do not reassign it by reading order/);
 const result=apply(p,t,[rows(),rows()]);assert.deepEqual(result.plan.relations[0].shaftBox,p.relations[0].shaftBox);
 t[0].shaftBox.y=90;assert.equal(p.relations[0].shaftBox.y,26);
 const {sceneRelationWithinAnchor:within}=require('../packages/slideclone-core/source-scene-topology-review');
 assert.equal(within(result.plan.relations[0],{start:{x:25,y:30},end:{x:35,y:30}}),true);
 assert.equal(within(result.plan.relations[0],{start:{x:25,y:50},end:{x:35,y:50}}),false);
 assert.equal(within(p.relations[1],{start:{x:25,y:50},end:{x:35,y:50}}),true);
});
