// @ts-check
"use strict";
const {types}=require("node:util");
const {sceneNativeGeometrySchema}=require('./source-scene-native-geometry');
const {parseSceneProgramBindings,sceneProgramSchema}=require('./source-scene-program-contract');
const {parseSceneEdgeBindings,sceneEdgeChoiceSchema,decodeSceneEdgeChoice}=require('./source-scene-edge-choice-contract');
/** @typedef {{reviews:number[],missing:number[],structures?:number[],inventories?:number[],relations?:number[],relationLocalizationIndices?:number[],relationPathIndices?:number[],relationEdgePaths?:Record<string,import('./source-scene-edge-choice-contract').EdgeBinding>,regionInventories?:number[],regionObjectCapacity?:number,regionRelationCapacity?:number,regionEndpointIds?:Record<string,string[]>,regionBoundaryIndices?:number[],regionProgramBindings?:Record<string,import('./source-scene-program-contract').ProgramBinding>}} LocalTargets */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @param {unknown} v @returns {number[]} */
function indices(v){
 if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>32
  ||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!("value" in p)))throw new TypeError("Scene local targets are invalid");
 const seen=new Set();
 return v.map(n=>{if(typeof n!=="number"||!Number.isSafeInteger(n)||n<0||n>=544||seen.has(n))throw new TypeError("Scene local targets are invalid");seen.add(n);return n;});
}
/** These immutable references reuse existing scene objects. They are never
 * additional object slots or provider-selected IDs.
 * @param {unknown} value @param {number[]} regions @returns {Record<string,string[]>} */
