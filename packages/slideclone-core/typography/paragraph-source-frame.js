// @ts-check
"use strict";
const {box,identity}=require('./typography-contract');
/** Source OCR frames are in slide points. Missing evidence remains a legacy
 * output estimate; it must never be written back as a source observation.
 * @param {import('./typography-contract').Text} text
 * @param {{widthPt:number,heightPt:number}} slideSize */
function paragraphSourceFrame(text,slideSize){
 const raw=text.source?.evidenceBox;
 if(raw===undefined)return {box:text.box,evidenced:false};
 const frame=box(raw);
 if(frame.x+frame.w>slideSize.widthPt+.001||frame.y+frame.h>slideSize.heightPt+.001)
  throw new TypeError('Paragraph source frame outside page');
 return {box:frame,evidenced:true};
}
/** A bound region program wins over inferred containing-region membership.
 * This is a style scope, never physical-node interior authority.
 * @param {import('./typography-contract').Text} text */
function paragraphStyleScope(text){
 const source=text.source;
 for(const key of ['sceneRegionProgramId','sceneRegionId','typographyRegionId']){
  if(source?.[key]!==undefined)return identity(source[key]);
 }
 return 'page';
}
module.exports={paragraphSourceFrame,paragraphStyleScope};
