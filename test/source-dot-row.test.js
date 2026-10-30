'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {readPng}=require('../packages/slideclone-core/png');
const {measureSourceDotRow:measure}=require('../packages/slideclone-core/scene-plan/source-dot-row');
function fixture(){
 const image=readPng(path.join(__dirname,'fixtures/source-dot-row/three-dot-source.png'));
 return {image,box:{x:0,y:0,w:image.width,h:image.height},budget:{used:0}};
}
function synthetic({centers=[7,17,27],rings=false}={}){
 const image={width:36,height:15,rgba:Buffer.alloc(36*15*4,240)};
 for(let y=0;y<15;y++)for(let x=0;x<36;x++){
  const distance=Math.min(...centers.map(cx=>Math.hypot(x+.5-cx,y+.5-7.5)));
  const value=distance<=2.5&&(!rings||distance>1.1)?140:240;
  image.rgba.set([value,value,value,255],(y*36+x)*4);
 }
 return {image,box:{x:0,y:0,w:36,h:15},budget:{used:0}};
}
test('source-only measurement proves three full antialiased dots with the original twelve-pixel floor',()=>{
 const input=fixture(),before=Buffer.from(input.image.rgba),r=measure(input);
 assert.ok(r);assert.deepEqual(r.box,{x:4,y:4,w:18,h:5});
 assert.equal(r.dots.length,3);assert.ok(r.dots.every(dot=>dot.count>=12));
 assert.deepEqual(input.image.rgba,before);assert.equal(input.budget.used,26*13*3);
 assert.ok(measure(synthetic()));
});
test('blank, missing, extra, irregularly spaced, non-solid and clipped marks fail without a partial symbol',()=>{
 for(const input of[synthetic({centers:[]}),synthetic({centers:[7,17]}),synthetic({centers:[5,14,23,32]}),
  synthetic({centers:[6,14,28]}),synthetic({rings:true})])assert.equal(measure(input),null);
 const clipped=fixture();clipped.box={x:5,y:0,w:21,h:13};assert.equal(measure(clipped),null);
 const tiny=synthetic();for(let y=0;y<15;y++)for(let x=0;x<36;x++){
  if(y===7&&[7,17,27].includes(x))tiny.image.rgba.set([100,100,100,255],(y*36+x)*4);
  else tiny.image.rgba.set([240,240,240,255],(y*36+x)*4);
 }assert.equal(measure(tiny),null);
});
test('transparent samples, inconsistent source colors and textured perimeter cannot prove a dot row',()=>{
 const alpha=fixture();alpha.image.rgba[3]=254;assert.equal(measure(alpha),null);
 const color=synthetic();for(let y=0;y<15;y++)for(let x=23;x<31;x++){
  const i=(y*36+x)*4;if(color.image.rgba[i]===140)color.image.rgba.set([90,150,170,255],i);
 }assert.equal(measure(color),null);
 const noise=fixture();noise.image.rgba.set([0,0,0,255],0);assert.equal(measure(noise),null);
 const gradient=synthetic();for(let y=0;y<15;y++)for(let x=0;x<36;x++){
  const i=(y*36+x)*4;for(let c=0;c<3;c++)gradient.image.rgba[i+c]=Math.max(0,gradient.image.rgba[i+c]-x*2);
 }assert.equal(measure(gradient),null);
});
test('offset byte views are respected; source and geometry budgets remain bounded',()=>{
 const a=fixture(),b=fixture(),buffer=Buffer.alloc(b.image.rgba.length+80,0);
 buffer.set(b.image.rgba,40);b.image.rgba=new Uint8Array(buffer.buffer,buffer.byteOffset+40,b.image.rgba.length);
 assert.deepEqual(measure(b),measure(a));
 const exhausted=fixture();exhausted.budget.used=4000000;
 assert.throws(()=>measure(exhausted),/pixel budget/);assert.equal(exhausted.budget.used,4000000);
 const exact=fixture();exact.budget.used=4000000-26*13*3;assert.ok(measure(exact));assert.equal(exact.budget.used,4000000);
 const empty=fixture();empty.box={x:0,y:0,w:3,h:3};assert.equal(measure(empty),null);assert.equal(empty.budget.used,0);
});
test('optional dot matching reserves both source windows and declines oversized or disagreeing candidates',()=>{
 const {matchSourceDotRowGlyph:match}=require('../packages/slideclone-core/scene-plan/source-dot-row');
 const f=fixture(),seed={x:3,y:3,w:19,h:7},budget={used:3999999};
 assert.equal(match(f.image,f.box,seed,seed,budget),null);assert.equal(budget.used,3999999);
 const outside={used:0};assert.equal(match(f.image,{x:0,y:0,w:512,h:512},seed,{x:0,y:0,w:400,h:400},outside),null);
 assert.equal(outside.used,0);
 assert.equal(match(f.image,f.box,seed,{x:13,y:3,w:8,h:7},{used:0}),null);
});
test('malformed and hostile input cannot invoke accessors, proxies or caller conversion hooks',()=>{
 const hostile=new Proxy({},{get(){throw new Error('hook');},getOwnPropertyDescriptor(){throw new Error('hook');},ownKeys(){throw new Error('hook');}});
 const getter=Object.defineProperty({},'width',{get(){throw new Error('hook');}});
 for(const input of[undefined,null,[],hostile,{...fixture(),image:hostile},{...fixture(),image:getter},
  {...fixture(),box:hostile},{...fixture(),budget:hostile},{...fixture(),box:{x:NaN,y:0,w:26,h:13}},
  {...fixture(),box:{x:0,y:0,w:999999999,h:1}},{...fixture(),budget:Object.freeze({used:0})}])
  assert.throws(()=>measure(input),{name:'TypeError',message:'Source dot row controls are invalid'});
 const input=fixture();input.image.rgba=hostile;assert.throws(()=>measure(input),/controls are invalid/);
 const shadow=fixture();Object.defineProperty(shadow.image.rgba,'buffer',{get(){throw new Error('hook');}});
 assert.ok(measure(shadow));
 if(typeof SharedArrayBuffer==='function'){
  const shared=fixture();shared.image.rgba=new Uint8Array(new SharedArrayBuffer(26*13*4));assert.throws(()=>measure(shared),/controls are invalid/);
 }
});
test('new regressions are included in both unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of['unit','all']){
  const names=discoverTestFiles(path.resolve(__dirname,'..'),suite).map(row=>row.file.replaceAll('\\','/'));
  for(const name of['source-dot-row.test.js','source-scene-dot-row-text.test.js'])assert.ok(names.includes('test/'+name));
 }
});