function endpointIds(value,regions){
 if(!record(value)||Object.keys(value).length!==regions.length||Object.keys(value).some(k=>!regions.some(n=>String(n)===k)))throw new TypeError('Scene regional endpoint bindings are invalid');
 const seen=new Set();
 return Object.fromEntries(regions.map(index=>{
  const ids=value[String(index)];
  if(!Array.isArray(ids)||types.isProxy(ids)||Object.getPrototypeOf(ids)!==Array.prototype||ids.length>64
   ||Reflect.ownKeys(ids).length!==ids.length+1||Object.values(Object.getOwnPropertyDescriptors(ids)).some(p=>!('value' in p)))throw new TypeError('Scene regional endpoint bindings are invalid');
  return [String(index),ids.map(id=>{
   if(typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id)||seen.has(id))throw new TypeError('Scene regional endpoint identity is invalid');
   seen.add(id);return id;
  })];
 }));
}
/** @param {unknown} v @returns {LocalTargets} */
function parseLocalTargets(v){
 if(!record(v)||Object.keys(v).some(k=>!['reviews','missing','structures','inventories','relations','relationLocalizationIndices','relationPathIndices','relationEdgePaths','regionInventories','regionObjectCapacity','regionRelationCapacity','regionEndpointIds','regionBoundaryIndices','regionProgramBindings'].includes(k)))throw new TypeError("Scene local targets are invalid");
 const reviews=indices(v.reviews),missing=indices(v.missing);
 const structures=Object.hasOwn(v,'structures')?indices(v.structures):[];
 const inventories=Object.hasOwn(v,'inventories')?indices(v.inventories):[];
 const relations=Object.hasOwn(v,'relations')?indices(v.relations):[];
 if(relations.length>24)throw new TypeError('Scene local relation capacity is invalid');
 const localizations=Object.hasOwn(v,'relationLocalizationIndices')?indices(v.relationLocalizationIndices):undefined;
 if(localizations&&(!Object.hasOwn(v,'relations')||localizations.some(n=>!relations.includes(n))))throw new TypeError('Scene local relation localization binding is invalid');
 const paths=Object.hasOwn(v,'relationPathIndices')?indices(v.relationPathIndices):undefined;
 if(paths&&(!Object.hasOwn(v,'relations')||paths.some(n=>!relations.includes(n)||localizations?.includes(n))))throw new TypeError('Scene local relation path binding is invalid');
 const edgePaths=Object.hasOwn(v,'relationEdgePaths')?parseSceneEdgeBindings(v.relationEdgePaths,relations,[...(localizations??[]),...(paths??[])]):undefined;
 const regions=Object.hasOwn(v,'regionInventories')?indices(v.regionInventories):[];
 const regional=Object.hasOwn(v,'regionInventories');
 const boundaries=Object.hasOwn(v,'regionBoundaryIndices')?indices(v.regionBoundaryIndices):undefined;
 if(boundaries&&(!regional||boundaries.some(n=>!regions.includes(n))))throw new TypeError('Scene regional boundary bindings are invalid');
 const endpoints=Object.hasOwn(v,'regionEndpointIds')?endpointIds(v.regionEndpointIds,regions):undefined;
 const programs=Object.hasOwn(v,'regionProgramBindings')?parseSceneProgramBindings(v.regionProgramBindings,regions):undefined;
 if(programs&&!regional)throw new TypeError('Scene program bindings are invalid');
 const references=new Set([...(endpoints?Object.values(endpoints).flat():[]),...(programs?Object.values(programs).flatMap(p=>p.objects):[])]);
 /** @param {number} n */const programOnly=n=>programs?.[String(n)]?.allowNewMembers===false;
 if(regional?(typeof v.regionObjectCapacity!=='number'||typeof v.regionRelationCapacity!=='number'
  ||!Number.isSafeInteger(v.regionObjectCapacity)||!Number.isSafeInteger(v.regionRelationCapacity)||v.regionObjectCapacity<0||v.regionObjectCapacity>64
  ||v.regionRelationCapacity<0||v.regionRelationCapacity>24
  ||references.size+v.regionObjectCapacity>64
  ||(endpoints?regions.filter(n=>!boundaries?.includes(n)&&!programOnly(n)&&((endpoints[String(n)]?.length??0)<2||v.regionRelationCapacity===0)).length>v.regionObjectCapacity
   :regions.filter(n=>!boundaries?.includes(n)&&!programOnly(n)).length>v.regionObjectCapacity)):Object.hasOwn(v,'regionObjectCapacity')||Object.hasOwn(v,'regionRelationCapacity')||endpoints!==undefined)throw new TypeError('Scene regional capacities are invalid');
 const all=[...reviews,...missing,...structures,...inventories,...relations,...regions];
 if(all.length>32||new Set(all).size!==all.length)throw new TypeError("Scene local targets exceed shared capacity");
 return {reviews,missing,...(Object.hasOwn(v,'structures')?{structures}:{}),...(Object.hasOwn(v,'inventories')?{inventories}:{}),
  ...(Object.hasOwn(v,'relations')?{relations}:{}),...(localizations?{relationLocalizationIndices:localizations}:{}),...(paths?{relationPathIndices:paths}:{}),...(edgePaths?{relationEdgePaths:edgePaths}:{}),
  ...(regional?{regionInventories:regions,regionObjectCapacity:/** @type {number} */(v.regionObjectCapacity),regionRelationCapacity:/** @type {number} */(v.regionRelationCapacity),...(endpoints?{regionEndpointIds:endpoints}:{}),...(boundaries?{regionBoundaryIndices:boundaries}:{}),...(programs?{regionProgramBindings:programs}:{})}:{})};
}
/** @param {Record<string,unknown>} properties */
function objectSchema(properties){return {type:"object",properties,required:Object.keys(properties),additionalProperties:false};}
/** Exact keyed targets prevent duplicate indices, missing reviews and unsolicited
 * observations at generation time. Source geometry still undergoes independent
 * admission after decoding; this schema grants no pixel or text ownership.
 * @param {LocalTargets} targets */
