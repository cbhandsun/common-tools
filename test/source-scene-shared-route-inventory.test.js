'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sharedRouteInventoryFixture:fixture}=require('./helpers/scene-shared-route-inventory.cjs');
const {readSharedSceneRouteGraphs:read,sharedSceneRouteMembers:members,survivingSharedSceneRoutes:surviving}=require('../packages/slideclone-core/source-scene-shared-route-inventory');
const {survivingSceneUnits}=require('../packages/slideclone-core/source-scene-inventory-materialization');
const {buildSceneInventoryEvidence:build,auditSceneInventory:audit}=require('../packages/slideclone-core/source-scene-observed-inventory');
const {packSceneInventoryMembers:pack,unpackSceneInventoryMembers:unpack}=require('../packages/slideclone-core/source-scene-inventory-codec');
const {writeSceneInventoryArtifact:write}=require('../packages/slideclone-core/source-scene-inventory-artifact');
const {finalizeSourceScene}=require('../packages/slideclone-core/source-scene-finalize');
const validate=f=>read([f.graph],f.units,f.plan.sourceHash);
const paths=f=>surviving([f.graph],f.shapes,[],f.units);

test('one physical shared trunk supports two final logical paths without acquiring source authority',()=>{
 const f=fixture(),before=JSON.stringify(f);
 assert.deepEqual(validate(f),[f.graph]);assert.equal(members(f.graph).length,8);
 assert.equal(new Set(members(f.graph)).size,8);assert.equal(paths(f).size,2);
 assert.ok(paths(f).get('relation-left').includes('graph-trunk'));
 assert.ok(paths(f).get('relation-right').includes('graph-trunk'));
 assert.equal(survivingSceneUnits(f.units,f.shapes,[],true,[f.graph]).size,5);
 const evidence=build(f.plan,f.shapes,[],[],[f.graph]);
 assert.equal(evidence.version,5);assert.deepEqual(audit(evidence,f.shapes,[],f.plan.sourceHash),[]);
 assert.equal(JSON.stringify(f),before);
});

