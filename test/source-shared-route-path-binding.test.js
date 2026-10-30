'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {bindSharedSourcePath:bind}=require('../packages/slideclone-core/routing/source-shared-route-path-binding');

function fixture(){
 const points={source:[10,0],a:[10,10],b:[0,20],c:[20,20],left:[0,30],right:[20,30]};
 const vertices=Object.entries(points).map(([id,[x,y]])=>({id,endpointId:['source','left','right'].includes(id)?id:null,
  arrow:['left','right'].includes(id),point:{x,y}}));
 const edges=[['source','a'],['a','b'],['a','c'],['b','c'],['b','left'],['c','right']].map(([from,to],i)=>({id:'edge-'+i,from,to,memberId:'part-'+i,direction:'undirected'}));
 const segments=new Map(edges.map(e=>{
  const [x,y]=points[e.from],[xx,yy]=points[e.to],count=Math.max(Math.abs(xx-x),Math.abs(yy-y));
  const path=Array.from({length:count+1},(_,i)=>({x:x+(xx-x)*i/count,y:y+(yy-y)*i/count}));
  return [e.id,{path,low:0,high:path.length-1}];
 }));
 return {relation:{id:'r',regionId:'root',fromId:'source',toId:'left',direction:'forward',shaftBox:{x:3,y:14,w:3,h:3}},
  graph:{id:'network',regionId:'root',sourceHash:'a'.repeat(64),topology:'source-network-v1',nodes:vertices.map(v=>({id:v.id,endpointId:v.endpointId,nativeId:v.id})),edges,paths:[]},
  vertices,segments,window:{x:0,y:0,w:40,h:40},work:{checks:0}};
}

test('cycle paths are selected by source identity across node, edge and edge-direction permutations',()=>{
 const expected=bind(fixture());assert.ok(expected.binding,expected.reason);
 for(const reverseEdges of [false,true])for(const reverseVertices of [false,true])for(const reverseDirection of [false,true]){
  const f=fixture();if(reverseEdges)f.graph.edges.reverse();if(reverseVertices)f.vertices.reverse();
  if(reverseDirection)for(const edge of f.graph.edges){
   [edge.from,edge.to]=[edge.to,edge.from];f.segments.get(edge.id).path.reverse();
  }
  const result=bind(f);assert.ok(result.binding,result.reason);assert.deepEqual(result.binding.samples,expected.binding.samples);
  const ambiguous={...f,relation:{...f.relation,shaftBox:undefined},work:{checks:0}};
  assert.equal(bind(ambiguous).reason,'shared-relation-ambiguous');
 }
});

test('an explicit path disambiguates a broad anchor but cannot fabricate a source route',()=>{
 const f=fixture(),program={kind:'polyline',dash:'solid',vertices:[[10,0],[10,10],[0,20],[0,30]].map(([x,y])=>({x,y}))};
 const input={...f,relation:{...f.relation,shaftBox:{x:0,y:0,w:40,h:40},visiblePath:program}};
 assert.ok(bind(input).binding);
 input.relation.visiblePath={...program,vertices:[{x:10,y:0},{x:30,y:10},{x:0,y:30}]};input.work={checks:0};
 assert.equal(bind(input).reason,'shared-path-program');
 assert.equal(bind({...fixture(),relation:{...f.relation,direction:'backward'}}).reason,'shared-relation-direction');
 assert.equal(bind({...fixture(),relation:{...f.relation,shaftBox:{x:35,y:35,w:1,h:1}}}).reason,'shared-relation-anchor');
});

test('a reversed observation cannot bind a directed physical route despite zero unordered distance',()=>{
 const f=fixture();f.relation.visiblePath={kind:'polyline',dash:'solid',
  vertices:[[0,30],[0,20],[10,10],[10,0]].map(([x,y])=>({x,y}))};
 const before=structuredClone(f.relation);assert.equal(bind(f).reason,'shared-path-program');
 assert.deepEqual(f.relation,before);
});

test('native corner movement cannot select a cycle arm without original source overlap',()=>{
 const f=fixture();f.relation.shaftBox={x:3,y:12,w:1,h:1};
 f.routes=new Map([['edge-1',[{x:10,y:10},{x:3,y:12},{x:0,y:20}]]]);
 assert.equal(bind(f).reason,'shared-relation-anchor');
});

