// @ts-check
"use strict";
const {compileExistingSceneVisibleGaps}=require('./source-scene-visible-gap-stage');
const {compileExistingSceneRoutes}=require('./source-scene-route-stage');
const {compileExistingSceneCaptionRoutes}=require('./source-scene-caption-route-stage');
const {compileJointIconGaps}=require('./source-scene-icon-joint-relations');
const {replaceMeasuredSceneConnectors}=require('./source-scene-replaced-connectors');
/** Both representations share the same source budget, identities and failed
 * straight-shaft inventory. A successful visible gap is not probed again as
 * a route. Optional region paint must still run after these measurements.
 * @param {Parameters<typeof compileExistingSceneVisibleGaps>[0]&{glyphOcclusion?:unknown,icons?:unknown[]}} request */
function compileSceneRelationFallbacks(request){
 const gaps=compileExistingSceneVisibleGaps(request);
 const sourceGaps=compileExistingSceneVisibleGaps({...request,sourceInk:true,unresolved:gaps.unresolved});
 const iconGaps=compileJointIconGaps({...request,sourceInk:true,unresolved:sourceGaps.unresolved},request.icons??[]);
 const routes=compileExistingSceneRoutes({...request,unresolved:sourceGaps.unresolved.filter(r=>!iconGaps.resolved.has(r.id))});
 const captions=compileExistingSceneCaptionRoutes({...request,unresolved:routes.unresolved});
 return {parts:[...gaps.parts,...sourceGaps.parts,...iconGaps.parts,...routes.parts,...captions.parts],resolvedIds:new Set([...gaps.resolved,...sourceGaps.resolved,...iconGaps.resolved,...routes.resolved,...captions.resolved]),resolvedRelations:gaps.resolved.size+sourceGaps.resolved.size+iconGaps.resolved.size+routes.resolved.size+captions.resolved.size,unresolved:captions.unresolved,
  evidence:{sourceVisibleGaps:gaps.resolved.size+sourceGaps.resolved.size,sourceVisibleGapRejected:sourceGaps.rejected,sourceVisibleGapRepaired:[...gaps.repaired,...sourceGaps.repaired],
   sourceIconEndpointGaps:iconGaps.resolved.size,sourceIconEndpointRejected:iconGaps.rejected,
   sourceRoutes:routes.resolved.size,sourceRouteParts:routes.parts.length,sourceRouteRejected:routes.rejected,
   sourceCaptionRoutes:captions.resolved.size,sourceCaptionRouteRejected:captions.rejected}};
}
module.exports={compileSceneRelationFallbacks,replaceMeasuredSceneConnectors};
