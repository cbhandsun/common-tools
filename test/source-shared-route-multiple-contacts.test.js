'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/source-shared-route-measurement');
const {compileSharedSourceRoute}=require('../packages/slideclone-core/source-shared-route-compiler');
function fixture(mixed=false){
 const f=sourceSharedTreeFixture(),target={id:'native-target',endpointId:'object-target',box:{x:30,y:170,w:240,h:30},arrow:true};
 for(let y=170;y<200;y++)for(let x=30;x<270;x++)f.put(x,y,[210,230,245]);
 if(mixed)for(let y=164;y<170;y++)for(let x=244;x<=256;x++)f.put(x,y,x>=249&&x<=251?[30,60,90]:[255,255,255]);
 // Create this source variant before measuring it. A prior fixture's raster
 // snapshots and private ports cannot certify a later changed pixel buffer.
 f.image={...f.image,rgba:Buffer.from(f.image.rgba)};
 f.put=(x,y,color=[30,60,90])=>f.image.rgba.set([...color,255],(y*f.image.width+x)*4);
 const cache=createSceneMeasurementCache(f.image,[],f.budget);f.nodes=[{...f.nodes[0]},target];
 for(const node of f.nodes){assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
 f.inferContacts=true;
 return f;
}
const relations=[45,245].map((x,i)=>({id:'relation-'+i,regionId:'root',fromId:'region-source',toId:'object-target',direction:'forward',shaftBox:{x,y:125,w:10,h:30}}));
test('one measured entity has two independent source contacts and two uniquely bound logical paths',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),measured=measureSharedSourceRoute(f);
 assert.ok(measured.fit,measured.reason);
 const result=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations,id:'shared-multi',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(result.graph.nodes.filter(n=>n.endpointId==='object-target').length,2);
 assert.equal(result.graph.paths.length,2);
 const shared=result.graph.paths[0].edges.filter(a=>result.graph.paths[1].edges.some(b=>a.id===b.id));assert.equal(shared.length,1);
 assert.equal(result.parts.filter(p=>p.style.startArrow||p.style.endArrow).length,2);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);assert.ok(measured.fit.workChecks<=4000000);
});
test('different arrow states belong to separate contacts of the same physical entity',()=>{
 const f=fixture(true),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const mixed=relations.map((r,i)=>({...r,direction:i?'undirected':'forward'}));
 const result=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations:mixed,id:'shared-mixed',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(result.graph.paths.length,2);assert.equal(result.parts.filter(p=>p.style.startArrow||p.style.endArrow).length,1);
 assert.deepEqual(measured.fit.nodes.filter(n=>n.endpointId==='object-target').map(n=>n.arrow).sort(),[false,true]);
 const wrong=mixed.map(r=>({...r,direction:'backward'}));
 assert.throws(()=>compileSharedSourceRoute({fit:measured.fit,image:f.image,relations:wrong,id:'shared-wrong',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}}),/shared-relation-direction/u);
});
test('ambiguous or absent path identity never chooses a contact by enumeration order',()=>{
 const f=fixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const base={fit:measured.fit,image:f.image,id:'shared-identity',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}};
 for(const bound of [undefined,{x:140,y:60,w:20,h:30}]){
  const ambiguous=relations.map(({shaftBox,...r})=>({...r,...(bound?{shaftBox:bound}:{})}));
  assert.throws(()=>compileSharedSourceRoute({...base,relations:ambiguous}),/shared-relation-ambiguous/u);
 }
 assert.throws(()=>compileSharedSourceRoute({...base,relations:relations.map(r=>({...r,shaftBox:{x:0,y:0,w:1,h:1}}))}),/shared-relation-anchor/u);
 assert.throws(()=>compileSharedSourceRoute({...base,fit:structuredClone(measured.fit),relations}),/proof/u);
});
test('contact order, source reflection and core order preserve unique paths and original source pixels',()=>{
 const f=fixture(),reflected=Buffer.from(f.image.rgba);
 for(let y=0;y<f.image.height;y++)for(let x=0;x<f.image.width;x++)f.image.rgba.copy(reflected,(y*f.image.width+x)*4,(y*f.image.width+f.image.width-1-x)*4,(y*f.image.width+f.image.width-x)*4);
 f.image.rgba=reflected;
 for(const n of f.nodes)n.box={...n.box,x:f.image.width-n.box.x-n.box.w};
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 for(const n of f.nodes){assert.ok(cache.fill(n.box));n.portFrame=cache.portFrame(n.box);}f.nodes.reverse();
 const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const mirrored=relations.slice().reverse().map(r=>({...r,shaftBox:{...r.shaftBox,x:f.image.width-r.shaftBox.x-r.shaftBox.w}}));
 const result=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations:mirrored,id:'shared-reflected',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(result.graph.paths.length,2);assert.equal(result.parts.filter(p=>p.style.startArrow||p.style.endArrow).length,2);
});
test('inferred contacts retain strict input, blank, source, budget and unified CI boundaries',()=>{
 const f=fixture();
 for(const inferContacts of [null,0,'true'])assert.throws(()=>measureSharedSourceRoute({...f,inferContacts}),TypeError);
 assert.equal(measureSharedSourceRoute({...f,budget:{used:4000000}}).fit,null);
 assert.equal(measureSharedSourceRoute({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).fit,null);
 assert.throws(()=>measureSharedSourceRoute({...f,nodes:[]}),TypeError);
 assert.throws(()=>measureSharedSourceRoute({...f,nodes:[f.nodes[0],f.nodes[0]]}),TypeError);
 for(let y=50;y<170;y++)for(let x=20;x<280;x++)f.put(x,y,[255,255,255]);
 assert.equal(measureSharedSourceRoute(f).fit,null);
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(r=>r.file.replaceAll('\\','/')==='test/source-shared-route-multiple-contacts.test.js'));
});
test('the default scene compiler binds separate contacts of one native object and preserves final shared ownership',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
 const {initializeSceneObjectBatches}=require('../packages/slideclone-core/source-scene-object-batches');
 const {auditSceneInventory}=require('../packages/slideclone-core/source-scene-observed-inventory');
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'multi-contact-scene-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const raw={coordinateSpace:'source-pixels',relationObservationUnit:'logical-relations-v1',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:230}},{id:'source',parentId:'root',kind:'container',box:f.nodes[0].box}],
  objects:[{id:'target',kind:'container',regionId:'root',box:f.nodes[1].box,pictorialContent:'absent'}],
  relations:relations.map((r,i)=>({...r,id:'r'+i,regionId:'root',fromId:'source',toId:'target'})),inventory:[['root',1,0,2],['source',0,0,0]]};
 const plan=initializeSceneObjectBatches(parseSourceScenePlan(raw,{sourceHash,widthPx:300,heightPx:230}));
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:300,heightPt:230}});
 assert.equal(result.evidence.resolvedRelations,2,JSON.stringify(result.evidence.sharedRoutes));
 assert.equal(result.evidence.sharedRoutes.graphs,1);
 const inventory=result.evidence.observedInventory,graph=inventory.sharedRouteGraphs[0];
 assert.deepEqual(auditSceneInventory(inventory,result.page.shapes,result.page.images,sourceHash),[]);
 assert.equal(graph.nodes.filter(n=>n.endpointId==='object-target').length,2);
 assert.equal(result.page.shapes.filter(s=>s.source?.sceneInventoryId==='object-target').length,1);
 const common=graph.paths[0].edges.find(a=>graph.paths[1].edges.some(b=>a.id===b.id)),trunk=graph.edges.find(e=>e.id===common.id).memberId;
 assert.ok(auditSceneInventory(inventory,result.page.shapes.filter(s=>s.id!==trunk),[],sourceHash).some(r=>r.kind==='relations'&&r.count===2));
 assert.equal(result.page.images.length,0);
});
