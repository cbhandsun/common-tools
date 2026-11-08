'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./helpers/source-detached-dashes.cjs');
const {measureSourceSceneVisibleGap:measure}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap');
const {compileSourceSceneVisibleGap:compile}=require('../packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler');
const {createFullSlideResidualBuilder}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {readPng,writePng}=require('../packages/slideclone-core/png');
function setup(t){
 const f=fixture(),fit=measure(f).fit;assert.ok(fit);
 const relation={id:'relation-detached',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:f.direction};
 const shape=compile({fit,relation,fromId:f.from.id,toId:f.to.id,width:300,height:300,slideSize:{widthPt:300,heightPt:300}});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'detached-residual-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png'),outputFile=path.join(root,'residual.png');writePng(sourceFile,f.image);
 const build=createFullSlideResidualBuilder({eraseMasks,readPng,writePng});
 return {f,shape,root,sourceFile,outputFile,build,request:{sourceFile,outputFile,objects:[shape],slideSize:{x:0,y:0,w:300,h:300}}};
}
test('full-slide residual erases only complete privately proven dash ink, preserving every blank interval and exterior pixel',async t=>{
 const {f,request,build,outputFile,sourceFile}=setup(t),sourceBefore=fs.readFileSync(sourceFile);
 await build(request);const result=readPng(outputFile);
 for(let n=0;n<300*300;n++){
  if(f.sourcePixels.has(n))assert.equal(result.rgba[n*4+3],0);
  else assert.deepEqual(result.rgba.subarray(n*4,n*4+4),f.image.rgba.subarray(n*4,n*4+4),'unowned pixel '+n);
 }
 assert.deepEqual(fs.readFileSync(sourceFile),sourceBefore);
});
test('copied or modified outputs and changed source pixels cannot fall back to a broad full-slide line mask',async t=>{
 for(const kind of ['copy','gradient','dash','source']){
  const {f,shape,request,build,sourceFile,outputFile}=setup(t);
  if(kind==='copy')request.objects=[structuredClone(shape)];
  if(kind==='gradient')shape.style.strokeGradient.angleDeg=37;
  if(kind==='dash')shape.style.strokeDashPattern='[[1,1]]';
  if(kind==='source'){f.image.rgba[0]^=1;writePng(sourceFile,f.image);}
  await assert.rejects(build(request),/source visible gap residual proof is invalid/u);assert.equal(fs.existsSync(outputFile),false);
 }
});
