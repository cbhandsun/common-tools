// @ts-check
'use strict';
const {pathPoints,orderedScenePathsMatch}=require('./source-scene-path-distance');
/** Reachability in the convex free-space cells of two ordered polylines
 * (continuous Frechet decision). The original 1.5px identity tolerance is
 * unchanged. Redundant collinear vertices cannot force correspondence between
 * unrelated corners. Both endpoints and monotone traversal are mandatory.
 * At most 225 cells / 900 bounded interval calculations; no resampling, source
 * searches, averaging or provider calls.
 * @param {unknown} first @param {unknown} second */
function scenePathPolylinesAgree(first,second){
 if(!pathPoints(first,16)||!pathPoints(second,16))throw new TypeError('Scene path consensus vertices are invalid');
 return orderedScenePathsMatch(first,second,{checks:0});
}
module.exports={scenePathPolylinesAgree};
