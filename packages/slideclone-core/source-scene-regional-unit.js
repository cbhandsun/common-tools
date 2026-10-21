// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {readStructuralObservations}=require('./source-scene-structural-review');
const {containsSceneBox}=require('./source-scene-plan');
/** A malformed ordinary geometry proposal has no source authority, but retains
 * its position and charge. Never guess coordinate order or abort independent
 * units. Unsafe containers, control fields and broken source mappings remain
 * boundary failures. Admission still requires both views and source evidence.
 * @param {unknown} unit
 * @param {{index:number,regionId:string,box:import('./source-scene-plan').Box}} target
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame */
function readSceneRegionalUnit(unit,target,frame){
 if(!record(unit)||Object.keys(unit).length!==(Object.hasOwn(unit,'nativeGeometry')?4:3)||!['kind','confidence','box_2d'].every(k=>Object.hasOwn(unit,k))
  ||typeof unit.kind!=='string'||!['container','icon'].includes(unit.kind)
  ||typeof unit.confidence!=='number'||!Number.isFinite(unit.confidence)||unit.confidence<0||unit.confidence>1)
  throw new TypeError('Scene regional unit is invalid');
 const geometry=unit.box_2d;
 if(geometry!==null){
  if(!record(frame)||!list(frame.sourceTargets)||!list(frame.sheetTargets)
   ||frame.sourceTargets.length>32||frame.sheetTargets.length>32
   ||[...frame.sourceTargets,...frame.sheetTargets].some(row=>!record(row))
   ||frame.sourceTargets.filter(row=>row.index===target.index).length!==1
   ||frame.sheetTargets.filter(row=>row.index===target.index).length!==1)
   throw new TypeError('Scene regional source mapping is invalid');
  if(!list(geometry)||geometry.length>4)throw new TypeError('Scene regional unit coordinates are invalid');
  if(geometry.length!==4||geometry.some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>1000)
   ||Number(geometry[0])>=Number(geometry[2])||Number(geometry[1])>=Number(geometry[3]))
   return {index:target.index,kind:unit.kind,confidence:unit.confidence,regionId:target.regionId,box:null,rejection:'unit-coordinates'};
 }
 const observation=readStructuralObservations({structures:[{index:target.index,kind:unit.kind,confidence:unit.confidence,regionId:target.regionId,box_2d:geometry,
  ...(Object.hasOwn(unit,'nativeGeometry')?{nativeGeometry:unit.nativeGeometry}:{})}]},
  [{...target,objectId:target.regionId}],frame)[0];
 if(!observation)throw new TypeError('Scene regional unit is invalid');
 return {...observation,...(!observation.box||!containsSceneBox(target.box,observation.box)?{rejection:'region-window'}:{})};
}
module.exports={readSceneRegionalUnit};
