'use strict';
const {sourceRoundedRouteFixture}=require('./source-rounded-route.cjs');
const {createSceneMeasurementCache}=require('../../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
/** A measured rounded broad arrow with a pale connected fringe at its source. */
function sourceFilledFringeFixture(){
 const f=sourceRoundedRouteFixture();
 for(let x=159;x<=179;x++)for(let y=104;y<=124;y++){
  const ink=Math.abs(y-114)<=Math.max(1,Math.floor((179-x)/2));
  f.image.rgba.set(ink?[30,60,90,255]:[255,255,255,255],(y*f.image.width+x)*4);
 }
 for(const x of [46,47,48])f.image.rgba.set([240,200,200,255],(50*f.image.width+x)*4);
 f.shaftBox={x:42,y:49,w:139,h:78};
 // Acquire both private ports from the final source pixels.
 const cache=createSceneMeasurementCache(f.image,[],f.budget);
 for(const n of [f.from,f.to]){const measured=cache.fill(n.box);if(!measured)throw Error('fixture body measurement failed');n.portFrame=cache.portFrame(n.box);n.box=measured.box;}
 return f;
}
module.exports={sourceFilledFringeFixture};
