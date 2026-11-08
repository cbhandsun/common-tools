'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedNetworkFixture:fixture,networkRelations:relations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {inspectSourceSharedShaftNetwork,inspectSourceSharedShaftTree}=require('../packages/slideclone-core/routing/source-shared-shaft-tree');

const compile=(f,fit,rs=relations)=>compileSharedSourceRoute({fit,image:f.image,relations:rs,id:'shared-cycle',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});

test('the explicit physical network retains all cycle arms while the compatibility API still rejects a cycle',()=>{
 const width=80,height=80,mask=new Uint8Array(width*height),cell=(x,y)=>y*width+x;
 for(let x=10;x<=70;x++)mask[cell(x,40)]=1;
 for(let y=10;y<=40;y++)mask[cell(40,y)]=1;
 for(let x=28;x<=52;x++)mask[cell(x,28)]=mask[cell(x,52)]=1;
 for(let y=28;y<=52;y++)mask[cell(28,y)]=mask[cell(52,y)]=1;
 for(let y=29;y<52;y++)for(let x=29;x<52;x++)mask[cell(x,y)]=0;
 const terminals=[cell(10,40),cell(70,40),cell(40,10)],before=mask.slice();
 for(const order of [terminals,[...terminals].reverse()]){
  const input={mask,width,height,terminals:order,work:{checks:0}},result=inspectSourceSharedShaftNetwork(input);
  assert.ok(result.tree,result.reason);assert.equal(result.tree.cycleCount,1);
  const represented=new Set(result.tree.edges.flatMap(e=>e.cells));
  for(let n=0;n<mask.length;n++)if(result.tree.skeleton[n])assert.ok(represented.has(n));
  assert.equal(inspectSourceSharedShaftTree({...input,work:{checks:0}}).reason,'shared-shaft-cycle');
 }
 assert.deepEqual(mask,before);
 const ladder=new Uint8Array(width*height);
 for(let x=10;x<=70;x++)ladder[cell(x,20)]=ladder[cell(x,40)]=1;
 for(let x=20;x<=70;x+=10)for(let y=20;y<=40;y++)ladder[cell(x,y)]=1;
 for(let y=10;y<20;y++)ladder[cell(40,y)]=1;
 assert.equal(inspectSourceSharedShaftNetwork({mask:ladder,width,height,
  terminals:[cell(10,20),cell(10,40),cell(40,10)],work:{checks:0}}).reason,'shared-shaft-cycle-capacity');
});

test('complete source edges of a physical cycle are measured and emitted without deleting an arm',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=measureSharedSourceRoute(f);
 assert.ok(result.fit,result.reason);assert.equal(result.fit.cycleCount,1);
 const compiled=compile(f,result.fit);
 assert.equal(compiled.graph.topology,'source-network-v1');assert.equal(compiled.graph.paths.length,2);
 assert.equal(compiled.graph.edges.length,compiled.graph.nodes.length);
 assert.ok(compiled.parts.every(p=>p.type!=='freeform'));
 const lines=compiled.parts.filter(p=>p.type==='line');assert.ok(lines.length);
 assert.ok(lines.every(p=>p.source.nativeConnectorRoute===true&&p.style.startAnchor&&p.style.endAnchor));
 assert.deepEqual(f.image.rgba,before);assert.ok(result.fit.workChecks<=4000000);
 assert.throws(()=>compile(f,structuredClone(result.fit)),/proof/u);
 const legacy=measureSharedSourceRoute({...fixture(),sourceNetwork:false});
 assert.equal(legacy.fit,null);assert.equal(legacy.reason,'shared-shaft-cycle');
});

