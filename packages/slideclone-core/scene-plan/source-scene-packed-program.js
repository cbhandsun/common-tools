// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {expandCompactProgramScene}=require('./source-scene-compact-program');
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function collection(value,maximum){if(!list(value)||value.length>maximum)throw new TypeError('Scene packed collection is invalid');return value;}
/** @param {unknown} value @param {number} minimum @param {number} [maximum] @returns {value is unknown[]} */
function tuple(value,minimum,maximum=minimum){return list(value)&&value.length>=minimum&&value.length<=maximum;}
/** Lossless transport only. Positional IDs occupy fixed, disjoint namespaces;
 * rejected rows retain their positions and declared owners. This does not
 * create source ownership, erase rights, native members or extra batch slots.
 * @param {unknown} value @returns {Record<string,unknown>} */
function expandPackedProgramScene(value){
 if(!record(value)||value.format!=='packed-v1'||Reflect.ownKeys(value).some(k=>typeof k!=='string'
  ||!['format','regions','objects','relations','programs','relationObservationUnit'].includes(k))
  ||value.relationObservationUnit!==undefined&&value.relationObservationUnit!=='logical-relations-v1')throw new TypeError('Scene packed input is invalid');
 const rawRegions=collection(value.regions,24),rawPrograms=collection(value.programs,24);
 if(rawPrograms.length!==rawRegions.length)throw new TypeError('Scene packed program owners are incomplete');
 const regions=rawRegions.map((raw,id)=>{
  if(!tuple(raw,4,5)||!tuple(raw[3],3))throw new TypeError('Scene packed region is invalid');
  return [id,raw[0],raw[1],raw[2],...(raw.length===5?[raw[4]]:[])];
 });
 const inventory=rawRegions.map((raw,id)=>{
  if(!tuple(raw,4,5)||!tuple(raw[3],3))throw new TypeError('Scene packed region is invalid');return [id,...raw[3]];
 });
 const objects=collection(value.objects,64).map((raw,index)=>{
  const id=100+index;
  if(!tuple(raw,3,4))return list(raw)?[id,raw[0],null,null,null,null,null]:raw;
  const code=raw[1],valid=typeof code==='number'&&Number.isSafeInteger(code)&&code>=0&&code<=8;
  return [id,raw[0],valid?Math.floor(code/3):-1,raw[2],valid?code%3:-1,...(raw.length===4?[raw[3]]:[])];
 });
 const relations=collection(value.relations,24).map((raw,index)=>{
  const id=200+index;
  if(!tuple(raw,4,6))return list(raw)?[id,raw[0],null,null,null,null,null,null]:raw;
  return [id,raw[0],raw[1],raw[2],raw.length===4?0:raw[4],raw[3],...(raw.length===6?[raw[5]]:[])];
 });
 const programs=rawPrograms.map((styles,id)=>[id,list(styles)&&styles.length<=32?styles.map(style=>{
  if(!tuple(style,1,4))return style;
  return [style[0],style[2]??null,style[1]??null,style[3]??null];
 }):styles]);
 return expandCompactProgramScene({format:'compact-v8',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
  regions,inventory,objects,relations,programs,...(value.relationObservationUnit!==undefined?{relationObservationUnit:value.relationObservationUnit}:{})});
}
module.exports={expandPackedProgramScene};
