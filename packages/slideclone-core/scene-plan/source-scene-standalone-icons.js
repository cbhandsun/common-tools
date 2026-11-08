// @ts-check
'use strict';
const {sceneNativeIconBinding}=require('./source-scene-native-icon');
const {sealMeasuredSceneGroups}=require('./source-scene-group-retention');
/** Preserve the complete group already emitted by source recovery. This does
 * not infer a physical parent, grant ports, add labels or regroup fragments.
 * Only the original private source receipt can nominate the actual members;
 * the shared final retention check still proves membership and paint order.
 * @param {import('../png').PngImage} image @param {unknown[]} nativeIcons
 * @param {Parameters<typeof sealMeasuredSceneGroups>[0]} page @param {number} checks */
function sealStandaloneSceneIcons(image,nativeIcons,page,checks){
 const groups=nativeIcons.flatMap(receipt=>{
  const binding=sceneNativeIconBinding(image,receipt);
  if(!binding||binding.parentObjectId||!binding.parts.length||binding.parts.length>32)return [];
  const id='scene-icon-'+binding.id;
  if(binding.parts.some(part=>part.source?.nativeComponentGroupId!==id))return [];
  return [{id,members:binding.parts}];
 });
 return sealMeasuredSceneGroups(page,groups,checks);
}
module.exports={sealStandaloneSceneIcons};
