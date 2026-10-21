// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {containsSceneBox}=require('./source-scene-plan');
const {sceneProgramTasks,sceneProgramTaskRevision}=require('./source-scene-program-tasks');
const {sceneLocalObjectCapacity,recordSceneLocalObjectBatch}=require('./source-scene-object-batches');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{index:number,sourceHash:string,revision:string,regionId:string,objectId:string,box:Box,iconIds:string[]}} Target */
/** @typedef {{kind:string,confidence:number,box:Box|null,rejected:boolean}} Unit */
/** @param {Box} a @param {Box} b */
function intersection(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
/** @param {Box} a @param {Box} b */
function iou(a,b){const area=intersection(a,b);return area/(a.w*a.h+b.w*b.h-area);}
/** An invalid seed cannot authorize a larger local crop. A separate complete
 * owner census can identify exactly one missing member by elimination, with
 * every other identity independently corroborated. Ambiguity grants nothing.
 * Reserve ALL census members from the existing local32 ledger, not just the
 * corrected object. Legacy plans acquire no implicit additional allowance.
 * @param {Plan|undefined} plan @returns {Target[]} */
function selectSceneOwnerRevisions(plan){
 if(plan===undefined)return [];
 sceneProgramTasks(plan,[]);
 const capacity=sceneLocalObjectCapacity(plan);
 if(!plan.objectBatches||!capacity||plan.observedInventory===undefined)return [];
 if(!list(plan.observedInventory)||plan.observedInventory.some(row=>!record(row)))throw new TypeError('Scene owner revision census is invalid');
 /** @type {Target[]} */const targets=[];let reserved=0;
 for(const region of plan.regions){
  const icons=plan.objects.filter(object=>object.regionId===region.id&&object.kind==='icon');
  const invalid=icons.filter(object=>!containsSceneBox(region.box,object.box));
  if(invalid.length!==1||!invalid[0]||icons.some(object=>object.parentObjectId!==undefined)
   ||region.box.w*region.box.h>262144||region.box.x+region.box.w>plan.widthPx||region.box.y+region.box.h>plan.heightPx
   ||plan.regions.some(child=>child.parentId===region.id))continue;
  const census=plan.observedInventory.filter(row=>row.regionId===region.id);
  if(census.length!==1||census[0]?.icons!==icons.length||icons.length>32||reserved+icons.length>capacity)continue;
  targets.push({index:targets.length,sourceHash:plan.sourceHash,revision:sceneProgramTaskRevision(plan,region.id),regionId:region.id,
   objectId:invalid[0].id,box:{...region.box},iconIds:icons.map(object=>object.id)});reserved+=icons.length;
 }
 return targets;
}
/** Validate persisted internal bindings before reading any observation.
 * @param {Plan} plan @param {unknown} value @returns {Target[]} */
function targetsFor(plan,value){
 const current=selectSceneOwnerRevisions(plan);
 if(!list(value)||value.length>32)throw new TypeError('Scene owner revision targets are invalid');
 const seen=new Set();
 return value.map(raw=>{
  if(!record(raw)||Object.keys(raw).length!==7||!box(raw.box)||Object.keys(raw.box).length!==4||!list(raw.iconIds)
   ||typeof raw.index!=='number'||!Number.isSafeInteger(raw.index)||raw.index<0||raw.index>=32||seen.has(raw.index))
   throw new TypeError('Scene owner revision target is invalid');
  seen.add(raw.index);const target=current.find(row=>row.index===raw.index),geometry=raw.box;
  if(!target||['sourceHash','revision','regionId','objectId'].some(key=>raw[key]!==target[/** @type {'sourceHash'|'revision'|'regionId'|'objectId'} */(key)])
   ||['x','y','w','h'].some(key=>geometry[/** @type {keyof Box} */(key)]!==target.box[/** @type {keyof Box} */(key)])
   ||raw.iconIds.length!==target.iconIds.length||raw.iconIds.some((id,index)=>id!==target.iconIds[index]))
   throw new TypeError('Scene owner revision binding is invalid');
  return target;
 });
}
/** @param {unknown} value @param {Target[]} targets @returns {{index:number,units:Unit[]}[]} */
function observation(value,targets){
 if(!list(value)||value.length!==targets.length)throw new TypeError('Scene owner revision observation is invalid');
 const seen=new Set();return value.map(raw=>{
  if(!record(raw)||Object.keys(raw).some(key=>!['index','units','relations'].includes(key))||typeof raw.index!=='number'||seen.has(raw.index)
   ||!targets.some(target=>target.index===raw.index)||!list(raw.units)||raw.units.length>32
   ||raw.units.length>(targets.find(target=>target.index===raw.index)?.iconIds.length??0)||!list(raw.relations)||raw.relations.length)
   throw new TypeError('Scene owner revision observation is invalid');
  seen.add(raw.index);const index=raw.index;
  const units=raw.units.map(unit=>{
   if(!record(unit)||Object.keys(unit).some(key=>!['index','regionId','kind','confidence','box','rejection'].includes(key))
    ||typeof unit.kind!=='string'||!['icon','container'].includes(unit.kind)||typeof unit.confidence!=='number'||!Number.isFinite(unit.confidence)||unit.confidence<0||unit.confidence>1
    ||unit.box!==null&&(!box(unit.box)||Object.keys(unit.box).length!==4)||unit.index!==undefined&&unit.index!==index
    ||unit.regionId!==undefined&&unit.regionId!==targets.find(target=>target.index===index)?.regionId
    ||unit.rejection!==undefined&&(typeof unit.rejection!=='string'||!['source-window','region-window','unit-coordinates'].includes(unit.rejection)))
    throw new TypeError('Scene owner revision unit is invalid');
   return {kind:unit.kind,confidence:unit.confidence,box:unit.box===null?null:{.../** @type {Box} */(unit.box)},rejected:unit.rejection!==undefined};
  });return {index,units};
 });
}
/** Propose one revision only after a complete, unique, independent match. This
 * grants no source mask, crop, erasure or completion receipt; the unchanged
 * source compiler must prove the revised unit and entire region afterwards.
 * @param {Plan} plan @param {unknown} rawTargets @param {unknown} observations */
function applySceneOwnerRevisions(plan,rawTargets,observations){
 const targets=targetsFor(plan,rawTargets);
 if(!list(observations)||observations.length!==2)throw new TypeError('Scene owner revision pair is invalid');
 const first=observation(observations[0],targets),second=observation(observations[1],targets);
 /** @type {string[]} */const corrected=[];
 /** @type {{regionId:string,reason:string}[]} */const rejected=[];
 const objects=[...plan.objects];
 for(const target of targets){
  const a=first.find(row=>row.index===target.index)?.units??[],b=second.find(row=>row.index===target.index)?.units??[];
  const decline=(/** @type {string} */reason)=>rejected.push({regionId:target.regionId,reason});
  if(a.length!==target.iconIds.length||b.length!==target.iconIds.length){decline('census-incomplete');continue;}
  if([...a,...b].some(unit=>unit.kind!=='icon'||unit.rejected||unit.confidence<.9||!unit.box||!containsSceneBox(target.box,unit.box))){decline('source-observation');continue;}
  const complete=(/** @type {Unit[]} */rows)=>rows.every((unit,index)=>rows.every((other,at)=>index===at||!unit.box||!other.box||intersection(unit.box,other.box)===0));
  if(!complete(a)||!complete(b)){decline('ambiguous-members');continue;}
  const used=new Set();let paired=true;
  for(const unit of a){const matches=b.map((row,index)=>({row,index})).filter(({row})=>unit.box&&row.box&&iou(unit.box,row.box)>=.85);
   if(matches.length!==1||used.has(matches[0]?.index)){paired=false;break;}used.add(matches[0]?.index);}
  if(!paired){decline('geometry-consensus');continue;}
  const anchored=new Set();let bound=true;
  for(const id of target.iconIds.filter(id=>id!==target.objectId)){
   const old=plan.objects.find(object=>object.id===id);
   const matches=a.map((unit,index)=>({unit,index})).filter(({unit})=>{
    const geometry=unit.box;if(!old||!geometry||iou(old.box,geometry)<.85)return false;
    return b.some(row=>row.box&&iou(old.box,row.box)>=.85&&iou(geometry,row.box)>=.85);
   });
   if(matches.length!==1||anchored.has(matches[0]?.index)){bound=false;break;}anchored.add(matches[0]?.index);
  }
  const missing=a.filter((_,index)=>!anchored.has(index));
  if(!bound||missing.length!==1||!missing[0]?.box){decline('identity-consensus');continue;}
  const revised=missing[0].box,index=objects.findIndex(object=>object.id===target.objectId),original=objects[index];
  if(!original)throw new TypeError('Scene owner revision identity is invalid');
  objects[index]={...original,box:{...revised}};corrected.push(original.id);
 }
 const reviewed=targets.flatMap(target=>target.iconIds);
 const result=recordSceneLocalObjectBatch(plan,{...plan,objects},[],reviewed);
 return {plan:result,evidence:{requested:targets.length,reviewedMembers:reviewed.length,corrected,rejected}};
}
module.exports={selectSceneOwnerRevisions,applySceneOwnerRevisions};
