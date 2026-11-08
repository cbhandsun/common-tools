'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSourceObstacleProbe:create}=require('../packages/slideclone-core/scene-plan/source-obstacle-probe');
test('indexed obstacle queries exactly match dense half-open membership inside and outside the source window',()=>{
 let seed=16473;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let trial=0;trial<80;trial++){
  const boxes=Array.from({length:40},()=>({x:Math.floor(random()*400),y:Math.floor(random()*300),w:1+random()*80,h:1+random()*80}));
  const work={checks:0},probe=create(boxes,{x:70,y:40,w:210,h:170},work);
  for(const point of [...boxes.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x+b.w-.001,y:b.y+b.h-.001}]),
   ...Array.from({length:100},()=>({x:random()*500,y:random()*400}))])
   assert.equal(probe(point),boxes.some(b=>point.x>=b.x&&point.x<b.x+b.w&&point.y>=b.y&&point.y<b.y+b.h));
  assert.ok(work.checks<=4000000);
 }
});
test('empty indexes preserve blank space and exhausted construction or query budgets fail closed',()=>{
 const window={x:0,y:0,w:128,h:128};assert.equal(create([],window,{checks:0})({x:32,y:32}),false);
 assert.equal(create([{x:0,y:0,w:128,h:128}],window,{checks:4000000})({x:200,y:200}),true);
 const work={checks:3999999},probe=create([],window,work);assert.equal(probe({x:10,y:10}),false);assert.equal(probe({x:10,y:10}),true);
});
test('local buckets reduce comparisons without dropping a distant or overlapping obstacle',()=>{
 const boxes=Array.from({length:80},(_,i)=>({x:i*40,y:0,w:10,h:20})),work={checks:0};
 const probe=create(boxes,{x:0,y:0,w:3200,h:40},work),before=work.checks;
 for(let i=0;i<1000;i++)assert.equal(probe({x:20,y:20}),false);
 assert.ok(work.checks-before<boxes.length*1000/10);assert.equal(probe({x:40,y:10}),true);
});
