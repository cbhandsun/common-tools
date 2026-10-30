'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeRouteAntialiasBackground:observe}=require('../packages/slideclone-core/routing/source-route-antialias-background');
const {createRouteSectionWitnesses}=require('../packages/slideclone-core/routing/source-route-section-witnesses');

function fixture({horizontal=false,offset=false,width=3}={}){
 const size=64,window={x:offset?7:0,y:offset?5:0,w:size,h:size};
 const imageWidth=size+window.x+4,imageHeight=size+window.y+3;
 const storage=Buffer.alloc(imageWidth*imageHeight*4+40,173);
 const image={width:imageWidth,height:imageHeight,rgba:storage.subarray(20,-20)};image.rgba.fill(255);
 const component=new Uint8Array(size*size),blocked=new Uint8Array(size*size);
 const cell=(axis,tangent)=>horizontal?axis*size+tangent:tangent*size+axis;
 const put=(n,color)=>image.rgba.set(color,((window.y+Math.floor(n/size))*image.width+window.x+n%size)*4);
 for(let tangent=8;tangent<56;tangent++)for(let axis=28;axis<28+width;axis++){
  const n=cell(axis,tangent);component[n]=1;put(n,[30,60,90,255]);
 }
 for(let tangent=10;tangent<54;tangent++)for(let distance=1;distance<=3;distance++){
  put(cell(28-distance,tangent),[237,239,242,255]);
  put(cell(27+width+distance,tangent),[237,239,242,255]);
 }
 const global=n=>(window.y+Math.floor(n/size))*image.width+window.x+n%size;
 return {image,window,component,blocked,work:{checks:0},cell,put,global,storage};
}

test('repeated physical section witnesses finish within the remaining budget with identical complete observations',()=>{
 const f=fixture(),expected=observe(f);assert.equal(expected.length,363);
 f.work.checks=3900000;
 const actual=observe(f);assert.ok(actual,'100000 remaining checks must cover the complete observer');
 assert.deepEqual(actual,expected);assert.ok(f.work.checks<=4000000);
});

test('one failed independent section cannot consume the budget for the eight remaining impossible matches',()=>{
 const f=fixture();f.put(f.cell(24,28),[30,60,90,255]);
 const before=Buffer.from(f.storage),expected=observe(f);assert.equal(expected.length,282);
 assert.equal(expected.some(row=>row.cell===f.global(f.cell(27,28))),false);
 f.work.checks=4000000-95000;
 const actual=observe(f);assert.deepEqual(actual,expected);assert.ok(f.work.checks<=4000000);
 assert.deepEqual(f.storage,before);
});

test('physical witness rebasing preserves exact interpolation for every axis, width and fringe distance',()=>{
 const left=[101,151,199],right=[111,142,213],profile=[-12.2,6.4,8.7];
 for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])for(const width of [2,3,7,31]){
  const witnesses=createRouteSectionWitnesses();witnesses.remember(123,dx,dy,left,right,profile);
  for(const first of [-1,-2,-3]){
   const last=first-width,positions=[last-5,last-4,first+5,first+6];
   const at=t=>left.map((v,c)=>v+(right[c]-v)*(t-positions[0])/(positions[3]-positions[0]));
   const actual=witnesses.read(123,dx,dy,first,last);
   assert.deepEqual(actual,{background:at(0),step:left.map((v,c)=>(right[c]-v)/(positions[3]-positions[0])),profile,first,last});
  }
 }
});

test('empty caches and different physical anchors, directions and invocations never share evidence',()=>{
 const witnesses=createRouteSectionWitnesses();assert.equal(witnesses.read(5,1,0,-1,-4),null);
 witnesses.remember(5,1,0,[240,241,242],[245,244,243],[1,2,3]);
 for(const [cell,dx,dy]of [[6,1,0],[5,-1,0],[5,0,1],[5,0,-1]])assert.equal(witnesses.read(cell,dx,dy,-1,-4),null);
 assert.equal(createRouteSectionWitnesses().read(5,1,0,-1,-4),null);
});

test('transposed and offset windows use the real source view without mutating source or masks',()=>{
 for(const horizontal of [false,true])for(const offset of [false,true]){
  const f=fixture({horizontal,offset}),before=Buffer.from(f.storage),component=Buffer.from(f.component),blocked=Buffer.from(f.blocked);
  const rows=observe(f);assert.equal(rows.length,363);
  for(const axis of [25,26,27,28,29,30,31,32,33]){
   const row=rows.find(r=>r.cell===f.global(f.cell(axis,32)));assert.ok(row);
   assert.deepEqual(row.color,[255,255,255]);
  }
  assert.deepEqual(f.storage,before);assert.deepEqual(Buffer.from(f.component),component);assert.deepEqual(Buffer.from(f.blocked),blocked);
 }
});

test('cached sections retain mask, opacity, foreign ink and repeated-profile rejection',()=>{
 for(const mode of ['blocked','transparent','foreign','nonmonotone','isolated','thin','wide']){
  const f=fixture({width:mode==='thin'?1:mode==='wide'?32:3}),target=f.cell(27,32);
  if(mode==='blocked')f.blocked[f.cell(25,32)]=1;
  if(mode==='transparent')f.put(f.cell(24,32),[255,255,255,0]);
  if(mode==='foreign')f.put(f.cell(24,32),[30,60,90,255]);
  if(mode==='nonmonotone')f.put(f.cell(26,32),[216,216,216,255]);
  if(mode==='isolated'){
   for(let tangent=10;tangent<54;tangent++)if(tangent!==32)for(const axis of [25,26,27,31,32,33])f.put(f.cell(axis,tangent),[255,255,255,255]);
   f.put(target,[220,220,240,255]);
  }
  const rows=observe(f);assert.ok(rows);assert.equal(rows.some(r=>r.cell===f.global(target)),false,mode);
 }
});

test('a later observer call rechecks changed pixels and budget exhaustion never returns partial observations',()=>{
 const f=fixture(),target=f.global(f.cell(27,32));assert.ok(observe(f).some(r=>r.cell===target));
 f.put(f.cell(24,32),[255,255,255,0]);f.work.checks=0;
 assert.equal(observe(f).some(r=>r.cell===target),false);
 for(const remaining of [0,1,4096,50000]){
  const input=fixture();input.work.checks=4000000-remaining;
  assert.equal(observe(input),null);assert.ok(input.work.checks>4000000);
 }
 const empty=fixture();empty.component.fill(0);assert.deepEqual(observe(empty),[]);
});

test('section witness regression belongs to both unified CI suites',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-section-witnesses.test.js'));
});
