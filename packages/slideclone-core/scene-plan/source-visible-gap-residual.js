// @ts-check
'use strict';
const {measuredSceneVisibleGapResidualPaint}=require('./source-scene-visible-gap-compiler');
/** Full-slide erasure uses the actual unmodified compiler output's private
 * source paint. Compact horizontal runs cover exactly those cells, including
 * censored base fragments. Never use a padded line/head envelope for a proved
 * disconnected relation. Invalid receipts fail rather than falling through.
 * @param {import('../png').PngImage} image @param {unknown} item */
function sourceVisibleGapResidualMasks(image,item){
 const cells=measuredSceneVisibleGapResidualPaint(image,item);
 if(!cells||!cells.size||cells.size>262144)throw new TypeError('source visible gap residual proof is invalid');
 const sorted=[...cells].sort((a,b)=>a-b);
 /** @type {{x:number,y:number,w:number,h:number}[]} */const masks=[];
 for(const n of sorted){
  const x=n%image.width,y=Math.floor(n/image.width),last=masks.at(-1);
  if(last&&last.y===y&&last.x+last.w===x)last.w++;
  else masks.push({x,y,w:1,h:1});
 }
 return masks;
}
module.exports={sourceVisibleGapResidualMasks};
