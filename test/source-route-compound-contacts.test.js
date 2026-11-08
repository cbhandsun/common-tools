'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fixture=require('./fixtures/source-compound-budget/geometry.json');
const {readPng}=require('../packages/slideclone-core/png');
const {sourceCompoundRouteGeometry:measure}=require('../packages/slideclone-core/routing/source-compound-route-geometry');
const {sourceRouteContactsAgree:agree}=require('../packages/slideclone-core/routing/source-route-contact-centres');
function observed(){
 const image=readPng(path.join(__dirname,'fixtures/source-compound-budget/source.png')),mask=new Uint8Array(fixture.width*fixture.height);
 for(const n of fixture.cells)mask[n]=1;
 return {...fixture,rgba:image.rgba,mask,path:fixture.paths[1],work:{checks:0}};
}
function contact(p,width,side='top'){return {index:p.y*width+p.x,point:{...p},side};}

test('one complete measured taper owns the five physical tip hypotheses without borrowing its neck',()=>{
 const f=observed(),mask=f.mask.slice(),pixels=Buffer.from(f.rgba),geometry=measure(f);
 assert.ok(geometry?.filledBody);const taper=geometry.terminalContacts.end;
 assert.ok(taper instanceof Set&&taper.size>0);assert.equal(geometry.terminalContacts.start,undefined);
 assert.ok([...taper].every(n=>f.mask[n]));assert.ok(taper.size<fixture.cells.length);
 const anchor=contact(f.path.at(-1),f.width);
 assert.ok(fixture.paths.some(p=>!agree(anchor,contact(p.at(-1),f.width))),'ordinary 2px contacts remain distinct');
 for(const p of fixture.paths)assert.equal(agree(anchor,contact(p.at(-1),f.width),taper),true);
 const neck=fixture.cells.find(n=>!taper.has(n)&&Math.hypot(n%f.width-anchor.point.x,Math.floor(n/f.width)-anchor.point.y)>2);
 assert.notEqual(neck,undefined);
 assert.equal(agree(anchor,contact({x:neck%f.width,y:Math.floor(neck/f.width)},f.width),taper),false);
 assert.deepEqual(f.mask,mask);assert.deepEqual(f.rgba,pixels);assert.ok(f.work.checks<=4000000);
});

test('a different side, unowned cell, missing head or separate head cannot consolidate distant contacts',()=>{
 const a=contact({x:10,y:10},40),b=contact({x:14,y:10},40),taper=new Set([b.index]);
 assert.equal(agree(a,b),false);assert.equal(agree(a,b,new Set()),false);assert.equal(agree(a,b,new Set([b.index+1])),false);
 assert.equal(agree(a,b,taper),true);assert.equal(agree(a,{...b,side:'left'},taper),false);
 assert.equal(agree(a,{...b,index:b.index+1},taper),false);
 assert.equal(agree(a,contact({x:12,y:10},40)),true,'ordinary contact allowance stays 2px');
 assert.equal(agree(a,contact({x:13,y:10},40)),false);
});

test('head ownership cannot arise from blank source, reversed arrows, a connected branch or exhausted work',()=>{
 for(const mode of ['blank','reverse','branch','budget']){
  const f=observed();
  if(mode==='blank'){f.rgba.fill(255);f.mask.fill(0);}
  if(mode==='reverse')f.direction='backward';
  if(mode==='branch'){
   const anchor=f.path[Math.floor(f.path.length/2)];
   for(let y=anchor.y-25;y<=anchor.y;y++){const n=y*f.width+anchor.x;f.mask[n]=1;f.rgba.set([0,0,0,255],n*4);}
  }
  if(mode==='budget')f.work.checks=4000000;
  const geometry=measure(f);assert.ok(geometry===null,mode);
 }
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});
