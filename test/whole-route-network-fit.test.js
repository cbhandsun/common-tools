'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {contractWholeRouteNetwork:contract}=require('../packages/slideclone-core/routing/whole-route-network-contract');
const {fitWholeRouteNativeNetwork:fit}=require('../packages/slideclone-core/routing/whole-route-network-fit');
const {wholeRouteCurves}=require('../packages/slideclone-core/routing/source-whole-route-geometry');
const {nativeElbowVertices,nativeElbowConnector}=require('../packages/slideclone-core/routing/source-route-native-elbow');
const {inspectWholeRouteNetworkTopology:inspect}=require('../packages/slideclone-core/routing/whole-route-network-topology');
const real=require('./fixtures/whole-native-network-input.json');
function simple(){
 const points=[[-20,0],[0,0],[60,0],[60,60],[0,60],[80,60]];
 const pairs=[[0,1],[1,2],[2,3],[3,4],[4,1],[3,5]];
 const graph={nodes:points.map((_,i)=>({id:'v'+i,endpointId:i===0||i===5?'node'+i:null})),
  edges:pairs.map(([a,b],i)=>({id:'e'+i,from:'v'+a,to:'v'+b,memberId:'p'+i})),
  paths:[{relationId:'top',edges:[{id:'e0',reversed:false},{id:'e1',reversed:false},{id:'e2',reversed:false},{id:'e5',reversed:false}]},
   {relationId:'bottom',edges:[{id:'e0',reversed:false},{id:'e4',reversed:true},{id:'e3',reversed:true},{id:'e5',reversed:false}]}]};
 const parts=pairs.map(([a,b],i)=>({id:'p'+i,type:'line',box:{x:points[a][0],y:points[a][1],w:points[b][0]-points[a][0],h:points[b][1]-points[a][1]},
  style:{fill:'none',strokeWidthPt:2}}));
 return {graph,parts,work:{checks:0},approximation:'semantic-native'};
}
test('network contraction preserves every physical edge, ordered reversal and both cycle paths',()=>{
 const input=simple(),before=structuredClone(input),out=contract(input);assert.ok(out);assert.equal(out.cycleRank,1);
 assert.equal(out.physicalEdgeCount,6);assert.equal(out.chains.length,4);assert.equal(out.nodes.length,4);
 assert.deepEqual(out.chains.flatMap(c=>c.refs.map(r=>r.id)).sort(),input.graph.edges.map(e=>e.id).sort());
 for(const path of out.logical){const expanded=path.chains.flatMap(r=>{
  const refs=out.chains[r.index].refs;return r.reversed?refs.slice().reverse().map(e=>({id:e.id,reversed:!e.reversed})):refs;});
  assert.deepEqual(expanded,input.graph.paths.find(p=>p.relationId===path.relationId).edges);}
 assert.deepEqual(input.graph,before.graph);assert.deepEqual(input.parts,before.parts);assert.ok(input.work.checks>0);
});
test('whole network produces one preset per relation without collapsing distinct sides of a cycle',()=>{
 const input=simple(),out=fit(input);assert.ok(out);assert.equal(out.paths.length,2);assert.equal(out.cycleRank,1);
 assert.equal(out.idealTopologyVerified,true);assert.notDeepEqual(out.paths[0].points,out.paths[1].points);
 for(const path of out.paths){assert.deepEqual(path.points,nativeElbowVertices(path.connector));
  assert.deepEqual(path.points[0],{x:-20,y:0});assert.deepEqual(path.points.at(-1),{x:80,y:60});}
 assert.equal(out.sourceFootprintVerified,false);assert.equal(out.fullActualTopologyVerified,false);assert.equal(out.nodeFollowingVerified,false);
 assert.ok(input.work.checks>0&&input.work.checks<=4000000);
});
test('actual two shared networks preserve all seven logical paths and the lower unused cycle arm',()=>{
 for(const [i,row]of real.entries()){
  const input={...structuredClone(row),work:{checks:0},approximation:'semantic-native'},before=structuredClone(input),out=fit(input);
  assert.ok(out);assert.equal(out.paths.length,i?5:2);assert.equal(out.cycleRank,i?1:0);
  assert.equal(out.chains.flatMap(c=>c.refs).length,input.graph.edges.length);
  const selected=new Set(out.paths.flatMap(p=>p.chains.map(r=>r.index))),unused=out.chains.filter((_,j)=>!selected.has(j));
  assert.equal(unused.length,i?1:0);
  for(const path of out.paths){const raw=input.graph.paths.find(p=>p.relationId===path.relationId);
   const first=raw.edges[0],last=raw.edges.at(-1),head=input.graph.edges.find(e=>e.id===first.id),tail=input.graph.edges.find(e=>e.id===last.id);
   const a=wholeRouteCurves(input.parts.find(p=>p.id===head.memberId)),b=wholeRouteCurves(input.parts.find(p=>p.id===tail.memberId));
   const s=first.reversed?a.at(-1).at(-1):a[0][0],e=last.reversed?b[0][0]:b.at(-1).at(-1);
   assert.ok(Math.hypot(path.points[0].x-s.x,path.points[0].y-s.y)<1e-6);
   assert.ok(Math.hypot(path.points.at(-1).x-e.x,path.points.at(-1).y-e.y)<1e-6);
   assert.deepEqual(path.points,nativeElbowVertices(path.connector));}
  assert.deepEqual(input.graph,before.graph);assert.deepEqual(input.parts,before.parts);
  assert.ok(input.work.checks<4000000);
 }
});
test('the generic fitter preserves the real cycle in decoded preset drawings, not just in graph metadata',()=>{
 const input={...structuredClone(real[1]),work:{checks:0},approximation:'semantic-native'},out=fit(input);assert.ok(out);
 const selected=new Set(out.paths.flatMap(p=>p.chains.map(r=>r.index)));
 const drawings=out.paths.map(p=>({points:p.points,connector:p.connector}));
 for(const c of out.chains.filter((_,i)=>!selected.has(i))){const connector=nativeElbowConnector(c.points);assert.ok(connector);
  drawings.push({points:nativeElbowVertices(connector),connector});}
 const parts=drawings.map(({points,connector})=>{const a=points[0],b=points.at(-1);return {type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},
  style:{...connector,fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round'}};});
 const work={checks:0},topology=inspect({parts,work});assert.ok(topology);assert.equal(topology.cycles,1);assert.equal(topology.connectedComponents,1);
 assert.equal(topology.fullTopologyVerified,false);assert.equal(out.fullActualTopologyVerified,false);
 for(const p of out.paths){const expanded=p.chains.flatMap(ref=>{const chain=out.chains[ref.index].refs;
  return ref.reversed?chain.slice().reverse().map(r=>({id:r.id,reversed:!r.reversed})):chain;});
  assert.deepEqual(expanded,input.graph.paths.find(r=>r.relationId===p.relationId).edges);}
});
test('reversing a complete logical path reverses its geometry without changing physical ownership',()=>{
 const input=simple(),forward=fit(input);assert.ok(forward);
 for(const p of input.graph.paths)p.edges=p.edges.slice().reverse().map(r=>({...r,reversed:!r.reversed}));input.work={checks:0};
 const backward=fit(input);assert.ok(backward);
 for(const p of backward.paths)assert.deepEqual(p.points,forward.paths.find(q=>q.relationId===p.relationId).points.slice().reverse());
});
test('translation, reflection and scale preserve branch identities and cycle rank',()=>{
 for(const [scale,mirror]of [[.5,1],[1,-1],[2,1]]){
  const input=simple();for(const p of input.parts){p.box.x=p.box.x*scale*mirror+123;p.box.y=p.box.y*scale-45;
   p.box.w*=scale*mirror;p.box.h*=scale;p.style.strokeWidthPt*=scale;}
  const out=fit(input);assert.ok(out);assert.equal(out.cycleRank,1);assert.equal(out.paths.length,2);
  for(const p of out.paths){assert.ok(Math.hypot(p.points[0].x-(-20*scale*mirror+123),p.points[0].y+45)<1e-6);
   assert.ok(Math.hypot(p.points.at(-1).x-(80*scale*mirror+123),p.points.at(-1).y-(60*scale-45))<1e-6);}
  assert.notDeepEqual(out.paths[0].points,out.paths[1].points);
 }
});
test('drawings with unsupported sample capacity return null before publishing a network',()=>{
 const input={approximation:'semantic-native',work:{checks:0},graph:{nodes:[{id:'a',endpointId:'start'},{id:'b',endpointId:'end'}],
  edges:[{id:'edge',from:'a',to:'b',memberId:'drawing'}],paths:[{relationId:'route',edges:[{id:'edge',reversed:false}]}]},
 parts:[{id:'drawing',type:'freeform',box:{x:0,y:0,w:5000,h:5000},style:{fill:'none',strokeWidthPt:2,closed:false,
  freeformSegments:[{type:'moveTo',points:[{x:0,y:0}]},{type:'cubicBezTo',points:[{x:1,y:0},{x:0,y:1},{x:1,y:1}]}]}}]};
 assert.equal(fit(input),null);assert.ok(input.work.checks>0&&input.work.checks<=4000000);
});
test('a lollipop loop keeps intermediate vertices instead of becoming a self-edge',()=>{
 const input=simple();input.graph.paths=[{relationId:'stem',edges:[{id:'e0',reversed:false}]}];
 // The full unused loop and the second stem still belong to the physical graph.
 input.graph.edges=input.graph.edges.filter(e=>e.id!=='e5');input.parts=input.parts.filter(p=>p.id!=='p5');input.graph.nodes=input.graph.nodes.filter(n=>n.id!=='v5');
 const out=contract(input);assert.ok(out);assert.equal(out.cycleRank,1);assert.equal(out.chains.length,5);
 assert.ok(out.chains.every(c=>c.from!==c.to));assert.equal(out.chains.flatMap(c=>c.refs).length,5);
});
test('path endpoints inside a degree-two chain remain explicit terminals',()=>{
 const input=simple();input.graph.paths=[{relationId:'partial',edges:[{id:'e1',reversed:false}]}];
 const out=contract(input);assert.ok(out);assert.ok(out.nodes.some(n=>n.id==='v2'));assert.equal(out.logical[0].chains.length,1);
});
test('missing, duplicate, disconnected, reordered and cyclic paths fail without a partial result',()=>{
 for(const edit of [
  x=>x.graph.edges.push({...x.graph.edges[0]}),x=>x.graph.nodes.push({...x.graph.nodes[0]}),x=>x.parts.push({...x.parts[0]}),
  x=>x.parts.pop(),x=>x.graph.edges[0].memberId='missing',x=>x.graph.edges[1].memberId=x.graph.edges[0].memberId,
  x=>x.graph.paths[0].edges[1].id='missing',x=>x.graph.paths[0].edges[1].reversed=true,
  x=>x.graph.paths[0].edges.reverse(),x=>x.graph.paths.push({...x.graph.paths[0]}),
  x=>x.graph.paths[0].edges.push({...x.graph.paths[0].edges[0]}),
  x=>x.graph.paths[0].edges=[{id:'e1',reversed:false},{id:'e2',reversed:false},{id:'e3',reversed:false},{id:'e4',reversed:false}],
  x=>x.parts[1].box.x+=1,x=>x.parts[0].style.strokeWidthPt=Infinity,
  x=>x.graph.nodes[0].id='bad\nnode',x=>x.graph.nodes[0].endpointId=17,
  x=>{x.graph.nodes.push({id:'detachedA',endpointId:null},{id:'detachedB',endpointId:null});x.graph.edges.push({id:'detached',from:'detachedA',to:'detachedB',memberId:'detachedPart'});
   x.parts.push({id:'detachedPart',type:'line',box:{x:200,y:200,w:10,h:0},style:{fill:'none',strokeWidthPt:2}});}
 ]){const input=simple();edit(input);assert.throws(()=>fit(input),TypeError);}
});
test('empty, illegal, extreme and unapproved controls cannot produce a connector',()=>{
 for(const value of [null,undefined,[],{}, {...simple(),approximation:'auto'},{...simple(),work:{checks:-1}},
  {...simple(),graph:{nodes:[],edges:[],paths:[]}},{...simple(),parts:[]},
  {...simple(),graph:{...simple().graph,nodes:Array.from({length:129},(_,i)=>({id:'v'+i,endpointId:null}))}}])assert.throws(()=>fit(value),TypeError);
 const long=simple();long.parts[0].style.freeformPath='x'.repeat(262145);assert.throws(()=>fit(long),TypeError);
 const huge=simple();huge.parts[0].box.x=100001;assert.throws(()=>fit(huge),TypeError);
});
test('unrepresentable or intersecting physical geometry returns null',()=>{
 const input=simple();input.parts[5].box.w=-80;assert.equal(fit(input),null);
});
test('hostile proxies, getters and coercion hooks are never invoked or logged',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const edit of [x=>proxy,x=>({...x,get graph(){return trap();}}),x=>({...x,graph:proxy}),x=>({...x,work:proxy}),
  x=>({...x,parts:proxy}),x=>{x.graph.nodes[0]=proxy;return x;},x=>{x.graph.paths[0].edges[0]=proxy;return x;},
  x=>{x.parts[0].style={get strokeWidthPt(){return trap();}};return x;},x=>{x.parts[0].style.strokeWidthPt={valueOf:trap};return x;},
  x=>{x.graph.nodes[0].id={toString:trap};return x;},x=>{x.graph.edges[0].memberId=proxy;return x;},
  x=>{Object.defineProperty(x.graph.nodes,'0',{get:trap});return x;}])assert.throws(()=>fit(edit(simple())),TypeError);
 assert.equal(calls,0);
});
test('source route metadata cannot override the real physical drawing commands',()=>{
 const input=simple(),expected=fit(input);assert.ok(expected);let calls=0;
 for(const p of input.parts)p.source={get nativeRoutePoints(){calls++;throw Error('private-content');},sourceFootprintVerified:true};
 input.work={checks:0};assert.deepEqual(fit(input),expected);assert.equal(calls,0);
 input.parts[0].box.w+=1;input.work={checks:0};assert.throws(()=>fit(input),TypeError);assert.equal(calls,0);
});
test('the caller ledger is never reset and exhaustion cannot return a prefix',()=>{
 for(const checks of [3999999,4000000]){const input=simple();input.work.checks=checks;const before=structuredClone(input.graph);
  assert.throws(()=>fit(input),/shared-geometry-budget/u);assert.equal(input.work.checks,4000001);assert.deepEqual(input.graph,before);}
 const input={...structuredClone(real[1]),approximation:'semantic-native',work:{checks:3970000}},before=structuredClone(input.graph);
 assert.throws(()=>fit(input),/shared-geometry-budget/u);assert.equal(input.work.checks,4000001);assert.deepEqual(input.graph,before);
});
test('network modules are boundary-typed, shipped and found by unified CI',()=>{
 for(const name of ['whole-route-network-contract','whole-route-network-fit']){const file='packages/slideclone-core/routing/'+name+'.js';
  assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
  assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));}
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/whole-route-network-fit.test.js'));
});
