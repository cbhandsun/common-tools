"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {compactNativeOpacityDefaults}=require('../packages/slideclone-core/scene-plan/native-opacity-defaults');
test('opaque defaults compact without changing overrides, non-default alpha, source or geometry',()=>{
 const page={shapes:[{box:{x:1,y:2,w:3,h:4},style:{opacity:1},source:{opacity:1}}],textBoxes:[
  {font:{opacity:1},style:{opacity:1}},{font:{opacity:.2},style:{opacity:1}},
  {font:{opacity:1},style:{opacity:.3}},{font:{opacity:0},style:{opacity:0}}]};
 const deck={pages:[page]},box=structuredClone(page.shapes[0].box);
 assert.equal(compactNativeOpacityDefaults(deck),deck);
 assert.deepEqual(page.shapes[0].style,{});assert.deepEqual(page.shapes[0].box,box);assert.equal(page.shapes[0].source.opacity,1);
 assert.deepEqual(page.textBoxes,[{font:{},style:{}},{font:{opacity:.2},style:{opacity:1}},{font:{},style:{opacity:.3}},{font:{opacity:0},style:{opacity:0}}]);
 assert.equal(compactNativeOpacityDefaults(deck),deck);
 assert.deepEqual(compactNativeOpacityDefaults({pages:[]}),{pages:[]});
});
test('all boundaries validate before mutations, including immutable defaults and hostile controls',()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,'opacity',{get(){calls++;throw Error('private-token');}});
 const shape={style:{opacity:1}};
 for(const value of [null,{},new Proxy({pages:[]},{}),{pages:new Array(1)},{pages:Array(10001).fill({})},
  {pages:[{shapes:[shape],textBoxes:[{font:hostile}]}]},
  {pages:[{shapes:[shape,{style:Object.freeze({opacity:1})}]}]},
  {pages:[{shapes:new Proxy([], {})}]},{pages:[{textBoxes:[{style:[]}]}]}]){
  assert.throws(()=>compactNativeOpacityDefaults(value),e=>e instanceof TypeError&&!e.message.includes('private-token'));
  assert.equal(shape.style.opacity,1);
 }
 assert.equal(calls,0);
});

