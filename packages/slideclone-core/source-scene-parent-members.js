// @ts-check
'use strict';
const {patternedSceneParentMembers,rebindPatternedSceneParentMembers}=require('./source-scene-patterned-output');
const {primitiveSceneParentMembers,rebindPrimitiveSceneParentMembers}=require('./source-scene-primitive-program');
/** Source-specific receipts supply whole parents to common label/icon assembly.
 * No serialized discriminator, group id or provider box chooses members.
 * @param {import('./png').PngImage} image @param {unknown} token @param {string} id
 * @param {import('./source-scene-complete-groups').Item[]} shapes
 * @returns {import('./source-scene-complete-groups').Item[]|null} */
function measuredSceneParentMembers(image,token,id,shapes){
 return patternedSceneParentMembers(image,token,id,shapes)??primitiveSceneParentMembers(image,token,id,shapes);
}
/** @param {import('./png').PngImage} image @param {unknown} token @param {string} id
 * @param {import('./source-scene-complete-groups').Item[]} before @param {import('./source-scene-complete-groups').Item[]} after */
function rebindMeasuredSceneParentMembers(image,token,id,before,after){
 return rebindPatternedSceneParentMembers(image,token,id,before,after)||rebindPrimitiveSceneParentMembers(image,token,id,before,after);
}
module.exports={measuredSceneParentMembers,rebindMeasuredSceneParentMembers};
