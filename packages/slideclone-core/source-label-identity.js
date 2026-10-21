// @ts-check
"use strict";
const crypto=require('node:crypto');
const {record}=require('./source-scene-group-containment');
/** A label reference follows admitted SOURCE geometry, not an array position,
 * text spelling, font or output layout. The scene's source hash supplies the
 * page binding; this digest grants no glyph/paint ownership.
 * @param {unknown} box @param {unknown} dimensions */
function sourceLabelIdentity(box,dimensions){
 if(!record(box)||!record(dimensions)
  ||![dimensions.widthPx,dimensions.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(dimensions.widthPx)*Number(dimensions.heightPx)>40000000
  ||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
  ||Number(box.x)<0||Number(box.y)<0||Number(box.w)<=0||Number(box.h)<=0
  ||Number(box.x)+Number(box.w)>Number(dimensions.widthPx)+1e-6
  ||Number(box.y)+Number(box.h)>Number(dimensions.heightPx)+1e-6)
  throw new TypeError('Scene source label frame is invalid');
 const frame=[dimensions.widthPx,dimensions.heightPx,...[box.x,box.y,box.w,box.h].map(n=>Number(n).toFixed(6))];
 return 'label-'+crypto.createHash('sha256').update(JSON.stringify(frame)).digest('hex').slice(0,24);
}
module.exports={sourceLabelIdentity};
