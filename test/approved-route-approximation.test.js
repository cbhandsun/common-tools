'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture:frameFixture}=require('./helpers/approved-frame-application.cjs');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {createApprovedFrameAssetApplication}=require('../packages/slideclone-core/scene-plan/approved-frame-application');
const {finalizeWithApprovedFrames}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
const {approvedRouteApproximationOption:parse,prepareApprovedRouteApproximation:prepare}=require('../packages/slideclone-core/scene-plan/approved-route-approximation');

function fixture(t,base=frameFixture){
 const f=base(t),page=f.deck.pages[0],sx=f.deck.slideSize.widthPt/f.review.source.width,sy=f.deck.slideSize.heightPt/f.review.source.height;
 const box=(x,y,w,h)=>({x:x*sx,y:y*sy,w:w*sx,h:h*sy});
 const a={id:'from',type:'rect',box:box(5,5,10,10)},b={id:'to',type:'rect',box:box(80,80,10,10)};
 const source={sceneRelationId:'route',sceneRegionId:'root',nativeComponentGroupId:'old-route'};
 const body={id:'body',type:'freeform',box:box(9,15,76,65),style:{fill:'#123456'},source:{...source}};
 const start={id:'start',type:'line',box:box(10,15,0,1),style:{startAnchor:{elementId:a.id,side:'bottom',position:.5},endAnchor:{elementId:body.id,side:'top',position:.1}},source:{...source}};
 const end={id:'end',type:'line',box:box(85,79,0,1),style:{startAnchor:{elementId:body.id,side:'right',position:1},endAnchor:{elementId:b.id,side:'top',position:.5}},source:{...source}};
 page.shapes.push(a,b,body,start,end);
 const route={approvalId:'user-approved-route-fixture',relationId:'route',direction:'forward',source:{...f.review.source},
  members:[body,start,end].map(row=>({id:row.id,fingerprint:fingerprint(row)})),endpoints:[a,b].map(row=>({id:row.id,fingerprint:fingerprint(row)})),
  points:[{x:10,y:15},{x:10,y:80},{x:85,y:80}],color:'#123456',widthPx:3};
 const input=()=>({deck:f.deck,shapes:page.shapes,images:page.images,texts:page.textBoxes});
 return {...f,page,route,input,a,b,body,start,end,
  run:finalize=>finalizeWithApprovedFrames(createApprovedFrameAssetApplication(f.review,{...(f.card?{cardBackdrop:f.card}:{}),nativeRoute:route}),f.context,finalize??(()=>f.deck))};
}

test('host-approved native stroke replaces only reviewed final members and retains strict evidence',async t=>{
 const f=fixture(t),strict=f.deck.meta.sourceSceneCompilation,source=f.page.source,other=f.page.shapes.filter(s=>!['body','start','end','old-frame'].includes(s.id));
 const original=f.hashFile(f.original),before=f.page.shapes;await f.run();
 assert.ok(before.includes(f.body));assert.ok(!f.page.shapes.some(s=>['body','start','end'].includes(s.id)));
 for(const row of other)assert.ok(f.page.shapes.includes(row));assert.equal(f.deck.meta.sourceSceneCompilation,strict);assert.equal(f.page.source,source);
 const parts=f.page.shapes.filter(s=>s.source?.detector==='approved-native-route-approximation'),lines=parts.filter(s=>s.type==='line');
 assert.equal(parts.length,1);assert.equal(lines.length,1);assert.equal(lines[0].style.startAnchor.elementId,'from');assert.equal(lines[0].style.endAnchor.elementId,'to');
 assert.equal(lines[0].style.endArrow,'triangle');
 assert.equal(f.hashFile(f.original),original);
 const report=f.deck.meta.approvedNativeRoute;assert.equal(report.nativeConnectors,1);assert.equal(report.internalJoints,0);assert.equal(report.strictBaselineUnchanged,true);
 for(const key of ['strictSourceEquivalent','sourceFootprint','sourceErasure','wholeProductAcceptance'])assert.equal(report[key],false);
 assert.equal(report.nodeFollowingVerification,'not-assessed');assert.equal(report.originalAssetsPreserved,true);
});

