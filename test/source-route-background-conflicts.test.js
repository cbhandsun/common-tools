'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createCoreBackgroundConflicts:create}=require('../packages/slideclone-core/routing/source-route-background-conflicts');
const {createCoreBackgroundRanges:createRanges}=require('../packages/slideclone-core/routing/source-route-background-ranges');
function colorAt(field,x,y){
 const u=(x-field.cx+field.flank)/(2*field.flank),v=(y-field.cy+field.verticalFlank)/(2*field.verticalFlank);
 return [0,1,2].map(c=>field.corners[0][c]*(1-u)*(1-v)+field.corners[1][c]*u*(1-v)+field.corners[2][c]*(1-u)*v+field.corners[3][c]*u*v);
}
function fixture(offset=false){
 const window={x:offset?5:0,y:offset?7:0,w:64,h:64},width=window.w+window.x,height=window.h+window.y;
 const storage=Buffer.alloc(width*height*4+24,230),rgba=storage.subarray(12,-12);for(let n=3;n<rgba.length;n+=4)rgba[n]=255;
 const image={width,height,rgba},component=new Uint8Array(4096),blocked=new Uint8Array(4096),halo=new Uint8Array(4096),work={checks:0};
 const f={image,window,component,blocked,halo,work,colorAt,storage};
 const query={field:{corners:Array.from({length:4},()=>[230,230,230]),cx:32,cy:32,flank:22,verticalFlank:22},radius:24,verticalRadius:24};
 const put=(n,color)=>rgba.set(color,((window.y+Math.floor(n/64))*width+window.x+n%64)*4);
 return {...f,query,put,cache:create(f)};
}

test('negative witnesses reproject the same source cell and retain strict 18 and 42 boundaries',()=>{
 for(const fringe of [false,true])for(const delta of [0,18,18.001,41.999,42,43]){
  const f=fixture(),n=32*64+32;f.halo[n]=fringe?1:0;
  // Fractional field colors exercise the original finite row arithmetic.
  for(const corner of f.query.field.corners)corner[0]=230+delta-43;
  f.put(n,[187,230,230,255]);f.cache.remember(n);
  assert.equal(f.cache.rejects(f.query),fringe?delta>=42:delta>18,[fringe,delta].join(','));
 }
 const f=fixture(),n=32*64+32;f.put(n,[210,210,210,255]);f.cache.remember(n);assert.equal(f.cache.rejects(f.query),true);
 for(const corner of f.query.field.corners)corner.fill(210);assert.equal(f.cache.rejects(f.query),false,'A previous failure cannot veto a different valid prediction');
 assert.equal(create(f).rejects(f.query),false,'Evidence never crosses observer calls');
});

test('physical window offsets, core exclusions, opaque bodies and transparent cells retain full verifier semantics',()=>{
 for(const offset of [false,true])for(const mode of ['exterior','core','blocked','alpha','outside']){
  const f=fixture(offset),n=mode==='outside'?0:32*64+32;f.put(n,[100,100,100,255]);
  if(mode==='core'||mode==='blocked')f.component[n]=1;if(mode==='blocked')f.blocked[n]=1;
  if(mode==='alpha')f.put(n,[230,230,230,0]);
  const before=Buffer.from(f.storage),component=f.component.slice(),blocked=f.blocked.slice(),halo=f.halo.slice();
  f.cache.remember(n);assert.equal(f.cache.rejects(f.query),!['core','outside'].includes(mode),mode);
  assert.deepEqual(f.storage,before);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);assert.deepEqual(f.halo,halo);
 }
});

