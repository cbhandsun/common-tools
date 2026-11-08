'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSpatialOutlineExterior:measure}=require('../packages/slideclone-core/scene-plan/source-outline-spatial-exterior');
const {measureOutlinedSceneContainerDetailed:original,measureOutlinedSceneContainerSpatial:spatial,sceneOutlineWindow}=require('../packages/slideclone-core/scene-plan/source-scene-outline');
const control={x0:0,y0:0,x1:90,y1:90,textMasks:[]};
test('uniform sides corroborate one background and all reads remain in the original observed window',()=>{
 const result=measure(control,(x,y)=>{assert(x>=0&&y>=0&&x<90&&y<90);assert(x<9||x>=81||y<9||y>=81);return [250,250,250,255];});
 assert.deepEqual(result.fill,[250,250,250]);assert.deepEqual(result.patches,[10,10,10,10]);assert.equal(result.reads,3240);
});
test('empty, mixed, ambiguous, translucent and masked sides cannot authorize contrast',()=>{
 for(const read of [(x,y)=>[x%2?0:255,y%2?0:255,0,255],()=>[255,255,255,0]])assert.equal(measure(control,read).fill,null);
 assert.equal(measure({...control,textMasks:[{x:0,y:0,w:90,h:9}]},()=>[255,255,255,255]).fill,null);
 // Every side contains multiple independently uniform white AND dark patches.
 assert.equal(measure(control,(x,y)=>Math.floor(x/9)%2===Math.floor(y/9)%2?[255,255,255,255]:[0,0,0,255]).fill,null);
});
test('unknown controls and pixel failures reject before unsafe access or invented evidence',()=>{
 let calls=0;const hostile={get x0(){calls++;throw Error('private-content');}};
 for(const value of [null,{},hostile,new Proxy(control,{}),{...control,x1:Infinity},{...control,x1:17},{...control,textMasks:new Array(1)}])
  assert.throws(()=>measure(value,()=>[255,255,255,255]),TypeError);
 assert.equal(calls,0);assert.throws(()=>measure(control,()=>[NaN,0,0,255]),TypeError);
 assert.throws(()=>measure({...control,textMasks:[{x:16380,y:0,w:10,h:10}]},()=>[255,255,255,255]),TypeError);
 for(const factor of [0,3,NaN,Infinity,'2'])assert.throws(()=>sceneOutlineWindow({width:100,height:100},{x:10,y:10,w:30,h:30},factor),TypeError);
 assert.throws(()=>measure(control,()=>{throw Error('source unavailable');}),/source unavailable/);
 const result=measure({x0:0,y0:0,x1:16384,y1:16384,textMasks:[]},()=>[255,255,255,255]);
 assert.equal(result.reads,5184);
});
function ring(open=false){
 const image={width:180,height:140,rgba:Buffer.alloc(180*140*4,255)},hint={x:40,y:35,w:100,h:70};
 const put=(x,y,color=[20,70,90,255])=>image.rgba.set(color,(y*180+x)*4);
 for(let x=40;x<=140;x++)for(let d=0;d<3;d++){if(!open||x<70||x>80)put(x,35+d);put(x,103+d);}
 for(let y=35;y<=105;y++)for(let d=0;d<3;d++){put(40+d,y);put(138+d,y);}
 // An unrelated corner mark breaks the old fixed patch proof but leaves many
 // independently stable side patches. It must not be drawn as part of a node.
 for(let y=27;y<36;y++)for(let x=32;x<41;x++)put(x,y,(x+y)%2?[170,30,80,255]:[255,255,255,255]);
 return {image,hint};
}
test('corner contamination can use independent spatial proof without extra charged source cells',()=>{
 const f=ring(),a={used:0},b={used:0},before=Buffer.from(f.image.rgba);
 assert.equal(original(f.image,f.hint,[],a).detailCode,'outline-exterior-unstable');
 const result=spatial(f.image,f.hint,[],b);assert.ok(result.outline);assert.equal(result.detailCode,null);
 assert.equal(a.used,b.used);assert.deepEqual(f.image.rgba,before);
 assert.ok(result.outline.sourcePixels.every(n=>n%180>=40&&Math.floor(n/180)>=35));
});
test('alternative background does not repair an open ring, missing source, or source text ownership',()=>{
 const f=ring(true);assert.equal(spatial(f.image,f.hint,[],{used:0}).outline,null);
 const closed=ring();assert.equal(spatial(closed.image,closed.hint,[{x:40,y:50,w:3,h:10}],{used:0}).outline,null);
 closed.image.rgba.fill(255);assert.equal(spatial(closed.image,closed.hint,[],{used:0}).outline,null);
});
test('a neighbouring border can require a charged wider observation while the body stays unchanged',()=>{
 const f=ring();
 for(let y=27;y<31;y++)for(let x=0;x<180;x++)f.image.rgba.set([50,90,120,255],(y*180+x)*4);
 const before=Buffer.from(f.image.rgba),first={used:0},retry={used:0};
 assert.equal(original(f.image,f.hint,[],first).outline,null);
 const result=spatial(f.image,f.hint,[],retry);assert.ok(result.outline);
 assert.ok(retry.used>first.used);assert.ok(retry.used<=4000000);
 assert.deepEqual(result.outline.box,{x:40,y:35,w:101,h:71});assert.deepEqual(f.image.rgba,before);
 const limited={used:4000000-first.used};
 const refused=spatial(f.image,f.hint,[],limited);assert.equal(refused.outline,null);
 assert.ok(refused.rejections['outline-retry-scan-budget']>0);assert.equal(limited.used,4000000);
});
test('opt-in cache selection preserves successful measurements and validates controls without reads',()=>{
 const {createSceneMeasurementCache:cache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
 const f=ring();const budget={used:0};assert.throws(()=>cache(f.image,[],budget,undefined,'true'),TypeError);assert.equal(budget.used,0);
 const old=cache(f.image,[],{used:0}),next=cache(f.image,[],{used:0},undefined,true);
 assert.equal(old.outline(f.hint),null);assert.ok(next.outline(f.hint));
 const used=next.evidence.outlineReuses;assert.ok(next.outline(f.hint));assert.equal(next.evidence.outlineReuses,used+1);
 assert.throws(()=>require('../packages/slideclone-core/scene-plan/source-scene-compiler').compileSourceScene({spatialExterior:'true'}),/exterior selection/);
});
test('normal compiler defaults to charged spatial source evidence and preserves an explicit legacy comparison',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {compileSourceScene:compile}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const f=ring(),root=fs.mkdtempSync(path.join(os.tmpdir(),'spatial-exterior-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:180,h:140}}],
  objects:[{id:'node',regionId:'root',kind:'container',box:f.hint}],relations:[]},
 {sourceHash:crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),widthPx:180,heightPx:140});
 const input={root,sourceFile,plan,page:{textBoxes:[],shapes:[],images:[]},slideSize:{widthPt:180,heightPt:140}};
 const a=compile({...input,spatialExterior:false}),b=compile(input);
 assert.ok(a.evidence.outlineRejections['outline-exterior-unstable']>0);
 assert.equal(b.evidence.outlineRejections['outline-exterior-unstable']??0,0);assert.equal(b.evidence.containers,1);
 assert.ok(b.page.shapes.some(s=>s.source?.detector==='source-scene-outline'));
 assert.ok(b.page.shapes.some(s=>s.source?.sceneInventoryId==='object-node'||s.id==='scene-container-object-node'));
 assert.ok(b.evidence.sourceScanPixels<=4000000);assert.ok(b.evidence.glyphOwnedPixels<=100000);
 assert.deepEqual(compile({...input,spatialExterior:false}).page.shapes,a.page.shapes);
 assert.deepEqual(compile({...input,spatialExterior:true}).page.shapes,b.page.shapes);
});
