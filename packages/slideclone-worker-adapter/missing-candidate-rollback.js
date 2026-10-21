// @ts-check
"use strict";
const {types,isDeepStrictEqual}=require("node:util");
const {validateDeckIrTree}=require("../slideclone-core/deck-ir-tree");
const {missingReferenceRegions}=require("./missing-component-regression");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
  &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @param {number} limit @returns {unknown[]} */
function array(value,limit){
  if(!Array.isArray(value)||types.isProxy(value)||value.length>limit||Object.getPrototypeOf(value)!==Array.prototype
    ||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))throw new TypeError("Invalid missing rollback collection");
  return value;
}
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {Box} */
function box(value){
  if(!record(value)||typeof value.x!=="number"||typeof value.y!=="number"||typeof value.w!=="number"||typeof value.h!=="number"
    ||![value.x,value.y,value.w,value.h].every(Number.isFinite)||value.x<0||value.y<0||value.w<0||value.h<0||value.w+value.h<=0
    ||value.x+value.w>100000||value.y+value.h>100000)throw new TypeError("Invalid missing rollback geometry");
  return {x:value.x,y:value.y,w:value.w,h:value.h};
}
/** @param {Box} a @param {Box} b */
function overlaps(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}
/** @param {unknown} values */
function shapes(values){
  /** @type {Map<string,Record<string,unknown>>} */const result=new Map();
  for(const item of array(values,10000)){
    if(!record(item)||typeof item.id!=="string"||!item.id||item.id.length>256||result.has(item.id))throw new TypeError("Ambiguous missing rollback object");
    result.set(item.id,item);
  }return result;
}
/** Revert only additive source-backed operations covering regressed fixed ROIs.
 * Output must be rebuilt and reverified; rank IDs never identify a rendered region.
 * @param {unknown} input */
function rollbackRegressedMissingAdditions(input){
  if(!record(input)||!record(input.baselineDeck)||!record(input.candidateDeck)||!record(input.baselineQuality)||!record(input.candidateQuality))throw new TypeError("Invalid missing rollback input");
  validateDeckIrTree(input.baselineDeck,16000000);validateDeckIrTree(input.candidateDeck,16000000);
  const originals=array(input.baselineDeck.pages,50),candidates=array(input.candidateDeck.pages,50);
  if(!originals.length||originals.length!==candidates.length)throw new TypeError("Invalid missing rollback pages");
  const rows=array(input.baselineQuality.componentWorst,20000);
  for(const row of rows)if(!record(row)||(row.box!==undefined&&!record(row.box))||(row.source!==undefined&&!record(row.source)))throw new TypeError("Invalid missing rollback reference");
  for(const row of array(input.candidateQuality.componentReferenceMetrics,80))if(!record(row)||!record(row.box))throw new TypeError("Invalid missing rollback reference");
  const before=missingReferenceRegions({componentWorst:rows}),after=missingReferenceRegions(input.candidateQuality);
  if(before.length!==after.length)throw new TypeError("Incomplete missing rollback evidence");
  const regressions=before.filter(region=>{
    if(region.pageIndex>=originals.length)throw new TypeError("Invalid missing rollback page");
    const matches=after.filter(row=>row.pageIndex===region.pageIndex&&isDeepStrictEqual(row.box,region.box));
    if(matches.length!==1||!matches[0])throw new TypeError("Ambiguous missing rollback reference");
    return matches[0].severity>region.severity+0.08;
  });
  let rolledBackShapes=0,retainedShapes=0;
  const pages=candidates.map((page,pageIndex)=>{
    const baseline=originals[pageIndex];
    if(!record(page)||!record(baseline))throw new TypeError("Invalid missing rollback page");
    const {shapes:originalShapes,...originalOther}=baseline,{shapes:candidateShapes,...candidateOther}=page;
    if(!isDeepStrictEqual(originalOther,candidateOther))throw new TypeError("Missing rollback changes non-shape content");
    const originalMap=shapes(originalShapes),candidateMap=shapes(candidateShapes);
    for(const [id,shape]of originalMap)if(!isDeepStrictEqual(shape,candidateMap.get(id)))throw new TypeError("Missing rollback changes existing objects");
    const added=[...candidateMap.values()].filter(item=>!originalMap.has(/** @type {string} */(item.id)));
    if(added.length>80)throw new RangeError("Missing rollback additions exceed boundary");
    const owned=added.map(shape=>{
      if(!record(shape.source)||typeof shape.source.detector!=="string"
        ||!(shape.source.detector.startsWith("missing-native-")
          ||(shape.source.detector==="visual-atom-native-team"&&typeof shape.id==="string"&&shape.id.startsWith("missing-native-visual-atom-"))))throw new TypeError("Unowned missing rollback addition");
      const ids=array(shape.source.sourceMissingNativeComponentIds === undefined
        ? [shape.source.missingNativeComponentId] : shape.source.sourceMissingNativeComponentIds,80);
      if(!ids.length||new Set(ids).size!==ids.length)throw new TypeError("Unowned missing rollback addition");
      for(const id of ids)if(typeof id!=="string"||!rows.some(row=>record(row)&&row.pageIndex===pageIndex&&row.id===id&&row.kind==="missing"))throw new TypeError("Stale missing rollback ownership");
      return {shape,ids,box:box(shape.box)};
    });
    const rejected=new Set(owned.filter(item=>regressions.some(row=>row.pageIndex===pageIndex&&overlaps(item.box,row.box))));
    let changed=true;
    while(changed){changed=false;for(const item of owned)if(!rejected.has(item)&&[...rejected].some(other=>overlaps(item.box,other.box)||item.ids.some(id=>other.ids.includes(id)))){rejected.add(item);changed=true;}}
    const rejectedIds=new Set([...rejected].map(item=>item.shape.id));
    rolledBackShapes+=rejected.size;retainedShapes+=owned.length-rejected.size;
    return {...page,shapes:[...candidateMap.values()].filter(shape=>!rejectedIds.has(shape.id))};
  });
  return {deck:{...input.candidateDeck,pages},rolledBackShapes,retainedShapes};
}
module.exports={rollbackRegressedMissingAdditions};
