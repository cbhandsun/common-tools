'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeSegmentedSourceRoute:observe}=require('../packages/slideclone-core/routing/source-segmented-route-observation');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
function fixture(){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0};
 const put=(x,y,color=[30,60,90])=>image.rgba.set([...color,255],(y*image.width+x)*4);
 const from={id:'a',box:{x:20,y:20,w:50,h:40}},to={id:'b',box:{x:170,y:20,w:50,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 for(let x=45;x<=195;x++)if((x-45)%12<7)for(let y=129;y<=131;y++)put(x,y);
 const cache=createSceneMeasurementCache(image,[],budget);assert(cache.fill(from.box));assert(cache.fill(to.box));
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,budget,from,to,textMasks:[],otherNodes:[],shaftBox:{x:38,y:59,w:165,h:76},put};
}
test('disconnected actual dash cells remain disconnected source observations with no relation authority',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=observe(f);
 assert.equal(result.failure,null);assert.equal(result.components.length,13);assert.equal(result.noisePixels,0);
 assert.equal(result.authorityGranted,false);assert.equal(result.fit,undefined);assert(result.components.every(c=>!c.boundary));
 assert(result.components.every(c=>c.cells.every(p=>(p.x-45)%12<7&&p.y>=129&&p.y<=131)));
 assert.deepEqual(f.image.rgba,before);assert(f.budget.used<=4000000);
});
test('clipped marks, text exclusions and other measured-node exclusions remain explicit',()=>{
 const f=fixture();for(let x=36;x<=45;x++)for(let y=95;y<=97;y++)f.put(x,y);
 const r=observe(f);assert(r.components.some(c=>c.boundary));assert.equal(r.authorityGranted,false);
 const masked=observe({...fixture(),textMasks:[{x:45,y:125,w:20,h:12}]});assert.equal(masked.failure,null);assert(masked.components.every(c=>c.box.x>=65));
 const other=observe({...fixture(),otherNodes:[{x:45,y:125,w:20,h:12}]});assert.deepEqual(other.components,masked.components);
});
test('blank source, unknown alpha, exhausted counters and over-capacity windows do not grant paint',()=>{
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(observe(blank).components.length,0);
 const alpha=fixture();alpha.image.rgba[(100*240+100)*4+3]=0;assert.equal(observe(alpha).failure,'segmented-source-alpha');
 const exhausted=fixture();exhausted.budget.used=4000000;assert.equal(observe(exhausted).failure,'segmented-source-budget');assert.equal(exhausted.budget.used,4000000);
 const parts=fixture();for(let x=50;x<200;x+=5)for(let y=80;y<115;y+=5)for(let dx=0;dx<2;dx++)for(let dy=0;dy<2;dy++)parts.put(x+dx,y+dy);
 assert.equal(observe(parts).failure,'segmented-parts-budget');
});
test('unsafe frames and copied source/port tokens reject without invoking accessors',()=>{
 const f=fixture();let calls=0;const getter={};Object.defineProperty(getter,'from',{get(){calls++;throw Error('private');}});
 for(const value of [null,{},new Proxy(f,{}),getter,{...f,otherNodes:new Array(1)},
  {...f,otherNodes:[{x:NaN,y:0,w:1,h:1}]},{...f,shaftBox:{x:0,y:0,w:99999,h:1}},
  {...f,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(f.image.rgba.length))}},
  {...f,budget:{used:-1}}])assert.throws(()=>observe(value),TypeError);
 assert.equal(calls,0);
 for(const token of [{},structuredClone(f.from.portFrame),new Proxy(f.from.portFrame,{})])assert.equal(observe({...f,from:{...f.from,portFrame:token}}).failure,'segmented-private-ports');
 assert.equal(observe({...f,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).failure,'segmented-private-ports');
});
