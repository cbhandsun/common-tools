// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {parsePrimitiveCandidate,constructPrimitiveCandidate}=require('./source-scene-primitive-candidate');
const {surfacePathsSchema}=require('./source-scene-surface-paths');
/** @typedef {{kind:import('./source-scene-primitive-candidate').Kind,capRatio:number,radiusRatio:number,seams:number[],corners:import('./source-scene-primitive-candidate').Point[]|null,paths?:import('./source-scene-surface-paths').SurfacePath[]}} NativeGeometry */
/** Geometry is an executable proposal. It contains no source paint, labels,
 * permissions or hidden objects. Use the same constructor parser for the wire
 * boundary and execution, so accepted fields cannot silently disappear.
 * @param {unknown} value @returns {NativeGeometry|undefined} */
function parseSceneNativeGeometry(value){
 if(value===undefined)return undefined;
 if(!record(value)||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!['kind','capRatio','radiusRatio','seams','corners','paths'].includes(k)))
  throw new TypeError('Scene native geometry is invalid');
 try{
  const r=parsePrimitiveCandidate({id:'native-proposal',box:{x:0,y:0,w:64,h:64},fill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1,...value});
  return {kind:r.kind,capRatio:r.capRatio,radiusRatio:r.radiusRatio,seams:r.seams,corners:r.corners,...(r.paths?{paths:r.paths}:{})};
 }catch(error){
  if(!(error instanceof TypeError&&/^Native (?:primitive|surface) /u.test(error.message)))throw error;
  throw new TypeError('Scene native geometry is invalid',{cause:error});
 }
}
/** Bound numeric transport shares the original object row and proposal slot.
 * [kind,capRatio?,radiusRatio?,seams?,corners?]; null leaves a default. No IDs,
 * text, paint, source coordinates or executable code are accepted here.
 * @param {unknown} value @returns {Record<string,unknown>|undefined} */
function expandSceneNativeGeometry(value){
 if(value===undefined||value===null)return undefined;
 if(!list(value)||value.length<1||value.length>6)return {kind:'invalid-native-geometry'};
 const kinds=['ellipse','roundRect','quad','cylinder','handFrame','pathSurface','openPaths'];
 const kind=typeof value[0]==='number'&&Number.isSafeInteger(value[0])?kinds[value[0]]:undefined;
 const fields=['capRatio','radiusRatio','seams','corners','paths'];
 const result={kind:kind??'invalid-native-geometry'};
 for(const [i,field]of fields.entries())if(value[i+1]!==undefined&&value[i+1]!==null)
  Object.assign(result,{[field]:value[i+1]});
 // Corner coordinates are dimensionless [x,y] pairs within this object.
 if(result&&'corners' in result&&list(result.corners))Object.assign(result,{corners:result.corners.map(p=>
  list(p)&&p.length===2?{x:p[0],y:p[1]}:p)});
 return result;
}
/** @param {unknown} first @param {unknown} second */
function sameSceneNativeGeometry(first,second){
 const a=parseSceneNativeGeometry(first),b=parseSceneNativeGeometry(second);
 return JSON.stringify(a)===JSON.stringify(b);
}
/** Build all native faces in one transaction before any source detector has
 * succeeded. Source admission and whole-unit assembly remain separate steps.
 * @param {{id:string,box:import('./source-scene-plan').Box,nativeGeometry?:NativeGeometry}} object
 * @param {{widthPx:number,heightPx:number,widthPt:number,heightPt:number}} frame */
function constructSceneNativeGeometry(object,frame){
 const geometry=parseSceneNativeGeometry(object.nativeGeometry);
 if(!geometry)return null;
 return constructPrimitiveCandidate({id:'scene-container-'+object.id,box:object.box,...geometry,
  fill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1},frame);
}
/** The keyed local protocol proposes the same executable geometry, never a
 * second object/permission channel. Nullable optional parameters mean defaults. */
function sceneNativeGeometrySchema(){
 return {type:['object','null'],additionalProperties:false,required:['kind','capRatio','radiusRatio','seams','corners','paths'],properties:{
  // Transparent owners use their complete source/member transaction; these
  // paths never pass the closed-body verifier or authorize physical ports.
  kind:{type:'string',enum:['ellipse','roundRect','quad','cylinder','handFrame','pathSurface','openPaths']},paths:surfacePathsSchema(),
  capRatio:{type:['number','null'],minimum:0,maximum:.5},radiusRatio:{type:['number','null'],minimum:0,maximum:.5},
  seams:{type:['array','null'],maxItems:15,items:{type:'number',minimum:0,maximum:1}},
  corners:{type:['array','null'],minItems:4,maxItems:4,items:{type:'object',additionalProperties:false,required:['x','y'],properties:{
   x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}}}}}};
}
module.exports={parseSceneNativeGeometry,expandSceneNativeGeometry,sameSceneNativeGeometry,constructSceneNativeGeometry,sceneNativeGeometrySchema};
