'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {bindSceneStrokeRelations:bind,STROKE_BINDING_CONSTANTS}=require('../packages/slideclone-core/scene-plan/source-scene-stroke-binding');
const edge=(id,from,to,points)=>({id,from,to,points,lengthPx:Math.hypot(points.at(-1)[0]-points[0][0],points.at(-1)[1]-points[0][1])});
const objects=[{id:'a',box:{x:0,y:0,w:40,h:40}},{id:'b',box:{x:200,y:150,w:40,h:40}},{id:'c',box:{x:200,y:0,w:40,h:40}}];
const diagonal=edge('e0','n0','n1',[[45,45],[195,145]]);

test('a single diagonal stroke binds both endpoints and reports drawn direction',()=>{
 const graph={nodes:[],edges:[diagonal],arrowheads:[{nodeId:'n1',shaftEdgeId:'e0',tip:[195,145],direction:[.8,.6]}]};
 const rows=bind({graph,objects,relations:[{id:'r0',fromId:'a',toId:'b',direction:'forward'},{id:'r1',fromId:'b',toId:'a',direction:'forward'},
  {id:'r2',fromId:'a',toId:'b',direction:'undirected'},{id:'r3',fromId:'a',toId:'c',direction:'forward'}]});
 assert.deepEqual(rows.map(r=>[r.status,r.direction??r.reason]),[['bound','agrees'],['bound','contradicts'],['bound','contradicts'],['unbound','no-stroke']]);
 assert.equal(rows[0].sourceAuthorized,false);assert.equal(rows[0].edgeId,'e0');
});

test('missing arrowheads stay unobserved, and competing strokes stay ambiguous',()=>{
 const one=bind({graph:{nodes:[],edges:[diagonal],arrowheads:[]},objects,relations:[{id:'r',fromId:'a',toId:'b',direction:'forward'}]});
 assert.equal(one[0].direction,'unobserved');
 const two=bind({graph:{nodes:[],edges:[diagonal,edge('e1','n2','n3',[[40,30],[200,160]])],arrowheads:[]},objects,relations:[{id:'r',fromId:'a',toId:'b',direction:'forward'}]});
 assert.deepEqual([two[0].status,two[0].edgeIds],['ambiguous',['e0','e1']]);
});

test('short strokes and far endpoints never bind; constants are fixed',()=>{
 assert.deepEqual(STROKE_BINDING_CONSTANTS,{MIN_EDGE_PX:20,ATTACH_PX:24});
 const far=edge('e2','n0','n1',[[70,70],[170,120]]);
 const short=edge('e3','n0','n1',[[41,20],[55,20]]);
 const rows=bind({graph:{nodes:[],edges:[far,short],arrowheads:[]},objects:[...objects,{id:'d',box:{x:58,y:0,w:20,h:40}}],
  relations:[{id:'r',fromId:'a',toId:'b',direction:'forward'},{id:'s',fromId:'a',toId:'d',direction:'forward'},{id:'m',fromId:'a',toId:'zz',direction:'forward'}]});
 assert.deepEqual(rows.map(r=>r.status+':'+r.reason),['unbound:no-stroke','unbound:no-stroke','unbound:endpoint-missing']);
});

test('invalid graphs, objects and relations fail closed',()=>{
 const graph={nodes:[],edges:[diagonal],arrowheads:[]};
 for(const g of [null,{...graph,edges:null},{...graph,edges:[{...diagonal,points:[[0,0]]}]},{...graph,edges:[{...diagonal,points:[[0,NaN],[1,1]]}]},{...graph,arrowheads:[{}]}])
  assert.throws(()=>bind({graph:g,objects,relations:[]}),/graph is invalid/);
 assert.throws(()=>bind({graph,objects:[objects[0],objects[0]],relations:[]}),/object is invalid/);
 assert.throws(()=>bind({graph,objects:[new Proxy(objects[0],{})],relations:[]}),/object is invalid/);
 assert.throws(()=>bind({graph,objects,relations:[{id:'r',fromId:'a',toId:'b'}]}),/relation is invalid/);
 assert.throws(()=>bind({graph,objects,relations:Array.from({length:129},()=>({}))}),/input is invalid/);
});

test('topology review nominates relations with ambiguous or contradictory stroke bindings without granting source ownership',()=>{
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {selectTopologyReviewTargets}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}}],
  objects:[{id:'a',regionId:'root',kind:'container',box:{x:10,y:20,w:30,h:30}},{id:'b',regionId:'root',kind:'container',box:{x:120,y:20,w:30,h:30}}],
  relations:[{id:'ab',regionId:'root',fromId:'a',toId:'b',direction:'forward'}]},{sourceHash:'a'.repeat(64),widthPx:200,heightPx:100});
 assert.deepEqual(selectTopologyReviewTargets(plan,32,undefined,[{relationId:'relation-ab',status:'bound',direction:'agrees'}]),[]);
 assert.deepEqual(selectTopologyReviewTargets(plan,32,undefined,[{relationId:'relation-ab',status:'bound',direction:'unobserved'}]),[]);
 assert.deepEqual(selectTopologyReviewTargets(plan,32,undefined,[{relationId:'relation-ab',status:'unbound',reason:'no-stroke'}]),[]);
 assert.equal(selectTopologyReviewTargets(plan,32,undefined,[{relationId:'relation-ab',status:'bound',direction:'contradicts'}]).length,1);
 assert.equal(selectTopologyReviewTargets(plan,32,undefined,[{relationId:'relation-ab',status:'ambiguous',reason:'multiple-strokes'}]).length,1);
 assert.throws(()=>selectTopologyReviewTargets(plan,32,undefined,new Proxy([],{})),/stroke bindings are invalid/);
 assert.throws(()=>selectTopologyReviewTargets(plan,32,undefined,[{relationId:1,status:'bound'}]),/stroke binding row is invalid/);
});
