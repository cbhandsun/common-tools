'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:frameFixture}=require('./helpers/approved-frame-application.cjs');
const {readPng,writePng}=require('../packages/slideclone-core/png');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const {compactNativeFreeformPaths}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
const {approvedRouteApproximationOption:parse,prepareApprovedRouteApproximation:prepare}=require('../packages/slideclone-core/scene-plan/approved-route-approximation');
function fixture(t){
 const f=frameFixture(t),image=readPng(f.context.sourceFile),box={x:10,y:10,w:70,h:60};
 for(let y=10;y<70;y++)for(let x=10;x<80;x++){
  const edge=Math.min(x-10,79-x,y-10,69-y);if(edge>3)continue;
  image.rgba.set([...(edge===1?[100,140,155]:edge===2?[20,70,90]:[180,210,220]),255],(y*image.width+x)*4);
 }
 writePng(f.context.sourceFile,image);const sourceHash=f.hashFile(f.context.sourceFile);
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:1,parentId:null,kind:'section',box:{x:0,y:0,w:120,h:120}}],
  objects:[{id:1,regionId:1,kind:'container',box,pictorialContent:'present'}],relations:[]},{sourceHash,widthPx:120,heightPx:120});
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile:f.context.sourceFile,root:f.root,slideSize:f.deck.slideSize});
 const shapes=compiled.page.shapes,a=shapes.find(s=>s.id==='scene-outline-object-n1')??shapes.find(s=>s.id==='scene-container-object-n1');assert.ok(a);assert.equal(a.style.fill,'none');
 const {measureOutlinedSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
 const {traceNativeMaskContours}=require('../packages/slideclone-core/scene-plan/native-mask-contours');
 const outline=measureOutlinedSceneContainer(image,box,[],{used:0});assert.ok(outline?.paint);
 const legacy=structuredClone(a);legacy.style.fill=outline.paint.baseColor;
 legacy.style.freeformSegments=traceNativeMaskContours(outline.sourcePixels.map(n=>({x:n%120,y:Math.floor(n/120)})),outline.box,{tolerancePx:1.5});
 const b={id:'to',type:'rect',box:{x:100,y:100,w:10,h:10}},source={sceneRelationId:'route',sceneRegionId:'root'};
 const body={id:'body',type:'freeform',box:{x:45,y:70,w:60,h:30},style:{fill:'#123456'},source:{...source}};
 const px=a.box.x+a.box.w/2,py=a.box.y+a.box.h;
 const start={id:'start',type:'line',box:{x:px,y:py,w:0,h:1},style:{startAnchor:{elementId:a.id,side:'bottom',position:.5},endAnchor:{elementId:body.id,side:'top',position:0}},source:{...source}};
 const end={id:'end',type:'line',box:{x:105,y:99,w:0,h:1},style:{startAnchor:{elementId:body.id,side:'bottom',position:1},endAnchor:{elementId:b.id,side:'top',position:.5}},source:{...source}};
 shapes.push(b,body,start,end);f.deck.pages[0]={shapes,images:[],textBoxes:[]};
 const route={approvalId:'user-approved-route-fixture',relationId:'route',direction:'forward',source:{width:120,height:120,sha256:sourceHash},
  members:[body,start,end].map(s=>({id:s.id,fingerprint:fingerprint(s)})),endpoints:[{id:a.id,fingerprint:fingerprint(legacy)},{id:b.id,fingerprint:fingerprint(b)}],
  points:[{x:px,y:py},{x:px,y:100},{x:105,y:100}],color:'#123456',widthPx:3};
 return {...f,a,b,body,legacy,shapes,sourceHash,route,input:()=>({deck:f.deck,shapes,images:[],texts:[]})};
}
test('source-proven outline paint can reuse the exact approved endpoint without rebinding the route',t=>{
 const f=fixture(t),policy=parse({nativeRoute:f.route},f.route.source),approval=fingerprint(policy),before=fingerprint(f.deck);
 const prepared=prepare(policy,f.input());assert.equal(fingerprint(f.deck),before);assert.equal(fingerprint(policy),approval);
 const result=prepared.apply(f.shapes);assert.equal(result.filter(s=>s.source?.sceneRelationId==='route').length,1);
 assert.equal(prepared.report.sourceAppearanceRevisions.length,1);
 assert.equal(prepared.report.sourceAppearanceRevisions[0].originalFingerprint,f.route.endpoints[0].fingerprint);
 assert.equal(prepared.report.sourceErasure,false);assert.equal(prepared.report.wholeProductAcceptance,false);
});
test('real thin outline compatibility reconstructs the old contour from the original admitted source cells',t=>{
 const {withSourceMeasuredOutlineScope:scope,registerSourceMeasuredOutlineStyle:register,sourceMeasuredOutlineAncestor:ancestor}=require('../packages/slideclone-core/scene-plan/source-measured-outline-compatibility');
 const image=readPng(require('node:path').join(__dirname,'fixtures/source-thin-outline/source.png')),sourceHash='c'.repeat(64);
 const {measureOutlinedSceneContainer:measure}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
 const {traceNativeMaskContours:trace}=require('../packages/slideclone-core/scene-plan/native-mask-contours');
 const {applySourceOutlinePaint:apply}=require('../packages/slideclone-core/scene-plan/source-outline-paint-shapes');
 const result=scope(image,sourceHash,()=>{
  const outline=measure(image,{x:16.01,y:16.912,w:48.87,h:49.232},[{x:31.214,y:29.569,w:15.204,h:24.616}],{used:0});assert.ok(outline?.paint?.disjoint);
  const shape={id:'real-ring',type:'freeform',box:outline.box,style:{fill:outline.color,stroke:'none',freeformSegments:outline.segments},source:{}};
  const shapes=apply([shape],new Map([[shape.id,outline.paint]])).shapes,a=shapes[0];
  const legacy={...a,style:{...a.style,fill:outline.paint.baseColor,freeformSegments:trace(outline.sourcePixels.map(n=>({x:n%image.width,y:Math.floor(n/image.width)})),outline.box,{tolerancePx:1.5})}};
  assert.notDeepEqual(a.style.freeformSegments,legacy.style.freeformSegments);assert.equal(register(outline,a,shapes),true);
  return {a,shapes,legacy};
 });
 assert.equal(ancestor(result.a,fingerprint(result.legacy),sourceHash,result.shapes).originalFingerprint,fingerprint(result.legacy));
});
test('outline compatibility rejects altered endpoints, paint children, route members and copied receipts',t=>{
 for(const mode of ['style-copy','fill','path','box','source','child-delete','child-copy','child-style','extra-child','route-member','wrong-source','expiry']){
  const f=fixture(t);
  if(mode==='style-copy')f.a.style=structuredClone(f.a.style);
  if(mode==='fill')f.a.style.fill='#000000';if(mode==='path')f.a.style.freeformSegments[1].points[0].x=.2;
  if(mode==='box')f.a.box.w++;if(mode==='source')f.a.source.extra='unapproved';
  const child=f.shapes.find(s=>s.source?.sceneOutlinePaintOwnerId===f.a.id);assert.ok(child);
  if(mode==='child-delete')f.shapes.splice(f.shapes.indexOf(child),1);
  if(mode==='child-copy')f.shapes[f.shapes.indexOf(child)]=structuredClone(child);
  if(mode==='child-style')child.style.fill='#000000';
  if(mode==='extra-child')f.shapes.push({...child,id:'extra'});
  if(mode==='route-member')f.body.style.fill='#000000';if(mode==='wrong-source')f.route.source.sha256='b'.repeat(64);
  if(mode==='expiry')t.mock.method(Date,'now',()=>Number.MAX_SAFE_INTEGER);
  const before=fingerprint(f.deck);assert.throws(()=>prepare(parse({nativeRoute:f.route},f.route.source),f.input()),/approved-route-member-binding/u);assert.equal(fingerprint(f.deck),before);t.mock.restoreAll();
 }
});
test('normal path compaction preserves privately measured endpoint compatibility',t=>{
 const f=fixture(t);compactNativeFreeformPaths(f.deck);
 // Historical approvals bind the normal compact transport representation.
 const old={...f.legacy,style:{...f.legacy.style}};compactNativeFreeformPaths({pages:[{shapes:[old],images:[],textBoxes:[]}]});
 f.route.endpoints[0].fingerprint=fingerprint(old);
 for(const member of f.route.members)member.fingerprint=fingerprint(f.shapes.find(s=>s.id===member.id));
 assert.equal(prepare(parse({nativeRoute:f.route},f.route.source),f.input()).report.sourceAppearanceRevisions.length,1);
});
test('prepared appearance compatibility is checked again before changing the final route',t=>{
 for(const mode of ['endpoint','child','duplicate']){
  const f=fixture(t),prepared=prepare(parse({nativeRoute:f.route},f.route.source),f.input());
  if(mode==='endpoint')f.a.box.x++;
  if(mode==='child')f.shapes.find(s=>s.source?.sceneOutlinePaintOwnerId===f.a.id).style.fill='#000000';
  if(mode==='duplicate')f.shapes.push({...f.a});
  const before=fingerprint(f.deck);assert.throws(()=>prepared.apply(f.shapes),/approved-route-final-endpoint-changed/u);
  assert.equal(fingerprint(f.deck),before);assert.equal(prepared.report.finalOutputRepresentation,null);
 }
});
test('late source admission metadata does not invalidate the drawing proof or relax the complete original endpoint fingerprint',t=>{
 const f=fixture(t);
 // The raw compiler adds page identity and normalizes role metadata after its
 // native measurement. The historical approval includes the final metadata.
 for(const s of f.shapes.filter(s=>s===f.a||s.source?.sceneOutlinePaintOwnerId===f.a.id)){
  s.source.pageImage='assets/source.png';delete s.source.nativeComponentRole;
 }
 f.legacy.source={...f.a.source};f.route.endpoints[0].fingerprint=fingerprint(f.legacy);
 assert.equal(prepare(parse({nativeRoute:f.route},f.route.source),f.input()).report.sourceAppearanceRevisions.length,1);
 f.a.source.sceneRegionId='unapproved';
 assert.throws(()=>prepare(parse({nativeRoute:f.route},f.route.source),f.input()),/approved-route-member-binding/u);
});
test('malformed, serialized, empty, forged and exhausted outline proofs cannot execute provider hooks',t=>{
 const {sourceMeasuredOutlineAncestor:ancestor,registerSourceMeasuredOutlineStyle:register,
  captureSourceOutlineAppearance:capture,withSourceMeasuredOutlineScope:scope}=require('../packages/slideclone-core/scene-plan/source-measured-outline-compatibility');
 let calls=0;const trap=()=>{calls++;throw Error('private');},getter={};Object.defineProperty(getter,'style',{get:trap});
 for(const item of [null,[],{},getter,new Proxy({},{get:trap,ownKeys:trap})]){
  assert.equal(ancestor(item,'a'.repeat(64),'b'.repeat(64),[]),null);assert.equal(register(item,item,[]),false);
 }
 const f=fixture(t);assert.equal(ancestor(JSON.parse(JSON.stringify(f.a)),f.route.endpoints[0].fingerprint,f.sourceHash,f.shapes),null);
 const image=readPng(f.context.sourceFile),{measureOutlinedSceneContainer:measure}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
 const outline=measure(image,{x:10,y:10,w:70,h:60},[],{used:0}),work={checks:4000000,exhausted:false};
 assert.ok(outline?.paint?.disjoint);
 scope(image,f.sourceHash,()=>{
  capture(image,outline,work);assert.equal(register(outline,f.a,f.shapes),false);
  assert.equal(register(structuredClone(outline),f.a,f.shapes),false);
 });
 assert.equal(work.checks,4000000);assert.equal(calls,0);
});
test('outline compatibility is included in unified CI and the installed runtime closure',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-measured-outline-compatibility.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-measured-outline-compatibility.js'));
});
