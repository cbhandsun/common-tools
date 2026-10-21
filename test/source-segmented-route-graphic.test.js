'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeSegmentedRouteGraphic:propose}=require('../packages/slideclone-core/source-segmented-route-graphic');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
function fixture(){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0};
 const put=(x,y,color=[30,60,90])=>image.rgba.set([...color,255],(y*image.width+x)*4);
 const from={id:'a',box:{x:20,y:20,w:50,h:40}},to={id:'b',box:{x:170,y:20,w:50,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 for(let x=45;x<=195;x++)if((x-45)%12<7)for(let y=129;y<=131;y++)put(x,y);
 const cache=createSceneMeasurementCache(image,[],budget);assert(cache.fill(from.box));assert(cache.fill(to.box));
 from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,budget,from,to,textMasks:[],otherNodes:[],shaftBox:{x:38,y:59,w:165,h:76},put,
  relation:{id:'relation-loop',regionId:'region-root'},slideSize:{widthPt:240,heightPt:180}};
}
test('each actual disconnected source dash becomes one editable path while gaps and relation proof stay untouched',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),r=propose(f);assert.equal(r.failure,null,JSON.stringify(r));assert.equal(r.shapes.length,13);
 assert.equal(r.relationResolved,false);assert.equal(r.sourceDirectionVerified,false);assert.deepEqual(f.image.rgba,before);
 assert(r.shapes.every(s=>s.type==='freeform'&&s.style.freeformSegments.length<=120&&s.style.freeformSegments.at(-1).type==='close'));
 assert(r.shapes.every(s=>s.box.w===7&&s.box.h===3&&s.style.fill==='#1E3C5A'));
 assert(r.shapes.every(s=>s.source.sourcePhysicalAttachment===false&&s.source.sourceDirectionVerified===false));
 assert(r.shapes.every(s=>s.source.sceneRelationId===undefined));
 const {encodeNativeFreeformPath}=require('../packages/slideclone-core/native-freeform-path');
 assert(r.shapes.every(s=>typeof encodeNativeFreeformPath(s.style.freeformSegments)==='string'));
});
test('blank sources, unsafe masks, clipped branches, changed paint and forged observations cannot publish partial paths',()=>{
 const blank=fixture();blank.image.rgba.fill(255);assert.notEqual(propose({...blank,components:[{box:{x:10,y:10,w:20,h:2}}]}).failure,null);
 const clipped=fixture();for(let x=36;x<=45;x++)for(let y=95;y<=97;y++)clipped.put(x,y);assert.notEqual(propose(clipped).failure,null);
 const multicolor=fixture();for(let x=69;x<=75;x++)for(let y=129;y<=131;y++)multicolor.put(x,y,[170,40,90]);const r=propose(multicolor);
 assert.equal(r.failure,'segmented-paint-transition');assert.equal(r.shapes,undefined);
 const masked=fixture();masked.textMasks=[{x:90,y:125,w:12,h:12}];assert.notEqual(propose(masked).failure,null);
 const clippedEnd=fixture();clippedEnd.textMasks=[{x:45,y:125,w:3,h:12}];assert.notEqual(propose(clippedEnd).failure,null);
 const exhausted=fixture();exhausted.budget.used=4000000;assert.equal(propose(exhausted).failure,'segmented-source-budget');assert.equal(exhausted.budget.used,4000000);
});
test('invalid graphic boundaries reject before evaluating user getters or conversions',()=>{
 const f=fixture();let calls=0;
 for(const input of [null,{},new Proxy(f,{}),{...f,relation:{get id(){calls++;throw Error('private');},regionId:'root'}},
  {...f,relation:{id:{toString(){calls++;throw Error('private');}},regionId:'root'}},
  {...f,slideSize:{widthPt:Infinity,heightPt:100}},{...f,slideSize:{widthPt:0,heightPt:100}},
  {...f,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(f.image.rgba.length))}}])assert.throws(()=>propose(input),TypeError);
 assert.equal(calls,0);
});