test('explicit network path controls reject hostile values before executing user code',()=>{
 const f=fixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);let calls=0;
 for(const value of [null,{},new Proxy({},{get(){calls++;throw Error('private');}}),
  {kind:'polyline',dash:'solid',vertices:new Proxy([],{get(){calls++;throw Error('private');}})},
  {kind:'polyline',dash:'solid',vertices:[{x:NaN,y:0},{x:0,y:0}]},
  Object.defineProperty({},'kind',{get(){calls++;throw Error('private');}})]){
  assert.throws(()=>compile(f,measured.fit,relations.map(r=>({...r,visiblePath:value}))),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 assert.equal(calls,0);
});

test('each relation must uniquely identify its own cycle route independently of edge and relation order',()=>{
 const f=fixture(),result=measureSharedSourceRoute(f);assert.ok(result.fit,result.reason);
 for(const rs of [relations,[...relations].reverse()]){
  const compiled=compile(f,result.fit,rs);
  assert.equal(compiled.graph.paths.length,2);
  const ambiguous=rs.map(({shaftBox,...r})=>r);
  assert.throws(()=>compile(f,result.fit,ambiguous),/shared-relation-ambiguous/u);
  assert.throws(()=>compile(f,result.fit,rs.map(r=>({...r,shaftBox:{x:149,y:60,w:3,h:10}}))),/shared-relation-ambiguous/u);
  assert.throws(()=>compile(f,result.fit,rs.map(r=>({...r,shaftBox:{x:0,y:0,w:1,h:1}}))),/shared-relation-anchor/u);
 }
});

test('network controls keep blank, forged, exhausted and CI boundaries',()=>{
 assert.throws(()=>measureSharedSourceRoute({...fixture(),sourceNetwork:'true'}),TypeError);
 const f=fixture();assert.equal(measureSharedSourceRoute({...f,budget:{used:4000000}}).fit,null);
 assert.equal(measureSharedSourceRoute({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).fit,null);
 assert.equal(measureSharedSourceRoute({...f,image:{...f.image,rgba:Buffer.alloc(f.image.rgba.length,255)}}).fit,null);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(r=>r.file.replaceAll('\\','/')==='test/source-shared-route-network.test.js'));
});

test('nearby cycle arms cannot borrow another edge width when their own transverse source proof fails',()=>{
 const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 for(const r of [5,6]){
  const f=sourceSharedTreeFixture();
  for(let y=111-r;y<110+r;y++)for(let x=151-r;x<150+r;x++)f.put(x,y,[255,255,255]);
  for(let x=150-r;x<=150+r;x++)for(let d=-1;d<=1;d++){f.put(x,110-r+d);f.put(x,110+r+d);}
  for(let y=110-r;y<=110+r;y++)for(let d=-1;d<=1;d++){f.put(150-r+d,y);f.put(150+r+d,y);}
  f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
  const cache=createSceneMeasurementCache(f.image,[],f.budget);
  for(const node of f.nodes){assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
  const before=Buffer.from(f.image.rgba),result=measureSharedSourceRoute({...f,sourceNetwork:true});
  assert.equal(result.fit,null);assert.equal(result.reason,'shared-shaft-width');assert.deepEqual(f.image.rgba,before);
 }
});

test('visible background calibration cannot bypass the independent complete exterior flank proof',()=>{
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const f=fixture();
 for(let y=85;y<=135;y++)for(let x=125;x<=175;x++){
  const at=(y*f.image.width+x)*4;
  if([0,1,2].every(c=>f.image.rgba[at+c]===255))f.image.rgba.set([226,250,255,255],at);
 }
 f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 for(const node of f.nodes){assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
 const before=Buffer.from(f.image.rgba),result=measureSharedSourceRoute(f);
 // This broad, abruptly bounded tint has visible width witnesses, but cannot
 // prove the complete exterior field. Recovering its width grants no fit.
 assert.equal(result.fit,null);assert.equal(result.reason,'shared-flanks #3');
 assert.deepEqual(f.image.rgba,before);
});

test('the versioned inventory preserves unused physical arms and cannot accept a truncated network',()=>{
 const {readSharedSceneRouteGraphs:read,survivingSharedSceneRoutes:survives}=require('../packages/slideclone-core/scene-plan/source-scene-shared-route-inventory');
 const f=fixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const rs=relations.map((r,i)=>i?{...r,shaftBox:{x:157,y:97,w:5,h:3}}:r),result=compile(f,measured.fit,rs);
 const units=[...f.nodes.map(n=>({id:n.endpointId,regionId:'root',kind:'container',members:[{type:'shape',id:n.id}]})),
  ...rs.map(r=>({...r,kind:'relation',members:[]}))];
 const shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box,source:{sceneInventoryId:n.endpointId}})),...result.parts];
 assert.deepEqual(read([result.graph],units,'a'.repeat(64)),[result.graph]);
 assert.equal(survives([result.graph],shapes,[],units).size,2);
 const {measuredSharedSceneRoutePaintGroups:paint}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 assert.equal(paint(f.image,shapes,{checks:0}).length,1);
 const used=new Set(result.graph.paths.flatMap(p=>p.edges.map(e=>e.id))),unused=result.graph.edges.find(e=>!used.has(e.id));assert.ok(unused);
 assert.equal(survives([result.graph],shapes.filter(s=>s.id!==unused.memberId),[],units).size,0);
 assert.deepEqual(paint(f.image,shapes.filter(s=>s.id!==unused.memberId),{checks:0}),[]);
 assert.deepEqual(paint(f.image,structuredClone(shapes),{checks:0}),[]);
 for(const mutate of [g=>delete g.topology,g=>g.topology='source-network-v2',g=>g.edges.pop(),
  g=>g.edges[0].to=g.edges[0].from,g=>g.paths[0].edges.push(g.paths[0].edges[0]),g=>g.nodes[0].endpointId='missing']){
  const graph=structuredClone(result.graph);mutate(graph);assert.throws(()=>read([graph],units,'a'.repeat(64)),TypeError);
 }
 let calls=0;const hostile=structuredClone(result.graph);Object.defineProperty(hostile,'topology',{get(){calls++;throw Error('private');}});
 assert.throws(()=>read([hostile],units,'a'.repeat(64)),TypeError);assert.equal(calls,0);
});

