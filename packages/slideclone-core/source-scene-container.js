// @ts-check
"use strict";
const {sampleAtomInteriorFill,sampleAtomInteriorFillSeeds}=require("./visual-atom-interior-fill");
const {measureSceneFillWindow,probeSceneFillTolerance,sameSceneFillComponent}=require("./source-scene-fill-window");
const {withSceneFillRasterCache}=require("./source-scene-fill-raster-cache");
const {sceneFillGlyphBridge,stageSceneGlyphOwnership,commitSceneGlyphOwnership,sceneGlyphOcclusionMatches}=require("./source-scene-glyph-occlusion");
/** @typedef {NonNullable<ReturnType<typeof measureSceneFillWindow>["fit"]>} Fit */
/** @typedef {import("./source-scene-plan").Box} Box */
/** Source fill connectivity closes a container independently of its OCR or
 * model layout. A component touching the search boundary is never a panel.
 * @param {import("./png").PngImage} image @param {Box} hint @param {Box[]} textMasks
 * @param {{used:number}} budget @param {unknown} [glyphOcclusion] */
function measureSceneContainer(image,hint,textMasks,budget,glyphOcclusion) {
  return withSceneFillRasterCache(image,budget,()=>{
    if(glyphOcclusion!==undefined&&!sceneGlyphOcclusionMatches(glyphOcclusion,image,budget))return null;
    return measureContainer(image,hint,textMasks,budget,glyphOcclusion);
  });
}
/** @param {import("./png").PngImage} image @param {Box} hint @param {Box[]} textMasks @param {{used:number}} budget @param {unknown} glyphOcclusion */
function measureContainer(image,hint,textMasks,budget,glyphOcclusion){
  const sample=sampleAtomInteriorFill(image,hint,textMasks);
  const first=sample?stageSceneGlyphOwnership(glyphOcclusion,()=>measureSeed(image,hint,sample.color,budget,glyphOcclusion)):null;
  if(first?.value&&commitSceneGlyphOwnership(glyphOcclusion,first.receipt))return first.value;
  // Mixed content (labels and pictorial units) can invalidate whole-hint
  // uniformity while leaving a closed, connected background. Local samples
  // retain the same uniformity gate and propose colors only. Every proposal
  // still has to pass the original full component geometry and density gates.
  if(budget.used+2304>4000000)throw new RangeError("Scene container scan exceeds the pixel budget");
  budget.used+=2304;
  const seeds=sampleAtomInteriorFillSeeds(image,hint,textMasks,glyphOcclusion!==undefined);
  /** @type {{fit:Fit,score:number,receipt:unknown}[]} */const fits=[];
  for(const seed of seeds){
    if(seed.color===sample?.color)continue;
    const candidate=stageSceneGlyphOwnership(glyphOcclusion,()=>{
      if('maskedTileSeed' in seed&&seed.maskedTileSeed===true){
        const frame={x:Math.floor(hint.x),y:Math.floor(hint.y),w:Math.ceil(hint.x+hint.w)-Math.floor(hint.x),h:Math.ceil(hint.y+hint.h)-Math.floor(hint.y)};
        if(frame.w*frame.h>262144||!sceneFillGlyphBridge(glyphOcclusion,image,budget,frame,[1,3,5].map(offset=>Number.parseInt(seed.color.slice(offset,offset+2),16))).size)return null;
      }
      return measureSeed(image,hint,seed.color,budget,glyphOcclusion);
    });
    const fit=candidate.value;if(!fit)continue;
    const intersection=Math.max(0,Math.min(fit.box.x+fit.box.w,hint.x+hint.w)-Math.max(fit.box.x,hint.x))
      *Math.max(0,Math.min(fit.box.y+fit.box.h,hint.y+hint.h)-Math.max(fit.box.y,hint.y));
    const score=intersection/(fit.box.w*fit.box.h+hint.w*hint.h-intersection);
    if(!fits.some(other=>sameSceneFillComponent(other.fit,fit)
      &&[1,3,5].every(offset=>Math.abs(Number.parseInt(other.fit.fill.slice(offset,offset+2),16)-Number.parseInt(fit.fill.slice(offset,offset+2),16))<=18)))fits.push({fit,score,receipt:candidate.receipt});
  }
  fits.sort((a,b)=>b.score-a.score);
  const best=fits[0];
  if(!best||fits[1]&&fits[1].score>=best.score*.9)return null;
  return commitSceneGlyphOwnership(glyphOcclusion,best.receipt)?best.fit:null;
}
/** @param {import("./png").PngImage} image @param {Box} hint @param {string} color @param {{used:number}} budget @param {unknown} glyphOcclusion */
function measureSeed(image,hint,color,budget,glyphOcclusion){
  const fill=[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
  const margin=Math.ceil(Math.min(64,Math.max(8,Math.min(hint.w,hint.h)*.2)));
  const primary=measureSceneFillWindow({image,hint,fill,color,budget,marginX:margin,marginY:margin,glyphOcclusion});
  if(primary.fit)return primary.fit;
  // The admitted body can be 1.35 times wider and 1.6 times taller. A window
  // based only on the shorter side can censor that body before closure is
  // tested. Retry within those same bounds; preserve successful measurements.
  const marginX=Math.max(margin,Math.ceil(Math.min(64,hint.w*.175)));
  const marginY=Math.max(margin,Math.ceil(Math.min(64,hint.h*.3)));
  if(marginX===margin&&marginY===margin)return null;
  const nextTolerance=probeSceneFillTolerance({image,hint,fill,color,budget,marginX,marginY});
  if(nextTolerance===null||!primary.canExpand&&primary.tolerance===nextTolerance)return null;
  return measureSceneFillWindow({image,hint,fill,color,budget,marginX,marginY,glyphOcclusion}).fit;
}
module.exports={measureSceneContainer};
