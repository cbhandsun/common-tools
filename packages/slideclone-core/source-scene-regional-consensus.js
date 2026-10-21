// @ts-check
'use strict';
const {list:plainList}=require('./source-scene-group-containment');
const {containsSceneBox}=require('./source-scene-plan');
const {sceneEndpointWithinScope}=require('./source-scene-topology-review');
const {sceneLocalRelationCapacity,recordSceneLocalRelationBatch}=require('./source-scene-relation-batches');
const {rebindRegionProgramMembers}=require('./source-scene-region-program');
const {sceneObjectLimit,sceneLocalObjectCapacity,recordSceneLocalObjectBatch}=require('./source-scene-object-batches');
const {sameSceneNativeGeometry}=require('./source-scene-native-geometry');
const {sceneRelationKey}=require('./source-scene-relation-identity');
const {regionalRelationAnchorsAgree}=require('./source-scene-regional-relation-anchor');
const {applySceneGeneratedPrograms}=require('./source-scene-program-generation');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {import('./source-scene-regional-inventory').Target} Target */
/** @typedef {import('./source-scene-regional-inventory').Observation} Observation */
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value,maximum){if(!plainList(value)||value.length>maximum)throw new TypeError('Scene regional inventory collection is invalid');return value;}

/** @param {Box} a @param {Box} b */
function iou(a,b){const overlap=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 return overlap/(a.w*a.h+b.w*b.h-overlap);}
/** Region observations jointly propose nodes and source-visible topology; the
 * compiler still proves every physical unit, shaft, direction and attachment.
 * @param {Plan} plan @param {Target[]} targets @param {Observation[][]} observations */
