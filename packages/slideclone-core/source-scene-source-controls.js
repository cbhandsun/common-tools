// @ts-check
"use strict";
const {createSceneTextMeasurementCache}=require('./source-scene-measurement-cache');
const {prepareSceneSurfacePortfolio,readSceneSurfaceSelection}=require('./source-scene-surface-portfolio');
const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence,sceneGlyphOcclusionScanReserve}=require('./source-scene-glyph-occlusion');
/** Prepare the existing source controls in their original order and shared
 * budget. Preflight never acquires glyph ownership. Output typography and
 * pending regional styles do not participate in this source observation.
 * @param {import('./png').PngImage} image
 * @param {Parameters<typeof createSceneTextMeasurementCache>[1]} texts
 * @param {{widthPt:number,heightPt:number}} slideSize
 * @param {{used:number}} budget @param {boolean} preflight @param {boolean} [spatialExterior] */
function prepareSceneSourceMeasurements(image,texts,slideSize,budget,preflight,spatialExterior=false){
 if(typeof preflight!=='boolean')throw new TypeError('Scene preflight controls are invalid');
 const glyphOcclusion=preflight?undefined:createSceneGlyphOcclusion(image,texts,slideSize,budget);
 return {glyphOcclusion,...createSceneTextMeasurementCache(image,texts,slideSize,budget,glyphOcclusion,spatialExterior)};
}
module.exports={prepareSceneSourceMeasurements,prepareSceneSurfacePortfolio,readSceneSurfaceSelection,sceneGlyphOcclusionEvidence,sceneGlyphOcclusionScanReserve};
