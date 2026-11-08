'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {orthogonalSourceTree,createNativeRouteGeometry}=require('../packages/slideclone-core/routing/source-route-native-elbow');
const p=(x,y)=>({x,y});
const edge=(from,to,points,widthPx=3)=>({from,to,points:points.map(([x,y])=>p(x,y)),widthPx});
function bus(){return {
 joints:new Map([[0,p(0,0)],[1,p(50,.5)],[2,p(100,-.5)],[3,p(150,0)],[4,p(50,50)],[5,p(100,-50)]]),
 fixed:new Set([0,3,4,5]),edges:[edge(0,1,[[0,0],[25,.4],[50,.5]]),edge(1,2,[[50,.5],[75,0],[100,-.5]]),
 edge(2,3,[[100,-.5],[125,-.4],[150,0]]),edge(1,4,[[50,.5],[50,50]]),edge(2,5,[[100,-.5],[100,-50]])]};}
test('shared straight axes are solved together with fixed terminals and independently of edge order',()=>{
 for(const reverse of [false,true]){
  const input=bus(),before=structuredClone(input);if(reverse)input.edges.reverse();
  const solved=orthogonalSourceTree(input);
  assert.ok(solved.routes.every(Boolean));
  for(const id of [0,1,2,3])assert.equal(solved.joints.get(id).y,0);
  for(const id of input.fixed)assert.deepEqual(solved.joints.get(id),input.joints.get(id));
  if(reverse)input.edges.reverse();assert.deepEqual(input,before);
 }
});
test('a wide unrelated edge cannot enlarge a narrow junction displacement allowance',()=>{
 const input={joints:new Map([[0,p(0,50)],[1,p(50,140)],[9,p(50,90)],[20,p(200,0)],[21,p(200,100)]]),
 fixed:new Set([0,1,20,21]),edges:[edge(0,9,[[0,50],[10,50],[50,90]]),edge(9,1,[[50,90],[50,140]]),edge(20,21,[[200,0],[200,100]],20)]};
 const solved=orthogonalSourceTree(input);
 assert.deepEqual(solved.joints.get(9),input.joints.get(9));assert.equal(solved.routes[0],null);
});
test('contradictory fixed terminals reject the whole shared axis without moving or merging them',()=>{
 const input=bus();input.joints.set(3,p(150,1));input.edges[2].points.at(-1).y=1;
 const before=structuredClone(input),solved=orthogonalSourceTree(input);
 assert.ok(solved.routes.every(r=>r===null));assert.deepEqual(input,before);
 for(const id of input.fixed)assert.deepEqual(solved.joints.get(id),input.joints.get(id));
});
test('parallel axes remain separate unless connected by a measured straight edge',()=>{
 const input=bus();input.joints.set(10,p(0,2));input.joints.set(11,p(150,2));input.fixed.add(10);input.fixed.add(11);
 input.edges.push(edge(10,11,[[0,2],[150,2]]));
 const solved=orthogonalSourceTree(input);assert.ok(solved.routes.every(Boolean));
 assert.equal(solved.joints.get(1).y,0);assert.equal(solved.joints.get(10).y,2);
});
test('an unrelated moved junction cannot excuse missing geometry on another edge',()=>{
 const input={joints:new Map([[0,p(-50,0)],[1,p(50,0)],[2,p(0,60)],[9,p(0,9)],[20,p(-10,0)],[21,p(10,0)]]),
 fixed:new Set([0,1,2,20,21]),edges:[edge(0,9,[[-50,0],[-10,0],[-3,3],[0,9]]),
 edge(9,1,[[0,9],[3,3],[10,0],[50,0]]),edge(9,2,[[0,9],[0,60]]),edge(20,21,[[-10,0],[0,7],[10,0]])]};
 const solved=orthogonalSourceTree(input);assert.equal(solved.joints.get(9).y,0);
 assert.ok(solved.routes.slice(0,3).every(Boolean));assert.equal(solved.routes[3],null);
});
test('an exact closed network keeps its distinct axes, all vertices and every cycle arm',()=>{
 const input={joints:new Map([[0,p(0,0)],[1,p(100,0)],[2,p(100,50)],[3,p(0,50)]]),fixed:new Set([0]),
 edges:[edge(0,1,[[0,0],[100,0]]),edge(1,2,[[100,0],[100,50]]),edge(2,3,[[100,50],[0,50]]),edge(3,0,[[0,50],[0,0]])]};
 const solved=orthogonalSourceTree(input);assert.deepEqual(solved.joints,input.joints);
 assert.deepEqual(solved.routes,input.edges.map(e=>e.points));
 const {assertNativeRouteTopology}=require('../packages/slideclone-core/routing/source-route-native-topology');
 assert.equal(assertNativeRouteTopology({vertices:[...solved.joints].map(([id,point])=>({id:'v'+id,point})),
 edges:input.edges.map((e,i)=>({from:'v'+e.from,to:'v'+e.to,points:solved.routes[i]})),work:{checks:0}}),true);
});
test('empty geometry stays empty and the shared solver uses the same bounded ledger',()=>{
 assert.deepEqual(orthogonalSourceTree({joints:new Map(),fixed:new Set(),edges:[]}),{joints:new Map(),routes:[]});
 const work={checks:0};assert.ok(createNativeRouteGeometry(work).orthogonalSourceTree(bus()).routes.every(Boolean));assert.ok(work.checks>0);
 const exhausted={checks:4000000};assert.throws(()=>createNativeRouteGeometry(exhausted).orthogonalSourceTree(bus()),/shared-geometry-budget/u);
 assert.equal(exhausted.checks,4000001);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/').endsWith('/source-route-shared-axes.test.js')));
});
