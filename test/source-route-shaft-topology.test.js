'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteShaftTopology:topology}=require('../packages/slideclone-core/source-route-shaft-topology');
function fixture(){
 const width=100,height=90,mask=new Uint8Array(width*height);
 const put=(x,y)=>{mask[y*width+x]=1;};
 for(let x=10;x<=70;x++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)put(x+dx,Math.round(50-20*Math.sin(x/50))+dy);
 return {mask,width,height,work:{checks:0},put};
}
test('a complete thick curved source shaft produces one path without mutating original cells',()=>{
 const input=fixture(),before=input.mask.slice(),path=topology(input);assert.ok(path);assert.ok(path.length>30&&path.length<=512);
 assert.deepEqual(input.mask,before);assert.ok(path.every(p=>input.mask[p.y*input.width+p.x]));
 assert.equal(new Set(path.map(p=>p.y*input.width+p.x)).size,path.length);assert.ok(input.work.checks<=4000000);
});
test('a whole-source branch, closed loop or second component cannot be discarded by choosing a shortest route',()=>{
 for(const mode of ['branch','loop','disconnected']){
  const input=fixture();
  if(mode==='branch')for(let y=10;y<=35;y++)for(let x=39;x<=41;x++)input.put(x,y);
  if(mode==='loop'){
   input.mask.fill(0);
   for(let y=10;y<=65;y++)for(let x=10;x<=75;x++)if(x<=12||x>=73||y<=12||y>=63)input.put(x,y);
  }
  if(mode==='disconnected')for(let x=10;x<=30;x++)input.put(x,75);
  assert.equal(topology(input),null,mode);
 }
});
test('empty, boundary, malformed, overlong and exhausted skeletons fail closed',()=>{
 const input=fixture();
 for(const change of [{mask:new Uint8Array(9000)},{width:0},{height:1.5},{mask:new Uint8Array(1)},{work:{checks:4000000}},{work:{checks:-1}}])
  assert.equal(topology({...input,...change}),null);
 const mask=new Uint8Array(600*5);for(let x=1;x<599;x++)mask[2*600+x]=1;
 assert.equal(topology({mask,width:600,height:5,work:{checks:0}}),null);
 input.mask[0]=1;assert.equal(topology(input),null);
});
