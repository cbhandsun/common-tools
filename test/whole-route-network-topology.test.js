'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectWholeRouteNetworkTopology:inspect}=require('../packages/slideclone-core/routing/whole-route-network-topology');
const {wholeRouteDrawing}=require('../packages/slideclone-core/routing/source-whole-route-geometry');
function line(a,b,width=3){return {type:'line',box:{x:a[0],y:a[1],w:b[0]-a[0],h:b[1]-a[1]},style:{fill:'none',stroke:'#123456',strokeWidthPt:width,lineCap:'round'}};}
const loop=()=>[line([0,0],[30,0]),line([30,0],[30,20]),line([30,20],[0,20]),line([0,20],[0,0]),line([-10,0],[0,0])];
const run=parts=>inspect({parts,work:{checks:0}});

test('a complete shared cycle survives overlap, reversal, translation and uniform scale',()=>{
 for(const scale of [0.25,1,10])for(const reverse of [false,true]){
  const parts=loop().map(p=>{const a=[(p.box.x+10)*scale,(p.box.y-20)*scale],b=[(p.box.x+p.box.w+10)*scale,(p.box.y+p.box.h-20)*scale];return line(reverse?b:a,reverse?a:b,3*scale);});
  parts.push(structuredClone(parts[0]));const before=structuredClone(parts),work={checks:0},out=inspect({parts,work});
  assert.equal(out.connectedComponents,1);assert.equal(out.cycles,1);assert.equal(out.fullTopologyVerified,false);assert.equal(out.sourceOwnershipGranted,false);
  assert.ok(work.checks>0&&work.checks<=4000000);assert.deepEqual(parts,before);
 }
});
test('the same relation count and endpoints cannot hide a lost or newly invented cycle',()=>{
 const original=loop(),lost=[...original.slice(0,2),line([30,20],[30,0]),line([30,0],[0,0]),original[4]];
 assert.equal(original.length,lost.length);assert.equal(run(original).cycles,1);assert.equal(run(lost).cycles,0);
 const bridge=[...original,line([0,10],[30,10])];assert.equal(run(bridge).cycles,2);
 assert.equal(run([...original,line([80,0],[100,0])]).connectedComponents,2);
});
test('actual cubic and connector commands are read without trusting metadata',()=>{
 const drawing=wholeRouteDrawing([[{x:0,y:0},{x:0,y:30},{x:30,y:30},{x:30,y:0}]]);
 const part={...drawing,style:{...drawing.style,fill:'none',stroke:'#123456',strokeWidthPt:3,lineCap:'round'},source:{get nativeRoutePoints(){throw Error('private-content');}}};
 assert.equal(run([part,line([30,0],[0,0])]).cycles,1);
});
test('empty, malformed, extreme, thin, dashed and oversized inputs never yield an unchecked pass',()=>{
 assert.deepEqual(run([]),{basis:'sampled-native-stroke-mask-v1',connectedComponents:0,cycles:0,cellSizePt:null,cells:0,sourceOwnershipGranted:false,fullTopologyVerified:false});
 for(const input of [undefined,null,{},[],{parts:[],work:{checks:-1}},{parts:new Array(2),work:{checks:0}},{parts:Array(129).fill(line([0,0],[10,10])),work:{checks:0}}])assert.throws(()=>inspect(input),TypeError);
 for(const edit of [p=>p.style.strokeWidthPt=0,p=>p.style.strokeWidthPt=NaN,p=>p.style.strokeWidthPt=101,p=>p.style.stroke='private-content',p=>p.box.x=Infinity,
  p=>p.style.strokeDash='dash',p=>p.style.dash='dot',p=>p.style.strokeDashPattern='[[1,1],[2,2]]',p=>p.style.opacity=0,p=>p.style.lineCap='flat',
  p=>p.style.strokeGradient={type:'linear',stops:[{color:'#000000',alpha:0},{color:'#123456'}]},
  p=>p.style.freeformPath='x'.repeat(262145)]){const p=line([0,0],[10,10]);edit(p);assert.throws(()=>run([p]),TypeError);}
 assert.equal(run([line([0,0],[100000,100000],.001)]),null);
});
test('the real shared-network regression detects cycle collapse despite intact whole relations',()=>{
 const f=require('./fixtures/whole-native-cycle-collapse.json');assert.equal(f.relations,5);
 assert.equal(f.before.length,f.collapsed.length);assert.equal(run(f.before).cycles,1);assert.equal(run(f.collapsed).cycles,0);
 assert.equal(run(f.networkConstrained).cycles,1);
});
test('actual Office node scaling can split a retained cycle despite unchanged complete connector bindings',()=>{
 const f=require('./fixtures/whole-native-cycle-split.json');
 assert.equal(f.businessRelations,5);assert.equal(f.auxiliaryPaths,1);
 const input=structuredClone(f);
 for(const parts of [f.before,f.bMoved,f.cScaled]){
  assert.equal(parts.length,6);
  for(const [i,part]of parts.entries()){
   assert.match(part.style.connectorType,/^elbow-[3-5]$/u);
   assert.equal(part.bindings.length,2);assert.deepEqual(part.bindings,f.before[i].bindings);
  }
  assert.equal(run(parts).connectedComponents,1);
 }
 assert.equal(run(f.before).cycles,1);assert.equal(run(f.bMoved).cycles,1);assert.equal(run(f.cScaled).cycles,2);
 assert.deepEqual(f,input);
});
test('an actual Office shape-type lock cannot stand in for physical cycle validation',()=>{
 const f=require('./fixtures/whole-native-cycle-locked-collapse.json');
 assert.equal(f.businessRelations,5);assert.equal(f.auxiliaryPaths,1);
 assert.equal(f.lockBefore,true);assert.equal(f.lockAfter,true);
 const input=structuredClone(f);
 for(const parts of [f.before,f.moved]){
  assert.equal(parts.length,6);
  for(const [i,part]of parts.entries())assert.deepEqual(part.bindings,f.before[i].bindings);
  assert.equal(run(parts).connectedComponents,1);
 }
 const auxiliary=parts=>parts.find(p=>p.id==='shared-7d801ca99e2bbf4a739c749d-edge-14');
 assert.equal(auxiliary(f.before).style.connectorType,'elbow-5');
 assert.equal(auxiliary(f.moved).style.connectorType,'elbow-3');
 assert.equal(run(f.before).cycles,1);assert.equal(run(f.moved).cycles,0);
 assert.deepEqual(f,input);
});

test('hostile nested accessors, proxies and coercion cannot execute or leak content',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const input of [proxy,{get parts(){return trap();},work:{checks:0}},{parts:new Proxy([],{get:trap}),work:{checks:0}},{parts:[],work:proxy}])assert.throws(()=>inspect(input),TypeError);
 for(const value of [proxy,{get strokeWidthPt(){return trap();}},{strokeWidthPt:{valueOf:trap}}]){const p=line([0,0],[10,10]);p.style=value;assert.throws(()=>run([p]),TypeError);}
 assert.equal(calls,0);
});
test('budget exhaustion cannot reset the caller ledger, modify shapes or emit a prefix',()=>{
 const parts=loop(),before=structuredClone(parts),work={checks:3999900};
 assert.throws(()=>inspect({parts,work}),/shared-geometry-budget/u);assert.equal(work.checks,4000001);assert.deepEqual(parts,before);
});
test('the topology inspector is typed, packaged and discovered by unified CI',()=>{
 const file='packages/slideclone-core/routing/whole-route-network-topology.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/whole-route-network-topology.test.js'));
});
