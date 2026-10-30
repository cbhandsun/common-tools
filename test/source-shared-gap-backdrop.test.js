'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {certifySharedGapBackdrop}=require('../packages/slideclone-core/routing/source-shared-gap-backdrop');
const BG=[231,245,255],TIP=[181,224,241],W=40,H=40,AXIS=20;
/** A downward arrow tip ending above a node outline; rows 12..14 are the tip.
 * @param {(set:(x:number,y:number,c:number[])=>void)=>void} paint */
function scene(paint){
 const rgba=Buffer.alloc(W*H*4);for(let n=0;n<W*H;n++)rgba.set([...BG,255],n*4);
 const set=(x,y,c)=>rgba.set([...c,255],(y*W+x)*4);
 for(let y=12;y<=14;y++)for(let x=AXIS-1;x<=AXIS+1;x++)set(x,y,TIP);
 paint(set);return {width:W,height:H,rgba};
}
const certify=(image,strip)=>certifySharedGapBackdrop({image,node:{id:'n',box:{x:5,y:18,w:30,h:10}},strip,
 window:{x:0,y:0,w:W,h:H},horizontal:false,positive:true,axis:AXIS,background:BG,budget:{used:0},work:{checks:0}});
const row=(set,y,c)=>{for(let x=0;x<W;x++)set(x,y,c);};
test('a clean gap is confirmed (unchanged behaviour)',()=>{
 assert.equal(certify(scene(set=>row(set,18,[98,141,173])),{x:17,y:15,w:7,h:3}),'shared-gap-background-confirmed');
});
test('the node outline anti-alias row adjacent to the node is trimmed, not treated as gap paint',()=>{
 const image=scene(set=>{row(set,17,[188,214,229]);row(set,18,[98,141,173]);});
 assert.equal(certify(image,{x:17,y:15,w:7,h:3}),'shared-gap-background-confirmed');
});
test('a banner inside the gap uses independently observed row flanks',()=>{
 const image=scene(set=>{row(set,16,[188,214,229]);row(set,18,[98,141,173]);});
 assert.equal(certify(image,{x:17,y:15,w:7,h:3}),'shared-gap-background-confirmed');
});
test('a node-adjacent row crossed by a shaft is not a uniform outline band and still fails',()=>{
 const image=scene(set=>{row(set,17,[188,214,229]);for(let y=15;y<=17;y++)set(AXIS,y,TIP);row(set,18,[98,141,173]);});
 assert.equal(certify(image,{x:17,y:15,w:7,h:3}),'shared-gap-background');
});
test('the tip anti-alias falloff in the tip-adjacent row is admitted; ink in the gap is not',()=>{
 const falloff=scene(set=>{set(AXIS,15,[210,241,255]);set(AXIS-1,15,[214,243,255]);row(set,16,[98,141,173]);});
 assert.equal(certify(falloff,{x:17,y:15,w:7,h:1}),'shared-gap-background-confirmed');
 const ink=scene(set=>{set(AXIS,15,TIP);row(set,16,[98,141,173]);});
 assert.equal(certify(ink,{x:17,y:15,w:7,h:1}),'shared-gap-background');
 // a hue-shifted cell is not a blend between the tip and the background
 const darker=scene(set=>{set(AXIS,15,[212,236,224]);set(AXIS-1,15,[212,236,224]);row(set,16,[98,141,173]);});
 assert.equal(certify(darker,{x:17,y:15,w:7,h:1}),'shared-gap-background');
});
test('regression is discovered by the unified unit CI entrypoint',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-shared-gap-backdrop.test.js'));
});
test('a privately owned outline row is excluded without certifying its nonuniform paint as background',()=>{
 const {createMeasuredScenePortFrame}=require('../packages/slideclone-core/scene-plan/source-scene-port-evidence');
 const image=scene(set=>{for(let x=13;x<=27;x++)set(x,18,[90+4*x,100+4*x,130+4*x]);});
 const node={id:'n',box:{x:5,y:19,w:30,h:10}};
 const perimeterPixels=Array.from({length:15},(_,i)=>18*W+13+i);
 const token=createMeasuredScenePortFrame(image,{box:node.box,fill:'#D2E6F5',perimeterPixels});
 const run=(img,portFrame,strip={x:17,y:16,w:7,h:3},work={checks:0})=>certifySharedGapBackdrop({image:img,node:{...node,portFrame},strip,
  window:{x:0,y:0,w:W,h:H},horizontal:false,positive:true,axis:AXIS,background:BG,budget:{used:0},work});
 assert.equal(run(image,token),'shared-gap-background-confirmed');
 assert.equal(run(image,{}),'shared-gap-background');
 assert.equal(run({...image,rgba:Buffer.from(image.rgba)},token),'shared-gap-background');
 // Ownership alone supplies no exterior sample, nor authority for a partial row.
 assert.equal(run(image,token,{x:17,y:18,w:7,h:1}),'shared-gap-background');
 const partial=createMeasuredScenePortFrame(image,{box:node.box,fill:'#D2E6F5',perimeterPixels:perimeterPixels.filter(n=>n!==18*W+20)});
 assert.equal(run(image,partial),'shared-gap-background');
 assert.equal(run(image,token,undefined,{checks:4000000}),'shared-geometry-budget');
 const blocked=scene(set=>{set(20,17,[30,60,90]);for(let x=13;x<=27;x++)set(x,18,[90+4*x,100+4*x,130+4*x]);});
 const blockedToken=createMeasuredScenePortFrame(blocked,{box:node.box,fill:'#D2E6F5',perimeterPixels});
 assert.equal(run(blocked,blockedToken),'shared-gap-background');
});
