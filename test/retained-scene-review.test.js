'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
const {fixture}=require('./helpers/source-edge-choice.cjs');
const {parseRetainedSceneReview:parse,applyRetainedSceneReview:apply}=require('../packages/slideclone-core/scene-plan/retained-scene-review');
const {createSourceSceneReviewStore:createStore}=require('../packages/remote-mcp-server/source-scene-review-store');
const {createSourceSceneRuntime}=require('../packages/remote-mcp-server/source-scene-runtime');
const {writePng}=require('../packages/slideclone-core/png');
const {bindSceneIconSemanticReview:bind}=require('../packages/slideclone-core/scene-plan/source-scene-icon-semantic-review');
const {measureSceneNativeIconDetailed:measure}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
function endpoint(plan,id){
 const collection=plan.objects.some(o=>o.id===id)?'objects':'regions',row=plan[collection].find(o=>o.id===id);assert.ok(row);
 return {collection,kind:row.kind,point:{x:row.box.x+row.box.w/2,y:row.box.y+row.box.h/2}};
}
function routeFixture(){
 const f=fixture(),review={sourceHash:f.plan.sourceHash,widthPx:300,heightPx:230,reviewId:'retained-human-choice',
  routes:f.plan.relations.map((r,i)=>({from:endpoint(f.plan,r.fromId),to:endpoint(f.plan,r.toId),direction:r.direction,steps:f.choices[i]})),icon:null};
 return {...f,review,input:{plan:f.plan,page:{shapes:[],images:[],textBoxes:[]},sourceRouteCatalogs:[f.context.catalog],slideSize:{widthPt:300,heightPt:230}}};
}

