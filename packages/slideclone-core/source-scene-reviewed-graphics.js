// @ts-check
"use strict";
const {materializeSceneIcon}=require("./source-scene-icon");
const {types}=require("node:util");
/** Missing physical graphics must survive the review-to-audit boundary. Model
 * classifications authorize removal of OCR, not loss of the source object.
 * @param {unknown} evidence @returns {number|null} */
function unresolvedReviewedGraphicCount(evidence){
 if(evidence===undefined)return 0;
 if(evidence===null||typeof evidence!=="object"||types.isProxy(evidence)||Array.isArray(evidence)
  ||![null,Object.prototype].includes(Object.getPrototypeOf(evidence))
  ||Object.values(Object.getOwnPropertyDescriptors(evidence)).some(p=>!("value" in p)))return null;
 const indices=/** @type {Record<string,unknown>} */(evidence).unresolvedReviewedGraphics;
 if(indices===undefined)return 0;
 if(!Array.isArray(indices)||types.isProxy(indices)||Object.getPrototypeOf(indices)!==Array.prototype||indices.length>512
  ||Reflect.ownKeys(indices).length!==indices.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(indices)).some(p=>!("value" in p))
  ||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=512)||new Set(indices).size!==indices.length)return null;
 return indices.length;
}
/** Keep compact completion evidence on the page: later candidate composition
 * replaces deck metadata but preserves page ownership and source evidence.
 * @template {{source?:Record<string,unknown>}} T
 * @param {T} page @param {unknown} evidence */
function withReviewedGraphicEvidence(page,evidence){
 const count=unresolvedReviewedGraphicCount(evidence);
 if(count===null)throw new TypeError("Reviewed graphic completion evidence is invalid");
 const review=/** @type {Record<string,unknown>|undefined} */(evidence);
 if(review?.unresolvedReviewedGraphics===undefined)return page;
 if(typeof review.sourceHash!=="string"||!/^[a-f0-9]{64}$/u.test(review.sourceHash))throw new TypeError("Reviewed graphic completion source binding is invalid");
 return {...page,source:{...page.source,sourceSceneReviewedGraphics:{version:1,sourceHash:review.sourceHash,
  unresolvedReviewedGraphics:/** @type {number[]} */(review.unresolvedReviewedGraphics).slice()}}};
}
/** @param {{image:import("./png").PngImage,rejectedOcr:{index:number,box:import("./source-scene-plan").Box|undefined,searchBox?:import("./source-scene-plan").Box|undefined}[],textBoxes:{text:string,box:import("./source-scene-plan").Box}[],root:string,budget:{used:number},sourceHash:string}} input */
function materializeReviewedSceneGraphics(input){
 const {image,rejectedOcr,textBoxes,root,budget,sourceHash}=input;
 // Review admission already binds these indices and boxes to both source
 // observations. Reuse the remaining LOCAL crop budget, not the scene object
 // compiler's allowance, and do not append model objects or relations.
 if(!/^[a-f0-9]{64}$/u.test(sourceHash)||rejectedOcr.length>512||new Set(rejectedOcr.map(row=>row.index)).size!==rejectedOcr.length)throw new TypeError("Reviewed graphic source binding is invalid");
 const graphics=[],unresolved=[];
 for(const target of rejectedOcr){
  if(!target.box||!Number.isSafeInteger(target.index)||target.index<0||target.index>=512)throw new TypeError("Reviewed graphic target is invalid");
  const icon=materializeSceneIcon({image,box:target.box,id:`reviewed-ocr-${target.index}`,regionId:"reviewed-ocr",root,
   slideSize:{widthPt:image.width,heightPt:image.height},textBoxes,budget,...(target.searchBox?{searchBox:target.searchBox}:{})});
  if(icon)graphics.push({...icon,source:{...icon.source,sceneReviewSourceHash:sourceHash,sceneReviewOcrIndex:target.index}});
  else unresolved.push(target.index);
 }
 return {graphics,unresolved};
}
/** Source-space assets keep their mapping through the native page rebuild.
 * @param {ReturnType<typeof materializeReviewedSceneGraphics>["graphics"]} graphics
 * @param {{widthPx:number,heightPx:number}} dimensions @param {{widthPt:number,heightPt:number}} slideSize */
function mapReviewedSceneGraphics(graphics,dimensions,slideSize){
 if(![dimensions.widthPx,dimensions.heightPx,slideSize.widthPt,slideSize.heightPt].every(v=>Number.isFinite(v)&&v>0))throw new TypeError("Reviewed graphic page frame is invalid");
 const sx=slideSize.widthPt/dimensions.widthPx,sy=slideSize.heightPt/dimensions.heightPx;
 return graphics.map(icon=>({...icon,box:{x:icon.box.x*sx,y:icon.box.y*sy,w:icon.box.w*sx,h:icon.box.h*sy}}));
}
module.exports={materializeReviewedSceneGraphics,mapReviewedSceneGraphics,unresolvedReviewedGraphicCount,withReviewedGraphicEvidence};
