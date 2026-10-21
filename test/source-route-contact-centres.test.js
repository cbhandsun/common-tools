'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteContactCentres:centres}=require('../packages/slideclone-core/source-route-contact-centres');
function fixture(weights,side='bottom'){
 const width=30,mask=new Uint8Array(900),rgba=new Uint8Array(3600).fill(255),sites=[];
 for(const [i,weight]of weights.entries()){
  const index=10*width+10+i;if(weight){mask[index]=1;rgba.set([20,70,210].map(v=>Math.round(255+(v-255)*weight)).concat(255),index*4);}
  sites.push({index,point:{x:10+i,y:10},side});
 }
 return {sites,mask,rgba,width,background:[255,255,255],work:{checks:0}};
}
test('one complete antialias contact span retains an original centre under the unchanged five-pixel coverage cap',()=>{
 const f=fixture([.2,.6,1,1,1,.6,.2]),before=f.mask.slice(),result=centres(f);assert.ok(result);
 const selected=result.get(f.sites[0]);assert.equal(selected,f.sites[3]);
 assert.ok(f.sites.every(s=>result.get(s)===selected));assert.deepEqual(f.mask,before);assert.ok(f.work.checks<=4000000);
});
test('blank gaps, different sides and truly opaque six-pixel contacts remain separate',()=>{
 const opaque=fixture([1,1,1,1,1,1]),full=centres(opaque);assert.ok(full);assert.ok(opaque.sites.every(s=>full.get(s)===s));
 const split=fixture([1,1,0,1,1]);split.sites.splice(2,1);const result=centres(split);assert.ok(result);
 assert.notEqual(result.get(split.sites[0]),result.get(split.sites.at(-1)));
 const sides=fixture([1,1]);sides.sites[1].side='top';const separate=centres(sides);assert.ok(separate);assert.notEqual(separate.get(sides.sites[0]),separate.get(sides.sites[1]));
});
test('empty hypotheses stay empty and exhausted source work grants no centre',()=>{
 const f=fixture([1,1]);assert.equal(centres({...f,work:{checks:4000000}}),null);
 assert.equal(centres({...f,sites:[]}).size,0);
});
