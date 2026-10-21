'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
function fixture(){
 const image={width:440,height:140,rgba:Buffer.alloc(440*140*4,255)},hint={x:20,y:20,w:400,h:90};
 for(let x=20;x<420;x++)for(let y=20+2*(Math.floor((x-20)/2)%2);y<110;y++)image.rgba.set([210,230,245,255],(y*440+x)*4);
 return {image,hint};
}
test('connected paint split by the path cap never mints a rectangular proxy port from its union bounds',()=>{
 const f=fixture(),budget={used:0},cache=createSceneMeasurementCache(f.image,[],budget),raw=cache.fill(f.hint);
 assert.ok(raw?.parts?.length>1,'regression must exercise actual path partitioning');
 assert.equal(cache.portFrame(f.hint),null,'part union bounds are not a connection surface');
 const result=cache.surface(f.hint);assert.deepEqual(result.measured,raw);
 assert.equal(cache.portFrame(f.hint),null);
 const used=budget.used,again=cache.surface(f.hint);assert.deepEqual(again,result);assert.equal(budget.used,used);
 assert.ok(used<=4000000);assert.ok(raw.parts.every(p=>p.segments.length<=120));
});
test('masked or disconnected paint cannot gain a port and depleted shared scans preserve failure',()=>{
 const f=fixture(),masks=[{x:19,y:19,w:402,h:8}],budget={used:0},cache=createSceneMeasurementCache(f.image,masks,budget);
 const raw=cache.fill(f.hint);assert.ok(raw?.parts);assert.ok(cache.surface(f.hint).measured?.parts);
 assert.equal(cache.portFrame(f.hint),null);
 const capped=createSceneMeasurementCache(f.image,[],{used:4000000});
 assert.throws(()=>capped.surface(f.hint),RangeError);
 const split=fixture();for(let y=20;y<110;y++)for(let x=210;x<230;x++)split.image.rgba.set([255,255,255,255],(y*440+x)*4);
 const other=createSceneMeasurementCache(split.image,[],{used:0});assert.ok(other.surface(split.hint).measured?.parts);
 assert.equal(other.portFrame(split.hint),null);
});
test('partitioned-body regression is part of the unified CI suites',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
});
