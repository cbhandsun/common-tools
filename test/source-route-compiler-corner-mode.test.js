'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoundedRouteFixture:fixture}=require('./helpers/source-rounded-route.cjs');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
const {decodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
function compiledFixture(options={}){
 const f=fixture(options),result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);
 const request={fit:result.fit,relation:{id:'rounded',regionId:'root',fromId:'a',toId:'b',direction:'forward'},fromId:f.from.id,toId:f.to.id,
  widthPx:240,heightPx:180,slideSize:{widthPt:240,heightPt:180}};
 return {f,request};
}
test('explicit auto emits a source measured rounded L as one open cubic and retains strict semantic rejection',()=>{
 const {request}=compiledFixture(),parts=compileSourceSceneRoute({...request,connectorCornerMode:'auto'});assert.equal(parts.length,1);
 const shape=parts[0];assert.equal(shape.type,'freeform');assert.equal(shape.source.connectorCornerMode,'rounded-freeform');
 assert.equal(shape.style.endArrow,'triangle');assert.equal(shape.style.closed,false);
 assert.ok(decodeNativeFreeformPath(shape.style.freeformPath).some(s=>s.type==='cubicBezTo'));
 const {auditSemanticEditability}=require('../packages/slideclone-core/quality/semantic-editability-quality');
 const audit=auditSemanticEditability({slideSize:request.slideSize,pages:[{shapes:parts,images:[]}]});assert.equal(audit.passed,false);
 assert.equal(audit.metrics.fixedRelationshipPaintCount,1);
 const elbow=compileSourceSceneRoute({...request,connectorCornerMode:'reroutable-elbow'});assert.equal(elbow.length,1);assert.equal(elbow[0].type,'line');
 assert.equal(elbow[0].style.startAnchor.elementId,'a');assert.equal(elbow[0].style.endAnchor.elementId,'b');
 assert.equal(auditSemanticEditability({slideSize:request.slideSize,pages:[{shapes:elbow,images:[]}]}).passed,true);
 assert.equal(compileSourceSceneRoute({...request,connectorCornerMode:'rounded-freeform'})[0].type,'freeform');
 assert.throws(()=>compileSourceSceneRoute({...request,connectorCornerMode:'invalid'}),TypeError);
 assert.throws(()=>compileSourceSceneRoute({...request,fit:structuredClone(request.fit)}),/proof/);
});

