'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteGradientInFrame,reframeSourceRouteGradient:reframe}=require('../packages/slideclone-core/routing/source-route-native-gradient');
const gradient=()=>({type:'linear',angleDeg:90,stops:[{position:0,color:'#123456'},{position:.4,color:'#456789'},{position:1,color:'#ABCDEF'}]});
const frames=[0,90,180,270].flatMap(rotationDeg=>[false,true].flatMap(flipH=>[false,true].map(flipV=>({rotationDeg,flipH,flipV}))));
test('gradient reframing preserves world direction and exact stops across rotations and flips',()=>{
 for(const from of frames)for(const to of frames)for(const angleDeg of [0,37,90,180,270,359]){
  const world={...gradient(),angleDeg},local=sourceRouteGradientInFrame(world,from),before=structuredClone(local);
  const next=reframe(local,from,to);assert.deepEqual(next,sourceRouteGradientInFrame(world,to));assert.deepEqual(local,before);
  assert.deepEqual(reframe(next,to,from),local);assert.deepEqual(next.stops,world.stops);
 }
 assert.deepEqual(reframe(gradient(),undefined,frames[0]),gradient());
});
test('gradient boundary rejects empty, malformed, extreme, reversed stops and invalid target frames',()=>{
 for(const value of [null,{},[],{...gradient(),angleDeg:Infinity},{...gradient(),angleDeg:36001},{...gradient(),type:'radial'},
  {...gradient(),stops:[]},{...gradient(),stops:[{position:0,color:'#123456'},{position:-1,color:'#123456'}]},
  {...gradient(),stops:gradient().stops.reverse()},{...gradient(),stops:[{position:0,color:'secret'},{position:1,color:'#123456'}]}])assert.throws(()=>reframe(value,undefined,frames[0]),TypeError);
 for(const frame of [null,{},[],{rotationDeg:45,flipH:false,flipV:false},{rotationDeg:0,flipH:1,flipV:false}]){
  assert.throws(()=>reframe(gradient(),frame,frames[0]),TypeError);assert.throws(()=>reframe(gradient(),undefined,frame),TypeError);}
});
test('gradient boundary rejects proxies, getters and coercion without invoking them',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const value of [proxy,{...gradient(),get angleDeg(){return trap();}},{...gradient(),stops:[proxy,proxy]},
  {...gradient(),angleDeg:{valueOf:trap}}])assert.throws(()=>reframe(value,undefined,frames[0]),TypeError);
 assert.throws(()=>reframe(gradient(),proxy,frames[0]),TypeError);assert.throws(()=>reframe(gradient(),undefined,proxy),TypeError);assert.equal(calls,0);
});
