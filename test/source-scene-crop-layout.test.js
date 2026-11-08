"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {planSceneCropLayout}=require("../packages/slideclone-core/scene-plan/source-scene-crop-layout");
const tight=[[341,134],[146,148],[127,111],[125,117],[132,133],[119,133],[128,124],[118,124],[402,276],[428,294],[402,352],[428,346],[470,372]];
const context=[[745,612],[354,356],[305,289],[301,293],[316,317],[303,317],[306,302],[290,296],[566,440],[604,470],[566,516],[604,522],[571,574]];
function sizes(rows){return rows.map(([w,h],index)=>({index,w,h}));}
function verify(input,result){
 assert.deepEqual(result.placements.map(p=>p.index),input.map(s=>s.index));
 assert.ok(result.width<=16384&&result.height<=16384&&result.width*result.height<=4000000);
 for(const p of result.placements){const s=input.find(s=>s.index===p.index);assert.ok(p.x>=8&&p.y>=8&&p.x+s.w+8<=result.width&&p.y+s.h+8<=result.height);}
 for(let i=0;i<input.length;i++)for(let j=i+1;j<input.length;j++){
  const a=result.placements[i],b=result.placements[j],sa=input[i],sb=input[j];
  assert.ok(a.x+sa.w+16<=b.x||b.x+sb.w+16<=a.x||a.y+sa.h+16<=b.y||b.y+sb.h+16<=a.y);
 }
}
test("uneven crops fit both independent observations in the original shared 4M budget",()=>{
 const a=sizes(tight),b=sizes(context),before=JSON.stringify([a,b]),local=planSceneCropLayout(a),surrounding=planSceneCropLayout(b);
 verify(a,local);verify(b,surrounding);
 assert.ok(local.width*local.height+surrounding.width*surrounding.height<=4000000);
 assert.equal(JSON.stringify([a,b]),before);assert.deepEqual(planSceneCropLayout(b),surrounding);
 // The original same-order square shelf occupied 4,109,700 pixels for context alone.
 assert.ok(surrounding.width*surrounding.height<4109700);
});
test("normal, singleton, thin and maximum-index crops retain every identity and gutter",()=>{
 for(const input of [[{index:511,w:1,h:1}],sizes([[500,1],[1,500],[20,20]]),sizes(Array.from({length:32},()=>[25,50]))])verify(input,planSceneCropLayout(input));
});
test("empty, malformed, duplicate, sparse, oversized and extreme dimensions fail closed",()=>{
 for(const input of [null,[],new Array(1),Array(33).fill({index:0,w:1,h:1}),[{index:0,w:1,h:1},{index:0,w:2,h:2}],
  [{index:512,w:1,h:1}],[{index:0,w:.5,h:1}],[{index:0,w:NaN,h:1}],[{index:0,w:Infinity,h:1}],[{index:0,w:0,h:1}],
  [{index:0,w:16385,h:1}],[{index:0,w:16384,h:1}],[{index:0,w:4096,h:1024}]])assert.throws(()=>planSceneCropLayout(input),/Scene/);
});
test("proxies, inherited fields and accessors do not execute provider code or expose content",()=>{
 let calls=0;const accessor={index:0,h:1};Object.defineProperty(accessor,"w",{enumerable:true,get(){calls++;throw Error("private-token");}});
 for(const input of [new Proxy(sizes([[1,1]]),{}),[new Proxy({index:0,w:1,h:1},{})],[accessor],[Object.create({index:0,w:1,h:1})]])
  assert.throws(()=>planSceneCropLayout(input),e=>!e.message.includes("private-token"));
 assert.equal(calls,0);
});