function catalogFingerprint(c){return crypto.createHash('sha256').update(JSON.stringify({sourceHash:c.sourceHash,widthPx:c.widthPx,heightPx:c.heightPx,window:c.window,
 relationIds:[...c.relationIds].sort(),contacts:[...c.contacts].sort((a,b)=>a.id.localeCompare(b.id)),edges:[...c.edges].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');}
function changedCatalog(c,mutate){const result=structuredClone(c);mutate(result);result.networkHash=catalogFingerprint(result);return result;}

test('fresh v17 source edge renaming preserves both human-confirmed own-side routes without geometry approximation',()=>{
 const f=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/source-physical-body/retained-edge-renaming.json'))),before=structuredClone(f);
 const legacy=structuredClone(f.review);for(const route of legacy.routes)delete route.catalog;
 assert.throws(()=>apply(f.input,legacy),/Scene source edge observation is invalid/u);
 const out=apply(f.input,f.review);assert.deepEqual(f,before);
 assert.deepEqual(out.plan.relations,f.input.plan.relations,'the current independently reviewed choices already describe exactly the retained source geometry');
 assert.equal(out.plan.relations.filter(r=>r.sourcePathChoice).length,2);
});

test('retained catalogs rebind changed raw edge names only when every source cut and geometry vertex is exactly identical',()=>{
 const f=routeFixture(),renames=new Map(f.context.catalog.edges.map((e,i)=>[e.id,'ink-'+crypto.createHash('sha256').update('renamed-'+i).digest('hex').slice(0,24)]));
 const old=changedCatalog(f.context.catalog,c=>c.edges.forEach(e=>{e.id=renames.get(e.id);}));
 const review=structuredClone(f.review);
 for(const route of review.routes){route.catalog=old;route.steps=route.steps.map(s=>({...s,id:renames.get(s.id)}));}
 const before=structuredClone({input:f.input,review}),out=apply(f.input,review);
 assert.deepEqual({input:f.input,review},before);assert.deepEqual(parse(review),review);
 assert.deepEqual(out.plan.relations.map(r=>r.sourcePathChoice.steps),f.choices);
 const compiled=require('../packages/slideclone-core/routing/source-shared-route-compiler').compileSharedSourceRoute({
  fit:f.fit,image:f.f.image,relations:out.plan.relations,id:'exact-rebound-network',sourceHash:f.plan.sourceHash,slideSize:f.input.slideSize});
 assert.equal(compiled.graph.paths.length,2);
 // Canonical edge orientation can also change without altering physical ink.
 const reversed=structuredClone(review);for(const route of reversed.routes){
  route.catalog=changedCatalog(route.catalog,c=>c.edges.forEach(e=>{[e.from,e.to]=[e.to,e.from];e.points.reverse();}));
  route.steps.forEach(s=>s.reversed=!s.reversed);
 }
 assert.deepEqual(apply(f.input,reversed).plan.relations.map(r=>r.sourcePathChoice.steps),f.choices);
});

test('retained rebinding refuses missing, ambiguous, reordered, foreign or changed source geometry and conflicting choices',()=>{
 const f=routeFixture(),steps=f.choices[0],selected=steps[0].id;
 const mutations=[c=>c.edges.find(e=>e.id===selected).points[0].x+=.001,c=>c.edges.find(e=>e.id===selected).points.reverse(),
  c=>c.edges=c.edges.filter(e=>e.id!==selected),c=>c.edges.push({...structuredClone(c.edges.find(e=>e.id===selected)),id:'ink-'+'f'.repeat(24)}),
  c=>c.edges.find(e=>e.id===selected).from=c.contacts.find(p=>p.id!==c.edges.find(e=>e.id===selected).from&&p.id!==c.edges.find(e=>e.id===selected).to).id];
 for(const mutate of mutations){
  const review=structuredClone(f.review);review.routes[0].catalog=changedCatalog(f.context.catalog,mutate);
  const inputBefore=structuredClone(f.input);assert.throws(()=>apply(f.input,review),TypeError);assert.deepEqual(f.input,inputBefore);
 }
 for(const mutate of [r=>r.routes[0].catalog.sourceHash='b'.repeat(64),r=>r.routes[0].catalog.widthPx++,
  r=>r.routes[0].catalog.networkHash='b'.repeat(64),r=>r.routes[0].catalog={},r=>r.routes[0].steps.reverse()]){
  const review=structuredClone(f.review);review.routes[0].catalog=structuredClone(f.context.catalog);mutate(review);assert.throws(()=>apply(f.input,review),TypeError);
 }
 const {rebindRetainedSceneRouteSteps:rebind}=require('../packages/slideclone-core/scene-plan/source-scene-retained-route-rebinding');
 assert.throws(()=>rebind(steps,f.context.catalog,f.context.catalog,{checks:4000000}),/exhausted/u);
 for(const value of [[],null,{},Array(16).fill(steps[0])])assert.throws(()=>rebind(value,f.context.catalog,f.context.catalog,{checks:0}),TypeError);
 for(const work of [null,{}, {checks:-1},{checks:NaN},{checks:4000001}])assert.throws(()=>rebind(steps,f.context.catalog,f.context.catalog,work),TypeError);
 let traps=0;const trap=()=>{traps++;throw Error('private');};
 for(const property of ['catalog','steps']){
  const review=structuredClone(f.review);Object.defineProperty(review.routes[0],property,{enumerable:true,get:trap});assert.throws(()=>parse(review),TypeError);
 }
 assert.throws(()=>rebind(steps,new Proxy({},{get:trap,ownKeys:trap}),f.context.catalog,{checks:0}),TypeError);
 assert.throws(()=>rebind(steps,f.context.catalog,f.context.catalog,new Proxy({},{get:trap})),TypeError);assert.equal(traps,0);
 const files=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
 assert.ok(files.includes('packages/slideclone-core/scene-plan/source-scene-retained-route-rebinding.js'));
});
test('retained paths resolve current identities and still pass real source compilation',()=>{
 const f=routeFixture(),before=structuredClone(f.input),out=apply(f.input,f.review);
 assert.deepEqual(f.input,before);assert.ok(out.plan.relations.every(r=>r.sourcePathChoice));
 const result=require('../packages/slideclone-core/routing/source-shared-route-compiler').compileSharedSourceRoute({
  fit:f.fit,image:f.f.image,relations:out.plan.relations,id:'retained-network',sourceHash:f.plan.sourceHash,slideSize:f.input.slideSize});
 assert.equal(result.graph.paths.length,2);assert.equal(result.graph.edges.length,result.graph.nodes.length);
});
test('the same retained source points survive changed model IDs and a newly measured catalog',()=>{
 const f=routeFixture(),rename=id=>'new-'+id;
 const nodes=f.f.nodes.map(n=>({...n,endpointId:rename(n.endpointId)}));
 const measured=require('../packages/slideclone-core/routing/source-shared-route-measurement').measureSharedSourceRoute({...f.f,nodes});assert.ok(measured.fit);
 const plan={...f.plan,regions:f.plan.regions.map(r=>({...r,id:rename(r.id),parentId:r.parentId?rename(r.parentId):null})),
  objects:f.plan.objects.map(o=>({...o,id:rename(o.id),regionId:rename(o.regionId)})),
  relations:f.plan.relations.map(r=>({...r,id:rename(r.id),regionId:rename(r.regionId),fromId:rename(r.fromId),toId:rename(r.toId)}))};
 const context=require('../packages/slideclone-core/routing/source-shared-route-choice').createSourceRouteCatalog({
  fit:measured.fit,image:f.f.image,relations:plan.relations,sourceHash:plan.sourceHash,work:{checks:measured.fit.workChecks}});
 assert.notEqual(context.catalog.networkHash,f.context.catalog.networkHash);
 const out=apply({...f.input,plan,sourceRouteCatalogs:[context.catalog]},f.review);
 assert.ok(out.plan.relations.every(r=>r.id.startsWith('new-')&&r.sourcePathChoice.networkHash===context.catalog.networkHash));
 const compiled=require('../packages/slideclone-core/routing/source-shared-route-compiler').compileSharedSourceRoute({
  fit:measured.fit,image:f.f.image,relations:out.plan.relations,id:'renamed-network',sourceHash:plan.sourceHash,slideSize:f.input.slideSize});
 assert.equal(compiled.graph.paths.length,2);
});
test('empty retained decisions grant no choices and parsing returns detached data',()=>{
 const f=routeFixture(),review={...f.review,routes:[]};assert.deepEqual(apply(f.input,review).plan,f.plan);
 const copy=parse(f.review);copy.routes[0].steps[0].reversed=!copy.routes[0].steps[0].reversed;
 assert.notDeepEqual(copy,f.review);assert.deepEqual(parse(review),review);
});

test('physical envelopes retain decisions across object-container and region-card representations',()=>{
 const f=routeFixture();
 for(const [index,route] of f.review.routes.entries())for(const name of ['from','to']){
  const e=route[name],id=name==='from'?f.plan.relations[index].fromId:f.plan.relations[index].toId;
  e.sourceBox={...f.plan[e.collection].find(row=>row.id===id).box};
 }
 const objects=f.plan.objects,source=f.plan.regions.find(r=>r.id==='region-source');
 const plan={...f.plan,objects:[{id:source.id,regionId:'root',kind:'container',box:{...source.box}}],
  regions:[f.plan.regions[0],...objects.map(o=>({id:o.id,parentId:'root',kind:'card',box:{...o.box,x:o.box.x+1,y:o.box.y-1}}))]};
 const out=apply({...f.input,plan},f.review);assert.ok(out.plan.relations.every(r=>r.sourcePathChoice));
 const before=structuredClone(f.input);
 const duplicate={...plan,objects:[...plan.objects,objects[0]]};
 assert.throws(()=>apply({...f.input,plan:duplicate},f.review),/identity is unavailable/);
 const moved=structuredClone(plan);moved.regions[1].box.x+=3;
 assert.throws(()=>apply({...f.input,plan:moved},f.review),/identity is unavailable/);
 const noEnvelope=structuredClone(f.review);for(const r of noEnvelope.routes){delete r.from.sourceBox;delete r.to.sourceBox;}
 assert.throws(()=>apply({...f.input,plan},noEnvelope),/identity is unavailable/);
 const bad=structuredClone(f.review);bad.routes[0].from.sourceBox.w=0;assert.throws(()=>parse(bad),TypeError);
 bad.routes[0].from.sourceBox={x:0,y:0,w:1,h:1};assert.throws(()=>parse(bad),TypeError);
 assert.deepEqual(f.input,before);
});
test('stale source, ambiguous nodes, conflicting paths and incomplete catalogs abort without partial changes',()=>{
 const f=routeFixture();
 for(const change of [x=>x.review.sourceHash='b'.repeat(64),x=>x.review.widthPx++,x=>x.input.sourceRouteCatalogs=[],
  x=>x.input.plan.objects.push({...x.input.plan.objects[0],id:'duplicate'}),
  x=>x.input.plan.relations.push({...x.input.plan.relations[0],id:'duplicate'}),x=>x.input.plan.relations[1].direction='backward',
  x=>x.review.routes[1].steps.reverse(),x=>x.review.routes[1].steps[0].id='ink-'+'f'.repeat(24),
  x=>x.input.plan.relations[0].sourcePathChoice={kind:'source-edges-v1',sourceHash:f.plan.sourceHash,networkHash:'b'.repeat(64),steps:f.choices[0]}]){
  const state=structuredClone({input:f.input,review:f.review});change(state);const before=structuredClone(state.input);
  assert.throws(()=>apply(state.input,state.review),TypeError);assert.deepEqual(state.input,before);
 }
});
test('parser rejects empty invalid extreme and hostile records without executing caller code',()=>{
 const f=routeFixture();let calls=0;const trap=()=>{calls++;throw Error('private-data');};
 const hostile=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const value of [null,undefined,[],{},hostile,Object.defineProperty({},'sourceHash',{get:trap})])assert.throws(()=>parse(value),TypeError);
 for(const mutate of [r=>r.routes=Array(49).fill(r.routes[0]),r=>r.routes[0].steps=Array(16).fill(r.routes[0].steps[0]),
  r=>r.routes[0].steps.push(r.routes[0].steps[0]),r=>r.widthPx=NaN,r=>r.heightPx=16385,r=>r.reviewId='../escape',
  r=>r.routes[0].from.point.x=-1,r=>r.routes[0].from.point.y=Infinity,r=>r.routes[0].from.point.x=300,
  r=>r.icon={accepted:true},r=>r.routes[0].steps[0].reversed='false',r=>r.routes[0].steps[0].extra=true,
  r=>r.routes[0].from.point=hostile,r=>r.routes[0].steps=hostile,r=>r.routes=hostile,
  r=>Object.defineProperty(r.routes[0],'from',{get:trap}),r=>Object.defineProperty(r.routes[0].steps[0],'id',{get:trap}),
  r=>delete r.routes[0],r=>r.routes.push(r.routes[0])]){const r=structuredClone(f.review);mutate(r);assert.throws(()=>parse(r),TypeError);}
 assert.equal(calls,0);
});
function iconFixture(t){
 const root=createTemp('retained-icon-');t.after(()=>removeTemp(root));
 const image={width:180,height:100,rgba:Buffer.alloc(180*100*4,255)};
 const put=(x,y,v=0)=>image.rgba.set([v,v,v,255],(y*180+x)*4);
 for(const [x,top]of [[22,44],[30,37],[38,30]])for(let y=top;y<55;y++)for(let dx=0;dx<4;dx++)put(x+dx,y);
 for(const x of [63,79,95])for(let y=31;y<55;y++)for(let dx=0;dx<4;dx++)put(x+dx,y);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const text={id:'new-footer',text:'5 III',box:{x:9,y:13.5,w:43,h:16},source:{editable:true,ocrLabelRef:'footer',ocrProvider:'fixture',confidence:.99,
  evidenceBox:{x:9,y:13.5,w:43,h:16},ocrPolygonPt:[[9,13.5],[52,13.5],[52,29.5],[9,29.5]]},font:{color:'#000000'}};
 const plan={version:1,widthPx:180,heightPx:100,sourceHash,regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:100}}],
  objects:[{id:'new-bars',regionId:'root',kind:'icon',box:{x:20,y:28,w:24,h:29}}],relations:[]};
 const review={sourceHash,widthPx:180,heightPx:100,reviewId:'retained-icon',routes:[],icon:{object:endpoint(plan,'new-bars'),
  textStartBox:{x:62,y:30,w:6,h:26},observationWindow:{x:8,y:16,w:116,h:54},textStartsWith:'5',expectedComponents:3}};
 return {root,image,sourceFile,plan,review,input:{plan,sourceFile,root,page:{shapes:[],images:[],textBoxes:[text]},slideSize:{widthPt:90,heightPt:50}}};
}
test('retained icon identity restores a new private receipt across IDs and point/pixel scales',t=>{
 const f=iconFixture(t),before=structuredClone(f.input),out=apply(f.input,JSON.parse(JSON.stringify(f.review))),budget={used:0};
 const semanticReview=bind(out.sourceIconReview,{image:f.image,sourceHash:f.plan.sourceHash,plan:out.plan,textBoxes:out.page.textBoxes,slideSize:out.slideSize,budget});
 const measured=measure({image:f.image,box:f.plan.objects[0].box,budget,textBoxes:out.page.textBoxes,root:f.root,slideSize:out.slideSize,
  id:'new-bars',regionId:'root',semanticReview});
 assert.equal(measured.reason,'icon-source-isolated');assert.deepEqual(f.input,before);
 assert.ok(budget.used<=4000000);assert.throws(()=>bind(structuredClone(out.sourceIconReview),{image:f.image,sourceHash:f.plan.sourceHash,plan:out.plan,textBoxes:out.page.textBoxes,slideSize:out.slideSize,budget}),TypeError);
});
test('the production runtime loads the retained store and remeasures actual icon output',t=>{
 const f=iconFixture(t),directory=path.join(f.root,'reviews');fs.mkdirSync(directory);
 fs.writeFileSync(path.join(directory,f.review.sourceHash+'.json'),JSON.stringify(f.review));
 const runtime=createSourceSceneRuntime({environment:{COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT:directory},sceneVision:null});
 const result=runtime.compileSourceScene(f.input);
 assert.ok(!result.evidence.unresolved.some(r=>r.id==='new-bars'));
 assert.ok(result.page.shapes.length>0);assert.deepEqual(f.input.page.shapes,[]);
 const reopened=createSourceSceneRuntime({environment:{COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT:directory},sceneVision:null}).compileSourceScene(f.input);
 assert.equal(reopened.evidence.icons,result.evidence.icons);
});
test('file store survives reopening and rejects malformed excessive stale or linked files',t=>{
 const directory=createTemp('retained-store-');t.after(()=>removeTemp(directory));const f=routeFixture(),hash=f.review.sourceHash;
 const file=path.join(directory,hash+'.json'),read=createStore(directory);assert.equal(read(hash),undefined);
 fs.writeFileSync(file,JSON.stringify(f.review));assert.deepEqual(createStore(directory)(hash),f.review);
 for(const content of ['{','[]',' '.repeat(65537),JSON.stringify({...f.review,sourceHash:'b'.repeat(64)})]){
  fs.writeFileSync(file,content);assert.throws(()=>read(hash),/store is unavailable/);
 }
 fs.unlinkSync(file);fs.mkdirSync(file);assert.throws(()=>read(hash),TypeError);fs.rmdirSync(file);
 const target=path.join(directory,'ordinary');fs.mkdirSync(target);fs.symlinkSync(target,file,'junction');assert.throws(()=>read(hash),TypeError);
 assert.throws(()=>createStore(file),TypeError);
 for(const value of ['../escape',null,{},'a'.repeat(65),'A'.repeat(64)])assert.throws(()=>read(value),TypeError);
 for(const value of ['',null,{},'relative'])assert.throws(()=>createStore(value),TypeError);
});
test('store errors expose no file or source content, and environment accessors cannot execute',t=>{
 const directory=createTemp('retained-store-errors-');t.after(()=>removeTemp(directory));const f=routeFixture();
 fs.writeFileSync(path.join(directory,f.review.sourceHash+'.json'),'private-content-invalid-json');
 assert.throws(()=>createStore(directory)(f.review.sourceHash),e=>e.message==='Scene review store is unavailable'&&!e.cause);
 let calls=0;assert.throws(()=>createSourceSceneRuntime({environment:{get COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT(){calls++;throw Error('private');}},sceneVision:null}),TypeError);
 assert.equal(calls,0);
 assert.throws(()=>createSourceSceneRuntime({environment:{COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT:''},sceneVision:null}),TypeError);
});
test('store bounds reads and refuses source mutation or IO failure without leaking paths',t=>{
 const directory=createTemp('retained-store-race-');t.after(()=>removeTemp(directory));const f=routeFixture();
 const file=path.join(directory,f.review.sourceHash+'.json'),bytes=JSON.stringify(f.review),original=fs.readSync,read=createStore(directory);
 for(const mode of ['grow','truncate','io']){
  fs.writeFileSync(file,bytes);let changed=false,maxRead=0;
  t.mock.method(fs,'readSync',(fd,buffer,offset,length,position)=>{
   maxRead=Math.max(maxRead,length);
   if(!changed){changed=true;if(mode==='io')throw Object.assign(Error('private-path'),{code:'EIO'});
    if(mode==='grow')fs.appendFileSync(file,' '.repeat(100000));else fs.truncateSync(file,10);}
   return original(fd,buffer,offset,length,position);
  });
  try{assert.throws(()=>read(f.review.sourceHash),e=>e.message==='Scene review store is unavailable'&&!e.cause);
   assert.ok(maxRead<=Buffer.byteLength(bytes));}finally{t.mock.restoreAll();}
 }
});
test('retained decision modules ship and regression remains in unified CI discovery',()=>{
 const suites=require('../scripts/test-suites');assert.equal(suites.classifyTestFile(__filename),'unit');assert.ok(suites.includesSuite(__filename,'all'));
 const root=path.resolve(__dirname,'..'),manifest=fs.readFileSync(path.join(root,'scripts/verify-runtime-package.js'),'utf8');
 for(const name of ['packages/remote-mcp-server/source-scene-review-store.js','packages/slideclone-core/scene-plan/retained-scene-review.js'])assert.ok(manifest.includes('"'+name+'"'));
});
