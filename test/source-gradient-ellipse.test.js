'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceGradientEllipse:measure}=require('../packages/slideclone-core/scene-plan/source-gradient-ellipse');
const {measureSceneGradientFillWindow,sceneFillPaintMeasurement,sceneFillHasConnectedBody}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
const {measureSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-container');
function fixture({axis='x',wide=false,label=false,pattern='gradient'}={}){
 const image={width:160,height:150,rgba:Buffer.alloc(160*150*4,255)};
 const hint={x:40,y:40,w:wide?76:56,h:56},box={...hint};
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
  if(((x+.5-box.x-box.w/2)/(box.w/2))**2+((y+.5-box.y-box.h/2)/(box.h/2))**2>1)continue;
  const t=axis==='x'?(x-box.x)/(box.w-1):(y-box.y)/(box.h-1);
  const v=pattern==='constant'?0:pattern==='step'?(t<.5?0:36):Math.round(36*t);
  image.rgba.set([20+v,95+v,170+v,255],(y*image.width+x)*4);
 }
 const textMasks=label?[{x:63,y:59,w:10,h:18}]:[];
 for(const m of textMasks)for(let y=m.y;y<m.y+m.h;y++)for(let x=m.x;x<m.x+m.w;x++)image.rgba.set([255,255,255,255],(y*image.width+x)*4);
 return {image,hint,textMasks,budget:{used:0},owners:[]};
}
function paint(f,x,y,color){f.image.rgba.set(color,(y*f.image.width+x)*4);}
test('closed graded source ellipses keep measured geometry, appearance and source bytes',()=>{
 for(const axis of ['x','y'])for(const wide of [false,true])for(const label of [false,true]){
  const f=fixture({axis,wide,label}),before=Buffer.from(f.image.rgba),m=measure(f);
  assert.ok(m,JSON.stringify({axis,wide,label}));assert.deepEqual(m.fit.box,f.hint);
  assert.equal(m.fit.gradient.angleDeg,axis==='x'?0:90);assert.ok(m.fit.segments);assert.equal(m.fit.parts,undefined);
  assert.ok(m.fit.support>.58);assert.ok(m.points.length< f.hint.w*f.hint.h);
  assert.ok(m.points.every(p=>!f.textMasks.some(b=>p.x>=b.x&&p.x<b.x+b.w&&p.y>=b.y&&p.y<b.y+b.h)));
  assert.equal(f.budget.used,(f.hint.w+24)*(f.hint.h+24));assert.deepEqual(f.image.rgba,before);
 }
});
test('real container fallback registers only private source component handles',()=>{
 const f=fixture({label:true}),fit=measureSceneGradientFillWindow(f);assert.ok(fit?.gradient);
 assert.deepEqual(sceneFillPaintMeasurement(fit,f.image),fit);assert.equal(sceneFillHasConnectedBody(fit,f.image),true);
 assert.equal(sceneFillPaintMeasurement(structuredClone(fit),f.image),null);
 assert.equal(sceneFillHasConnectedBody(structuredClone(fit),f.image),false);
 assert.equal(sceneFillPaintMeasurement(fit,{...f.image,rgba:Buffer.from(f.image.rgba)}),null);
 fit.gradient.angleDeg=90;assert.equal(sceneFillPaintMeasurement(fit,f.image),null);
 const full=fixture({label:true});assert.ok(measureSceneContainer(full.image,full.hint,full.textMasks,full.budget)?.gradient);
});
test('a source-owned glyph cannot let an inset uniform patch preempt the complete measured gradient body',()=>{
 const path=require('node:path'),{readPng}=require('../packages/slideclone-core/png');
 const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const root=path.join(__dirname,'fixtures/source-gradient-ellipse'),spec=require('./fixtures/source-gradient-ellipse/badge.json');
 const image=readPng(path.join(root,'badge.png')),before=Buffer.from(image.rgba),budget={used:0};
 const token=createSceneGlyphOcclusion(image,[spec.text],{widthPt:image.width,heightPt:image.height},budget);
 const fit=measureSceneContainer(image,spec.hint,[spec.text.box],budget,token);
 assert.ok(fit?.gradient);assert.deepEqual(fit.box,spec.expectedBox);assert.equal(fit.glyphOcclusionPixels,undefined);
 assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0,'complete visible contrast needs no glyph ownership');
 assert.deepEqual(image.rgba,before);assert.ok(budget.used<=4000000);
});
test('a broken envelope, clipping or connected external branch cannot become a node',()=>{
 for(const kind of ['notch','split','branch','rectangle','transparent','corner','low-contrast','blank']){
  const f=fixture();
  if(kind==='notch'||kind==='split')for(let y=40;y<(kind==='split'?96:68);y++)for(let x=66;x<71;x++)paint(f,x,y,[255,255,255,255]);
  if(kind==='branch')for(let x=95;x<105;x++)for(let y=65;y<69;y++)paint(f,x,y,[30,110,180,255]);
  if(kind==='rectangle')for(let y=40;y<96;y++)for(let x=40;x<96;x++)paint(f,x,y,[20+Math.round((x-40)*.65),95,170,255]);
  if(kind==='transparent')for(let y=40;y<96;y++)paint(f,68,y,[30,110,180,0]);
  if(kind==='corner')paint(f,40,40,[0,0,0,255]);
  if(kind==='low-contrast')for(let i=0;i<f.image.rgba.length;i+=4)if(f.image.rgba[i]<200)f.image.rgba.set([225,225,225,255],i);
  if(kind==='blank')f.image.rgba.fill(255);
  assert.equal(measure(f),null,kind);
 }
 const clipped=fixture();clipped.hint={x:0,y:40,w:56,h:56};
 for(let y=40;y<96;y++)for(let x=0;x<56;x++){
  const sx=x+40;paint(clipped,x,y,Array.from(clipped.image.rgba.subarray((y*160+sx)*4,(y*160+sx)*4+4)));
 }
 assert.equal(measure(clipped),null);
});
test('appearance cannot manufacture a gradient, ownership or geometry',()=>{
 for(const pattern of ['constant','step'])assert.equal(measure(fixture({pattern})),null,pattern);
 const f=fixture();f.textMasks=[f.hint];assert.equal(measure(f),null);
 const transparent=fixture();transparent.image.rgba.fill(0);assert.equal(measure(transparent),null);
});
test('two competing closed bodies cannot acquire a unique node identity',()=>{
 const f=fixture();f.image.rgba.fill(255);f.hint={x:40,y:35,w:36,h:36};
 for(const top of [25,54])for(let y=top;y<top+28;y++)for(let x=44;x<72;x++){
  if(((x+.5-58)/14)**2+((y+.5-top-14)/14)**2<=1)paint(f,x,y,[20+Math.round((x-44)*36/27),95,170,255]);
 }
 assert.equal(measure(f),null);
});
test('gradient source reads reuse only the exact private raster scope and source budget',()=>{
 const {withSceneFillRasterCache:cache}=require('../packages/slideclone-core/scene-plan/source-scene-fill-raster-cache');
 const f=fixture();let first,second,used;
 cache(f.image,f.budget,()=>{first=measure(f);used=f.budget.used;second=measure(f);assert.equal(f.budget.used,used);});
 assert.ok(first&&second);assert.deepEqual(first.fit,second.fit);
 measure(f);assert.equal(f.budget.used,used*2);
});
test('hostile controls and extreme inputs fail before reading pixels or invoking provider hooks',()=>{
 const f=fixture();let calls=0;const trap=()=>{calls++;throw Error('private-ellipse-token');};
 const getter={...f};Object.defineProperty(getter,'image',{get:trap});
 const masks=[f.hint];Object.defineProperty(masks,'0',{get:trap});
 const values=[null,[],getter,new Proxy(f,{get:trap,ownKeys:trap}),{...f,textMasks:masks},
  {...f,image:new Proxy(f.image,{get:trap})},{...f,hint:{...f.hint,w:Infinity}},
  {...f,image:{...f.image,rgba:new Proxy(f.image.rgba,{get:trap})}},
  {...f,image:{...f.image,width:1e30}},{...f,hint:{...f.hint,x:-1}},
  {...f,hint:{...f.hint,w:1e30}},{...f,budget:{used:NaN}},{...f,textMasks:Array(10001).fill(f.hint)}];
 for(const v of values)assert.throws(()=>measure(v),e=>e instanceof TypeError&&!e.message.includes('private-ellipse-token'));
 assert.equal(calls,0);assert.equal(f.budget.used,0);
});
test('fallback stays within the original per-window and shared source read allowances',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba);f.budget.used=4000000;
 assert.equal(measure(f),null);assert.equal(f.budget.used,4000000);assert.deepEqual(f.image.rgba,before);
 const large={image:{width:600,height:600,rgba:Buffer.alloc(600*600*4,255)},hint:{x:20,y:20,w:550,h:550},textMasks:[],owners:[],budget:{used:0}};
 assert.equal(measure(large),null);assert.equal(large.budget.used,0);
 const tiny=fixture();tiny.hint={x:40,y:40,w:.1,h:.1};assert.equal(measure(tiny),null);
});
test('gradient ellipse regressions and runtime are registered in unified CI and release boundaries',()=>{
 const fs=require('node:fs'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-gradient-ellipse.test.js'));
 const filename='packages/slideclone-core/scene-plan/source-gradient-ellipse.js';
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(filename));
 assert.ok(JSON.parse(fs.readFileSync('tsconfig.boundaries.json','utf8')).include.includes(filename));
});