function localResponseFormat(targets){
 const admitted=parseLocalTargets(targets);
 const review={type:"string",enum:["text","graphic","mixed","uncertain"]};
 const glyph=objectSchema({text:{type:["string","null"]},confidence:{type:"number",minimum:0,maximum:1},
  box_2d:{type:["array","null"],items:{type:"integer",minimum:0,maximum:1000},minItems:4,maxItems:4},color:{type:["string","null"]}});
 const structure=objectSchema({kind:{type:'string',enum:['container','icon','unknown']},confidence:{type:'number',minimum:0,maximum:1},
  regionId:{type:['string','null']},box_2d:{type:['array','null'],items:{type:'integer',minimum:0,maximum:1000},minItems:4,maxItems:4},nativeGeometry:sceneNativeGeometrySchema()});
 const relation=objectSchema({fromId:{type:['string','null']},toId:{type:['string','null']},
  direction:{type:'string',enum:['forward','backward','both','unknown','undirected']},confidence:{type:'number',minimum:0,maximum:1}});
 const visiblePath={anyOf:[{type:'null'},objectSchema({kind:{type:'string',enum:['polyline']},dash:{type:'string',enum:['solid']},
  vertices:{type:'array',minItems:2,maxItems:16,items:objectSchema({x:{type:'integer',minimum:0,maximum:1000},y:{type:'integer',minimum:0,maximum:1000}})}})]};
 /** @param {number} n */
 const relationSchema=n=>{const edge=admitted.relationEdgePaths?.[String(n)];
  return admitted.relationLocalizationIndices?.includes(n)?objectSchema({...relation.properties,shaftBox_2d:structure.properties.box_2d,visibleMatches:{type:'integer',minimum:0,maximum:10000}})
   :edge?objectSchema({...relation.properties,sourceEdgePath:sceneEdgeChoiceSchema(edge)})
   :admitted.relationPathIndices?.includes(n)?objectSchema({...relation.properties,visiblePath_2d:visiblePath}):relation;};
 /** @param {number} index */
 const regional=index=>{
 const ids=admitted.regionEndpointIds?.[String(index)]??[],numeric={type:'integer',minimum:0,maximum:63};
  const binding=admitted.regionProgramBindings?.[String(index)],programOnly=binding?.allowNewMembers===false;
 const endpoint=ids.length?{anyOf:[numeric,{type:'string',enum:ids}]}:numeric;
  return objectSchema({units:{type:'array',maxItems:programOnly?0:admitted.regionObjectCapacity??0,items:objectSchema({
  kind:{type:'string',enum:['container','icon']},confidence:{type:'number',minimum:0,maximum:1},
   box_2d:{type:'array',items:{type:'integer',minimum:0,maximum:1000},minItems:4,maxItems:4},nativeGeometry:sceneNativeGeometrySchema()})},relations:{type:'array',maxItems:programOnly?0:admitted.regionRelationCapacity??0,
  items:objectSchema({from:endpoint,to:endpoint,direction:{type:'string',enum:['forward','backward','both','unknown','undirected']},
   shaftBox_2d:{type:['array','null'],items:{type:'integer',minimum:0,maximum:1000},minItems:4,maxItems:4}})},
   ...(binding?{program:sceneProgramSchema(binding,admitted.regionObjectCapacity??0,admitted.regionRelationCapacity??0)}:{}),
   ...(admitted.regionBoundaryIndices?.includes(index)?{boundary:objectSchema({confidence:{type:'number',minimum:0,maximum:1},
   box_2d:{type:['array','null'],items:{type:'integer',minimum:0,maximum:1000},minItems:4,maxItems:4}})}:{})});};
 return {type:"json_schema",json_schema:{name:"source_scene_local",strict:true,schema:objectSchema({
  reviewsByIndex:objectSchema(Object.fromEntries(admitted.reviews.map(n=>[String(n),review]))),
  recoveredByIndex:objectSchema(Object.fromEntries(admitted.missing.map(n=>[String(n),glyph]))),
  ...(admitted.structures?{structuresByIndex:objectSchema(Object.fromEntries(admitted.structures.map(n=>[String(n),structure])))}:{}),
  ...(admitted.inventories?{inventoriesByIndex:objectSchema(Object.fromEntries(admitted.inventories.map(n=>[String(n),
   objectSchema({kind:{type:'string',enum:['icon','unknown']},confidence:structure.properties.confidence,
    regionId:structure.properties.regionId,box_2d:structure.properties.box_2d})])))}:{}),
  ...(admitted.relations?{relationsByIndex:objectSchema(Object.fromEntries(admitted.relations.map(n=>[String(n),relationSchema(n)])))}:{}),
  ...(admitted.regionInventories?{regionInventoriesByIndex:objectSchema(Object.fromEntries(admitted.regionInventories.map(n=>[String(n),regional(n)])))}:{})})}};
}
/** @param {unknown} value @param {number[]} expected */
function exactMap(value,expected){
 if(!record(value)||Object.keys(value).length!==expected.length||Object.keys(value).some(k=>!expected.some(n=>String(n)===k)))
  throw new TypeError("Scene local response target binding is invalid");
 return value;
}
/** @param {unknown} response @param {LocalTargets} targets */
function decodeLocalResponse(response,targets){
 const admitted=parseLocalTargets(targets);
 if(!record(response)||Object.keys(response).length!==2+Number(!!admitted.structures)+Number(!!admitted.inventories)+Number(!!admitted.relations)+Number(!!admitted.regionInventories))throw new TypeError("Scene local response is invalid");
 const reviews=exactMap(response.reviewsByIndex,admitted.reviews),missing=exactMap(response.recoveredByIndex,admitted.missing);
 const structures=admitted.structures?exactMap(response.structuresByIndex,admitted.structures):undefined;
 const inventories=admitted.inventories?exactMap(response.inventoriesByIndex,admitted.inventories):undefined;
 const relations=admitted.relations?exactMap(response.relationsByIndex,admitted.relations):undefined;
 const regional=admitted.regionInventories?exactMap(response.regionInventoriesByIndex,admitted.regionInventories):undefined;
 return {reviews:admitted.reviews.map(index=>{
  const kind=reviews[String(index)];if(typeof kind!=="string"||!["text","graphic","mixed","uncertain"].includes(kind))throw new TypeError("Scene local review kind is invalid");
  return {index,kind};
 }),recoveredText:admitted.missing.map(index=>{
  const row=missing[String(index)];if(!record(row)||Object.keys(row).length!==4||!["text","confidence","box_2d","color"].every(k=>Object.hasOwn(row,k)))throw new TypeError("Scene local glyph record is invalid");
  return {index,text:row.text,confidence:row.confidence,...(row.box_2d!==null?{box_2d:row.box_2d}:{}),...(row.color!==null?{color:row.color}:{})};
 }),...(structures?{structures:(admitted.structures??[]).map(index=>{
  const row=structures[String(index)];if(!record(row)||Object.keys(row).length!==(Object.hasOwn(row,'nativeGeometry')?5:4)||!['kind','confidence','regionId','box_2d'].every(k=>Object.hasOwn(row,k)))throw new TypeError('Scene local structural record is invalid');
  return {index,kind:row.kind,confidence:row.confidence,regionId:row.regionId,box_2d:row.box_2d,...(Object.hasOwn(row,'nativeGeometry')?{nativeGeometry:row.nativeGeometry}:{})};
 })}:{}),...(inventories?{inventories:(admitted.inventories??[]).map(index=>{
  const row=inventories[String(index)];if(!record(row)||Object.keys(row).length!==4||!['kind','confidence','regionId','box_2d'].every(k=>Object.hasOwn(row,k)))throw new TypeError('Scene local inventory record is invalid');
  return {index,kind:row.kind,confidence:row.confidence,regionId:row.regionId,box_2d:row.box_2d};
 })}:{}),...(relations?{relations:(admitted.relations??[]).map(index=>{
  const row=relations[String(index)],localization=admitted.relationLocalizationIndices?.includes(index),path=admitted.relationPathIndices?.includes(index),edge=admitted.relationEdgePaths?.[String(index)];
  if(!record(row)||Object.keys(row).length!==4+Number(!!localization)*2+Number(!!path)+Number(!!edge)||!['fromId','toId','direction','confidence',...(localization?['shaftBox_2d','visibleMatches']:[]),...(path?['visiblePath_2d']:[]),...(edge?['sourceEdgePath']:[])].every(k=>Object.hasOwn(row,k)))throw new TypeError('Scene local relation record is invalid');
  return {index,fromId:row.fromId,toId:row.toId,direction:row.direction,confidence:row.confidence,...(localization?{shaftBox_2d:row.shaftBox_2d,visibleMatches:row.visibleMatches}:{}),...(path?{visiblePath_2d:row.visiblePath_2d}:{}),...(edge?{sourceEdgePath:decodeSceneEdgeChoice(row.sourceEdgePath,edge)}:{})};
 })}:{}),...(regional?{regionInventories:(admitted.regionInventories??[]).map(index=>{
   const row=regional[String(index)],boundary=admitted.regionBoundaryIndices?.includes(index),program=admitted.regionProgramBindings?.[String(index)];
   if(!record(row)||Object.keys(row).length!==2+Number(!!boundary)+Number(!!program)||!Object.hasOwn(row,'units')||!Object.hasOwn(row,'relations')
    ||boundary&&!Object.hasOwn(row,'boundary')||program&&!Object.hasOwn(row,'program'))throw new TypeError('Scene regional record is invalid');
   return {index,units:row.units,relations:row.relations,...(boundary?{boundary:row.boundary}:{}),...(program?{program:row.program}:{})};
 })}:{})};
}
/** Keep source instructions, schema and the final transport instructions on
 * the same admitted per-index shape. An optional boundary on the request is
 * mandatory only on that index's response; empty evidence never omits it.
 * This changes no targets, model calls, capacity or acceptance predicate.
 * @param {unknown} value */
