'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measurePatternedSceneFrame:measure,patternedSceneFrameGeometry:geometry}=require('../packages/slideclone-core/source-scene-patterned-frame');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const {createMeasuredScenePortFrame,verifyMeasuredScenePort}=require('../packages/slideclone-core/source-scene-port-evidence');
const {sceneFrameGapCoverage}=require('../packages/slideclone-core/source-scene-frame-occlusion');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {writePng}=require('../packages/slideclone-core/png');
const {parseSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
function fixture(visibleStroke=false){
 const image={width:240,height:210,rgba:Buffer.alloc(240*210*4,255)},hint={x:30,y:25,w:144,h:120};
 const put=(x,y,w,h,color=[30,60,90,255])=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set(color,(row*image.width+col)*4);};
 for(let x=46;x<158;x+=12){put(x,25,8,2);put(x,143,8,2);}
 for(let y=41;y<130;y+=12){put(30,y,2,8);put(172,y,2,8);}
 for(const [x,y,right,bottom]of[[30,25,false,false],[165,25,true,false],[30,136,false,true],[165,136,true,true]]){
  put(x,y+(bottom?7:0),9,2);put(x+(right?7:0),y,2,9);
 }
 const owner={x:75,y:132,w:62,h:30};put(owner.x,owner.y,owner.w,owner.h,[220,80,130,255]);
 if(visibleStroke)put(94,143,8,2);
 const budget={used:0},cache=createSceneMeasurementCache(image,[],budget);
 assert.ok(cache.surface(owner).measured);const token=cache.portFrame(owner);assert.ok(token);
 return {image,hint,owner,token,cache,budget,textMasks:[],owners:[],put};
}
test('a genuinely measured opaque source surface explains a rail interruption without painting hidden dashes',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba);assert.equal(measure(f),null);
 const frame=measure({...f,occlusionFrames:[f.token]});assert.ok(frame);assert.deepEqual(frame.box,f.hint);
 assert.equal(frame.sourcePixels.includes(143*f.image.width+100),false);
 assert.ok(frame.sourcePixels.includes(143*f.image.width+58));assert.deepEqual(f.image.rgba,before);
 const port=createMeasuredScenePortFrame(f.image,{...geometry(frame,f.image),fill:'none'},frame);
 assert.equal(measure({...f,occlusionFrames:[port]}),null,'a hollow enclosure cannot act as an opaque foreground');
 assert.equal(verifyMeasuredScenePort({image:f.image,token:port,box:frame.box,point:{x:100,y:145},side:'bottom',color:'#1E3C5A',textMasks:[],budget:f.budget}),false);
});
test('unknown, serialized, copied and cross-source tokens cannot explain a rail gap',()=>{
 const f=fixture(),other=fixture();
 for(const token of [{},structuredClone(f.token),new Proxy(f.token,{}),other.token,{box:f.owner,fill:'#DC5082'}])
  assert.equal(measure({...f,occlusionFrames:[token]}),null);
 assert.equal(measure({...f,occlusionFrames:[]}),null);
});
test('visible source strokes painted above an opaque body remain in the native frame',()=>{
 const f=fixture(true),frame=measure({...f,occlusionFrames:[f.token]});assert.ok(frame);
 assert.ok(frame.sourcePixels.includes(143*f.image.width+94));
 assert.equal(frame.sourcePixels.includes(143*f.image.width+110),false);
});
test('coverage requires the whole missing stroke band and preserves the work ceiling',()=>{
 const f=fixture(),work={checks:0,exhausted:false},covered=sceneFrameGapCoverage(f.image,[f.token],work);
 assert.equal(covered(1,75,137,144,2),true);
 assert.equal(covered(2,132,162,100,2),true,'vertical rail coverage uses the same source polygon');
 assert.equal(covered(1,74,137,144,2),false,'a remaining unsupported pixel cannot be hidden by a nearby surface');
 assert.equal(covered(1,75,137,131,2),false,'covering the rail axis alone is insufficient');
 assert.equal(covered(1,75,137,144,Infinity),false);
 for(const args of [[4,75,137,144,2],[1,-1,137,144,2],[1,75,1e30,144,2],[1,75,137,144,2,1e30],[1,75,137,Infinity,2]])assert.equal(covered(...args),false);
 const exhausted={checks:3999999,exhausted:false},limited=sceneFrameGapCoverage(f.image,[f.token],exhausted);
 assert.equal(limited(1,75,137,144,2),false);assert.equal(exhausted.exhausted,true);
 const spent=exhausted.checks;assert.equal(limited.owns(100,144),false);assert.equal(exhausted.checks,spent,'exhaustion stops later geometry work');
});
test('cache permits one source-authorized retry after the foreground is measured, then reuses its proof',()=>{
 const f=fixture();assert.equal(f.cache.outline(f.hint),null);assert.equal(f.cache.pattern(f.hint),null);
 const frame=f.cache.pattern(f.hint,[f.token]);assert.ok(frame);const used=f.budget.used;
 assert.equal(f.cache.pattern(f.hint,[f.token]),frame);assert.equal(f.budget.used,used);
 const unknown=fixture();assert.equal(unknown.cache.outline(unknown.hint),null);assert.equal(unknown.cache.pattern(unknown.hint),null);
 assert.equal(unknown.cache.pattern(unknown.hint,[{}]),null);const spent=unknown.budget.used;
 assert.equal(unknown.cache.pattern(unknown.hint,[unknown.token]),null,'one failed retry cannot become an unbounded search');assert.equal(unknown.budget.used,spent);
});
test('hostile occlusion controls fail before source pixels are scanned or getters execute',()=>{
 const f=fixture(),used=f.budget.used;let calls=0;const getter=[];Object.defineProperty(getter,'0',{get(){calls++;throw Error('private');}});
 for(const tokens of [null,{},getter,new Proxy([],{}),new Array(1),new Array(89).fill({})])assert.throws(()=>measure({...f,occlusionFrames:tokens}),TypeError);
 assert.equal(calls,0);assert.equal(f.budget.used,used);
});
test('the compiler revisits a failed frame after a later opaque body is emitted, retaining unsupported failure otherwise',t=>{
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-frame-occlusion-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const rgba=Buffer.alloc(240*450*4,255);f.image.rgba.copy(rgba);f.image.rgba=rgba;f.image.height=450;
 f.put(75,162,62,270,[220,80,130,255]);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const binding={sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:240,heightPx:450};
 const observed={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:450}}],
  objects:[{id:'frame',regionId:'root',kind:'container',box:f.hint},
   {id:'foreground',regionId:'root',kind:'container',box:{x:75,y:132,w:62,h:300}}],relations:[]};
 const request={sourceFile,root,slideSize:{widthPt:240,heightPt:450},page:{shapes:[],images:[],textBoxes:[]}};
 const unsupported=compileSourceScene({...request,plan:parseSourceScenePlan({...observed,objects:observed.objects.slice(0,1)},binding)});
 assert.ok(unsupported.evidence.unresolved.some(f=>f.id==='object-frame'&&f.reason==='container-perimeter'));
 const result=compileSourceScene({...request,plan:parseSourceScenePlan(observed,binding)});
 assert.equal(result.evidence.unresolved.some(f=>f.id==='object-frame'),false);
 assert.ok(result.page.shapes.some(s=>s.id.startsWith('scene-pattern-object-frame-')));
 assert.ok(result.page.shapes.some(s=>s.id==='scene-container-object-foreground'));
 assert.equal(result.evidence.occludedPerimeters,1);
 assert.ok(result.evidence.sourceScanPixels<=4000000);
});