test('full source ranges report exact hard witnesses including cached body refusals, without changing returned proof',()=>{
 for(const mode of ['exterior','fringe','blocked','alpha']){
  const f=fixture(),n=32*64+32;if(mode==='fringe')f.halo[n]=1;if(mode==='blocked')f.blocked[n]=1;
  f.put(n,[180,180,180,mode==='alpha'?0:255]);const cells=[];
  const read=createRanges({...f,onConflict:cell=>{cells.push(cell);f.cache.remember(cell);}});
  const query={y:32,start:32,end:39,left:[230,230,230],step:[0,0,0],origin:0};
  assert.equal(read(query),'refused');assert.equal(read(query),'refused');assert.deepEqual(cells,[n,n]);assert.equal(f.cache.rejects(f.query),true);
 }
 const f=fixture(),read=createRanges({...f,onConflict:()=>{throw new Error('Controlled conflict sink failure');}});
 f.blocked[32*64+32]=1;assert.throws(()=>read({y:32,start:32,end:39,left:[230,230,230],step:[0,0,0],origin:0}),/Controlled conflict sink failure/);
});

test('every cached rejection is independently rejected by the complete per-pixel source oracle',()=>{
 let seed=123456;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let iteration=0;iteration<400;iteration++){
  const f=fixture(iteration%2===0);
  for(const corner of f.query.field.corners)for(let c=0;c<3;c++)corner[c]=190+random()*60;
  for(let i=0;i<12;i++){
   const n=Math.floor(random()*4096);f.halo[n]=random()<.5?1:0;f.component[n]=random()<.1?1:0;
   f.blocked[n]=random()<.05?1:0;f.put(n,[Math.floor(random()*256),Math.floor(random()*256),Math.floor(random()*256),random()<.05?0:255]);f.cache.remember(n);
  }
  if(!f.cache.rejects(f.query))continue;
  let rejected=false;const {field,radius,verticalRadius}=f.query;
  for(let y=field.cy-verticalRadius;y<=field.cy+verticalRadius;y++){
   const left=colorAt(field,field.cx-radius,y),right=colorAt(field,field.cx+radius,y),step=right.map((v,c)=>(v-left[c])/(2*radius));
   for(let x=field.cx-radius;x<=field.cx+radius;x++){
    const n=y*64+x,offset=((f.window.y+y)*f.image.width+f.window.x+x)*4;
    if(f.blocked[n]||f.image.rgba[offset+3]!==255){rejected=true;continue;}if(f.component[n])continue;
    const delta=left.map((v,c)=>Math.abs(f.image.rgba[offset+c]-(v+step[c]*(x-(field.cx-radius)))));
    if(f.halo[n]?delta.some(v=>v>=42):delta.some(v=>v>18))rejected=true;
   }
  }
  assert.equal(rejected,true,'An early refusal must have an exact physical source contradiction');
 }
});

test('invalid geometry, nonfinite budgets, sparse colors and predictor failure cannot produce evidence',()=>{
 for(const invalid of [{window:{x:-1,y:0,w:64,h:64}},{image:{width:Infinity,height:64,rgba:new Uint8Array()}},{halo:new Uint8Array(1)}])assert.throws(()=>create({...fixture(),...invalid}),RangeError);
 assert.throws(()=>create({...fixture(),colorAt:null}),TypeError);
 for(const n of [-1,4096,NaN,1.5,'1'])assert.throws(()=>fixture().cache.remember(n),RangeError);
 for(const query of [{radius:NaN},{verticalRadius:0},{radius:33}]){const f=fixture();assert.throws(()=>f.cache.rejects({...f.query,...query}),RangeError);}
 const sparse=fixture();sparse.query.field.corners[0]=Array(3);assert.throws(()=>sparse.cache.rejects(sparse.query),RangeError);
 const bad=fixture();bad.work.checks=NaN;assert.throws(()=>bad.cache.remember(1),RangeError);
 for(const remaining of [0,1,2,40,85]){const f=fixture();f.put(2080,[100,100,100,255]);f.cache.remember(2080);f.work.checks=4000000-remaining;assert.equal(f.cache.rejects(f.query),false);assert.ok(f.work.checks>4000000);}
 const broken=fixture(),cache=create({...broken,colorAt:()=>{throw new Error('Controlled predictor failure');}});cache.remember(2080);assert.throws(()=>cache.rejects(broken.query),/Controlled predictor failure/);
});

test('negative source proof regressions run in both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-background-conflicts.test.js'));
});
