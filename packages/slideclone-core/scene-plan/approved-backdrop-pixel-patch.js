// @ts-check
'use strict';
const {chargeApprovedBackdropChecks}=require('./approved-backdrop-budget');
/** Sparse writes only. Opaque and partial-alpha pixels retain all four bytes.
 * Colors were reviewed; this application performs no new inference/search.
 * @param {import('../png').PngImage} image @param {{x:number,y:number}} origin
 * @param {ReturnType<typeof import('./approved-backdrop-pixel-input').parseApprovedBackdropPixels>} review */
function patchApprovedBackdropPixels(image,origin,review){
 const rgba=Buffer.from(image.rgba),cells=[];
 for(const row of review.pixels){
  chargeApprovedBackdropChecks(1);
  const x=row.cell%review.source.width-origin.x,y=Math.floor(row.cell/review.source.width)-origin.y;
  if(x<0||y<0||x>=image.width||y>=image.height)continue;
  chargeApprovedBackdropChecks(1);const offset=(y*image.width+x)*4;
  if(rgba[offset+3]!==0)continue;
  chargeApprovedBackdropChecks(4);rgba.set([...row.color,255],offset);cells.push(row.cell);
 }
 return {image:{width:image.width,height:image.height,rgba},cells};
}
module.exports={patchApprovedBackdropPixels};
