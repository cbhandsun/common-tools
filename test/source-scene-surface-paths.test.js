"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {parseSurfacePaths}=require('../packages/slideclone-core/source-scene-surface-paths');
const {parseSceneNativeGeometry,expandSceneNativeGeometry}=require('../packages/slideclone-core/source-scene-native-geometry');
const {compileScenePrimitiveProgram}=require('../packages/slideclone-core/source-scene-primitive-program');
const {admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
const {writePng}=require('../packages/slideclone-core/png');
const segment=(type,points=[])=>({type,points:points.map(([x,y])=>({x,y}))});
const exterior={filled:true,segments:[segment('moveTo',[[0,0]]),segment('lnTo',[[1,0]]),segment('lnTo',[[1,1]]),segment('lnTo',[[0,1]]),segment('close')]};
const divider={filled:false,segments:[segment('moveTo',[[0,.5]]),segment('cubicBezTo',[[.25,.25],[.75,.75],[1,.5]])]};
function fixture(missing=false){
 const image={width:200,height:200,rgba:Buffer.alloc(200*200*4,255)},box={x:30,y:30,w:100,h:100};
 // Independent source raster: analytic rectangle and independently sampled
 // cubic, without the production parser, constructor or path flattener.
 const curve=[];for(let i=0;i<=400;i++){const t=i/400,u=1-t;
  curve.push({x:30+100*(3*u*u*t*.25+3*u*t*t*.75+t*t*t),y:30+100*(u*u*u*.5+3*u*u*t*.25+3*u*t*t*.75+t*t*t*.5)});}
 for(let y=25;y<135;y++)for(let x=25;x<135;x++){
  const px=x+.5,py=y+.5,inside=px>=30&&px<=130&&py>=30&&py<=130;
  const edge=inside?Math.min(px-30,130-px,py-30,130-py):Math.hypot(Math.max(30-px,0,px-130),Math.max(30-py,0,py-130));
  const ink=edge<=1.5||!missing&&curve.some(p=>Math.hypot(p.x-px,p.y-py)<=1.5);
  if(ink||inside)image.rgba.set([...(ink?[24,24,24]:[204,224,236]),255],(y*200+x)*4);
 }
 return {image,box,nativeGeometry:{kind:'pathSurface',paths:[exterior,divider]}};
}
function request(f,budget={used:0}){return {image:f.image,object:{id:'object-unit',regionId:'region-root',kind:'container',box:f.box,nativeGeometry:f.nativeGeometry},
 textMasks:[],budget,slideSize:{widthPt:200,heightPt:200}};}

test('complete curved surfaces survive packed admission, source proof and region completion',t=>{
 const f=fixture(),input=request(f),result=compileScenePrimitiveProgram(input);
 assert.equal(result.failure,null,JSON.stringify(result));assert.equal(result.shapes.length,2);
 assert.equal(result.shapes[1].style.freeformSegments[1].type,'cubicBezTo');
 assert.ok(input.budget.used>0&&input.budget.used<=4000000);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-surface-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,f.image);
 const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const plan=admitSourceScenePlan({format:'packed-v1',regions:[[null,3,[0,0,1000,1000],[1,0,0]]],
  objects:[[0,0,[150,150,650,650],[5,null,null,null,null,[exterior,divider]]]],relations:[],programs:[[]]},
 {sourceHash,widthPx:200,heightPx:200,labelRefs:[]});
 assert.equal(plan.objects.length,1);assert.equal(plan.objectBatches.batches[0].members.length,1);
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile,root,slideSize:{widthPt:200,heightPt:200}});
 assert.equal(compiled.evidence.nativeProgram.admitted,1,JSON.stringify(compiled.evidence));
 assert.equal(compiled.evidence.regionPrograms.completed,1);assert.equal(compiled.page.shapes.length,2);
 assert.deepEqual(compiled.evidence.unresolved,[]);
});

test('missing curves, source masks and exhausted source budgets cannot publish partial faces',()=>{
 const absent=compileScenePrimitiveProgram(request(fixture(true)));assert.ok(absent.failure);assert.equal(absent.shapes,undefined);
 const masked=request(fixture());masked.textMasks=[{x:28,y:65,w:8,h:25}];
 assert.ok(compileScenePrimitiveProgram(masked).failure);
 const budget={used:4000000},denied=compileScenePrimitiveProgram(request(fixture(),budget));
 assert.equal(denied.failure,'primitive-source-budget');assert.equal(budget.used,4000000);
});

test('detached figures and paths outside the exterior cannot hide inside one container proposal',()=>{
 for(const points of [[[.2,.3],[.8,.3]],[[0,.5],[1,.5],[.8,.9],[.8,1]]]){
  const f=fixture();f.nativeGeometry.paths=[exterior,{filled:false,segments:points.map((p,i)=>segment(i?'lnTo':'moveTo',[p]))}];
  if(points.length>2)f.nativeGeometry.paths[0]={filled:true,segments:[segment('moveTo',[[0,0]]),segment('lnTo',[[.5,0]]),segment('lnTo',[[.5,1]]),segment('lnTo',[[0,1]]),segment('close')]};
  assert.equal(compileScenePrimitiveProgram(request(f)).failure,'primitive-surface-scope');
 }
 const crossed=fixture();crossed.nativeGeometry.paths=[{filled:true,segments:[segment('moveTo',[[0,0]]),
  segment('lnTo',[[1,1]]),segment('lnTo',[[1,0]]),segment('lnTo',[[0,1]]),segment('close')]}];
 assert.equal(compileScenePrimitiveProgram(request(crossed)).failure,'primitive-surface-scope');
});

test('surface paths are strict bounded data, never executable code or paint authority',()=>{
 const paths=parseSurfacePaths([exterior,divider]);assert.deepEqual(paths,[exterior,divider]);assert.notEqual(paths[0],exterior);
 const parsed=parseSceneNativeGeometry(expandSceneNativeGeometry([5,null,null,null,null,[exterior,divider]]));
 assert.equal(parsed.kind,'pathSurface');assert.deepEqual(parsed.paths,paths);
 let reads=0;const getter={};Object.defineProperty(getter,'segments',{enumerable:true,get(){reads++;throw Error('unsafe');}});
 const proxy=new Proxy({},{get(){reads++;throw Error('unsafe');}});
 for(const value of [null,[],Array(17).fill(exterior),[getter],[proxy],[{...exterior,paint:'#000000'}],
  [{...exterior,segments:[segment('moveTo',[[0,0]]),segment('lnTo',[[Infinity,1]]),segment('close')]}],
  [{...exterior,segments:[segment('moveTo',[[0,0]]),segment('lnTo',[[1,1]])]}],
  [{...exterior,segments:[segment('moveTo',[[0,0]]),segment('moveTo',[[1,1]]),segment('close')]}],
  [{filled:false,segments:divider.segments}],Array(16).fill(exterior)])assert.throws(()=>parseSurfacePaths(value),TypeError);
 assert.equal(reads,0);
 const symbol={...exterior};Object.defineProperty(symbol,Symbol('unsafe'),{get(){reads++;throw Error('unsafe');}});
 assert.throws(()=>parseSurfacePaths([symbol]),TypeError);assert.equal(reads,0);
 assert.throws(()=>parseSceneNativeGeometry({kind:'ellipse',paths:[exterior]}),/native geometry/u);
});
