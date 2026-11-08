'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {supplementaryBackgroundFixture:fixture}=require('./helpers/source-supplementary-background.cjs');
const {observeSourceCoreBackdrop:observe}=require('../packages/slideclone-core/routing/source-route-core-backdrop');

test('a complete mixed-phase narrow field restores a curved core when both existing grids have unavailable corners',()=>{
 const f=fixture(),rows=observe(f),target=47*80+47;assert.ok(rows);
 assert.deepEqual(rows.find(row=>row.cell===target)?.color,[235,248,241]);
 assert.ok(f.work.checks<=4000000);
});

test('mixed-phase fields preserve source-view offsets, gradients and transposition without expanding ownership',()=>{
 for(const mode of ['plain','gradient','transpose','offset','covered','body','transparent','foreign-ink']){
  const f=fixture(),target=47*80+47;
  if(mode==='gradient')for(let y=0;y<80;y++)for(let x=0;x<80;x++){
   const n=y*80+x;if(f.component[n])continue;const noise=f.image.rgba[n*4]===245?10:0;
   f.image.rgba.set([210+Math.floor(x/4)+noise,225+Math.floor(y/4),235,255],n*4);
  }
  if(mode==='transpose'){
   const rgba=Buffer.from(f.image.rgba),component=f.component.slice();
   for(let y=0;y<80;y++)for(let x=0;x<80;x++){const from=y*80+x,to=x*80+y;
    rgba.copy(f.image.rgba,to*4,from*4,from*4+4);f.component[to]=component[from];
   }
  }
  if(mode==='covered')f.covered.add(target);
  if(mode==='body')f.blocked[target]=1;
  if(mode==='transparent')f.image.rgba[target*4+3]=0;
  if(mode==='foreign-ink')f.image.rgba.set([30,60,90,255],(46*80+46)*4);
  if(mode==='offset'){
   const storage=Buffer.alloc(100*100*4+24,255),rgba=storage.subarray(12,-12);
   for(let y=0;y<80;y++)f.image.rgba.copy(rgba,((y+10)*100+10)*4,y*80*4,(y+1)*80*4);
   f.image={width:100,height:100,rgba};f.window={x:10,y:10,w:80,h:80};
  }
  const before=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice(),rows=observe(f);assert.ok(rows,mode);
  const global=mode==='offset'?57*100+57:target,row=rows.find(r=>r.cell===global);
  if(['plain','gradient','transpose','offset'].includes(mode)){
   assert.ok(row,mode);const expected=mode==='gradient'?[221,236,235]:[235,248,241];
   assert.ok(row.color.every((v,c)=>Math.abs(v-expected[c])<=1),mode);
  }else assert.equal(row,undefined,mode);
  for(const r of rows){const local=(Math.floor(r.cell/f.image.width)-f.window.y)*80+r.cell%f.image.width-f.window.x;
   assert.equal(f.component[local],1);assert.equal(f.blocked[local],0);assert.equal(f.covered.has(local),false);
  }
  assert.equal(new Set(rows.map(r=>r.cell)).size,rows.length);
  assert.deepEqual(f.image.rgba,before);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);
 }
});

test('supplementary fields return no partial background on late budget exhaustion or fully covered cores',()=>{
 const measured=fixture();assert.ok(observe(measured).length);
 const f=fixture(),before=Buffer.from(f.image.rgba);f.work.checks=4000000-measured.work.checks+1;
 assert.equal(observe(f),null);assert.ok(f.work.checks>4000000);assert.deepEqual(f.image.rgba,before);
 const covered=fixture();covered.covered=new Set([...covered.component.keys()].filter(n=>covered.component[n]));
 assert.deepEqual(observe(covered),[]);
});

test('mixed-phase regression is discovered by both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-supplementary-core-background.test.js'));
});
