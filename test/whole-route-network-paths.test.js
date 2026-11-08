'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitWholeRouteNativeNetwork}=require('../packages/slideclone-core/routing/whole-route-network-fit');
const {inspectWholeRouteNetworkPaths:inspect}=require('../packages/slideclone-core/routing/whole-route-network-paths');
const {nativeElbowConnector,nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
const real=require('./fixtures/whole-native-network-input.json');
function drawing(connector){const points=nativeElbowVertices(connector),a=points[0],b=points.at(-1);
 return {type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style:{...connector,fill:'none',stroke:'#234567',strokeWidthPt:2}};}
function fixture(index=1){
 const network=fitWholeRouteNativeNetwork({...structuredClone(real[index]),approximation:'semantic-native',work:{checks:0}});assert.ok(network);
 const used=new Set(network.paths.flatMap(p=>p.chains.map(r=>r.index)));
 const arms=network.chains.flatMap((c,chainIndex)=>used.has(chainIndex)?[]:[{chainIndex,reversed:false,part:drawing(nativeElbowConnector(c.points))}]);
 return {network,relations:network.paths.map(p=>({relationId:p.relationId,part:drawing(p.connector)})),arms,work:{checks:0}};
}
test('actual Office presets match every ordered real path and retained physical arm',()=>{
 for(const index of [0,1]){const input=fixture(index),before=structuredClone(input),out=inspect(input);assert.ok(out);assert.equal(out.orderedPathsVerified,true);
  assert.equal(out.relations.length,input.network.paths.length);assert.equal(out.retainedArms.length,input.arms.length);
  assert.equal(out.fullActualTopologyVerified,false);assert.equal(out.nodeFollowingVerified,false);
  for(const p of [...out.relations,...out.retainedArms])assert.ok(p.match.maxPointErrorPt<=p.match.quantizationBoundPt);
  assert.deepEqual(input.network,before.network);assert.deepEqual(input.relations,before.relations);assert.ok(input.work.checks>0);}
});
test('same endpoints and connector counts cannot hide collapsed or switched cycle paths',()=>{
 const points=[[[-20,0],[60,0],[60,60],[80,60]],[[-20,0],[0,0],[0,60],[80,60]]].map(p=>p.map(([x,y])=>({x,y})));
 const input={network:{chains:points.map(p=>({points:p})),paths:points.map((_,i)=>({relationId:'route'+i,chains:[{index:i,reversed:false}]}))},
  relations:points.map((p,i)=>({relationId:'route'+i,part:drawing(nativeElbowConnector(p))})),arms:[],work:{checks:0}};
 assert.ok(inspect(input));const i=0,j=1,a=input.relations[i].part,b=input.relations[j].part;
 input.relations[j].part=structuredClone(a);assert.equal(inspect(input),null);
 input.relations[i].part=b;input.work={checks:0};assert.equal(inspect(input),null);
});
test('missing, duplicate, relabelled and reversed members fail atomically',()=>{
 for(const edit of [x=>x.relations.pop(),x=>x.relations.push(x.relations[0]),x=>x.relations[0].relationId='other',
  x=>x.arms.pop(),x=>x.arms.push(x.arms[0]),x=>x.arms[0].reversed=true,
  x=>x.relations[0].part.type='freeform',x=>x.relations[0].part.style.connectorFrame.x+=.1]){
  const input=fixture();assert.ok(input.arms.length);edit(input);assert.equal(inspect(input),null);}
 const input=fixture();input.network.paths[0].chains.reverse();assert.throws(()=>inspect(input),TypeError);
});
test('empty, illegal, extreme and hostile input never executes user hooks',()=>{
 for(const input of [null,{},[],{...fixture(),relations:[]},{...fixture(),network:{chains:[],paths:[]}}])assert.throws(()=>inspect(input),TypeError);
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const edit of [x=>proxy,x=>({...x,get network(){return trap();}}),x=>({...x,work:proxy}),x=>{x.network.chains[0].points[0]=proxy;return x;},
  x=>{x.relations[0].part.style={get connectorType(){return trap();}};return x;},
  x=>{x.arms[0].part.box.x={valueOf:trap};return x;},x=>{x.network.chains[0].points[0].x=100001;return x;}])assert.throws(()=>inspect(edit(fixture())),TypeError);
 assert.equal(calls,0);
});
test('ledger exhaustion never publishes partial correspondence',()=>{
 const input=fixture();input.work.checks=3999999;assert.throws(()=>inspect(input),/shared-geometry-budget/u);assert.equal(input.work.checks,4000001);
});
