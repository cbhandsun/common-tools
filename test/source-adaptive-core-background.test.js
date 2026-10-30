'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {adaptiveBackgroundFixture:fixture}=require('./helpers/source-adaptive-background.cjs');
const {observeSourceCoreBackdrop:observe}=require('../packages/slideclone-core/routing/source-route-core-backdrop');

test('four independently visible asymmetric corners recover a curved source core missed by fixed grids',()=>{
 const f=fixture(),rows=observe(f);assert.ok(rows);
 assert.deepEqual(rows.find(row=>row.cell===47*80+47)?.color,[235,248,241]);
 assert.ok(f.work.checks<=4000000);
});

test('asymmetric fields retain both source axes, gradients, source offsets, body masks and original refusals',()=>{
 for(const mode of ['plain','gradient','transpose','offset','covered','body','alpha','foreign','original-refusal']){
  const f=fixture(),target=47*80+47;
  if(mode==='gradient')for(let y=0;y<80;y++)for(let x=0;x<80;x++){
   const n=y*80+x;if(f.component[n])continue;const noise=f.image.rgba[n*4]===245?10:0;
   f.image.rgba.set([210+Math.floor(x/4)+noise,225+Math.floor(y/4),235,255],n*4);
  }
  if(mode==='transpose'){
   const rgba=Buffer.from(f.image.rgba),component=f.component.slice();for(let y=0;y<80;y++)for(let x=0;x<80;x++){
    const from=y*80+x,to=x*80+y;rgba.copy(f.image.rgba,to*4,from*4,from*4+4);f.component[to]=component[from];
   }
  }
  if(mode==='covered')f.covered.add(target);if(mode==='body')f.blocked[target]=1;if(mode==='alpha')f.image.rgba[target*4+3]=0;
  if(mode==='foreign')f.image.rgba.set([30,60,90,255],(46*80+46)*4);
  if(mode==='original-refusal')f.blocked[22*80+22]=1;
  if(mode==='offset'){
   const storage=Buffer.alloc(100*100*4+24,255),rgba=storage.subarray(12,-12);for(let y=0;y<80;y++)f.image.rgba.copy(rgba,((y+10)*100+10)*4,y*80*4,(y+1)*80*4);
   f.image={width:100,height:100,rgba};f.window={x:10,y:10,w:80,h:80};
  }
  const source=Buffer.from(f.image.rgba),component=f.component.slice(),blocked=f.blocked.slice(),rows=observe(f);assert.ok(rows,mode);
  const cell=mode==='offset'?57*100+57:target,row=rows.find(r=>r.cell===cell);
  if(['plain','gradient','transpose','offset'].includes(mode)){assert.ok(row,mode);const color=mode==='gradient'?[221,236,235]:[235,248,241];assert.ok(row.color.every((v,c)=>Math.abs(v-color[c])<=1),mode);}
  else assert.equal(row,undefined,mode);
  for(const r of rows){const n=(Math.floor(r.cell/f.image.width)-f.window.y)*80+r.cell%f.image.width-f.window.x;assert.equal(f.component[n],1);assert.equal(f.blocked[n],0);assert.equal(f.covered.has(n),false);}
  assert.equal(rows.length,new Set(rows.map(r=>r.cell)).size);assert.deepEqual(f.image.rgba,source);assert.deepEqual(f.component,component);assert.deepEqual(f.blocked,blocked);
 }
});

test('late asymmetric proof budget exhaustion returns no partial background, and an empty component stays empty',()=>{
 const full=fixture();assert.ok(observe(full));const limited=fixture();limited.work.checks=4000000-full.work.checks+1;
 assert.equal(observe(limited),null);assert.ok(limited.work.checks>4000000);const empty=fixture();empty.component.fill(0);assert.deepEqual(observe(empty),[]);
});

test('asymmetric core regressions run in both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-adaptive-core-background.test.js'));
});