test('unconfigured single-route compilation equals the bound native mode with original gradient and endpoint direction',()=>{
 for(const options of [{},{gradient:true},{gradient:true,reverse:true},{gradient:'path'}]){
  const {request}=compiledFixture(options),expected=compileSourceSceneRoute({...request,connectorCornerMode:'reroutable-elbow'});
  for(const controls of [{},{connectorCornerMode:undefined}]){
   const parts=compileSourceSceneRoute({...request,...controls});assert.deepEqual(parts,expected);
   const lines=parts.filter(part=>part.type==='line');assert.ok(lines.length);
   assert.ok(lines.every(part=>part.style.startAnchor&&part.style.endAnchor&&!part.style.freeformPath));
   assert.equal(lines[0].style.startAnchor.elementId,request.fromId);
   assert.equal(lines.at(-1).style.endAnchor.elementId,request.toId);
  }
 }
});
test('native gradients survive rounded and flipped elbow compilation in both directions',()=>{
 for(const reverse of [false,true]){
  const {request}=compiledFixture({gradient:true,reverse});assert.ok(request.fit.paint);
  assert.ok(request.fit.paint.spatial);assert.ok(Object.isFrozen(request.fit.paint.spatial));
  assert.ok(Object.isFrozen(request.fit.paint.spatial.color));assert.ok(Object.isFrozen(request.fit.paint.spatial.step));
  const rounded=compileSourceSceneRoute({...request,connectorCornerMode:'auto'});assert.equal(rounded.length,1);assert.equal(rounded[0].type,'freeform');assert.equal(rounded[0].style.strokeGradient.angleDeg,90);
  const elbow=compileSourceSceneRoute({...request,connectorCornerMode:'reroutable-elbow'})[0],frame=elbow.style.connectorFrame;
  const local=elbow.style.strokeGradient.angleDeg*Math.PI/180;
  const angle=Math.atan2(Math.sin(local)*(frame.flipV?-1:1),Math.cos(local)*(frame.flipH?-1:1))*180/Math.PI+frame.rotationDeg;
  assert.ok(Math.abs(((angle+360)%360)-90)<1e-6);assert.equal(elbow.style.endArrow,'triangle');
 }
});
test('non spatial measured paint retains its segment gradients instead of degrading to a uniform native path',()=>{
 const {request}=compiledFixture({gradient:'path'});assert.ok(request.fit.paint);
 for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const shapes=compileSourceSceneRoute({...request,connectorCornerMode:mode}),lines=shapes.filter(s=>s.type==='line');
  assert.ok(lines.length>1);assert.ok(lines.every(s=>s.style.strokeGradient));
  assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
 }
});
test('a source spatial gradient with a short transition stays one rounded native path',()=>{
 for(const reverse of [false,true]){
  const {request}=compiledFixture({gradient:'spatial-knots',reverse});
  assert.ok(request.fit.paint?.spatial,'source coordinate paint must retain the short transition');
  const spatial=request.fit.paint.spatial;assert.ok(spatial.stops?.length>2);assert.ok(spatial.stops.length<=6);
  assert.ok(Object.isFrozen(spatial));assert.ok(Object.isFrozen(spatial.stops));assert.ok(spatial.stops.every(Object.isFrozen));
  for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
   const parts=compileSourceSceneRoute({...request,connectorCornerMode:mode});assert.equal(parts.length,1);
   assert.equal(parts[0].type,mode==='reroutable-elbow'?'line':'freeform');
   assert.ok(parts[0].style.strokeGradient.stops.length>2);assert.ok(parts[0].style.strokeGradient.stops.length<=6);
   assert.equal(parts[0].style.startAnchor.elementId,request.fromId);assert.equal(parts[0].style.endAnchor.elementId,request.toId);
  }
 }
});
test('the complete shared T compiler retains all branches, native gradients and the requested corner strategy',()=>{
 const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=sourceSharedTreeFixture();
 for(let y=50;y<170;y++)for(let x=40;x<=260;x++){
  const at=(y*f.image.width+x)*4;if(f.image.rgba[at]===30&&f.image.rgba[at+1]===60)f.put(x,y,[30,Math.round(220-y*.9),180]);
 }
 const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const relations=['left','right'].map(name=>({id:'relation-'+name,regionId:'root',fromId:'region-source',toId:'object-'+name,direction:'forward'}));
 for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const result=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations,id:'tree',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},connectorCornerMode:mode});
  const shapes=result.parts.filter(s=>!s.source.routeControl);assert.equal(shapes.length,3);assert.equal(result.graph.paths.length,2);
  assert.ok(shapes.every(s=>s.style.strokeGradient||s.style.stroke!=='none'));
  assert.equal(shapes.filter(s=>s.type==='freeform').length,mode==='rounded-freeform'?2:0);
  assert.equal(shapes.filter(s=>s.style.endArrow||s.style.startArrow).length,2);
 }
});
test('the default source scene entrypoint propagates all three corner strategies',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {initializeSceneObjectBatches}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'rounded-scene-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=initializeSceneObjectBatches(parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:180}}],
  objects:[f.from,f.to].map(n=>({id:n.id,regionId:'root',kind:'container',box:n.box,pictorialContent:'absent'})),
  relations:[{id:'rounded',regionId:'root',fromId:'a',toId:'b',direction:'forward',shaftBox:f.shaftBox}],inventory:[['root',2,0,1]]},{sourceHash,widthPx:240,heightPx:180}));
 for(const connectorCornerMode of [undefined,'auto','rounded-freeform','reroutable-elbow']){
  const result=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,root,sourceFile,slideSize:{widthPt:240,heightPt:180},connectorCornerMode});
  assert.equal(result.evidence.resolvedRelations,1,JSON.stringify(result.evidence.unresolved));
  const route=result.page.shapes.find(s=>s.source?.sceneRelationId);assert.ok(route);
  const native=connectorCornerMode===undefined||connectorCornerMode==='reroutable-elbow';
  assert.equal(route.type,native?'line':'freeform');
  if(native){
   assert.equal(route.source.nativeConnectorRoute,true);
   assert.equal(route.style.startAnchor.elementId,'scene-container-object-a');
   assert.equal(route.style.endAnchor.elementId,'scene-container-object-b');
   assert.equal(route.style.freeformPath,undefined);
  }
 }
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
 const worker=fs.readFileSync(path.join(__dirname,'../packages/remote-mcp-server/bin/common-tools-team-image-worker.js'),'utf8');
 assert.match(worker,/createNativeRebuilder\(settings,[^\n]*connectorCornerMode: settings.connectorCornerMode/);
 assert.match(worker,/createImageToEditableArchiveHandler\([^\n]*connectorCornerMode: settings.connectorCornerMode/);
});
