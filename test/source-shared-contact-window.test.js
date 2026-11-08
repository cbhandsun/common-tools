'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {collectSharedRouteContacts:collect}=require('../packages/slideclone-core/routing/source-shared-route-contacts');
const {collectSharedRouteContacts:fullScan}=require('./helpers/source-contact-full-scan.cjs');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');

function inputFor(f,node,window=f.window){
 const mask=new Uint8Array(window.w*window.h),rgba=Buffer.alloc(mask.length*4);
 for(let y=0;y<window.h;y++)for(let x=0;x<window.w;x++){
  const xx=x+window.x,yy=y+window.y,at=(yy*f.image.width+xx)*4,n=y*window.w+x;
  f.image.rgba.copy(rgba,n*4,at,at+4);
  const body=f.nodes.some(r=>xx>=r.box.x&&xx<r.box.x+r.box.w&&yy>=r.box.y&&yy<r.box.y+r.box.h);
  if(!body&&[0,1,2].some(c=>255-rgba[n*4+c]>=42))mask[n]=1;
 }
 return {image:f.image,node,window,mask,rgba,textMasks:[],background:[255,255,255],budget:{used:f.budget.used},work:{checks:0}};
}
function equivalent(input){
 const before={image:Buffer.from(input.image.rgba),mask:input.mask.slice(),rgba:Buffer.from(input.rgba)};
 const optimized={...input,budget:{...input.budget},work:{...input.work}},legacy={...input,budget:{...input.budget},work:{...input.work}};
 const actual=collect(optimized),expected=fullScan(legacy);
 assert.deepEqual(actual,expected);
 assert.deepEqual(input.image.rgba,before.image);assert.deepEqual(input.mask,before.mask);assert.deepEqual(input.rgba,before.rgba);
 return {actual,optimized,legacy};
}

test('private contacts stay identical while each endpoint visits only its own candidate rectangle',()=>{
 const f=sourceSharedTreeFixture();let saved=0;
 for(const node of f.nodes){
  const {actual,optimized,legacy}=equivalent(inputFor(f,node));
  assert.ok(actual.sites.length>0);assert.ok(actual.proven>0);assert.ok(actual.candidates>0);
  assert.ok(optimized.work.checks<legacy.work.checks);saved+=legacy.work.checks-optimized.work.checks;
 }
 assert.ok(saved>100000);
});

test('the same finite budget completes real contacts where irrelevant full-window traversal fails',()=>{
 const f=sourceSharedTreeFixture(),input=inputFor(f,f.nodes[0]);
 const result=collect({...input,work:{checks:3990000}});
 assert.equal(result.reason,null);assert.ok(result.sites.length>0);
 const previous=fullScan({...input,budget:{...input.budget},work:{checks:3990000}});
 assert.equal(previous.reason,'shared-geometry-budget');assert.equal(previous.sites.length,0);
});

test('inclusive edge, fractional body, clipped window and distant ink preserve full-scan results',()=>{
 for(const shift of [0,.25,-.25,Number.EPSILON*128]){
  const f=sourceSharedTreeFixture(),node=f.nodes[0];node.box={...node.box,x:node.box.x+shift,w:node.box.w-shift};
  const cache=createSceneMeasurementCache(f.image,[],f.budget);assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);
  for(const window of [f.window,{x:128,y:48,w:45,h:8},{x:0,y:90,w:100,h:80},{x:280,y:0,w:20,h:20}]){
   const input=inputFor(f,node,window);
   // Pixels exactly at every rounded search boundary and one cell outside
   // remain original pixels. They cannot acquire private port authority.
   for(const dx of [-3,-2,-1,0,1,2,3]){
    const x=Math.round(node.box.x+node.box.w+dx)-window.x,y=50-window.y;
    if(x>=0&&y>=0&&x<window.w&&y<window.h)input.mask[y*window.w+x]=1;
   }
   equivalent(input);
  }
 }
});

test('empty, transparent, forged, masked and exhausted contacts still fail closed',()=>{
 for(const kind of ['empty','transparent','forged','masked','geometry','source']){
  const f=sourceSharedTreeFixture(),input=inputFor(f,f.nodes[0]);
  if(kind==='empty')input.mask.fill(0);
  if(kind==='transparent'){
   input.image={...input.image,rgba:Buffer.from(input.image.rgba)};
   for(let n=0;n<input.mask.length;n++)if(input.mask[n]){
    input.rgba[n*4+3]=0;const x=n%input.window.w+input.window.x,y=Math.floor(n/input.window.w)+input.window.y;
    input.image.rgba[(y*input.image.width+x)*4+3]=0;
   }
  }
  if(kind==='forged')input.node={...input.node,portFrame:{}};
  if(kind==='masked')input.textMasks=[{x:0,y:0,w:300,h:230}];
  if(kind==='geometry')input.work.checks=4000000;
  if(kind==='source')input.budget.used=4000000;
  const {actual}=equivalent(input);
  assert.equal(actual.sites.length,0,kind);
 }
});

test('contact window regression is selected by both unified CI discovery entry points',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-shared-contact-window.test.js'));
});
