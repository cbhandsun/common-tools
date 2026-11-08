// @ts-check
'use strict';
const path=require('node:path');
const {record,list}=require('./source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
const {measuredSourceRouteGroupContext}=require('./source-scene-route');
const {boundSourceFilledComponent}=require('../routing/source-filled-route-binding');
const {readRegisteredSourceCropSnapshot}=require('./source-crop-registration');
const {sharedOutputWork,chargeSharedOutput}=require('../routing/source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {'retained-source-context'|'unknown-relationship-or-contact'|'unknown-outside-crop'|'unknown-alpha'|'unknown-source-mismatch'} State */
/** @typedef {{x:number,y:number,state:State,rgba:readonly number[]|null}} Observation */
const imageKeys=new Set(['id','type','assetPath','box','source','style','layerType','detector','expressionForm','expressionSubtype','recommendedAction']);
/** Observe ONE actual retained crop in SOURCE coordinates, excluding the
 * complete private filled-relation component, including all mixed contacts.
 * No public mask, bbox, copied fit or opaque pixel can supply that exclusion.
 * No final stack visibility, Office resampling, ownership or erasure is proven.
 * Invalid controls reject; unavailable private evidence or an exhausted ledger
 * returns null without publishing a partial prefix.
 * @param {unknown} input @returns {{observations:readonly Observation[],componentCells:number,checks:number,sourceDomainOnly:true}|null} */
function observeRegisteredRouteContext(input){
 if(!record(input)||!sharedOutputWork(input.work)||!list(input.points)||input.points.length>262144)
  throw new TypeError('Retained route context controls are invalid');
 const work=input.work,source=sourceRaster(input.image);
 if(!input.points.every(p=>record(p)&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)
  &&Number(p.x)>=0&&Number(p.y)>=0&&Number(p.x)<source.width&&Number(p.y)<source.height))
  throw new TypeError('Retained route context points are invalid');
 const points=/** @type {Point[]} */(input.points),item=input.item;
 if(!record(item)||!record(item.box)||!record(item.style??{})||Object.keys(item.style??{}).length
  ||Reflect.ownKeys(item).some(k=>typeof k!=='string'||!imageKeys.has(k))
  ||typeof item.assetPath!=='string'||path.isAbsolute(item.assetPath)||typeof input.root!=='string'||!path.isAbsolute(input.root))return null;
 const context=measuredSourceRouteGroupContext(input.fit,input.image);
 if(!context||!record(input.fit))return null;
 const component=boundSourceFilledComponent(input.fit.filledBody);if(!component)return null;
 work.checks=Math.max(work.checks,context.checks);
 if(!chargeSharedOutput(work,component.cells.length+points.length*6+1))return null;
 const captured=readRegisteredSourceCropSnapshot(input.registration,input.image,input.root,path.resolve(input.root,item.assetPath),item.box);
 if(!captured)return null;
 const excluded=new Set(component.cells.map(cell=>(component.y+Math.floor(cell/component.width))*source.width+component.x+cell%component.width));
 const {pixelBox:window,raster}=captured;
 const observations=points.map(p=>{
  const cell=p.y*source.width+p.x,x=p.x-window.x,y=p.y-window.y;
  /** @type {State} */let state='retained-source-context';let rgba=null;
  if(excluded.has(cell))state='unknown-relationship-or-contact';
  else if(x<0||y<0||x>=window.w||y>=window.h)state='unknown-outside-crop';
  else{
   const at=(y*raster.width+x)*4,origin=cell*4;
   if(raster.rgba[at+3]!==255||source.rgba[origin+3]!==255)state='unknown-alpha';
   else if([0,1,2,3].some(c=>raster.rgba[at+c]!==source.rgba[origin+c]))state='unknown-source-mismatch';
   else rgba=Object.freeze(Array.from(raster.rgba.subarray(at,at+4)));
  }
  return Object.freeze({x:p.x,y:p.y,state,rgba});
 });
 return Object.freeze({observations:Object.freeze(observations),componentCells:component.cells.length,checks:work.checks,sourceDomainOnly:true});
}
module.exports={observeRegisteredRouteContext};