function applyRegionalInventoryReview(plan,targets,observations){
 if(observations.length!==2||observations.some(rows=>rows.length!==targets.length)||targets.length>32
  ||new Set(targets.map(t=>t.index)).size!==targets.length)throw new TypeError('Scene regional consensus is invalid');
 const objects=[...plan.objects],relations=[...plan.relations];
 const relationCapacity=sceneLocalRelationCapacity(plan);
 // The two views corroborate one bounded proposal batch. Count attempts before
 // filtering by endpoint, consensus or duplicate checks; rejection is not a
 // refund. A context-only proposal uses a slot even when it cannot be emitted.
 const relationProposals=targets.reduce((total,target)=>{
  const a=observations[0]?.find(r=>r.index===target.index),b=observations[1]?.find(r=>r.index===target.index);
  if(!a||!b)throw new TypeError('Scene regional owner binding is invalid');
  return total+Math.max(list(a.relations,24).length,list(b.relations,24).length);
 },0);
 if(relationProposals>relationCapacity)throw new RangeError('Scene regional relation capacity exceeded');
 const objectProposals=targets.reduce((total,target)=>{
  const a=observations[0]?.find(r=>r.index===target.index),b=observations[1]?.find(r=>r.index===target.index);
  if(!a||!b)throw new TypeError('Scene regional owner binding is invalid');
  return total+Math.max(list(a.units,plan.objectBatches?32:64).length,list(b.units,plan.objectBatches?32:64).length);
 },0);
 if(plan.objectBatches&&objectProposals>sceneLocalObjectCapacity(plan))throw new RangeError('Scene regional object proposal capacity exceeded');
 /** @type {string[]} */const added=[];
 /** @type {{index:number,unit:number,reason:string}[]} */const rejected=[];
 /** @type {{index:number,relation:number,reason:string}[]} */const rejectedRelations=[];
  /** @type {Map<number,import('./source-scene-program-generation').MemberMatches>} */const programMatches=new Map();
 for(const target of targets){
  const region=plan.regions.find(r=>r.id===target.regionId),a=observations[0]?.find(r=>r.index===target.index),b=observations[1]?.find(r=>r.index===target.index);
  const owner=target.ownerBox??target.box;
  if(!region||!a||!b||['x','y','w','h'].some(k=>region.box[/** @type {keyof Box} */(k)]!==owner[/** @type {keyof Box} */(k)])
   ||target.ownerBox&&(region.parentId!==null||region.kind!=='section'||!containsSceneBox(region.box,target.box)
    ||target.boundaryReview||target.endpoints?.length||plan.observedInventory?.find(row=>row.regionId===region.id)?.relations!==0))
   throw new TypeError('Scene regional owner binding is invalid');
  /** @type {Map<number,{second:number,id:string}>} */const matched=new Map();const used=new Set();
   /** @type {Map<number,{second:number,id:string}>} */const matchedRelations=new Map();
   programMatches.set(target.index,{objects:matched,relations:matchedRelations});
  for(const [index,unit]of a.units.entries()){
   const decline=(/** @type {string} */reason)=>rejected.push({index:target.index,unit:index,reason});
   if(!unit.box||unit.rejection||unit.confidence<.9){decline('source-observation');continue;}
   const box=unit.box;
   if(target.ownerBox&&(!containsSceneBox(target.box,box)||plan.regions.some(r=>r.id!==region.id&&containsSceneBox(r.box,box)))){
    decline('direct-owner-scope');continue;}
   const candidates=b.units.map((row,second)=>({row,second})).filter(({row,second})=>!used.has(second)&&row.box&&!row.rejection
    &&row.confidence>=.9&&row.kind===unit.kind&&iou(box,row.box)>=.85);
   if(candidates.length!==1){decline('geometry-consensus');continue;}
   if(!sameSceneNativeGeometry(unit.nativeGeometry,candidates[0]?.row.nativeGeometry)){decline('native-geometry-consensus');continue;}
   if(objects.some(o=>o.kind===unit.kind&&iou(o.box,box)>=.85)){decline('existing-unit');continue;}
   if(objects.length>=sceneObjectLimit(plan))throw new RangeError('Scene regional object capacity exceeded');
   const id=`object-regional-${target.index}-${index}`,candidate=candidates[0];
   if(!candidate||objects.some(o=>o.id===id))throw new TypeError('Scene regional identity conflicts');
   objects.push({id,kind:unit.kind,regionId:region.id,box:{...box},...(unit.kind==='icon'?{nativePictorial:true}:{}),...(unit.nativeGeometry?{nativeGeometry:unit.nativeGeometry}:{})});
   matched.set(index,{second:candidate.second,id});used.add(candidate.second);added.push(id);
  }
  /** Existing references are immutable identities, not geometry supplied by
   * the response. A structural correction invalidates this older binding.
   * @param {number|string} ref @returns {{second:number|string,id:string}|undefined} */
  const resolve=ref=>{
   if(typeof ref==='number')return matched.get(ref);
   const binding=target.endpoints?.find(e=>e.id===ref),object=plan.objects.find(o=>o.id===ref),physicalRegion=plan.regions.find(r=>r.id===ref),text=plan.textEndpoints?.find(t=>t.id===ref),entity=object??physicalRegion??text;
   if(!binding||!entity||!sceneEndpointWithinScope(plan,region.id,ref)
    ||(binding.entityKind?binding.entityKind!==(object?'object':text?'text':'region')||binding.ownerId!==(object?object.regionId:text?text.regionId:physicalRegion?.parentId):!object||object.regionId!==region.id)
    ||['x','y','w','h'].some(k=>entity.box[/** @type {keyof Box} */(k)]!==binding.box[/** @type {keyof Box} */(k)]))return undefined;
   return {second:ref,id:ref};
  };
  for(const [index,link]of a.relations.entries()){
   const decline=(/** @type {string} */reason)=>rejectedRelations.push({index:target.index,relation:index,reason});
   const from=resolve(link.from),to=resolve(link.to);if(!from||!to||from.id===to.id){decline('endpoint-observation');continue;}
    const other=b.relations.filter(r=>r.from===from.second&&r.to===to.second&&r.direction===link.direction&&regionalRelationAnchorsAgree(link,r));
    const otherLink=other[0];if(other.length!==1||!otherLink){decline('relation-consensus');continue;}
   const relation={regionId:region.id,fromId:from.id,toId:to.id,direction:link.direction,...(link.shaftBox?{shaftBox:{...link.shaftBox}}:{})};
   if(relations.some(r=>sceneRelationKey(r)===sceneRelationKey(relation))){decline('existing-relation');continue;}
   if(relations.length-plan.relations.length>=relationCapacity)throw new RangeError('Scene regional relation capacity exceeded');
   const id=`relation-regional-${target.index}-${index}`;if(relations.some(r=>r.id===id))throw new TypeError('Scene regional identity conflicts');
   relations.push({id,...relation});
    matchedRelations.set(index,{second:b.relations.indexOf(otherLink),id});
  }
 }
 const additions=relations.slice(plan.relations.length).map(r=>r.id);
 const objectResult=recordSceneLocalObjectBatch(plan,{...plan,objects,relations},added,[],objectProposals-added.length);
 const result=recordSceneLocalRelationBatch(plan,objectResult,additions,[],relationProposals-additions.length);
  const generated=applySceneGeneratedPrograms({previous:plan,next:rebindRegionProgramMembers(plan,result),targets,observations,matches:programMatches});
  return {plan:generated.plan,evidence:{proposed:targets.length,added,addedRelations:relations.length-plan.relations.length,rejected,...(rejectedRelations.length?{rejectedRelations}:{}),...(generated.evidence.requested?{programGeneration:generated.evidence}:{})}};
}
module.exports={applyRegionalInventoryReview};
