'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createCoreBackgroundPatches}=require('../packages/slideclone-core/routing/source-route-background-patches');

function fixture(){
 const image={width:80,height:80,rgba:Buffer.alloc(80*80*4)},component=new Uint8Array(80*80),blocked=new Uint8Array(80*80),halo=new Uint8Array(80*80);
 for(let n=0;n<80*80;n++)image.rgba.set([235,248,241,255],n*4);
 return {image,window:{x:0,y:0,w:80,h:80},component,blocked,halo,work:{checks:0}};
}

test('complete background patches reuse identical physical samples with the original arithmetic and charged lookup',()=>{
 const f=fixture(),read=createCoreBackgroundPatches(f),before=Buffer.from(f.image.rgba);
 assert.deepEqual(read(30,30),[235,248,241]);assert.equal(f.work.checks,46);
 assert.deepEqual(read(30,30),[235,248,241]);assert.equal(f.work.checks,47);
 assert.deepEqual(read(31,30),[235,248,241]);assert.equal(f.work.checks,93);
 assert.deepEqual(f.image.rgba,before);
});

test('background patch refusals, unavailable evidence and empty boundaries stay distinct',()=>{
 for(const mode of ['body','transparent','foreign','noise','halo','edge']){
  const f=fixture(),n=29*80+29;
  if(mode==='body')f.blocked[n]=1;
  if(mode==='transparent')f.image.rgba[n*4+3]=0;
  if(mode==='foreign')f.image.rgba[n*4]=20;
  if(mode==='noise')f.image.rgba[n*4]+=10;
  if(mode==='halo')f.halo[n]=1;
  const read=createCoreBackgroundPatches(f),x=mode==='edge'?0:30;
  const expected=['body','transparent','foreign'].includes(mode)?'refused':null;
  assert.equal(read(x,30),expected,mode);const charged=f.work.checks;
  assert.equal(read(x,30),expected,mode);assert.equal(f.work.checks,charged+1);
 }
});

test('nonzero source views, offset windows and fractional channel means preserve exact patch samples',()=>{
 const f=fixture(),storage=Buffer.alloc(100*100*4+24,255),rgba=storage.subarray(12,-12);
 f.image={width:100,height:100,rgba};f.window={x:10,y:8,w:80,h:80};
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)rgba.set([230+x+1,240+y+1,250+(x===1&&y===1?1:0),255],((38+y)*100+40+x)*4);
 assert.deepEqual(createCoreBackgroundPatches(f)(30,30),[231,241,250+1/9]);
});

test('exhausted patches cannot cache partial evidence or share successful evidence across observer calls',()=>{
 const f=fixture(),read=createCoreBackgroundPatches(f);f.work.checks=3999980;assert.equal(read(30,30),null);assert.ok(f.work.checks>4000000);
 f.work.checks=0;assert.deepEqual(read(30,30),[235,248,241]);assert.equal(f.work.checks,46);
 f.image.rgba[(29*80+29)*4]=20;f.work.checks=0;
 assert.equal(createCoreBackgroundPatches(f)(30,30),'refused');
});

test('supplementary background regression is discovered by the unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-background-patches.test.js'));
});
