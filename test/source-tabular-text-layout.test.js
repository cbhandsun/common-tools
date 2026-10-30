"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {hasTabularTextLayout:has}=require('../packages/slideclone-core/typography/source-tabular-text-layout');
const {proposeSceneTableHeaders:propose}=require('../packages/slideclone-core/scene-plan/source-scene-table-headers');
function fixture(){
 const region={x:0,y:0,w:100,h:100},headers=[{x:10,y:10,w:20,h:10},{x:60,y:10,w:20,h:10}],body=[20,40].flatMap(y=>[{x:12,y:y+10,w:20,h:8},{x:62,y:y+10,w:20,h:8}]);
 return {region,headers,body};
}
test('physical table alignment needs two independent complete body rows',()=>{
 const {region,headers,body}=fixture(),before=structuredClone(body);
 assert.equal(has(headers,[...headers,...body],region),true);assert.deepEqual(body,before);
 for(const boxes of [[],body.slice(0,2),body.slice(1),[...body,body[0]],body.map(b=>({...b,x:10,w:80}))])assert.equal(has(headers,[...headers,...boxes],region),false);
 assert.equal(has([],body,region),false);assert.equal(has(headers.slice(0,1),body,region),false);
 assert.equal(has(Array.from({length:65},()=>headers[0]),body,region),false);
 assert.equal(has(headers,Array.from({length:10000},()=>body[0]),region),false);
});
test('generic physical containers recover proposals from source evidence rather than a provider table label',()=>{
 const {region,headers,body}=fixture(),input={widthPx:100,heightPx:100,slideSize:{widthPt:100,heightPt:100},capacity:2,
  regions:[{id:'region',kind:'container',box:region}],textBoxes:[...headers,...body].map((box,i)=>({text:String(i),box}))};
 const before=structuredClone(input);assert.equal(propose(input).length,2);assert.deepEqual(input,before);
 assert.equal(propose({...input,regions:[{...input.regions[0],kind:'section'}]}).length,0);
 assert.equal(propose({...input,textBoxes:input.textBoxes.slice(0,4)}).length,0);
 assert.equal(propose({...input,capacity:0}).length,0);
 assert.equal(propose({...input,regions:[{...input.regions[0],kind:'table'}],textBoxes:input.textBoxes.slice(0,2)}).length,2);
});