test('the default logical scene stage compiles a complete cyclic network and keeps the final inventory valid',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {initializeSceneObjectBatches}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
 const {auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
 const {packSceneInventoryMembers,unpackSceneInventoryMembers}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'network-scene-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const raw={coordinateSpace:'source-pixels',relationObservationUnit:'logical-relations-v1',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:230}},{id:'source',parentId:'root',kind:'container',box:f.nodes[0].box}],
  objects:f.nodes.slice(1).map(n=>({id:n.endpointId,kind:'container',regionId:'root',box:n.box,pictorialContent:'absent'})),
  relations:relations.map((r,i)=>({...r,fromId:'source',shaftBox:{x:35,y:45,w:230,h:130},
   visiblePath:{kind:'polyline',dash:'solid',vertices:(i?[[150,50],[150,98],[138,98],[138,122],[162,122],[162,110],[250,110],[250,169]]
    :[[150,50],[150,98],[138,98],[138,110],[50,110],[50,169]]).map(([x,y])=>({x,y}))}})),inventory:[['root',2,0,2],['source',0,0,0]]};
 const plan=initializeSceneObjectBatches(parseSourceScenePlan(raw,{sourceHash,widthPx:300,heightPx:230}));
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:300,heightPt:230}});
 assert.equal(result.evidence.resolvedRelations,2,JSON.stringify(result.evidence.sharedRoutes));assert.equal(result.evidence.sharedRoutes.graphs,1);
 const evidence=result.evidence.observedInventory;assert.equal(evidence.sharedRouteGraphs[0].topology,'source-network-v1');
 assert.deepEqual(auditSceneInventory(evidence,result.page.shapes,result.page.images,sourceHash),[]);
 const encoded=JSON.parse(JSON.stringify(packSceneInventoryMembers(evidence)));assert.deepEqual(unpackSceneInventoryMembers(encoded),evidence);
 assert.deepEqual(auditSceneInventory(encoded,result.page.shapes,result.page.images,sourceHash),[]);
 const graph=evidence.sharedRouteGraphs[0],missing=graph.renderedPaths[0].memberId;
 assert.equal(graph.rendering,'whole-native-paths-v1');assert.ok(result.page.shapes.some(s=>s.id===missing));
 assert.ok(auditSceneInventory(evidence,result.page.shapes.filter(s=>s.id!==missing),[],sourceHash).some(r=>r.kind==='relations'&&r.count===2));
});
