'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceIconPartFringeOwners:observe}=require('../packages/slideclone-core/scene-plan/source-icon-part-fringe-owners');
function fixture(){
 const width=9,height=7,owners=new Int8Array(width*height).fill(-1),rgba=new Uint8Array(width*height*4);
 const ink=(x,y,owner)=>{const n=y*width+x;rgba.set([20,30,40,255],n*4);if(owner!==undefined)owners[n]=owner;return n;};
 const a=ink(2,3,0),b=ink(6,3,1),left=ink(3,3),tie=ink(4,3),right=ink(5,3),far=ink(0,2);ink(1,3);
 return {width,height,owners,rgba,work:{checks:0},a,b,left,tie,right,far};
}
test('original isolated edge cells acquire only a unique nearest actual native member within the existing contact bound',()=>{
 const f=fixture(),before=f.owners.slice(),pixels=f.rgba.slice(),result=observe(f);assert.ok(result);
 assert.equal(result[f.left],0);assert.equal(result[f.right],1);assert.equal(result[f.tie],-1);
 assert.equal(result[f.a],0);assert.equal(result[f.b],1);assert.equal(result[f.far],-1,'newly nominated cells cannot propagate ownership');
 assert.equal(result[2*f.width+2],-1,'transparent source holes acquire no ink');
 assert.deepEqual(f.owners,before);assert.deepEqual(f.rgba,pixels);assert.ok(f.work.checks<=4000000);
});
test('absent independent ink and exhausted work cannot produce edge ownership',()=>{
 const f=fixture();f.rgba[f.a*4+3]=0;const result=observe(f);assert.ok(result);assert.equal(result[f.left],-1);
 assert.equal(observe({...fixture(),work:{checks:4000000}}),null);
 const empty={owners:new Int8Array(),rgba:new Uint8Array(),width:0,height:0,work:{checks:0}};
 assert.equal(observe(empty).length,0);
});
test('native edge ownership regression belongs to unified CI',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-icon-part-fringe-owners.test.js'));
});
