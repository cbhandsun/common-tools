'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/source-edge-choice.cjs');
const {parseSourceRouteCatalog:parse,parseSourceRouteChoice,createSourceRouteCatalog:create,sourceRouteChoiceFailureCatalog:failureCatalog,sourceEdgeKey}=require('../packages/slideclone-core/routing/source-shared-route-choice');
const {measureSharedSourceRoute:measure}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute:compile}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
test('catalogs keep every loop edge and stable identity across independent contact and relation enumeration',()=>{
 const f=fixture(),a=f.context.catalog,fit=measure({...f.f,nodes:[...f.f.nodes].reverse(),budget:{used:0}}).fit;assert.ok(fit);
 const b=create({fit,image:f.f.image,relations:[...f.plan.relations].reverse(),sourceHash:a.sourceHash,work:{checks:fit.workChecks}}).catalog;
 assert.equal(a.networkHash,b.networkHash);assert.deepEqual([...a.edges].sort((x,y)=>x.id.localeCompare(y.id)),[...b.edges].sort((x,y)=>x.id.localeCompare(y.id)));
 assert.equal(a.edges.length,a.contacts.length);assert.deepEqual(parse(a),a);
 const named=f.fit.edges.map(e=>sourceEdgeKey(e.path,f.fit.window));
 assert.deepEqual([...f.fit.edges].reverse().map(e=>sourceEdgeKey(e.path,f.fit.window).id),named.map(k=>k.id).reverse());
 for(const [i,edge]of f.fit.edges.entries()){
  const reversed=sourceEdgeKey([...edge.path].reverse(),f.fit.window);assert.equal(reversed.id,named[i].id);assert.equal(reversed.reversed,!named[i].reversed);
 }
 assert.throws(()=>create({fit:structuredClone(f.fit),image:f.f.image,relations:f.plan.relations,sourceHash:a.sourceHash,work:{checks:0}}),/proof/);
 assert.throws(()=>create({fit:f.fit,image:f.f.image,relations:f.plan.relations,sourceHash:a.sourceHash,work:{checks:4000000}}),/budget/);
});
test('catalog and choice parsers reject truncated, stale, extreme and hostile public descriptions',()=>{
 const f=fixture(),a=f.context.catalog;let calls=0;const getter=()=>{calls++;throw Error('private');};
 for(const mutate of [c=>c.edges.pop(),c=>c.contacts.pop(),c=>c.sourceHash='b'.repeat(64),c=>c.networkHash='b'.repeat(64),c=>c.edges[0].to='missing',
  c=>c.window.x=.1,c=>c.edges[0].points[0].x=Infinity,c=>c.widthPx=16385,c=>c.edges[0].points=Array(121).fill({x:1,y:1})]){
  const c=structuredClone(a);mutate(c);assert.throws(()=>parse(c),TypeError);
 }
 for(const c of [new Proxy({},{get:getter}),Object.defineProperty({},'sourceHash',{get:getter}),{...a,edges:new Proxy([],{get:getter})}])assert.throws(()=>parse(c),TypeError);
 const choice={kind:'source-edges-v1',sourceHash:a.sourceHash,networkHash:a.networkHash,steps:f.choices[0]};assert.deepEqual(parseSourceRouteChoice(choice),choice);
 for(const steps of [[],Array(16).fill(choice.steps[0]),[choice.steps[0],choice.steps[0]],new Proxy([],{get:getter}),[Object.defineProperty({},'id',{get:getter})]])
  assert.throws(()=>parseSourceRouteChoice({...choice,steps}),TypeError);
 assert.equal(calls,0);assert.equal(failureCatalog({catalog:a}),undefined);
});

test('bounded public descriptions retain long shared-edge vertices without creating measurement authority',()=>{
 const a=fixture().context.catalog,crypto=require('node:crypto');
 const rehash=c=>{c.networkHash=crypto.createHash('sha256').update(JSON.stringify({sourceHash:c.sourceHash,widthPx:c.widthPx,heightPx:c.heightPx,
  window:c.window,relationIds:[...c.relationIds].sort(),contacts:[...c.contacts].sort((x,y)=>x.id.localeCompare(y.id)),
  edges:[...c.edges].sort((x,y)=>x.id.localeCompare(y.id))})).digest('hex');return c;};
 for(const length of [19,120]){
  const c=structuredClone(a);c.edges[0].points=Array.from({length},()=>({...c.contacts[0].point}));rehash(c);
  assert.deepEqual(parse(c),c);
  const invalid=structuredClone(c);invalid.edges[0].points.push({...invalid.contacts[0].point});
  assert.throws(()=>parse(invalid),TypeError);
  if(length===120)assert.throws(()=>parse(rehash(invalid)),TypeError);
 }
 const empty=structuredClone(a);empty.edges[0].points=[];assert.throws(()=>parse(rehash(empty)),TypeError);
});
test('only a unique complete physical route can consume a choice and a failure privately retains its whole catalog',()=>{
 const f=fixture(),request={fit:f.fit,image:f.f.image,relations:f.plan.relations,id:'choice-test',sourceHash:f.plan.sourceHash,slideSize:{widthPt:300,heightPt:230}};
 let catalog;assert.throws(()=>compile(request),e=>{catalog=failureCatalog(e);return !!catalog&&/shared-relation-ambiguous/.test(e.message);});assert.equal(catalog.edges.length,6);
 const relations=f.plan.relations.map((r,i)=>({...r,sourcePathChoice:{kind:'source-edges-v1',sourceHash:catalog.sourceHash,networkHash:catalog.networkHash,steps:f.choices[i]}}));
 assert.equal(compile({...request,relations}).graph.paths.length,2);
 for(const mutate of [c=>c.networkHash='b'.repeat(64),c=>c.sourceHash='b'.repeat(64),c=>c.steps.reverse(),c=>c.steps.pop(),c=>c.steps[0].reversed=!c.steps[0].reversed]){
  const rs=structuredClone(relations);mutate(rs[0].sourcePathChoice);assert.throws(()=>compile({...request,relations:rs}),/shared-path-program/);
 }
 const duplicate=[relations[0],{...relations[0],id:'duplicate'}];assert.throws(()=>compile({...request,relations:duplicate}),/shared-path-program|duplicate/);
});
test('source edge regression files and runtime modules enter unified CI and the install payload',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').map(r=>r.file.replaceAll('\\','/'));
 for(const file of ['source-scene-edge-choice','source-shared-route-choice'])assert.ok(files.includes('test/'+file+'.test.js'));
 const release=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
 for(const file of ['scene-plan/source-scene-edge-choice-review','scene-plan/source-scene-edge-choice-contract','routing/source-shared-route-choice'])assert.ok(release.includes('packages/slideclone-core/'+file+'.js'));
});