test('a dense continuously checked path crosses bounded anchor windows without losing or fabricating its original identity',()=>{
 const f=fixture(),expected=bind(f),g=fixture();assert.ok(expected.binding);
 g.routes=new Map(g.graph.edges.map(e=>{
  const a=g.vertices.find(v=>v.id===e.from).point,b=g.vertices.find(v=>v.id===e.to).point;
  return [e.id,Array.from({length:129},(_,i)=>({x:a.x+(b.x-a.x)*i/128,y:a.y+(b.y-a.y)*i/128}))];
 }));
 const actual=bind(g);assert.ok(actual.binding,actual.reason);assert.ok(actual.binding.points.length>32);
 assert.deepEqual(actual.binding.refs,expected.binding.refs);assert.deepEqual(actual.binding.samples,expected.binding.samples);
 assert.ok(g.work.checks>f.work.checks);
 const invalid={...g,relation:{...g.relation,shaftBox:{x:3,y:12,w:1,h:1}},work:{checks:0}};
 assert.equal(bind(invalid).reason,'shared-relation-anchor');
 const short={...g,work:{checks:4000000-g.work.checks+1}};assert.equal(bind(short).reason,'shared-geometry-budget');
});

test('exhaustion or an overlong alternative invalidates an otherwise valid binding',()=>{
 const f=fixture();f.work.checks=3999999;assert.equal(bind(f).reason,'shared-geometry-budget');assert.ok(f.work.checks<=4000001);
 for(const sourceBudget of [true,false]){
  const g=fixture();g.relation.shaftBox=undefined;
  if(sourceBudget){
   const s=g.segments.get('edge-3');s.path=Array.from({length:514},()=>({x:10,y:20}));s.high=513;
   assert.equal(bind(g).reason,'shared-source-path-budget');
  }else{
   const edge=g.graph.edges.find(e=>e.id==='edge-3'),from=edge.from,to=edge.to;g.graph.edges=g.graph.edges.filter(e=>e!==edge);
   for(let i=0;i<15;i++){
    const a=i?'extra-'+(i-1):from,b=i===14?to:'extra-'+i,id='long-'+i;
    if(i<14)g.vertices.push({id:b,endpointId:null,arrow:false,point:{x:i,y:20}});
    g.graph.edges.push({id,from:a,to:b,memberId:'part-'+id,direction:'undirected'});
    g.segments.set(id,{path:[{x:i,y:20},{x:i+1,y:20}],low:0,high:1});
   }
   assert.equal(bind(g).reason,'shared-path-budget');
  }
 }
});

test('path binding regressions are included by the unified CI discovery',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(r=>r.file.replaceAll('\\','/')==='test/source-shared-route-path-binding.test.js'));
});
test('partial group binding never accepts earlier paths after an alternative or the aggregate search exhausts a budget',()=>{
 const {bindSharedSourceRelations:bindGroup}=require('../packages/slideclone-core/routing/source-shared-route-bindings');
 const context=require('./helpers/source-edge-choice.cjs').fixture().context;
 const make=()=>{const f=fixture(),{relation,...base}=f;return {...base,choiceContext:context,allowUnboundRelations:true,
  relations:[relation,{...relation,id:'right',toId:'right',shaftBox:{x:16,y:14,w:3,h:3}},
   {...relation,id:'ambiguous',shaftBox:undefined}]};};
 const measured=make();assert.equal(bindGroup(measured).bindings.size,2);
 const f=make();f.work.checks=4000000-measured.work.checks+1;
 assert.throws(()=>bindGroup(f),/shared-geometry-budget/);assert.ok(f.work.checks<=4000001);
 const long=make(),segment=long.segments.get('edge-3');
 segment.path=Array.from({length:514},()=>({x:10,y:20}));segment.high=513;
 assert.throws(()=>bindGroup(long),/shared-source-path-budget/);
 const tree=make();delete tree.graph.topology;assert.throws(()=>bindGroup(tree),/shared-relation-ambiguous/);
});
