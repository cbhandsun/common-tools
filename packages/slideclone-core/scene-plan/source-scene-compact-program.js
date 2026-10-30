// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {expandSceneNativeGeometry}=require('./source-scene-native-geometry');
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function collection(value,maximum){
 if(!list(value)||value.length>maximum)throw new TypeError('Scene compact program collection is invalid');return value;
}
/** Defer a malformed independent unit to its ordinary strict admission. The
 * outer collections remain fatal when unsafe or over capacity.
 * @param {unknown} value @param {number} minimum @param {number} maximum @returns {value is unknown[]} */
function tuple(value,minimum,maximum=minimum){return list(value)&&value.length>=minimum&&value.length<=maximum;}
/** Invalid enums reach the ordinary unit admission boundary; never coerce an
 * object or accept a legacy enum string in this numeric transport.
 * @param {unknown} value @param {readonly string[]} values @returns {unknown} */
function enumeration(value,values){
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<values.length
  ?values[value]:'invalid-compact-enum';
}
/** Numeric and decimal-string IDs have the same existing strict identity.
 * This key only joins EXPLICIT owners, never geometry or inferred containment.
 * @param {unknown} value */
function ownerKey(value){
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=999999)return `n${value}`;
 if(typeof value==='string'&&/^[0-9]{1,6}$/u.test(value))return `n${Number(value)}`;
 return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value)?value:null;
}
/** Project ONLY explicit parent links into program membership. Source admission
 * still checks every ancestor's type, geometry and uniqueness. Keep malformed
 * child dependencies in the list so later rejection cannot complete a program.
 * @param {unknown[]} regions @param {unknown[]} objects */
function objectRegionOwners(regions,objects){
 const regionIds=new Set(regions.flatMap(r=>list(r)&&r.length>=1&&ownerKey(r[0])!==null?[ownerKey(r[0])]:[]));
 /** @type {Map<string,unknown[][]>} */const byId=new Map();
 for(const object of objects){
  if(!list(object)||object.length<2)continue;const id=ownerKey(object[0]);if(id===null)continue;
  const entries=byId.get(id)??[];entries.push(object);byId.set(id,entries);
 }
 /** @param {unknown} owner */
 return owner=>{
  let key=ownerKey(owner);const seen=new Set();
  for(let depth=0;depth<=objects.length;depth++){
   if(key===null||seen.has(key))return null;if(regionIds.has(key))return key;seen.add(key);
   const candidates=byId.get(key),parent=candidates?.length===1?candidates[0]:undefined;
   if(!parent||parent[2]!=='container')return null;key=ownerKey(parent[1]);
  }
  return null;
 };
}
/** Expand bounded transport into the existing v6 contract BEFORE admission.
 * Member lists come from every original explicitly owned proposal, including
 * proposals later rejected by the strict parser. Filtering first would hide
 * failed dependencies and falsely complete a program. No counts, source IDs,
 * geometry, routes, labels or budgets are derived or changed here.
 * @param {unknown} value @returns {Record<string,unknown>} */
function expandCompactProgramScene(value){
 if(!record(value)||value.format!=='compact-v8'
  ||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!['format','coordinateSpace','boxFormat','regions','inventory','objects','relations','programs','relationObservationUnit'].includes(k))
  ||value.relationObservationUnit!==undefined&&value.relationObservationUnit!=='logical-relations-v1')
  throw new TypeError('Scene compact program input is invalid');
 const regions=collection(value.regions,24).map(raw=>{
  if(!tuple(raw,4,5))return raw;return [raw[0],raw[1],enumeration(raw[2],['section','card','container','diagram','table','unknown']),raw[3],
   ...(raw.length===5?[expandSceneNativeGeometry(raw[4])]:[])];
 });
 const objects=collection(value.objects,64).map(raw=>{
  if(!tuple(raw,5,6))return raw;return [raw[0],raw[1],enumeration(raw[2],['container','icon','unknown']),raw[3],enumeration(raw[4],['absent','present','unknown']),...(raw.length===6?[expandSceneNativeGeometry(raw[5])]:[])];
 });
 const relations=collection(value.relations,24).map(raw=>{
  if(!tuple(raw,6,7))return raw;return [raw[0],raw[1],raw[2],raw[3],enumeration(raw[4],['forward','backward','both','unknown','undirected']),raw[5],raw.length===6?null:raw[6]];
 });
 const objectOwner=objectRegionOwners(regions,objects);
 const programs=collection(value.programs,24).map(raw=>{
  if(!tuple(raw,2))return raw;const owner=ownerKey(raw[0]);
  const labels=tuple(raw[1],0,32)?raw[1].map(style=>{
   if(!tuple(style,1,5))return style;
   return {refs:style[0],...(style[1]!==undefined&&style[1]!==null?{family:style[1]}:{}),
    ...(style[2]!==undefined&&style[2]!==null?{weight:enumeration(style[2],['regular','bold'])}:{}),
    ...(style[3]!==undefined&&style[3]!==null?{sizePt:style[3]}:{}),
    ...(style[4]!==undefined&&style[4]!==null?{role:enumeration(style[4],['title','heading','sectionHeading','body','caption','label','list','footnote'])}:{})};
  }):raw[1];
  const members=(/** @type {unknown[]} */ units,/** @type {(value:unknown)=>string|null} */ resolve)=>owner===null?[]:
   units.flatMap(unit=>list(unit)&&unit.length>=2&&resolve(unit[1])===owner?[unit[0]]:[]);
  return {regionId:raw[0],objects:members(objects,objectOwner),relations:members(relations,ownerKey),labels};
 });
 return {...value,format:'compact-v6',regions,objects,relations,programs};
}
module.exports={expandCompactProgramScene};
