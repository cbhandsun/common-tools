// @ts-check
'use strict';
const {measureSceneIcon,measureSceneIconDetailed}=require('./source-scene-icon');
const {discoverSceneInteriorForeground}=require('./source-scene-interior-discovery');
/** Keep source-driven candidate geometry and actual isolation separate.
 * At most two bounded isolation attempts belong to this one parent target.
 * Neither discovery nor a failed attempt increases target/part capacity.
 * @param {Parameters<typeof measureSceneIcon>[0]} request
 * @param {{textMasks:import('./source-scene-plan').Box[],sourceDriven:boolean,
 * legacySeed?:import('./source-scene-plan').Box,recoverSource?:(seed:import('./source-scene-plan').Box,parent:import('./source-scene-plan').Box)=>{glyphOcclusion?:unknown,backdrop?:unknown}}} options */
function measureSceneInterior(request,{textMasks,sourceDriven,legacySeed,recoverSource}){
 if(typeof sourceDriven!=='boolean'||recoverSource!==undefined&&typeof recoverSource!=='function')throw new TypeError('Scene interior measurement controls are invalid');
 if(!recoverSource||!sourceDriven)return measureSceneIcon(request);
 const parent=/** @type {import('./source-scene-plan').Box} */(request.searchBox);
 const controls=recoverSource(request.box,parent);
 const discovered=sourceDriven?discoverSceneInteriorForeground({image:request.image,box:parent,textMasks,budget:request.budget,...controls}):null;
 const first=measureSceneIconDetailed({...request,...controls,...(discovered?{box:discovered.seed}:{})});
 if(first.measurement||!sourceDriven||!legacySeed)return first.measurement;
 // Preserve the old finite candidate when source discovery cannot isolate a
 // complete picture. This still rechecks the original full-parent pixels.
 return measureSceneIconDetailed({...request,...controls,box:legacySeed}).measurement;
}
module.exports={measureSceneInterior};
