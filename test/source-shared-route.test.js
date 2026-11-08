'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedTreeFixture:fixture,sourceSharedGapTreeFixture:gapFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute:measure}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute:compile}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const relations=['left','right'].map(name=>({id:'relation-'+name,regionId:'root',fromId:'region-source',toId:'object-'+name,direction:'forward'}));
for(const [variant,factory]of [['physical',fixture],['logical-gap',gapFixture]])test(`the production compiler preserves a ${variant} region tree through final inventory and artifact round-trip`,t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {initializeSceneObjectBatches}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
 const {auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
 const {packSceneInventoryMembers:pack}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
 const f=factory(),root=fs.mkdtempSync(path.join(os.tmpdir(),'source-shared-production-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const raw={coordinateSpace:'source-pixels',relationObservationUnit:'logical-relations-v1',
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:300,h:230}},{id:'source',parentId:'root',kind:'container',box:f.nodes[0].box}],
  objects:f.nodes.slice(1).map((n,i)=>({id:i?'right':'left',kind:'container',regionId:'root',box:n.box,pictorialContent:'absent'})),
  relations:relations.map((r,i)=>({...r,id:i?'right':'left',regionId:'root',fromId:'source',toId:i?'right':'left',shaftBox:{x:i?145:45,y:49,w:110,h:122}})),
  inventory:[['root',2,0,2],['source',0,0,0]]};
 const plan=initializeSceneObjectBatches(parseSourceScenePlan(raw,{sourceHash,widthPx:300,heightPx:230}));
 const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:300,heightPt:230}});
 assert.equal(result.evidence.resolvedRelations,2,JSON.stringify(result.evidence.sharedRoutes));
 assert.equal(result.evidence.sharedRoutes.graphs,1);
 const inventory=result.evidence.observedInventory;
 assert.equal(inventory.endpointBindings.length,1);assert.equal(inventory.endpointBindings[0].kind,'region');
 assert.deepEqual(audit(pack(inventory),result.page.shapes,result.page.images,sourceHash,result.page.textBoxes),[]);
 const graph=inventory.sharedRouteGraphs[0],common=graph.paths[0].edges.find(a=>graph.paths[1].edges.some(b=>a.id===b.id));assert.ok(common);
 assert.equal(graph.rendering,'whole-native-paths-v1');assert.equal(graph.renderedPaths.length,2);
 const members=new Set(graph.renderedPaths.map(p=>p.memberId));assert.ok([...members].every(id=>result.page.shapes.some(s=>s.id===id)));
 assert.ok(audit(inventory,result.page.shapes.filter(s=>!members.has(s.id)),[],sourceHash).some(r=>r.kind==='relations'&&r.count===2));
 assert.ok(audit(inventory,result.page.shapes.filter(s=>s.id!==graph.renderedPaths[0].memberId),[],sourceHash).some(r=>r.kind==='relations'));
 assert.equal(result.page.images.length,0);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),sourceHash);
});
test('real source pixels prove a complete tree and compile one native trunk with real region contacts',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
 const output=compile({fit:result.fit,image:f.image,relations,id:'shared-tree',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(output.graph.paths.length,2);assert.ok(output.parts.length<=32);
 const common=output.graph.paths[0].edges.filter(a=>output.graph.paths[1].edges.some(b=>a.id===b.id));assert.equal(common.length,1);
 assert.equal(output.parts.filter(p=>p.style.endArrow||p.style.startArrow).length,2);
 assert.ok(output.graph.nodes.some(n=>n.endpointId==='region-source'&&n.nativeId==='native-source'));
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);assert.ok(result.fit.workChecks<=4000000);
 assert.throws(()=>compile({fit:structuredClone(result.fit),image:f.image,relations,id:'shared-tree',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}}),/proof/u);
 assert.throws(()=>{result.fit.edges[0].points[0].x++;},TypeError);
});

