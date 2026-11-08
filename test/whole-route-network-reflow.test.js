'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reflowWholeRouteNativeNetwork:reflow}=require('../packages/slideclone-core/routing/whole-route-network-reflow');
const {fitWholeRouteNativeNetwork:fit}=require('../packages/slideclone-core/routing/whole-route-network-fit');
const {nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
const real=require('./fixtures/whole-native-network-input.json');
const edited=require('./fixtures/whole-native-network-edited-ports.json');
const {syntheticNetwork}=require('./helpers/native-network-synthetic.cjs');
function input(index=1){return {...structuredClone(real[index]),approximation:'semantic-native',work:{checks:0}};}
function pins(value){const network=fit({...value,work:{checks:0}});assert.ok(network);
 return network.nodes.filter(n=>n.endpointId!==null).map(n=>({nodeId:n.id,point:{...n.point}}));}
function endpoints(out){for(const path of out.paths){assert.deepEqual(path.points,nativeElbowVertices(path.connector));
 const first=path.chains[0],last=path.chains.at(-1),a=out.chains[first.index],b=out.chains[last.index];
 for(const [nodeId,point]of [[first.reversed?a.to:a.from,path.points[0]],[last.reversed?b.from:b.to,path.points.at(-1)]]){
  const node=out.nodes.find(n=>n.id===nodeId);assert.ok(Math.hypot(node.point.x-point.x,node.point.y-point.y)<1e-6);
 }
}}

test('independent straight, elbow, tree and cycle networks translate all free tracks with their terminals',()=>{
 for(const index of [0,1,2,3])for(const [scale,mirror]of [[.3,1],[.5,1],[1,1],[1,-1],[2,1]])for(const [dx,dy]of [[17,23],[-40,50],[.1,.2],[0,0]]){
  const {name,cycles,input:value}=syntheticNetwork(index,scale,mirror),before=structuredClone(value),original=fit(value);assert.ok(original,name);
  value.work={checks:0};value.endpointPins=original.nodes.filter(n=>n.endpointId!==null).map(n=>({nodeId:n.id,point:{x:n.point.x+dx,y:n.point.y+dy}}));
  const out=reflow(value);assert.ok(out,`${name}: scale=${scale}, mirror=${mirror}, translation=${dx},${dy}`);
  assert.equal(out.sampledTopology.cycles,cycles);assert.equal(out.sampledTopology.connectedComponents,1);
  assert.equal(out.paths.length,original.paths.length);assert.equal(out.correspondence.orderedPathsVerified,true);endpoints(out);
  for(const chain of out.chains){const previous=original.chains.find(c=>c.refs[0].id===chain.refs[0].id);assert.ok(previous);
   assert.equal(chain.points.length,previous.points.length);
   for(const [i,p]of chain.points.entries())assert.ok(Math.hypot(p.x-previous.points[i].x-dx,p.y-previous.points[i].y-dy)<1e-6);
   assert.deepEqual(chain.refs,previous.refs);}
  assert.deepEqual(value.graph,before.graph);assert.deepEqual(value.parts,before.parts);
  assert.equal(out.automaticOfficeFollowingVerified,false);assert.equal(out.sourceOwnershipGranted,false);assert.ok(value.work.checks<=4000000);
 }
});

test('rigid translation cannot carry a free auxiliary track beyond the supported slide domain',()=>{
 const {input:value}=syntheticNetwork(3);
 value.graph.nodes.push({id:'free-arm-end',endpointId:null});
 value.graph.edges.push({id:'free-arm',from:'synthetic-4',to:'free-arm-end',memberId:'free-arm-part'});
 value.parts.push({id:'free-arm-part',type:'line',box:{x:173,y:151,w:0,h:40},style:{fill:'none',strokeWidthPt:2}});
 const original=fit(value);assert.ok(original);const before=structuredClone({graph:value.graph,parts:value.parts});
 const terminalNodes=original.nodes.filter(n=>n.endpointId!==null),dy=100000-Math.max(...terminalNodes.map(n=>n.point.y));
 value.endpointPins=terminalNodes.map(n=>({nodeId:n.id,point:{x:n.point.x,y:n.point.y+dy}}));value.work={checks:0};
 assert.ok(value.endpointPins.every(p=>Math.abs(p.point.y)<=100000));assert.equal(reflow(value),null);
 assert.deepEqual({graph:value.graph,parts:value.parts},before);assert.ok(value.work.checks>0&&value.work.checks<=4000000);
});

test('explicit reflow retains every ordered business path, unused arm and cycle after actual B/C edits',()=>{
 const value={...input(),endpointPins:structuredClone(edited.endpointPins)},before=structuredClone(value),out=reflow(value);assert.ok(out);
 assert.equal(out.paths.length,5);assert.equal(out.arms.length,1);assert.equal(out.cycleRank,1);
 assert.equal(out.sampledTopology.cycles,1);assert.equal(out.sampledTopology.connectedComponents,1);
 assert.equal(out.correspondence.orderedPathsVerified,true);endpoints(out);
 for(const p of [...out.paths,...out.arms]){assert.equal(Object.hasOwn(p,'part'),false);assert.equal(Object.hasOwn(p.connector,'stroke'),false);}
 for(const pin of value.endpointPins)assert.deepEqual(out.nodes.find(n=>n.id===pin.nodeId).point,pin.point);
 const original=fit({...input(),work:{checks:0}});assert.ok(original);
 for(const p of out.paths)assert.deepEqual(p.chains,original.paths.find(q=>q.relationId===p.relationId).chains);
 assert.deepEqual(out.chains.flatMap(c=>c.refs),original.chains.flatMap(c=>c.refs));
 assert.equal(out.sourceOwnershipGranted,false);assert.equal(out.sourceFootprintVerified,false);
 assert.equal(out.fullActualTopologyVerified,false);assert.equal(out.nodeFollowingVerified,false);assert.equal(out.automaticOfficeFollowingVerified,false);
 assert.deepEqual(value.graph,before.graph);assert.deepEqual(value.parts,before.parts);assert.deepEqual(value.endpointPins,before.endpointPins);
 assert.ok(value.work.checks>0&&value.work.checks<=4000000);
});

test('unchanged terminal coordinates preserve both real networks without mutating the caller',()=>{
 for(const index of [0,1]){const value=input(index);value.endpointPins=pins(value);const before=structuredClone(value),out=reflow(value);assert.ok(out);
  assert.equal(out.paths.length,index?5:2);assert.equal(out.sampledTopology.cycles,index?1:0);endpoints(out);
  assert.deepEqual(value.graph,before.graph);assert.deepEqual(value.parts,before.parts);assert.deepEqual(value.endpointPins,before.endpointPins);}
});

test('missing, repeated, unknown and nonterminal pins cannot publish a partial solve',()=>{
 for(const edit of [p=>p.pop(),p=>p.push(structuredClone(p[0])),p=>p[0].nodeId='unknown',p=>p[0].nodeId='vertex-1',p=>p.reverse()&&p.splice(1)]){
  const value=input();value.endpointPins=pins(value);edit(value.endpointPins);assert.throws(()=>reflow(value),TypeError);
 }
});

test('empty, illegal, extreme and unsafe values fail without running caller code or leaking content',()=>{
 for(const value of [undefined,null,[],{}, {...input(),endpointPins:[]},{...input(),endpointPins:new Array(2)},
  {...input(),endpointPins:Array(129).fill({})},{...input(),endpointPins:edited.endpointPins,work:{checks:-1}}])assert.throws(()=>reflow(value),TypeError);
 let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 const proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const bad of [proxy,new Proxy([],{get:trap}),{get nodeId(){return trap();}},
  {nodeId:'vertex-0',point:{get x(){return trap();},y:1}},{nodeId:'private\ncontent',point:{x:1,y:1}},
  ...[NaN,Infinity,100001,{},'private-content'].map(x=>({nodeId:'vertex-0',point:{x,y:1}}))]){
  const value=input();value.endpointPins=[bad,...edited.endpointPins.slice(1)];assert.throws(()=>reflow(value),error=>error instanceof TypeError&&!error.message.includes('private'));
 }
 const value=input();Object.defineProperty(value,'endpointPins',{get:trap});assert.throws(()=>reflow(value),TypeError);
 assert.equal(calls,0);
});

