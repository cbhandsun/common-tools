"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {residualInkComponents,residualInkFringe}=require("../packages/slideclone-core/residual-ink-components");
test("equal-distance fringe requires all nearest solid owners and propagates rejection",()=>{
 const c=new Uint8Array(7).fill(1),s=Uint8Array.of(1,0,0,0,0,0,1);
 assert.deepEqual([...residualInkFringe(c,s,7,s)],[1,1,1,1,1,1,1]);
 assert.deepEqual([...residualInkFringe(c,s,7,Uint8Array.of(1,0,0,0,0,0,0))],[1,1,1,3,2,2,2]);
 const grid=new Uint8Array(15).fill(1),solid=new Uint8Array(15),owned=new Uint8Array(15);
 solid[0]=solid[4]=1;owned[0]=1;
 const states=residualInkFringe(grid,solid,5,owned);
 assert.equal(states[2],3);assert.equal(states[7],3);assert.equal(states[12],3);
 assert.deepEqual([...residualInkFringe(c,new Uint8Array(7),7,s)],Array(7).fill(0));
 assert.throws(()=>residualInkFringe(c,s,3,s),/invalid/);
 assert.throws(()=>residualInkFringe(c,s,7,new Uint8Array(6)),/invalid/);
});
test("solid components compete for weak fringe and retain equidistant ambiguity",()=>{
 const candidates=Uint8Array.of(1,1,1,1,1,1,1),solid=Uint8Array.of(1,1,0,0,0,1,1);
 const before=candidates.slice(),strength=solid.slice(),labels=residualInkComponents(candidates,solid,7);
 assert.deepEqual([...labels],[1,1,1,0,2,2,2]);
 assert.deepEqual(candidates,before);assert.deepEqual(solid,strength);
 assert.deepEqual([...residualInkComponents(new Uint8Array(6),new Uint8Array(6),3)],[0,0,0,0,0,0]);
 assert.deepEqual([...residualInkComponents(candidates,new Uint8Array(7),7)],[0,0,0,0,0,0,0]);
});
test("solid joins remain a single component and row boundaries never wrap",()=>{
 assert.deepEqual([...residualInkComponents(new Uint8Array(12).fill(1),new Uint8Array(12).fill(1),4)],Array(12).fill(1));
 assert.deepEqual([...residualInkComponents(Uint8Array.of(0,0,1,1,0,0),Uint8Array.of(0,0,1,1,0,0),3)],[0,0,1,2,0,0]);
});
test("weak-fringe decisions are invariant under reflection",()=>{
 const width=17,height=13,c=new Uint8Array(width*height).fill(1),s=new Uint8Array(c.length);
 for(const [x,y] of [[2,2],[8,6],[14,10]])s[y*width+x]=1;
 const reflect=a=>Uint8Array.from(a,(_,i)=>a[Math.floor(i/width)*width+width-1-i%width]);
 const first=residualInkComponents(c,s,width),second=residualInkComponents(reflect(c),reflect(s),width);
 for(let i=0;i<c.length;i++)assert.equal(first[i]===0,second[Math.floor(i/width)*width+width-1-i%width]===0);
});
test("component geometry remains bounded for empty, invalid and extreme input",()=>{
 for(const [area,width,other] of [[0,1,0],[4,0,4],[4,NaN,4],[4,Infinity,4],[4,1.5,4],[4,3,4],[4,2,3],[262145,1,262145]])
  assert.throws(()=>residualInkComponents(new Uint8Array(area),new Uint8Array(other),width),/invalid/);
 const mask=new Uint8Array(262144).fill(1),labels=residualInkComponents(mask,mask,512);
 assert.equal(labels.length,262144);assert.equal(labels[262143],1);
});
test("fringe admission preserves input masks, supports the existing maximum and never wraps rows",()=>{
 const c=Uint8Array.of(0,0,1,1,0,0),s=c.slice(),owned=Uint8Array.of(0,0,1,0,0,0);
 const snapshots=[c.slice(),s.slice(),owned.slice()];
 assert.deepEqual([...residualInkFringe(c,s,3,owned)],[0,0,1,2,0,0]);
 assert.deepEqual([c,s,owned],snapshots);
 for(const [area,width,other] of [[0,1,0],[4,0,4],[4,NaN,4],[4,Infinity,4],[4,1.5,4],[4,3,4],[4,2,3],[262145,1,262145]])
  assert.throws(()=>residualInkFringe(new Uint8Array(area),new Uint8Array(other),width,new Uint8Array(area)),/invalid/);
 const mask=new Uint8Array(262144).fill(1),states=residualInkFringe(mask,mask,512,mask);
 assert.equal(states.length,262144);assert.ok(states.every(value=>value===1));
 assert.deepEqual([...residualInkFringe(new Uint8Array(4),new Uint8Array(4),2,new Uint8Array(4))],[0,0,0,0]);
});