test('unattached boundary fringe does not exhaust the capacity of privately proven shared contacts',()=>{
 const f=fixture();
 // These disconnected source strokes touch the geometric boundary, but the
 // independently measured port requires shaft ink outside that boundary.
 // Neither stroke belongs to the complete shared component between the nodes.
 for(let x=130;x<=146;x++)f.put(x,50);
 for(let x=154;x<=169;x++)f.put(x,50);
 const result=measure(f);
 assert.ok(result.fit,JSON.stringify({reason:result.reason,contacts:result.endpointContacts}));
 const output=compile({fit:result.fit,image:f.image,relations,id:'shared-fringe',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(output.graph.paths.length,2);
 assert.equal(output.parts.filter(p=>p.style.endArrow||p.style.startArrow).length,2);
});

test('shared head and shaft width consume the privately observed body-adjacent background consistently',()=>{
 const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const f=fixture(),source=f.nodes[0];source.box={x:20,y:20,w:260,h:30};
 for(let y=20;y<50;y++)for(let x=20;x<280;x++)f.put(x,y,[210,230,245]);
 for(let y=50;y<166;y++)for(let x=20;x<280;x++){
  const at=(y*f.image.width+x)*4;
  if(f.image.rgba[at]===255&&f.image.rgba[at+1]===255&&f.image.rgba[at+2]===255)
   f.put(x,y,[255,Math.min(255,200+(y-50)*.5),Math.min(255,175+(y-50)*.7)].map(Math.round));
 }
 const cache=createSceneMeasurementCache(f.image,[],f.budget);assert.ok(cache.fill(source.box));source.portFrame=cache.portFrame(source.box);
 const before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
 const output=compile({fit:result.fit,image:f.image,relations,id:'shared-shadow-field',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(output.graph.paths.length,2);assert.equal(output.parts.filter(part=>part.style.endArrow||part.style.startArrow).length,2);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);assert.ok(result.fit.workChecks<=4000000);
});

test('true excessive contacts and absent private shaft support retain separate closed failures',()=>{
 const excessive=fixture();
 for(const y of [50,51]){
  for(let x=130;x<=146;x++)excessive.put(x,y);
  for(let x=154;x<=169;x++)excessive.put(x,y);
 }
 for(let x=130;x<=169;x++)excessive.put(x,52);
 const capacity=measure(excessive);
 assert.equal(capacity.fit,null);assert.equal(capacity.reason,'shared-contact-capacity');
 assert.ok(capacity.endpointContacts[0].count>32);
 const detached=fixture();
 for(let y=51;y<=53;y++)for(let x=149;x<=151;x++)detached.put(x,y,[255,255,255]);
 detached.put(150,52);
 const unproven=measure(detached);
 assert.equal(Boolean(unproven.fit),false);assert.equal(unproven.reason,'shared-gap-background');
 assert.ok(unproven.endpointContacts[0].candidates>0);
 assert.equal(unproven.endpointContacts[0].proven,0);
 assert.equal(unproven.endpointContacts[0].count,0);
});

test('complete shared trees preserve visible terminal gaps without extending native arrows',()=>{
 const f=gapFixture();
 const result=measure(f);assert.ok(result.fit,result.reason);
 const output=compile({fit:result.fit,image:f.image,relations,id:'shared-gap',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
 assert.equal(output.graph.paths.length,2);
 const arrowParts=output.parts.filter(p=>p.style.startArrow||p.style.endArrow);
 assert.equal(arrowParts.length,2);
 for(const part of arrowParts){
  const tip=part.style.endArrow?{x:part.box.x+part.box.w,y:part.box.y+part.box.h}:{x:part.box.x,y:part.box.y};
  assert.equal(tip.y,163);
  assert.equal(part.source.sourceAttachmentKind,'visible-gap-logical');
  const anchor=part.style.endArrow?part.style.endAnchor:part.style.startAnchor;
  assert.equal(anchor.dyPt,-7);
 }
 assert.ok(f.budget.used<=4000000);assert.ok(result.fit.workChecks<=4000000);
});

test('logical shared gaps reject obstructed, translucent, ambiguous and direction-invalid source terminals',()=>{
 for(const mode of ['ink','text','node','alpha','duplicate','direction']){
  const f=gapFixture();
  if(mode==='ink')f.put(150,53);
  if(mode==='text')f.textMasks.push({x:149,y:52,w:3,h:2});
  if(mode==='node')f.obstacles=[{x:149,y:52,w:3,h:2}];
  if(mode==='alpha')f.image.rgba[(53*300+150)*4+3]=0;
  if(mode==='duplicate')f.nodes.push({...f.nodes[1],id:'native-duplicate',endpointId:'object-duplicate'});
  if(mode==='direction')f.nodes[1].arrow=false;
  const result=measure(f);assert.equal(Boolean(result.fit),false,mode);
 }
 const malformed=gapFixture();
 for(const obstacles of [null,new Array(1),[{x:0,y:0,w:100000,h:1}]])assert.throws(()=>measure({...malformed,obstacles}),TypeError);
});

test('a complete one-cell blank corridor proves logical attachment at a two-pixel tip-to-port distance',()=>{
 for(const distance of [2,3]){
  const f=gapFixture({targetGap:distance}),result=measure(f);assert.ok(result.fit,result.reason);
  const output=compile({fit:result.fit,image:f.image,relations,id:'shared-short-gap',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}});
  const arrows=output.parts.filter(part=>part.style.endArrow||part.style.startArrow);assert.equal(arrows.length,2);
  for(const part of arrows){
   const tip=part.style.endArrow?part.box.y+part.box.h:part.box.y,anchor=part.style.endArrow?part.style.endAnchor:part.style.startAnchor;
   assert.equal(tip,170-distance);assert.equal(anchor.dyPt,-distance);assert.equal(part.source.sourcePhysicalAttachment,false);
  }
 }
 for(const mode of ['text','node','alpha']){
  const f=gapFixture({targetGap:2});
  if(mode==='text')f.textMasks=[{x:49,y:169,w:3,h:1}];
  if(mode==='node')f.obstacles=[{x:49,y:169,w:3,h:1}];
  if(mode==='alpha')f.image.rgba[(169*300+50)*4+3]=0;
  assert.equal(Boolean(measure(f).fit),false,mode);
 }
});

test('independently observed smooth node shadow is background, while inserted corridor ink still rejects',()=>{
 const shadow=()=>{
  const f=gapFixture();
  for(let y=51;y<=55;y++)for(let x=140;x<=160;x++){const value=255-(56-y)*7;f.put(x,y,[value,value,value]);}
  return f;
 };
 const f=shadow(),result=measure(f);assert.ok(result.fit,result.reason);
 const blocked=shadow();blocked.put(150,53);
 assert.equal(Boolean(measure(blocked).fit),false);
 const unstable=shadow();unstable.put(143,58,[100,100,100]);
 assert.equal(Boolean(measure(unstable).fit),false);
});
test('blank, disconnected, unrepresented branches and unexpected heads cannot produce a complete shared tree',()=>{
 for(const mode of ['blank','break','branch','wrong-head','transparent']){
  const f=fixture();
  if(mode==='blank')for(let y=50;y<170;y++)for(let x=20;x<280;x++)f.put(x,y,[255,255,255]);
  if(mode==='break')for(let y=80;y<=85;y++)for(let x=148;x<=152;x++)f.put(x,y,[255,255,255]);
  if(mode==='branch')for(let y=110;y<=140;y++)for(let x=99;x<=101;x++)f.put(x,y);
  if(mode==='wrong-head')f.nodes[1].arrow=false;
  if(mode==='transparent')f.image.rgba[(80*300+150)*4+3]=0;
  assert.equal(measure(f).fit,null,mode);
 }
});
test('budgets, forged ports, source substitution and hostile controls fail closed',()=>{
 const f=fixture();assert.equal(measure({...f,budget:{used:4000000}}).fit,null);
 assert.equal(measure({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).fit,null);
 assert.equal(measure({...f,nodes:f.nodes.map(n=>({...n,portFrame:{}}))}).fit,null);
 let calls=0;const hostile={};Object.defineProperty(hostile,'window',{get(){calls++;throw Error('private');}});
 for(const input of [null,hostile,new Proxy(f,{get(){calls++;throw Error('private');}}),{...f,nodes:new Array(3)},{...f,window:{x:0,y:0,w:100000,h:1}}])
  assert.throws(()=>measure(input),TypeError);
 assert.equal(calls,0);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
});
test('a high-cardinality portfolio with duplicate bodies rejects ambiguous ports before exhausting geometry',()=>{
 const f=fixture();f.nodes=Array.from({length:32},(_,i)=>({...f.nodes[i%3],id:'native-stress-'+i,endpointId:'object-stress-'+i}));
 const before=Buffer.from(f.image.rgba),result=measure(f);
 assert.equal(result.fit,null);assert.equal(result.reason,'shared-ambiguous-ports');assert.deepEqual(f.image.rgba,before);
});
