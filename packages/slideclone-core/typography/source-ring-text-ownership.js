// @ts-check
"use strict";
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sourceRaster}=require('./residual-text-mask');
const {sceneSourceTextPointsOwned}=require('../scene-plan/source-scene-glyph-occlusion');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('../scene-plan/source-scene-plan').Box} Box */
/** A complete measured ring may intersect OCR whitespace. Only the existing
 * private glyph proof can resolve that overlap; missing proof stays owned.
 * This grants no erasure, fill, guessed ring closure or additional allowance.
 * Call only after independent source topology and geometry have succeeded.
 * @param {unknown} input @returns {boolean} */
function sourceRingTextOwned(input){
 if(!record(input)||!record(input.budget)||!Number.isSafeInteger(input.budget.used)||Number(input.budget.used)<0
  ||Number(input.budget.used)>4000000||!list(input.points)||input.points.length>262144
  ||!list(input.textMasks)||input.textMasks.length>10000)throw new TypeError('Source ring ownership input is invalid');
 const image=sourceRaster(input.image);
 if(input.points.some(p=>!record(p)||![p.x,p.y].every(n=>typeof n==='number'&&Number.isSafeInteger(n))
  ||Number(p.x)<0||Number(p.y)<0||Number(p.x)>=image.width||Number(p.y)>=image.height)
  ||input.textMasks.some(m=>!record(m)||![m.x,m.y,m.w,m.h].every(n=>typeof n==='number'&&Number.isFinite(n))
   ||Number(m.x)<0||Number(m.y)<0||Number(m.w)<=0||Number(m.h)<=0
   ||Number(m.x)+Number(m.w)>image.width||Number(m.y)+Number(m.h)>image.height))
  throw new TypeError('Source ring ownership frame is invalid');
 const points=/** @type {Point[]} */(input.points),masks=/** @type {Box[]} */(input.textMasks),budget=/** @type {{used:number}} */(input.budget);
 for(const mask of masks){
  const overlap=points.filter(p=>p.x>=mask.x&&p.y>=mask.y&&p.x<mask.x+mask.w&&p.y<mask.y+mask.h);
  if(!overlap.length)continue;
  const owned=sceneSourceTextPointsOwned(input.glyphOcclusion,image,budget,mask,overlap);
  if(owned!==false)return true;
 }
 return false;
}
module.exports={sourceRingTextOwned};
