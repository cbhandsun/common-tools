'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./helpers/source-edge-choice.cjs');
const {parseSourceRouteCatalogs:parse,sourceRouteCatalogsFromEvidence:read,reprojectSourceRouteChoice:reproject}=require('../packages/slideclone-core/routing/source-shared-route-reprojection');
const {compileSharedSourceRoute:compile}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
function fingerprint(c){return crypto.createHash('sha256').update(JSON.stringify({sourceHash:c.sourceHash,widthPx:c.widthPx,heightPx:c.heightPx,window:c.window,
 relationIds:[...c.relationIds].sort(),contacts:[...c.contacts].sort((a,b)=>a.id.localeCompare(b.id)),edges:[...c.edges].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');}
function previous(c,mutate){const p=structuredClone(c);mutate(p);p.networkHash=fingerprint(p);return parse([p])[0];}
test('complete physical source identity can reproject independently verified port coordinates without mutating old choices',()=>{
 const f=fixture(),current=f.context.catalog,old=previous(current,c=>{c.contacts[0].point.y+=.47;c.contacts[1].point.x+=.51;});
 const choice={kind:'source-edges-v1',sourceHash:old.sourceHash,networkHash:old.networkHash,steps:f.choices[0]},before=structuredClone(choice);
 const result=reproject(choice,[old],current,{checks:0});assert.equal(result.networkHash,current.networkHash);assert.deepEqual(choice,before);
 assert.deepEqual(result.steps,choice.steps);assert.deepEqual(reproject(choice,[],current,{checks:0}),choice);
 const relations=f.plan.relations.map((r,i)=>({...r,sourcePathChoice:{...choice,steps:f.choices[i]}}));
 const input={fit:f.fit,image:f.f.image,relations,id:'reproject-test',sourceHash:f.plan.sourceHash,slideSize:{widthPt:300,heightPt:230}};
 assert.throws(()=>compile(input),/shared-path-program/);
 const compiled=compile({...input,sourceRouteCatalogs:[old]});assert.equal(compiled.graph.paths.length,2);
 assert.deepEqual(compiled.reprojectedChoices.map(r=>r.id),relations.map(r=>r.id));assert.deepEqual(relations.map(r=>r.sourcePathChoice.networkHash),[old.networkHash,old.networkHash]);
 const permuted=structuredClone(current);permuted.contacts.reverse();permuted.edges.reverse();permuted.relationIds.reverse();
 assert.equal(reproject(choice,[old],parse([permuted])[0],{checks:0}).networkHash,current.networkHash);
 assert.throws(()=>reproject(choice,[old],current,{checks:4000000}),/shared-geometry-budget/);
});
test('changed source, contact identity, complete membership or physical geometry cannot reproject an old selection',()=>{
 const f=fixture(),c=f.context.catalog;
 for(const mutate of [p=>p.sourceHash='b'.repeat(64),p=>p.relationIds[0]='different',p=>p.edges.pop(),
  p=>p.edges[0].points[0].x+=1,p=>p.contacts[0].arrow=!p.contacts[0].arrow,p=>p.contacts[0].endpointId='different',p=>p.window.x+=1]){
  let old;try{old=previous(c,mutate);}catch(error){assert.ok(error instanceof TypeError);continue;}
  const choice={kind:'source-edges-v1',sourceHash:old.sourceHash,networkHash:old.networkHash,steps:f.choices[0]};
  assert.deepEqual(reproject(choice,[old],c,{checks:0}),choice);
  const relations=f.plan.relations.map((r,i)=>({...r,sourcePathChoice:{...choice,steps:f.choices[i]}}));
  assert.throws(()=>compile({fit:f.fit,image:f.f.image,relations,id:'changed-source',sourceHash:f.plan.sourceHash,
   slideSize:{widthPt:300,heightPt:230},sourceRouteCatalogs:[old]}),/shared-path-program/);
 }
 const wrong={kind:'source-edges-v1',sourceHash:'b'.repeat(64),networkHash:c.networkHash,steps:f.choices[0]};
 assert.deepEqual(reproject(wrong,[c],c,{checks:0}),wrong);
});
test('previous catalog boundaries reject unvalidated, truncated, excessive and hostile input without running accessors',()=>{
 const c=fixture().context.catalog;let calls=0;const getter=()=>{calls++;throw Error('private');};
 assert.deepEqual(parse(undefined),[]);assert.deepEqual(parse([]),[]);assert.deepEqual(read({}),[]);assert.deepEqual(read({sharedRoutes:{pathChoices:[c]}}),[c]);
 for(const value of [null,{},[c,c],Array(25).fill(c),[{...c,networkHash:'b'.repeat(64)}],new Proxy([],{get:getter}),[Object.defineProperty({},'sourceHash',{get:getter})]])
  assert.throws(()=>parse(value),e=>e instanceof TypeError&&!e.message.includes('private'));
 for(const value of [new Proxy({},{get:getter}),Object.defineProperty({},'sharedRoutes',{get:getter}),{sharedRoutes:new Proxy({},{get:getter})}])assert.deepEqual(read(value),[]);
 assert.equal(calls,0);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-shared-route-reprojection.test.js'));
 const file='packages/slideclone-core/routing/source-shared-route-reprojection.js';
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
});
