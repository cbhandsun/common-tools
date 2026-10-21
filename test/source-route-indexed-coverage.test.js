'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteIndexedCoverage:indexed}=require('../packages/slideclone-core/source-route-indexed-coverage');
const {sourceRouteCoversComponent:reference}=require('../packages/slideclone-core/source-route-centerline');
test('spatial coverage exactly matches exhaustive distances and first-index ties',()=>{
 const width=50,height=40,path=[];for(let y=8;y<=26;y++)path.push({x:10,y});for(let x=11;x<=38;x++)path.push({x,y:26});
 for(const shaft of [1,3,5])for(const start of [false,true])for(const end of [false,true])for(let probe=0;probe<40;probe++){
  const mask=new Uint8Array(width*height);for(const p of path)mask[p.y*width+p.x]=1;
  for(let d=0;d<=probe%14;d++){const x=10+d,y=8+Math.floor(probe/14);mask[y*width+x]=1;}
  assert.equal(indexed(mask,width,height,path,shaft,start,end,{checks:0}),reference(mask,width,height,path,shaft,start,end,{checks:0}),[shaft,start,end,probe].join(':'));
 }
});
test('long source paths retain branch rejection with bounded indexed work',()=>{
 const width=520,height=30,path=Array.from({length:500},(_,x)=>({x:x+10,y:15})),mask=new Uint8Array(width*height);
 for(const p of path)for(let dy=-1;dy<=1;dy++)mask[(p.y+dy)*width+p.x]=1;
 const work={checks:0};assert.equal(indexed(mask,width,height,path,3,false,false,work),true);assert.ok(work.checks<200000);
 for(let y=15;y<=25;y++)mask[y*width+250]=1;assert.equal(indexed(mask,width,height,path,3,false,false,{checks:0}),false);
 assert.equal(indexed(mask,width,height,path,3,false,false,{checks:4000000}),false);
 assert.equal(indexed(mask,width,height,[],3,false,false,{checks:0}),false);
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