function sceneRegionalOutputPrompt(value){
 const targets=parseLocalTargets(value),regions=targets.regionInventories??[];
 if(!regions.length)return '';
 const fields=Object.fromEntries(regions.map(index=>[String(index),['units','relations',...(targets.regionBoundaryIndices?.includes(index)?['boundary']:[]),...(targets.regionProgramBindings?.[String(index)]?['program']:[])]]));
 return ` regionInventoriesByIndex MUST have EXACT keys ${JSON.stringify(regions.map(String))}. Required fields by index: ${JSON.stringify(fields)}. `
  +'Return only these per-index fields. '
  +(targets.regionBoundaryIndices?.length?'For requested boundaries return {confidence:number,box_2d:array|null}; for insufficient boundary evidence use confidence:0,box_2d:null. ':'')
   +(targets.regionProgramBindings?`For requested programs return null if incomplete or uncertain; otherwise {objects,relations,labels}. Include EVERY bound existing object/relation ID and every source label index, plus indices of ALL newly proposed units/relations owned by this region. labels is [{refs:[original OCR indices],family:string|null,weight:regular|bold|null,sizePt:number|null,role:string|null}]. Each source label is referenced exactly once. Do not substitute an empty program for unknown evidence. allowNewMembers:false requires EMPTY units and relations arrays; the program still references existing members. Exact source-bound program references: ${JSON.stringify(targets.regionProgramBindings)}. `:'')
  +`Combined units <=${targets.regionObjectCapacity}, combined relations <=${targets.regionRelationCapacity}. No omissions or extra entries.`;
}
/** Keep ordinary endpoint reviews on the legacy four-field contract. A
 * localization is an explicit per-index variant, not a new target or budget.
 * @param {unknown} value */