test('deleting the trunk invalidates both paths and deleting one branch invalidates only its dependent path',()=>{
 const f=fixture(),evidence=build(f.plan,f.shapes,[],[],[f.graph]);
 for(const [removed,count]of [['graph-trunk',2],['graph-left-terminal',1],['graph-junction',2]]){
  const shapes=f.shapes.filter(s=>s.id!==removed);
  assert.equal(surviving([f.graph],shapes,[],f.units).size,2-count);
  assert.ok(audit(evidence,shapes,[],f.plan.sourceHash).some(r=>r.reason==='compile-missing'&&r.kind==='relations'&&r.count===count));
 }
 const extra=structuredClone(f.shapes[3]);extra.id='unlisted-part';
 assert.deepEqual(audit(evidence,[...f.shapes,extra],[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
});

test('external endpoints must belong to the exact recorded object, and all its required members must survive',()=>{
 const f=fixture();
 f.graph.nodes.find(n=>n.id==='node-source').nativeId='unrelated-node';
 f.shapes.push({id:'unrelated-node',type:'rect',source:{sceneInventoryId:'object-source'}});
 f.shapes.find(s=>s.id==='graph-trunk').style.startAnchor.elementId='unrelated-node';
 assert.throws(()=>validate(f),TypeError);assert.equal(paths(f).size,0);
 const g=fixture();g.units[0].members.push({type:'shape',id:'missing-required-perimeter'});
 assert.equal(paths(g).size,0);
 const h=fixture();h.shapes[0].source.sceneInventoryId='object-left';assert.equal(paths(h).size,0);
});

test('internal controls are bounded invisible native junctions and arrow values match the actual writer enum',()=>{
 for(const mutate of [s=>s.box.w=600,s=>s.box.h=340,s=>s.box.x=NaN,s=>s.style.fill='#000000',
  s=>s.style.stroke='#000000',s=>s.style.strokeWidthPt=1,s=>s.type='ellipse']){
  const f=fixture();mutate(f.shapes.find(s=>s.id==='graph-junction'));assert.equal(paths(f).size,0);
 }
 for(const value of [{},true,1,'diamond','bad-arrow','',null]){
  const f=fixture();f.shapes.find(s=>s.id==='graph-left-terminal').style.endArrow=value;assert.equal(paths(f).size,1);
 }
 for(const value of ['triangle','arrow','openArrow']){
  const f=fixture();f.shapes.find(s=>s.id==='graph-left-terminal').style.endArrow=value;assert.equal(paths(f).size,2);
 }
});

test('wrong actual connector bindings, duplicate identities, direction and invalid anchors cannot satisfy paths',()=>{
 for(const mutate of [f=>f.shapes.push(structuredClone(f.shapes[0])),
  f=>f.shapes.push(structuredClone(f.shapes.find(s=>s.id==='graph-trunk'))),
  f=>f.shapes.find(s=>s.id==='graph-trunk').style.startAnchor.elementId='node-left',
  f=>f.shapes.find(s=>s.id==='graph-trunk').style.startAnchor.position=Infinity,
  f=>f.shapes.find(s=>s.id==='graph-trunk').style.startAnchor.side='diagonal',
  f=>f.shapes.find(s=>s.id==='graph-trunk').style.endArrow='triangle']){
  const f=fixture();mutate(f);assert.equal(paths(f).size,0);
 }
});

test('graph parser rejects empty, malformed, cyclic, cross-source, cross-owner and over-budget claims',()=>{
 assert.deepEqual(read([],[], 'a'.repeat(64)),[]);
 for(const mutate of [f=>f.graph.sourceHash='b'.repeat(64),f=>f.graph.regionId='other',f=>f.graph.extra=true,
  f=>f.graph.nodes[0].endpointId='object-unknown',f=>f.graph.nodes[1].nativeId='node-source',
  f=>f.graph.edges[1].memberId='graph-trunk',f=>f.graph.edges[0].to='node-source',
  f=>f.graph.edges[0].to='graph-left-turn',f=>f.graph.edges[0].direction='forward',
  f=>f.graph.paths[1].relationId='relation-left',f=>f.graph.paths[0].edges.reverse(),
  f=>f.graph.paths[0].edges[1].reversed=true,f=>f.graph.paths[0].edges=Array(16).fill(f.graph.paths[0].edges[0]),
  f=>f.graph.nodes=Array(34).fill(f.graph.nodes[0]),f=>f.graph.edges=Array(33).fill(f.graph.edges[0]),
  f=>f.graph.paths=Array(49).fill(f.graph.paths[0]),f=>f.graph.paths.pop()]){
  const f=fixture();mutate(f);assert.throws(()=>validate(f),TypeError);
 }
 assert.throws(()=>read(Array(25).fill(fixture().graph),fixture().units,'a'.repeat(64)),TypeError);
 assert.throws(()=>read(null,[],'a'.repeat(64)),TypeError);
});

test('hostile graph controls never execute getters, proxies or direction coercion',()=>{
 let calls=0;const hostile={toString(){calls++;throw Error('private');}};
 for(const mutate of [f=>f.graph.edges[0].direction=hostile,f=>f.units[3].direction=hostile,
  f=>Object.defineProperty(f.graph.nodes[0],'nativeId',{enumerable:true,get(){calls++;throw Error('private');}}),
  f=>f.graph.paths[0].edges=new Proxy([],{get(){calls++;throw Error('private');}}),
  f=>f.graph.nodes=new Array(4),f=>f.graph=new Proxy(f.graph,{get(){calls++;throw Error('private');}})]){
  const f=fixture();mutate(f);assert.throws(()=>validate(f),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 assert.equal(calls,0);
 const f=fixture();Object.defineProperty(f.shapes[3],'style',{enumerable:true,get(){calls++;throw Error('private');}});
 assert.equal(paths(f),null);assert.equal(calls,0);
});

test('v5 survives lossless member codec and immutable artifacts, and legacy evidence cannot smuggle graph controls',t=>{
 const f=fixture(),evidence=build(f.plan,f.shapes,[],[],[f.graph]);
 const encoded=JSON.parse(JSON.stringify(pack(evidence)));assert.deepEqual(unpack(encoded),evidence);
 assert.deepEqual(audit(encoded,f.shapes,[],f.plan.sourceHash),[]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-scene-inventory-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ref=write(root,evidence);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,ref.assetPath),'utf8')),evidence);
 for(const version of [1,2,3,4])assert.deepEqual(audit({...evidence,version},f.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
 for(const value of [undefined,'physical','logical-relations-v2',{},null]){
  const bad=structuredClone(evidence);bad.relationObservationUnit=value;
  assert.deepEqual(audit(bad,f.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
 }
 for(const key of ['fromId','toId','direction']){
  const bad=JSON.parse(JSON.stringify(encoded));delete bad.evidence.units.find(u=>u.identity.includes(':relation:'))[key];
  assert.deepEqual(audit(bad,f.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
 }
 const legacy={...f.plan};delete legacy.relationObservationUnit;
 assert.throws(()=>build(legacy,f.shapes,[],[],[f.graph]),/observation unit/u);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});

test('finalization preserves shared ownership even when legacy relation tags exist on a physical segment',()=>{
 const f=fixture();
 for(const shape of f.shapes.filter(s=>s.source.sceneInventoryId===f.graph.id))shape.source.sceneRelationId='relation-left';
 const result=finalizeSourceScene({image:{width:600,height:340,rgba:Buffer.alloc(600*340*4,255)},slideSize:{widthPt:600,heightPt:340},
  shapes:f.shapes,images:[],textBoxes:[],physicalNodes:[],plan:f.plan,root:os.tmpdir(),budget:{used:0},preflight:true,
  validRegions:new Set(['region']),physicalAliases:[],sharedRouteGraphs:[f.graph]});
 assert.equal(result.evidence.observedInventory.version,5);
 assert.equal(result.evidence.observedInventory.sharedRouteGraphs.length,1);
 assert.deepEqual(audit(result.evidence.observedInventory,result.shapes,[],f.plan.sourceHash),[]);
 assert.ok(result.shapes.filter(s=>members(f.graph).includes(s.id)).every(s=>s.source.sceneInventoryId===f.graph.id));
});

test('logical observation remains v5 with no graph and the total physical-member bound includes graph members',()=>{
 const f=fixture();f.plan.relations=[];f.plan.observedInventory[0].relations=0;
 const evidence=build(f.plan,f.shapes.slice(0,3),[]);
 assert.equal(evidence.version,5);assert.deepEqual(evidence.sharedRouteGraphs,[]);
 assert.deepEqual(audit(evidence,f.shapes.slice(0,3),[],f.plan.sourceHash),[]);
 const g=fixture(),large=build(g.plan,g.shapes,[],[],[g.graph]);
 large.units[0].members.push(...Array.from({length:9990},(_,i)=>({type:'shape',id:'extra-'+i})));
 assert.deepEqual(audit(large,g.shapes,[],g.plan.sourceHash),[{reason:'evidence-invalid'}]);
 delete g.plan.objectBatches;assert.throws(()=>build(g.plan,g.shapes,[],[],[g.graph]),/object ledger/u);
});

test('the complete graph uses the existing 32-part and 16-vertex path bounds without manufacturing object slots',()=>{
 const f=fixture(),original=f.graph.edges[0],count=12;
 const ids=Array.from({length:count},(_,i)=>'extra-joint-'+i);
 f.graph.nodes.push(...ids.map(id=>({id,endpointId:null,nativeId:id})));
 const nodes=[original.from,...ids,original.to];
 const chain=nodes.slice(1).map((to,i)=>({id:i?'extra-edge-'+i:original.id,memberId:i?'extra-edge-'+i:original.memberId,
  from:nodes[i],to,direction:'undirected'}));
 f.graph.edges.splice(0,1,...chain);
 for(const route of f.graph.paths)route.edges.splice(0,1,...chain.map(e=>({id:e.id,reversed:false})));
 assert.equal(members(f.graph).length,32);assert.equal(f.graph.paths[0].edges.length+1,16);assert.equal(validate(f).length,1);
 const {sceneLocalObjectCapacity,sceneHeaderObjectCapacity}=require('../packages/slideclone-core/source-scene-object-batches');
 assert.equal(sceneLocalObjectCapacity(f.plan),32);assert.equal(sceneHeaderObjectCapacity(f.plan),61);
 f.graph.paths[0].edges.push({...f.graph.paths[0].edges.at(-1)});assert.throws(()=>validate(f),TypeError);
});

test('reversed edge storage preserves real connector direction and the same two logical paths',()=>{
 const f=fixture();
 for(const edge of f.graph.edges){[edge.from,edge.to]=[edge.to,edge.from];if(edge.direction==='forward')edge.direction='backward';}
 for(const route of f.graph.paths)for(const edge of route.edges)edge.reversed=true;
 for(const shape of f.shapes.filter(s=>s.type==='line')){
  [shape.style.startAnchor,shape.style.endAnchor]=[shape.style.endAnchor,shape.style.startAnchor];
  [shape.style.startArrow,shape.style.endArrow]=[shape.style.endArrow,shape.style.startArrow];
 }
 assert.equal(validate(f).length,1);assert.equal(paths(f).size,2);
 const evidence=build(f.plan,f.shapes,[],[],[f.graph]);assert.deepEqual(audit(evidence,f.shapes,[],f.plan.sourceHash),[]);
});

test('one actual endpoint may have separate source contact sites without duplicating its physical ownership',()=>{
 const f=fixture();
 f.graph.nodes.push({id:'source-second-site',endpointId:'object-source',nativeId:'node-source'});
 f.graph.edges.push({id:'second-exit',from:'source-second-site',to:'graph-junction',memberId:'second-exit',direction:'undirected'});
 f.graph.paths[1].edges[0]={id:'second-exit',reversed:false};
 f.shapes.push({id:'second-exit',type:'line',box:{x:340,y:50,w:-40,h:110},source:{sceneInventoryId:f.graph.id},
  style:{fill:'none',stroke:'#1E3C5A',strokeWidthPt:1.5,
   startAnchor:{elementId:'node-source',side:'right',position:.5},endAnchor:{elementId:'graph-junction',side:'top',position:.5}}});
 assert.equal(validate(f).length,1);assert.equal(paths(f).size,2);
 assert.equal(f.shapes.filter(s=>s.id==='node-source').length,1);
 assert.deepEqual(audit(build(f.plan,f.shapes,[],[],[f.graph]),f.shapes,[],f.plan.sourceHash),[]);
});
