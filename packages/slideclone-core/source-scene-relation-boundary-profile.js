// @ts-check
'use strict';
const {measuredScenePortPerimeterCells}=require('./source-scene-port-evidence');
const {sourceShaftProfile}=require('./source-shaft-profile');
/** A native stroke can extend into the gap beyond its centerline box. Retry
 * only a failed shaft profile, excluding exactly those privately observed
 * endpoint cells. Keep all original shaft/head/attachment/ownership gates.
 * Background is re-observed from at least two unowned original corners;
 * endpoint ink must not turn the white corridor into a gray background.
 * @param {Parameters<typeof import('./source-scene-relation').measureSceneRelationDetailed>[0]} input
 * @param {import('./source-scene-plan').Box} window
 * @param {Parameters<typeof sourceShaftProfile>[0]} profile */
function sceneRelationBoundaryProfile(input,window,profile){
 const bodyPixels=new Set([...measuredScenePortPerimeterCells(input.image,input.from.portFrame,input.from.box,window),
  ...measuredScenePortPerimeterCells(input.image,input.to.portFrame,input.to.box,window)]);
 if(!bodyPixels.size)return null;
 const corners=[[0,0],[profile.image.width-1,0],[0,profile.image.height-1],[profile.image.width-1,profile.image.height-1]];
 const colors=corners.flatMap(p=>{const x=p[0],y=p[1];if(x===undefined||y===undefined)return [];
  const cell=y*profile.image.width+x,i=cell*4;
  if(bodyPixels.has(cell)||(profile.image.rgba[i+3]??0)<240)return [];
  return [[profile.image.rgba[i]??0,profile.image.rgba[i+1]??0,profile.image.rgba[i+2]??0]];});
 if(colors.length<2)return null;
 const background=[0,1,2].map(c=>{const values=colors.map(p=>p[c]??0).sort((a,b)=>a-b);
  return ((values[Math.floor((values.length-1)/2)]??0)+(values[Math.floor(values.length/2)]??0))/2;});
 return sourceShaftProfile({...profile,background,bodyPixels});
}
module.exports={sceneRelationBoundaryProfile};