test('final output representation reflects native replacement while the original strict report is retained',async t=>{
 const f=fixture(t),old={basis:'compiled-ir-structure-only',nativeModeUnmetRelationIds:['route'],
  relations:[{relationId:'route',representation:'mixed-fixed-and-connectors',fixedPathParts:1}]};
 f.page.source={...f.page.source,sourceScene:{routeRepresentations:old}};
 let checked=false;
 await f.run(()=>{
  const summary=f.deck.meta.approvedNativeRoute.finalOutputRepresentation;
  assert.ok(summary);assert.equal(summary.basis,'compiled-ir-structure-only');
  assert.equal(summary.nodeFollowingVerification,'not-assessed');assert.deepEqual(summary.nativeModeUnmetRelationIds,[]);
  assert.equal(summary.relations.length,1);
  const row=summary.relations[0];assert.equal(row.relationId,'route');assert.equal(row.representation,'native-connectors');
  assert.equal(row.boundConnectorParts,1);assert.equal(row.fixedPathParts,0);assert.equal(row.controlParts,0);
  assert.equal(row.wholeNativeObject,true);assert.equal(row.objectStructure,'single-native-connector');
  assert.equal(f.page.source.sourceScene.routeRepresentations,old);
  assert.equal(f.deck.meta.approvedNativeRoute.strictSourceEquivalent,false);checked=true;
 });
 assert.equal(checked,true);
});

test('missing or ambiguous final endpoint identities cannot publish a native output report',t=>{
 for(const mode of ['missing','duplicate']){
  const f=fixture(t),policy=parse({nativeRoute:f.route},f.review.source),prepared=prepare(policy,f.input()),before=JSON.stringify(f.deck);
  const candidates=mode==='missing'?f.page.shapes.filter(s=>s!==f.a):[...f.page.shapes,{...f.a}];
  assert.throws(()=>prepared.apply(candidates),/approved-route-final-representation-invalid/u);
  assert.equal(prepared.report.finalOutputRepresentation,null);assert.equal(JSON.stringify(f.deck),before);
 }
});

test('final seal failure rolls back route members, meta and frame asset publication together',async t=>{
 const f=fixture(t),before=JSON.stringify(f.deck),shapeIdentity=f.page.shapes;
 await assert.rejects(f.run(()=>{assert.ok(f.deck.meta.approvedNativeRoute);throw Error('seal-rejected');}),/seal-rejected/u);
 assert.equal(JSON.stringify(f.deck),before);assert.equal(f.page.shapes,shapeIdentity);assert.deepEqual(f.directories(),[]);
});

