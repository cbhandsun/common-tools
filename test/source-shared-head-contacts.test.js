'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {consolidateSharedHeadContacts:consolidate}=require('../packages/slideclone-core/routing/source-shared-head-contacts');
function fixture(){
 const width=120,height=110,mask=new Uint8Array(width*height),rgba=new Uint8Array(mask.length*4).fill(255);
 const put=(x,y)=>{const n=y*width+x;mask[n]=1;rgba.set([30,60,90,255],n*4);};
 for(let y=5;y<=40;y++)for(let x=59;x<=61;x++)put(x,y);
 for(let x=20;x<=100;x++)for(let y=39;y<=41;y++)put(x,y);
 for(const x of [20,100]){
  for(let y=40;y<=99;y++)for(let xx=x-1;xx<=x+1;xx++)put(xx,y);
  for(let y=92;y<=99;y++)for(let xx=x-(99-y);xx<=x+(99-y);xx++)put(xx,y);
 }
 return {width,height,mask,rgba,background:[255,255,255],work:{checks:0},
  terminals:[{index:5*width+60,owner:0},{index:99*width+20,owner:1},{index:96*width+23,owner:1},{index:99*width+100,owner:2}]};
}
test('a complete measured arrow owns duplicate contacts while preserving every source cell',()=>{
 const f=fixture(),before=f.mask.slice(),rgba=f.rgba.slice(),keep=consolidate(f);
 assert.ok(keep);assert.equal(keep.length,3);assert.equal(keep.filter(i=>f.terminals[i].owner===1).length,1);
 assert.deepEqual(f.mask,before);assert.deepEqual(f.rgba,rgba);assert.ok(f.work.checks<=4000000);
 const reversed={...fixture(),terminals:fixture().terminals.reverse()};
 assert.deepEqual(consolidate(reversed).map(i=>reversed.terminals[i].index).sort((a,b)=>a-b),keep.map(i=>f.terminals[i].index).sort((a,b)=>a-b));
});
test('a shared endpoint, proximity or a branch outside the certified head cannot merge contacts',()=>{
 const f=fixture();f.terminals[2]={index:60*f.width+20,owner:1};
 assert.deepEqual(consolidate(f),[0,1,2,3]);
 const independent=fixture();independent.terminals[3].owner=1;
 assert.deepEqual(consolidate(independent),[0,1,2,3]);
 const separate=fixture();separate.terminals[2].owner=3;
 assert.deepEqual(consolidate(separate),[0,1,2,3]);
});
test('empty and single contacts are unchanged; exhausted work cannot certify a head',()=>{
 const f=fixture();assert.deepEqual(consolidate({...f,terminals:[]}),[]);
 assert.deepEqual(consolidate({...f,terminals:f.terminals.slice(0,1)}),[0]);
 assert.equal(consolidate({...f,work:{checks:4000000}}),null);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-shared-head-contacts.test.js'));
});
