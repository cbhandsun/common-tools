'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceObliqueDashFootprint:footprint}=require('../packages/slideclone-core/source-oblique-dash-footprint');
const {sourceObliqueDashProfile:profile}=require('../packages/slideclone-core/source-oblique-dash-profile');
const {sourceVisibleCrossingDashProfile:crossing}=require('../packages/slideclone-core/source-visible-crossing-dash-profile');

function fixture(slope=.87,horizontal=true){
 const width=320,height=260,rgba=new Uint8Array(width*height*4).fill(255),scale=Math.hypot(1,slope),intercept=120-slope*160;
 const paint=(s,segments)=>{
  const sc=Math.hypot(1,s),b=120-s*160,cells=[];
  for(let a=0;a<width;a++)for(let c=0;c<height;c++){
   const t=((a-160)+s*(c-120))/sc,v=(c-s*a-b)/sc;
   if(Math.abs(v)>3.25||!segments.some(([lo,hi])=>t>=lo&&t<=hi))continue;
   const n=horizontal?c*width+a:a*width+c;if(n<0||n>=width*height)continue;
   cells.push(n);rgba.set([2,3,7,255],n*4);
  }
  return cells;
 };
 const runs=[[-70,-48],[-38,-16],[-6,16],[26,48],[58,80]],parts=runs.map(r=>({cells:paint(slope,[r]),bounded:true}));
 return {width,rgba,horizontal,increasing:true,sign:Math.sign(slope),background:[255,255,255],work:{checks:0},components:parts,paint,scale,intercept,slope};
}

test('flat oblique caps use complete original footprints in either source column system',()=>{
 for(const slope of [.23,.87,-.31,-.81])for(const horizontal of [false,true]){
  const f=fixture(slope,horizontal),before=Buffer.from(f.rgba),result=profile(f);
  assert.ok(result,JSON.stringify({slope,horizontal}));assert.ok(result.widthPx>=1&&result.widthPx<=25);
  assert.equal(new Set(result.cells).size,f.components.reduce((s,c)=>s+c.cells.length,0));assert.ok(Buffer.from(f.rgba).equals(before));
  assert.equal(JSON.parse(result.strokeDashPattern).length,5);
 }
});

test('a dash cannot discard an internal hole, a branch, mixed ink, or exhausted work',()=>{
 for(const mode of ['hole','branch','color','budget','empty']){
  const f=fixture();
  if(mode==='hole'){
   const part=f.components[2],n=120*f.width+160;part.cells=part.cells.filter(c=>c!==n);f.rgba.set([255,255,255,255],n*4);
  }
  if(mode==='branch')for(let y=120;y<=140;y++){const n=y*f.width+160;f.components[2].cells.push(n);f.rgba.set([2,3,7,255],n*4);}
  if(mode==='color')for(const n of f.components[2].cells)f.rgba.set([190,20,30,255],n*4);
  if(mode==='budget')f.work.checks=4000000;
  if(mode==='empty')f.components=[];
  assert.equal(profile(f),null,mode);
 }
 const f=fixture(),part=f.components[1];
 assert.equal(footprint({cells:[],width:f.width,horizontal:true,slope:f.slope,intercept:f.intercept,work:{checks:0}}),null);
 assert.equal(footprint({cells:part.cells,width:f.width,horizontal:true,slope:f.slope,intercept:f.intercept,work:{checks:4000000}}),null);
});

function connected(cells,width){
 const remaining=new Set(cells),result=[];
 while(remaining.size){
  const part=[remaining.values().next().value];remaining.delete(part[0]);
  for(let i=0;i<part.length;i++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
   const n=part[i]+y*width+x;if(remaining.delete(n))part.push(n);
  }
  result.push({cells:part,bounded:true});
 }
 return result;
}

test('a crossing may join two separated dashes without filling their actual source gap',()=>{
 const f=fixture(.87),other=f.paint(-.81,[[-70,-48],[-38,-16],[-10,14],[24,46],[56,78]]);
 f.components=connected([...f.components.flatMap(p=>p.cells),...other],f.width);
 const before=Buffer.from(f.rgba),result=crossing(f);assert.ok(result);assert.ok(Buffer.from(f.rgba).equals(before));
 const joint=f.components.find(c=>c.cells.length>200);assert.ok(joint);
 const broken={...f,components:f.components.map(p=>p===joint?{...p,cells:[...p.cells]}:p),work:{checks:0}};
 const changed=broken.components.find(c=>c.cells.length>200);
 for(let y=120;y<=146;y++)changed.cells.push(y*f.width+160);
 assert.equal(crossing(broken),null,'a third branch cannot gain ownership through crossing partition');
});

test('oblique source proofs run in the unified CI entry',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-oblique-dash-profile.test.js'));
});