test('frame, card and route approvals compose before final seal without changing other native routes',async t=>{
 const f=fixture(t,require('./helpers/approved-card-backdrop.cjs').fixture),strict=f.deck.meta.sourceSceneCompilation;
 const shared={id:'shared',type:'line',box:{x:1,y:2,w:3,h:4},style:{startAnchor:{elementId:'from'},endAnchor:{elementId:'to'}},
  source:{detector:'source-shared-route'}};f.page.shapes.push(shared);
 const originalHash=f.hashFile(f.original),sourceHash=f.hashFile(f.context.sourceFile),card=f.members.map(p=>structuredClone(p));
 let sealed=0;await f.run(()=>{
  sealed++;assert.ok(f.deck.meta.approvedApproximateFrames);assert.ok(f.deck.meta.approvedCardBackdrop);assert.ok(f.deck.meta.approvedNativeRoute);
  assert.equal(f.deck.meta.sourceSceneCompilation,strict);assert.ok(f.page.shapes.includes(shared));
  assert.ok(!f.page.shapes.some(p=>['body','start','end','old-frame'].includes(p.id)));
 });
 assert.equal(sealed,1);assert.equal(f.hashFile(f.original),originalHash);assert.equal(f.hashFile(f.context.sourceFile),sourceHash);
 const all=[...f.page.shapes,...f.page.images,...f.page.textBoxes];
 for(const original of card){const actual=all.find(p=>p.id===original.id);assert.equal(actual.source.nativeComponentGroupId,'approved-card-region-n10');
  const copy=structuredClone(actual);copy.source.nativeComponentGroupId=original.source.nativeComponentGroupId;
  if(original.style.nativeComponentGroupId!==undefined)copy.style.nativeComponentGroupId=original.style.nativeComponentGroupId;assert.deepEqual(copy,original);}
 assert.equal(f.deck.meta.approvedNativeRoute.sourceErasure,false);assert.equal(f.deck.meta.approvedNativeRoute.wholeProductAcceptance,false);
 const lines=f.page.shapes.filter(p=>p.source?.detector==='approved-native-route-approximation'&&p.type==='line');
 assert.equal(lines.length,1);assert.equal(lines[0].style.startAnchor.elementId,'from');assert.equal(lines[0].style.endAnchor.elementId,'to');
});

test('combined card and route publication rolls back every collection if final seal fails',async t=>{
 const f=fixture(t,require('./helpers/approved-card-backdrop.cjs').fixture),before=JSON.stringify(f.deck),refs={...f.page},meta=f.deck.meta;
 await assert.rejects(f.run(()=>{throw Error('combined-seal-rejected');}),/combined-seal-rejected/u);
 assert.equal(JSON.stringify(f.deck),before);assert.equal(f.deck.meta,meta);
 for(const name of ['shapes','images','textBoxes'])assert.equal(f.page[name],refs[name]);assert.deepEqual(f.directories(),[]);
});

test('approval is snapshotted and absence retains the original fixed relation',async t=>{
 const f=fixture(t),service=createApprovedFrameAssetApplication(f.review,{nativeRoute:f.route});
 f.route.points[0].x=100;f.route.members=[];await finalizeWithApprovedFrames(service,f.context,()=>true);
 assert.equal(f.deck.meta.approvedNativeRoute.measuredVerticesPreserved,true);
 const g=fixture(t);await finalizeWithApprovedFrames(createApprovedFrameAssetApplication(g.review),g.context,()=>true);
 assert.ok(g.page.shapes.includes(g.body));assert.equal(g.deck.meta.approvedNativeRoute,undefined);
});

test('source, stroke, points and membership boundaries reject empty, invalid and extreme input',t=>{
 const f=fixture(t),edits=[r=>r.source.sha256='b'.repeat(64),r=>r.source.width=121,r=>r.points=[],r=>r.points=new Array(2),
  r=>r.points=Array(17).fill({x:1,y:1}),r=>r.points[0].x=-1,r=>r.points[0].x=120,r=>r.points[0].y=NaN,
  r=>r.points[1]={...r.points[0]},r=>r.widthPx=0,r=>r.widthPx=101,r=>r.color='private-content',r=>r.direction='unknown',
  r=>r.relationId='bad.id',r=>r.members=[],r=>r.endpoints.pop(),r=>r.endpoints[1]={...r.endpoints[0]},r=>r.extra='private-content'];
 for(const edit of edits){const route=structuredClone(f.route);edit(route);assert.throws(()=>parse({nativeRoute:route},f.review.source),TypeError);}
 assert.equal(parse(undefined,f.review.source),null);assert.equal(parse({},f.review.source),null);
 assert.throws(()=>parse({unknown:true},f.review.source),/option-invalid/u);
});