test('an edit that crosses a source branch is rejected rather than changing its identity',()=>{
 const value=input();value.endpointPins=pins(value);
 value.endpointPins.find(p=>p.nodeId==='vertex-4').point.x=800;
 const before=structuredClone(value);assert.equal(reflow(value),null);
 assert.deepEqual(value.graph,before.graph);assert.deepEqual(value.parts,before.parts);assert.deepEqual(value.endpointPins,before.endpointPins);
});

test('budget exhaustion is explicit and cannot reset the caller ledger',()=>{
 const value={...input(),endpointPins:structuredClone(edited.endpointPins),work:{checks:3999999}};
 assert.throws(()=>reflow(value),/shared-geometry-budget/u);assert.equal(value.work.checks,4000001);
});

test('inconsistent terminal pins on one straight track return no candidate',()=>{
 const value={approximation:'semantic-native',work:{checks:0},
  graph:{nodes:[{id:'a',endpointId:'start'},{id:'b',endpointId:'end'}],edges:[{id:'e',from:'a',to:'b',memberId:'p'}],
   paths:[{relationId:'route',edges:[{id:'e',reversed:false}]}]},
  parts:[{id:'p',type:'line',box:{x:0,y:0,w:0,h:50},style:{fill:'none',strokeWidthPt:2}}],
  endpointPins:[{nodeId:'a',point:{x:0,y:0}},{nodeId:'b',point:{x:10,y:50}}]};
 assert.equal(reflow(value),null);
});

test('caller vertex identities cannot collide with generated corner variable names',()=>{
 const value=input(),before='vertex-3',after='reflow-corner-3-1';
 value.graph.nodes.find(n=>n.id===before).id=after;
 for(const e of value.graph.edges){if(e.from===before)e.from=after;if(e.to===before)e.to=after;}
 value.endpointPins=pins(value);const out=reflow(value);assert.ok(out);
 assert.equal(out.sampledTopology.cycles,1);assert.equal(out.paths.length,5);
 assert.ok(out.nodes.some(n=>n.id===after));endpoints(out);
});

test('the explicit solver is typed, packaged and discovered by unified CI',()=>{
 const file='packages/slideclone-core/routing/whole-route-network-reflow.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/whole-route-network-reflow.test.js'));
});
