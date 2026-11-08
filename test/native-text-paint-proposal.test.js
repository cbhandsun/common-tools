"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeNativeTextPaint}=require('../packages/slideclone-core/typography/native-text-paint-proposal');
function fixture(){return {width:48,height:48,rgba:Buffer.alloc(48*48*4,255)};}
function rectangle(image,x,y,w,h){
 for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){
  const border=col<x+2||col>=x+w-2||row<y+2||row>=y+h-2;
  image.rgba.set(border?[5,2,1,255]:[254,46,77,255],(row*image.width+col)*4);
 }
 return image;
}
test('proposes bounded native paint without changing source or exporting glyph geometry',()=>{
 const image=rectangle(fixture(),12,10,24,28),before=Buffer.from(image.rgba),result=proposeNativeTextPaint(image);
 assert.ok(result);assert.deepEqual(result.frame,{x:12,y:10,w:24,h:28});
 assert.equal(result.fillColor,'#FE2E4D');assert.equal(result.outlineColor,'#050201');assert.equal(result.explained,1);
 assert.ok(result.outlineRadius95>0&&result.outlineRadius95<=2);
 assert.deepEqual(Object.keys(result).sort(),['explained','fillColor','frame','outlineColor','outlineRadius95']);
 assert.deepEqual(image.rgba,before);
});
test('blank, monochrome, transparent, clipped and ambiguous windows produce no proposal',()=>{
 assert.equal(proposeNativeTextPaint(fixture()),null);
 const mono=rectangle(fixture(),12,10,24,28);
 for(let i=0;i<mono.rgba.length;i+=4)if(mono.rgba[i]===254)mono.rgba.set([5,2,1],i);
 assert.equal(proposeNativeTextPaint(mono),null);
 const alpha=rectangle(fixture(),12,10,24,28);alpha.rgba[3]=0;assert.equal(proposeNativeTextPaint(alpha),null);
 assert.equal(proposeNativeTextPaint(rectangle(fixture(),0,10,24,28)),null);
 const tied=rectangle(rectangle(fixture(),6,10,14,28),28,10,14,28);assert.equal(proposeNativeTextPaint(tied),null);
});
test('raw unexplained colors inside a proposed component cannot be hidden by palette filtering',()=>{
 const image=rectangle(fixture(),12,10,24,28);
 for(let y=13;y<28;y++)for(let x=15;x<29;x++)image.rgba.set([0,200,255,255],(y*48+x)*4);
 assert.equal(proposeNativeTextPaint(image),null);
});
test('rejects unsafe controls, wrong byte counts and resource extremes before sampling',()=>{
 const image=fixture();const hostile=new Proxy({}, {get(){throw Error('getter ran');}});
 for(const value of [null,[],hostile,{...image,width:0},{...image,width:Infinity},{...image,height:1.5},
  {...image,width:9001,height:1},{...image,rgba:Buffer.alloc(2)},{...image,rgba:hostile},
  {...image,rgba:new Uint8Array(new SharedArrayBuffer(48*48*4))}])assert.throws(()=>proposeNativeTextPaint(value),TypeError);
 const accessor={...image};Object.defineProperty(accessor,'width',{get(){throw Error('getter ran');}});
 assert.throws(()=>proposeNativeTextPaint(accessor),TypeError);
});
test('honors typed-array subwindows and the exact sampled-window ceiling',()=>{
 const image=rectangle(fixture(),12,10,24,28),storage=Buffer.alloc(image.rgba.length+16,0);
 image.rgba.copy(storage,8);assert.deepEqual(proposeNativeTextPaint({...image,rgba:storage.subarray(8,-8)}),proposeNativeTextPaint(image));
 assert.equal(proposeNativeTextPaint({width:90,height:100,rgba:Buffer.alloc(9000*4,255)}),null);
});