test('stale members, shifted nodes, outside connections, shared groups and conflicts cannot publish',async t=>{
 for(const mode of ['paint','missing','duplicate','node','attachment','foreign-relation-member','external','shared-group','output-id']){
  const f=fixture(t);
  if(mode==='paint')f.body.style.fill='#FFFFFF';if(mode==='missing')f.page.shapes.splice(f.page.shapes.indexOf(f.body),1);
  if(mode==='duplicate')f.page.shapes.push(structuredClone(f.body));if(mode==='node')f.a.box.x++;
  if(mode==='attachment')f.route.points[0].x++;
  if(mode==='foreign-relation-member')f.page.shapes.push({id:'foreign',type:'rect',source:{sceneRelationId:'route'}});
  if(mode==='external')f.page.shapes.push({id:'foreign',type:'line',style:{startAnchor:{elementId:'body'}}});
  if(mode==='shared-group')f.page.shapes.push({id:'foreign',type:'rect',source:{nativeComponentGroupId:'old-route'}});
  if(mode==='output-id')f.page.shapes.push({id:'approved-route-route',type:'rect'});
  const before=JSON.stringify(f.deck);await assert.rejects(f.run(),TypeError);assert.equal(JSON.stringify(f.deck),before,mode);assert.deepEqual(f.directories(),[]);
 }
});

test('all declared directions retain exact approved vertices, width, color and correct arrow ends',t=>{
 for(const direction of ['forward','backward','both','none']){
  const f=fixture(t);f.route.direction=direction;const policy=parse({nativeRoute:f.route},f.review.source),prepared=prepare(policy,f.input());
  const parts=prepared.apply(f.page.shapes),lines=parts.filter(s=>s.source?.detector==='approved-native-route-approximation'&&s.type==='line');
  assert.equal(lines[0].style.startArrow,['backward','both'].includes(direction)?'triangle':undefined);
  assert.equal(lines.at(-1).style.endArrow,['forward','both'].includes(direction)?'triangle':undefined);
  assert.equal(lines.length,1);
  const line=lines[0],vertices=require('../packages/slideclone-core/routing/source-route-native-elbow').nativeElbowVertices(line.style);
  assert.deepEqual(vertices.filter((p,i)=>!i||Math.hypot(p.x-vertices[i-1].x,p.y-vertices[i-1].y)>1e-6),f.route.points);
  assert.equal(line.style.stroke,f.route.color);assert.equal(line.style.strokeWidthPt,f.route.widthPx);
 }
});

test('non-preset measured routes remain one exact native path without claiming node following',async t=>{
 const f=fixture(t);f.route.points=[{x:10,y:15},{x:23,y:24},{x:30,y:60},{x:85,y:80}];
 await f.run();const report=f.deck.meta.approvedNativeRoute,parts=f.page.shapes.filter(s=>s.source?.detector==='approved-native-route-approximation');
 assert.equal(parts.length,1);assert.equal(parts[0].type,'freeform');assert.equal(report.internalJoints,0);
 assert.equal(report.nativeConnectors,0);assert.equal(report.nativePaths,1);assert.equal(report.wholeNativeObject,true);
 const row=report.finalOutputRepresentation.relations[0];assert.equal(row.objectStructure,'single-native-path');assert.equal(row.wholeNativeObject,true);
 assert.deepEqual(report.finalOutputRepresentation.nativeModeUnmetRelationIds,['route']);
 const shape=parts[0],segments=require('../packages/slideclone-core/scene-plan/native-freeform-path').decodeNativeFreeformPath(shape.style.freeformPath);
 assert.deepEqual(segments.map(s=>s.points.map(p=>({x:shape.box.x+p.x*shape.box.w,y:shape.box.y+p.y*shape.box.h}))).flat(),f.route.points);
 assert.equal(shape.style.endArrow,'triangle');assert.equal(report.nodeFollowingVerification,'not-assessed');
});

