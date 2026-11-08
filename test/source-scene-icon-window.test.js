"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneIconSearchWindow:window}=require('../packages/slideclone-core/scene-plan/source-scene-icon-window');
const {measureSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
function fixture(){
 const image={width:400,height:300,rgba:Buffer.alloc(400*300*4,255)};
 for(let y=25;y<50;y++)for(let x=30;x<80;x++)if(x<43||y>=46&&y<49)image.rgba.set([30,60,90,255],(y*400+x)*4);
 return {image,box:{x:40,y:30,w:20,h:15},id:'graphic',regionId:'region',root:process.cwd(),
  slideSize:{widthPt:400,heightPt:300},textBoxes:[],budget:{used:0},searchBox:{x:20,y:15,w:75,h:50}};
}
test('a bounded search frame recovers the whole connected object beyond a small identity seed',()=>{
 const input=fixture(),original=Buffer.from(input.image.rgba);
 assert.equal(measureSceneIcon({...input,searchBox:undefined,budget:{used:0}}),null);
 const result=measureSceneIcon(input);assert.ok(result);
 assert.ok(result.icon.box.x<=30&&result.icon.box.x+result.icon.box.w>=80);
 assert.deepEqual(input.image.rgba,original);assert.equal(input.budget.used,75*50);
});
test('larger search frames retain clipped-ink, text ownership and shared budget failures',()=>{
 const clipped=fixture();clipped.searchBox={x:20,y:15,w:55,h:50};assert.equal(measureSceneIcon(clipped),null);
 const text=fixture();text.textBoxes=[{text:'caption',box:{x:42,y:30,w:10,h:10}}];assert.equal(measureSceneIcon(text),null);
 const empty=fixture();empty.image.rgba.fill(255);assert.equal(measureSceneIcon(empty),null);
 const exhausted=fixture();exhausted.budget.used=4000000;assert.throws(()=>measureSceneIcon(exhausted),RangeError);assert.equal(exhausted.budget.used,4000000);
});
test('explicit frames reject invalid, hostile and excessive controls before source accounting',()=>{
 let calls=0;const accessor={x:20,y:15,w:75,get h(){calls++;throw Error('private');}};
 const proxy=new Proxy({}, {get(){calls++;throw Error('private');}});
 for(const searchBox of [null,[],proxy,accessor,{x:20,y:15,w:75,h:NaN},{x:20,y:15,w:75,h:0},
  {x:-1,y:15,w:75,h:50},{x:20,y:15,w:400,h:50},{x:50,y:15,w:75,h:50},
  {x:20,y:15,w:'75',h:50},{x:20,y:15,w:75,h:50,extra:1}]){
  const input=fixture();input.searchBox=searchBox;assert.throws(()=>measureSceneIcon(input));assert.equal(input.budget.used,0);
 }
 assert.equal(calls,0);
 assert.throws(()=>window({width:2000,height:2000},{x:20,y:20,w:10,h:10},{x:0,y:0,w:513,h:512}),RangeError);
 assert.deepEqual(window({width:512,height:512},{x:20,y:20,w:10,h:10},{x:0,y:0,w:512,h:512}),{x:0,y:0,w:512,h:512});
});
test('fractional enclosing frames round outward without changing the default padding contract',()=>{
 const input=fixture();assert.deepEqual(window(input.image,input.box,{x:20.2,y:15.2,w:75.2,h:50.2}),{x:20,y:15,w:76,h:51});
 assert.deepEqual(window(input.image,input.box,undefined),{x:34,y:24,w:32,h:27});
});