function sceneRelationOutputPrompt(value){
 const targets=parseLocalTargets(value),relations=targets.relations??[];if(!relations.length)return '';
 return ` relationsByIndex MUST have EXACT keys ${JSON.stringify(relations.map(String))}. Ordinary entries are {fromId,toId,direction,confidence}, with exact transmitted endpoint IDs and direction forward/backward/both/unknown/undirected. `
  +(targets.relationLocalizationIndices?.length?`ONLY localization indices ${JSON.stringify(targets.relationLocalizationIndices.map(String))} MUST additionally include shaftBox_2d and visibleMatches. Independently locate the COMPLETE visible shaft and arrowheads inside this original target crop; shaftBox_2d is exactly four integers [ymin,xmin,ymax,xmax] in the FIRST atlas frame, or null. visibleMatches counts ALL physical connectors matching the bound endpoint pair and direction in the complete owner view, including parallel connectors. Use a location only for exactly one match. Never guess a missing coordinate or assign parallel connectors by reading order. For ambiguous or absent evidence return null,null,unknown,0,null,0 in these six fields. `:'')
  +(targets.relationPathIndices?.length?`ONLY path indices ${JSON.stringify(targets.relationPathIndices.map(String))} MUST additionally include visiblePath_2d, either null or {kind:"polyline",dash:"solid",vertices:[{x,y},...]}, 2-16 ordered vertices with integer x,y in 0-1000 in the FIRST atlas frame. Follow the COMPLETE independently visible source shaft from the unchanged fromId to toId, including every turn and curved transition; keep the bound direction, owner and source anchor. Do not choose a cycle arm by traversal order, infer a missing segment, or copy a prior proposal. Decline when a complete path cannot be represented within 16 vertices. For uncertainty return null,null,unknown,0,null. `:'')
  +(targets.relationEdgePaths&&Object.keys(targets.relationEdgePaths).length?`ONLY edge-choice indices ${JSON.stringify(Object.keys(targets.relationEdgePaths))} additionally require sourceEdgePath:null|[{id,reversed},...], 1-15 unique bound edge IDs in complete fromId-toId order. Follow actual source turns and preserve endpoints/direction/anchor; never choose by list order. For uncertainty return null,null,unknown,0,null. `:'')
  +'Undirected requires a complete visible connector without arrowheads. Use null,null,unknown,0 for insufficient ordinary reference evidence. No omissions or extra fields. These proposals grant no source pixels or completion.';
}
module.exports={parseLocalTargets,localResponseFormat,decodeLocalResponse,sceneRegionalOutputPrompt,sceneRelationOutputPrompt};