test('final route diagnostics retain the trusted job mode without changing approved geometry or strict evidence',async t=>{
 let geometry;
 for(const mode of [undefined,'auto','rounded-freeform','reroutable-elbow']){
  const f=fixture(t);f.route.points=[{x:10,y:15},{x:23,y:24},{x:30,y:60},{x:85,y:80}];
  f.context.connectorCornerMode=mode;
  // Serialized deck hints cannot override the configuration delivered by the host.
  f.deck.meta.connectorCornerMode=mode==='reroutable-elbow'?'rounded-freeform':'reroutable-elbow';
  const strict=f.deck.meta.sourceSceneCompilation;
  await f.run();
  const report=f.deck.meta.approvedNativeRoute,summary=report.finalOutputRepresentation;
  assert.equal(summary.requestedMode,mode??'reroutable-elbow');
  assert.deepEqual(summary.nativeModeUnmetRelationIds,mode===undefined||mode==='reroutable-elbow'?['route']:[]);
  assert.deepEqual(summary.wholeObjectUnmetRelationIds,[]);
  assert.equal(summary.nodeFollowingVerification,'not-assessed');
  assert.equal(summary.relations[0].objectStructure,'single-native-path');
  assert.equal(report.strictSourceEquivalent,false);assert.equal(report.sourceErasure,false);assert.equal(report.wholeProductAcceptance,false);
  assert.equal(f.deck.meta.sourceSceneCompilation,strict);
  const parts=f.page.shapes.filter(shape=>shape.source?.detector==='approved-native-route-approximation');
  if(geometry===undefined)geometry=structuredClone(parts);else assert.deepEqual(parts,geometry);
 }
});

test('invalid trusted modes fail before cancellation, asset publication or route mutation',async t=>{
 for(const mode of [null,'',true,0,[],{},'private-content'.repeat(10000)]){
  const f=fixture(t),before=JSON.stringify(f.deck);let cancellations=0;
  f.context.connectorCornerMode=mode;f.context.isCancellationRequested=async()=>{cancellations++;return false;};
  await assert.rejects(f.run(),{name:'TypeError',message:'Connector corner mode is invalid'});
  assert.equal(cancellations,0);assert.equal(JSON.stringify(f.deck),before);assert.deepEqual(f.directories(),[]);
  const policy=parse({nativeRoute:f.route},f.review.source);
  assert.throws(()=>prepare(policy,{...f.input(),connectorCornerMode:mode}),{name:'TypeError',message:'Connector corner mode is invalid'});
 }
 let calls=0;const trap=()=>{calls++;throw Error('private-provider-content');};
 for(const kind of ['accessor','coercion','proxy']){
  const f=fixture(t),before=JSON.stringify(f.deck);
  if(kind==='accessor')Object.defineProperty(f.context,'connectorCornerMode',{get:trap});
  else f.context.connectorCornerMode=kind==='proxy'?new Proxy({},{get:trap,getPrototypeOf:trap,ownKeys:trap}):{toString:trap};
  await assert.rejects(f.run(),error=>error instanceof TypeError&&!error.message.includes('private-provider-content'));
  assert.equal(JSON.stringify(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
 assert.equal(calls,0);
});

test('provider proxies, accessors and coercion hooks are rejected without running user code',t=>{
 const f=fixture(t);let calls=0;const trap=()=>{calls++;throw Error('private-provider-content');};
 const proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap});
 for(const options of [proxy,{get nativeRoute(){return trap();}},{nativeRoute:proxy}])assert.throws(()=>parse(options,f.review.source),TypeError);
 for(const change of [r=>r.points[0]={get x(){return trap();},y:15},r=>r.color={toString:trap},r=>r.members[0]=proxy]){
  const route=structuredClone(f.route);change(route);assert.throws(()=>parse({nativeRoute:route},f.review.source),TypeError);
 }
 assert.equal(calls,0);
});

test('route approval modules and regressions join the unified typed and packaged CI surface',()=>{
 for(const name of ['approved-route-approximation-input','approved-route-approximation']){
  const file=`packages/slideclone-core/scene-plan/${name}.js`;
  assert.ok(require('../tsconfig.boundaries.json').include.includes(file));assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 }
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/approved-route-approximation.test.js'));
});
