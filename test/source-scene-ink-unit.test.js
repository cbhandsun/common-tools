'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneInkPort:create,bindSceneInkPortUnit:bind,sceneInkPortUnitOwnsCell:owns,sceneInkPortOwnsCell,sceneInkPortContour}=require('../packages/slideclone-core/source-scene-ink-port');
function fixture(){
 const image={width:60,height:40,rgba:Buffer.alloc(60*40*4,255)},window={x:0,y:0,w:60,h:40};
 const body={...image,rgba:Buffer.alloc(image.rgba.length)},member={...image,rgba:Buffer.alloc(image.rgba.length)},foreign={...image,rgba:Buffer.alloc(image.rgba.length)};
 const put=(r,x,y)=>{const i=(y*image.width+x)*4;image.rgba.set([20,60,90,255],i);r.rgba.set(image.rgba.subarray(i,i+4),i);};
 for(let y=10;y<20;y++)for(let x=10;x<20;x++){put(body,x,y);put(member,x,y);}
 for(let y=8;y<22;y++)put(body,7,y);
 put(foreign,45,20);
 return {image,window,body,member,foreign,unit:create(image,body,window,window),part:create(image,member,window,window)};
}
test('measured unit ink excludes a neighboring native member without changing the actual attachment contour',()=>{
 const f=fixture(),extra=15*60+7,inside=15*60+15,blank=15*60+8;
 const before=sceneInkPortContour(f.image,f.part,f.window,15,'left');assert.deepEqual(before,{x:10,y:15});
 assert.equal(owns(f.image,f.part,f.window,extra),false);assert.equal(bind(f.image,f.part,f.window,f.unit,f.window),true);
 assert.equal(owns(f.image,f.part,f.window,extra),true);assert.equal(owns(f.image,f.part,f.window,inside),true);
 assert.equal(owns(f.image,f.part,f.window,blank),false);assert.equal(sceneInkPortOwnsCell(f.image,f.part,f.window,extra),false);
 assert.deepEqual(sceneInkPortContour(f.image,f.part,f.window,15,'left'),before);
 assert.equal(bind(f.image,f.part,f.window,f.unit,f.window),false,'membership is immutable');
});
test('copied, cross-source, forged, nonmember and changed-frame units cannot grant exclusion',()=>{
 const f=fixture(),other=create(f.image,f.foreign,f.window,f.window),extra=15*60+7;
 for(const token of [null,{},structuredClone(f.part),new Proxy(f.part,{get(){throw Error('private');}})])
  assert.equal(bind(f.image,token,f.window,f.unit,f.window),false);
 assert.equal(bind(f.image,f.part,f.window,other,f.window),false);
 assert.equal(bind(f.image,f.part,f.window,f.part,f.window),false);
 assert.equal(bind(f.image,f.part,{...f.window,w:59},f.unit,f.window),false);
 const copy={...f.image,rgba:Buffer.from(f.image.rgba)};assert.equal(bind(copy,f.part,f.window,f.unit,f.window),false);
 assert.equal(owns(f.image,f.part,f.window,extra),false);assert.equal(bind(f.image,f.part,f.window,f.unit,f.window),true);
 for(const cell of [-1,NaN,Infinity,2400])assert.equal(owns(f.image,f.part,f.window,cell),false);
 assert.equal(owns(copy,f.part,f.window,extra),false);assert.equal(owns(f.image,structuredClone(f.part),f.window,extra),false);
 assert.equal(owns(f.image,f.part,{...f.window,x:1},extra),false);
 const empty={...f.image,rgba:Buffer.alloc(f.image.rgba.length)};assert.equal(create(f.image,empty,f.window,f.window),null);
});
test('unit exclusion regression is discovered by unified CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-ink-unit.test.js'));
});
