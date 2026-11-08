// @ts-check
"use strict";
const {types}=require('node:util');
const {containsSceneBox}=require('./source-scene-plan');
const {readSceneRegionalUnit}=require('./source-scene-regional-unit');
const {sourceBox2D}=require('./source-scene-coordinate-frame');
const {sceneRecoveredInventoryCounts,sceneProgramRelationObservation}=require('./source-scene-observed-inventory');
const {sceneEndpointWithinScope}=require('./source-scene-topology-review');
const {sceneLocalRelationCapacity}=require('./source-scene-relation-batches');
const {sceneLocalObjectCapacity}=require('./source-scene-object-batches');
const {sourceSceneCompileFeedback}=require('./source-scene-compile-feedback');
const {readSceneRegionBoundary,applySceneRegionBoundaryReview,sceneRegionalReviewContext}=require('./source-scene-region-boundary-review');
const {sceneRegionalOutputPrompt}=require('./source-scene-local-response');
const {sourceSceneDirectReviewScope}=require('./source-scene-direct-review-scope');
const {readRegionalRelationAnchor}=require('./source-scene-regional-relation-anchor');
const {sceneProgramTasks,sceneRegionalProgramBindings}=require('./source-scene-program-tasks');
const {readSceneProgram}=require('./source-scene-program-contract');
const {applyRegionalInventoryReview,captureSceneCensusScopeReview}=require('./source-scene-regional-consensus');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,box:Box,entityKind?:'object'|'region'|'text',ownerId?:string|null}} Endpoint */
/** @typedef {Pick<import('./source-scene-plan').Relation,'id'|'fromId'|'toId'|'direction'|'shaftBox'>} ExistingRelation */
/** @typedef {{index:number,regionId:string,box:Box,contextBox?:Box,ownerBox?:Box,endpoints?:Endpoint[],existingRelations?:ExistingRelation[],addObjects?:boolean,preferredObjectSlots?:number,boundaryReview?:boolean,boundaryMembers?:Endpoint[],inventoryMissing?:{containers:number,icons:number,relations:number},programTask?:import('./source-scene-program-tasks').ProgramTask,programOnly?:boolean,scopeDiscovery?:import('./source-scene-census-scope-review').CensusScopeReview}} Target */
/** @typedef {{kind:string,confidence:number,box:Box|null,rejection?:string,nativeGeometry?:import('./source-scene-native-geometry').NativeGeometry}} Unit */
/** @typedef {{from:number|string,to:number|string,direction:string,shaftBox?:Box,rejection?:string}} Link */
/** @typedef {{index:number,units:Unit[],relations:Link[],boundary?:ReturnType<typeof readSceneRegionBoundary>,program?:import('./source-scene-program-contract').ProgramObservation|null}} Observation */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @param {number} maximum @returns {unknown[]} */
function list(v,maximum){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>maximum
 ||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!('value' in p)))
 throw new TypeError('Scene regional inventory collection is invalid');return v;}
/** Rank complete missing regions and reserve their observed unit demand before
 * decoration. The validated local batch shares targets/references/pixel budget;
 * its region count follows actual demand, never a fixed two-region ceiling.
 * Legacy unbatched plans retain their original selection contract.
 * @param {Plan|undefined} plan @param {number} capacity @param {number} released @param {unknown} [compiledInventory] @param {unknown} [compileEvidence] @param {number} [reservedObjectSlots] @param {unknown} [sourceLabels] */
function selectRegionalInventoryTargets(plan,capacity,released,compiledInventory,compileEvidence,reservedObjectSlots=0,sourceLabels){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32||!Number.isSafeInteger(released)||released<0||released>64
  ||!Number.isSafeInteger(reservedObjectSlots)||reservedObjectSlots<0||reservedObjectSlots>32)
  throw new RangeError('Scene regional inventory capacity is invalid');
 if(!plan||!capacity)return [];
 const relationCapacity=sceneLocalRelationCapacity(plan),objectCapacity=Math.max(0,sceneLocalObjectCapacity(plan)-(plan.objectBatches?reservedObjectSlots:0));
 const recovered=sceneRecoveredInventoryCounts(plan,compiledInventory);
 const failures=compileEvidence===undefined?new Map():sourceSceneCompileFeedback(plan,compileEvidence);
 const emptyAllowed=released>0&&plan.objects.length+released===64;
  const programTasks=sourceLabels===undefined?[]:sceneProgramTasks(plan,sourceLabels);
 const candidates=plan.regions.filter(r=>['section','diagram','table','card','container'].includes(r.kind)).map(region=>{
  const legacyCard=region.parentId!==null&&region.kind==='card';
  const nodes=plan.objects.filter(o=>o.regionId===region.id&&o.kind==='container');
  const census=plan.observedInventory?.find(row=>row.regionId===region.id);
  const relationCensus=sceneProgramRelationObservation(plan,region.id);
  const proposedRelations=plan.relations.filter(r=>r.regionId===region.id).length;
  const directScope=sourceSceneDirectReviewScope(plan,region.id,sourceLabels);
  /** Ancestor scopes need real descendant nodes, including physical regions.
   * Their boxes nominate review only; source compilation still proves bodies.
   * @type {Endpoint[]} */
  const endpoints=directScope?[]:census&&census.relations!==null&&census.relations>proposedRelations
   ?[...plan.objects,...plan.regions,...(plan.textEndpoints??[])].filter(e=>e.id!==region.id&&sceneEndpointWithinScope(plan,region.id,e.id)).map(e=>{
     const object=plan.objects.find(o=>o.id===e.id);
     const text=plan.textEndpoints?.find(t=>t.id===e.id);if(text)return {id:e.id,box:{...e.box},entityKind:/** @type {const} */('text'),ownerId:text.regionId};
     return object&&object.regionId===region.id?{id:e.id,box:{...e.box}}:{id:e.id,box:{...e.box},entityKind:object?'object':'region',ownerId:object?object.regionId:plan.regions.find(r=>r.id===e.id)?.parentId};
    })
   :[...plan.objects.filter(o=>o.regionId===region.id&&['container','icon'].includes(o.kind)&&containsSceneBox(region.box,o.box)).map(o=>({id:o.id,box:{...o.box}})),
    ...plan.regions.filter(r=>r.parentId===region.id&&['card','container'].includes(r.kind)&&containsSceneBox(region.box,r.box))
     .map(r=>({id:r.id,box:{...r.box},entityKind:/** @type {const} */('region'),ownerId:r.parentId})),
    ...(plan.textEndpoints??[]).filter(t=>t.regionId===region.id&&sceneEndpointWithinScope(plan,region.id,t.id)).map(t=>({id:t.id,box:{...t.box},entityKind:/** @type {const} */('text'),ownerId:t.regionId}))];
  const connected=new Set(plan.relations.filter(r=>r.regionId===region.id).flatMap(r=>[r.fromId,r.toId]));
  // Missing participation proposes a review, never a new edge. Independent
  // observations may correctly return no relations for disconnected artwork.
  const missing=legacyCard&&census?.relations!==0&&relationCapacity>0&&nodes.length===endpoints.length&&endpoints.length>=2
   ?endpoints.filter(e=>!connected.has(e.id)).length:0;
  const measured=recovered.get(region.id);
  const inventoryMissing=census?{
   containers:Math.max(0,(census.containers??0)-nodes.length-(measured?.containers??0)),
   icons:Math.max(0,(census.icons??0)-plan.objects.filter(o=>o.regionId===region.id&&o.kind==='icon').length-(measured?.icons??0)),
   relations:Math.max(0,(relationCensus??0)-proposedRelations)}:undefined;
  const objectGap=inventoryMissing?inventoryMissing.containers+inventoryMissing.icons:0;
  const scopeDiscovery=inventoryMissing&&inventoryMissing.relations>0&&relationCapacity>0&&endpoints.filter(e=>e.entityKind!=='text').length<2
   ?captureSceneCensusScopeReview(plan,region.id):undefined;
  const censusActionable=!!inventoryMissing&&(objectGap>0&&objectCapacity>0||inventoryMissing.relations>0&&relationCapacity>0&&(endpoints.length>=2||!!scopeDiscovery));
  const boundaryReview=region.parentId!==null&&['card','container'].includes(region.kind)&&failures.has(region.id);
  const boundaryMembers=boundaryReview?[...plan.objects.filter(o=>o.regionId===region.id),...plan.regions.filter(r=>r.parentId===region.id)]
   .map(e=>({id:e.id,box:{...e.box}})):[];
   const programTask=scopeDiscovery?undefined:programTasks.find(task=>task.regionId===region.id);
   return {region,directScope:programTask?undefined:directScope,endpoints:scopeDiscovery?.endpoints??endpoints,scopeDiscovery,missing,empty:legacyCard&&emptyAllowed&&nodes.length===0,inventoryMissing,objectGap,censusActionable,boundaryReview,boundaryMembers,programTask};
  }).filter(c=>c.empty||c.missing>0||c.censusActionable||c.boundaryReview||c.programTask).sort((a,b)=>Number(!!b.scopeDiscovery)-Number(!!a.scopeDiscovery)||Number(!!b.programTask)-Number(!!a.programTask)||Number(!!b.directScope&&b.censusActionable)-Number(!!a.directScope&&a.censusActionable)
  ||Number(b.boundaryReview)-Number(a.boundaryReview)||Number(b.censusActionable)-Number(a.censusActionable)
  ||b.objectGap-a.objectGap||(b.inventoryMissing?.relations??0)-(a.inventoryMissing?.relations??0)
  ||b.missing-a.missing||b.region.box.w*b.region.box.h-a.region.box.w*a.region.box.h||a.region.box.y-b.region.box.y);
 let free=objectCapacity;
 /** @type {Omit<Target,'index'>[]} */const selected=[];
 /** @type {Set<string>} */const referenced=new Set();let endpointSlots=64;
 for(const candidate of candidates){
  if(selected.length>=(plan.objectBatches?capacity:Math.min(capacity,2)))break;
  const addObjects=!candidate.scopeDiscovery&&(candidate.empty||candidate.censusActionable&&candidate.objectGap>0&&free>0);
   const programOnly=!!candidate.programTask&&!candidate.empty&&!candidate.censusActionable&&candidate.missing===0;
  // The keyed local protocol has one unchanged shared reference/object limit
  // and forbids duplicate references across regions. Defer overlapping scopes
  // instead of broadening that contract or silently truncating their nodes.
   const reserve=selected.some(t=>t.addObjects||!t.endpoints?.length&&!t.programOnly)||addObjects||candidate.empty?objectCapacity:0;
   const programMembers=plan.objects.filter(o=>candidate.programTask?.objects.includes(o.id));
   const references=[...new Map([...candidate.endpoints,...candidate.boundaryMembers,...programMembers].map(e=>[e.id,e])).values()];
  if(references.some(e=>referenced.has(e.id))||references.length+reserve>endpointSlots)continue;
  const preferredObjectSlots=addObjects?Math.min(free,Math.max(1,candidate.objectGap)):0;
  // After one reservation, prefer another whole region that fits. The first
  // oversized region remains explicitly incomplete; a census is never lowered
  // to match this scheduling estimate, and final source receipts still decide.
  if(plan.objectBatches&&addObjects&&candidate.objectGap>free&&selected.some(t=>t.addObjects))continue;
  if(candidate.empty&&free<1)continue;
  if(addObjects)free-=plan.objectBatches?preferredObjectSlots:1;
   else if(candidate.censusActionable&&candidate.inventoryMissing?.relations===0&&candidate.missing===0&&!candidate.boundaryReview&&!candidate.programTask)continue;
  const endpointIds=new Set(candidate.endpoints.map(e=>e.id));
  const existingRelations=plan.relations.filter(r=>(r.regionId===candidate.region.id||r.regionId===candidate.scopeDiscovery?.reviewRegionId)&&endpointIds.has(r.fromId)&&endpointIds.has(r.toId))
   .map(r=>({id:r.id,fromId:r.fromId,toId:r.toId,direction:r.direction,...(r.shaftBox?{shaftBox:{...r.shaftBox}}:{})}));
  selected.push({regionId:candidate.scopeDiscovery?.reviewRegionId??candidate.region.id,box:{...(candidate.directScope??candidate.region.box)},...(candidate.scopeDiscovery?{scopeDiscovery:candidate.scopeDiscovery,ownerBox:{...candidate.scopeDiscovery.ownerBox}}:candidate.directScope?{ownerBox:{...candidate.region.box}}:{}),...(plan.objectBatches&&addObjects?{preferredObjectSlots}:{}),...(candidate.endpoints.length?{endpoints:candidate.endpoints}:{}),
    ...(existingRelations.length?{existingRelations}:{}),
    ...(candidate.programTask?{programTask:candidate.programTask,programOnly}:{}),
   ...(candidate.inventoryMissing?{inventoryMissing:candidate.inventoryMissing,addObjects}:{} ),...(candidate.boundaryReview?{boundaryReview:true,addObjects,boundaryMembers:candidate.boundaryMembers}:{} )});
  for(const endpoint of references)referenced.add(endpoint.id);endpointSlots-=references.length;
 }
 return selected.map(target=>{
  const contextBox=sceneRegionalReviewContext({...target,index:0});
  return ['x','y','w','h'].some(k=>Math.abs(contextBox[/** @type {keyof Box} */(k)]-target.box[/** @type {keyof Box} */(k)])>1e-6)?{...target,contextBox}:target;
 });
}
/** Reuse the exact sheet/source mapping and original crop-edge rounding guard
 * for every observed unit. No response supplies source pixels or an owner ID.
 * @param {unknown} response @param {Target[]} targets
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame
 * @param {{objects:number,relations:number}} capacity @returns {Observation[]} */
function readRegionalInventoryObservations(response,targets,frame,capacity){
 if(!record(response)||!record(capacity)||Object.keys(capacity).length!==2
  ||![capacity.objects,capacity.relations].every(Number.isSafeInteger)||capacity.objects<0||capacity.objects>64||capacity.relations<0||capacity.relations>24)
  throw new TypeError('Scene regional inventory response is invalid');
 const rows=list(response.regionInventories??[],32),seen=new Set();let objects=0,links=0;
 const observations=rows.map(raw=>{
  if(!record(raw)||typeof raw.index!=='number'||seen.has(raw.index))throw new TypeError('Scene regional inventory binding is invalid');
  const target=targets.find(t=>t.index===raw.index);if(!target)throw new TypeError('Scene regional inventory binding is invalid');seen.add(raw.index);
   if(Object.keys(raw).length!==3+Number(!!target.boundaryReview)+Number(!!target.programTask)||!['index','units','relations',...(target.boundaryReview?['boundary']:[]),...(target.programTask?['program']:[])].every(k=>Object.hasOwn(raw,k)))
   throw new TypeError('Scene regional inventory binding is invalid');
  const boundary=target.boundaryReview?readSceneRegionBoundary(raw.boundary,target,frame):undefined;
  const units=list(raw.units,capacity.objects).map(unit=>readSceneRegionalUnit(unit,target,frame));
  /** @param {unknown} ref @returns {ref is number|string} */
  const endpoint=ref=>typeof ref==='string'?(target.endpoints??[]).some(e=>e.id===ref&&containsSceneBox(target.box,e.box))
   :typeof ref==='number'&&Number.isSafeInteger(ref)&&ref>=0&&ref<units.length&&['container','icon'].includes(units[ref]?.kind??'');
  const relations=list(raw.relations,capacity.relations).map(link=>{
   if(!record(link)||Object.keys(link).length!==3+Number(Object.hasOwn(link,'shaftBox_2d'))||!endpoint(link.from)||!endpoint(link.to)||link.from===link.to
    ||typeof link.direction!=='string'||!['forward','backward','both','unknown','undirected'].includes(link.direction))throw new TypeError('Scene regional relation is invalid');
   return {from:link.from,to:link.to,direction:link.direction,...readRegionalRelationAnchor(link.shaftBox_2d,target,frame)};
  });
   if(target.programOnly&&(units.length||relations.length))throw new TypeError('Scene program-only inventory is invalid');
   const binding=sceneRegionalProgramBindings([target]).regionProgramBindings?.[String(target.index)];
   const program=binding?readSceneProgram(raw.program,binding,units.length,relations.length):undefined;
   objects+=units.length;links+=relations.length;return {index:target.index,units,relations,...(boundary?{boundary}:{}),...(program!==undefined?{program}:{})};
 });
 if(objects>capacity.objects||links>capacity.relations||observations.length!==targets.length)throw new TypeError('Scene regional inventory exceeds shared capacity');
 return observations;
}
/** @param {Target[]} targets @param {{objects:number,relations:number}} capacity
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame */
function regionalInventoryPrompt(targets,capacity,frame){
 const bindings=targets.map(t=>{
  const source=frame?.sourceTargets.find(s=>s.index===t.index),sheet=frame?.sheetTargets.find(s=>s.index===t.index);
  const encode=(/** @type {Endpoint} */e)=>{
   if(!frame||!source||!sheet||!containsSceneBox(source.cropBox,e.box))throw new TypeError('Scene regional endpoint crop is invalid');
   return {id:e.id,box_2d:sourceBox2D({x:e.box.x-source.cropBox.x+sheet.cropBox.x,y:e.box.y-source.cropBox.y+sheet.cropBox.y,w:e.box.w,h:e.box.h},frame)};
  };
  const endpoints=(t.endpoints??[]).map(encode);
  const ids=new Set(endpoints.map(e=>e.id));
  const existingRelations=(t.existingRelations===undefined?[]:list(t.existingRelations,48)).map(raw=>{
   if(!record(raw)||!['id','fromId','toId','direction'].every(k=>typeof raw[k]==='string')
    ||Object.keys(raw).some(k=>!['id','fromId','toId','direction','shaftBox'].includes(k))
    ||typeof raw.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(raw.id)
    ||!ids.has(/** @type {string} */(raw.fromId))||!ids.has(/** @type {string} */(raw.toId))||raw.fromId===raw.toId
    ||!['forward','backward','both','undirected','unknown'].includes(/** @type {string} */(raw.direction)))
    throw new TypeError('Scene regional existing relation context is invalid');
   const hint=raw.shaftBox;
   if(hint!==undefined&&(!record(hint)||Object.keys(hint).length!==4||!['x','y','w','h'].every(k=>typeof hint[k]==='number'&&Number.isFinite(hint[k]))
    ||Number(hint.x)<0||Number(hint.y)<0||Number(hint.w)<=0||Number(hint.h)<=0))throw new TypeError('Scene regional existing relation geometry is invalid');
   const shaft=hint===undefined?undefined:/** @type {Box} */(hint);
   return {id:raw.id,from:raw.fromId,to:raw.toId,direction:raw.direction,
    shaftBox_2d:shaft&&source&&containsSceneBox(source.cropBox,shaft)?encode({id:raw.id,box:shaft}).box_2d:null};
  });
  return {index:t.index,regionId:t.regionId,...(t.scopeDiscovery?{scopeDiscovery:{sourceRegionId:t.scopeDiscovery.sourceRegionId,reviewRegionId:t.scopeDiscovery.reviewRegionId,observedRelations:t.scopeDiscovery.observedRelations}}:t.ownerBox?{directOwnerWindow:true}:{}),...(t.preferredObjectSlots!==undefined?{preferredObjectSlots:t.preferredObjectSlots}:{}),...(t.boundaryReview?{boundaryReview:true,requiredBoundaryMembers:(t.boundaryMembers??[]).map(encode)}:{}),...(endpoints.length?{existingEndpoints:endpoints}:{}),...(t.inventoryMissing?{inventoryMissing:t.inventoryMissing}:{}),
   ...(existingRelations.length?{existingRelations}:{}),
   ...(t.programTask?{programReview:true,programLabels:t.programTask.labels.map(label=>({index:label.index,...encode({id:'label-'+label.index,box:label.box})}))}:{})};
 });
 let output=sceneRegionalOutputPrompt({reviews:[],missing:[],regionInventories:targets.map(t=>t.index),regionObjectCapacity:capacity.objects,regionRelationCapacity:capacity.relations,
  ...sceneRegionalProgramBindings(targets),...(targets.some(t=>t.boundaryReview)?{regionBoundaryIndices:targets.filter(t=>t.boundaryReview).map(t=>t.index)}:{}),
  ...(targets.some(t=>t.endpoints?.length)?{regionEndpointIds:Object.fromEntries(targets.map(t=>[String(t.index),(t.endpoints??[]).map(e=>e.id)]))}:{})});
 if(targets.some(t=>t.ownerBox&&!t.scopeDiscovery))output+=' For directOwnerWindow bindings, candidateBox2D is a bounded view of the semantic page owner, not a physical enclosing panel. Propose only units directly owned by that page region, including source highlights and pictorial marks. Child panels and their contents retain their own owners; do not duplicate them. Its inventoryMissing is the unchanged whole-owner census, not a claim that all missing units fit this window. Inspect only complete visible units in the window. Do not invent an enclosing panel or reduce the census.';
 if(targets.some(t=>t.scopeDiscovery))output+=' For scopeDiscovery bindings, an unchanged census in sourceRegionId has no legal endpoint pair under its declared ancestry. reviewRegionId is an existing common ancestor, supplied only for independent connector discovery inside candidateBox2D. Return units:[]; use only existingEndpoints and independently visible complete shafts/arrowheads in this window. Do not infer connections from the count, change ancestry, count ownership or any census, or treat this review as proof of completeness. Existing proposals remain context; do not duplicate them.';
 if(bindings.some(t=>t.existingRelations?.length))output+=' existingRelations lists previously admitted proposals in the SAME atlas frame, solely as context: do not propose an already listed physical connector again. Preserve distinct physical contacts even when endpoints and direction match; a separately observed disjoint shaft may be new. A null shaft hint does not supply a location. Return only independently observed missing connectors, with complete source shaft locations; never infer links from inventoryMissing, fill a quota, rewrite existing proposals or treat this context as source proof. Duplicate and rejected proposals still consume the unchanged local relation capacity.';
 return targets.length?`${output}
 Independently understand the workflow semantics and COMPLETE physical layout in each candidateBox2D. Inventory actual connector endpoints in EVERY region before decoration. Enclosed labeled nodes are containers; standalone pictorial endpoints remain icons. Never invent an enclosing surface around an icon. Native source isolation and complete endpoint compilation remain mandatory. A labeled enclosed node is container, its glyphs remain OCR text. An icon contains only pictorial strokes, never labels or a whole node. The enclosing region panel already exists; never duplicate it. For bindings marked boundaryReview, also return boundary:{confidence:number,box_2d:array|null}. Independently inspect the COMPLETE enclosing physical panel in cropBox2D: the current candidate may incorrectly include unrelated sections below it. Locate ALL requiredBoundaryMembers first, then identify the actual visible outer panel enclosing those members. Never substitute another panel elsewhere in the broad candidate. If no single physical panel encloses these exact members, return confidence:0,box_2d:null; do not drop or reassign members. A boundary correction changes only this region envelope, never its identity, type, owner, members or census. All returned geometry uses the ENTIRE SHEET atlas frame and remains inside cropBox2D. Use units:[{kind:container/icon,confidence:0.99,box_2d:[ymin,xmin,ymax,xmax],nativeGeometry:object|null}], unit boxes inside the corresponding candidateBox2D. For a clearly visible container surface, nativeGeometry has kind ellipse/roundRect/quad/cylinder/handFrame, capRatio:number|null,radiusRatio:number|null,seams:sorted relative positions|null,corners:four convex {x,y} points in 0-1 relative to this object|null. Use null for uncertain geometry and all icons. Propose every visible face and divider; never invent hidden geometry. Complete source measurement remains mandatory. Include ONLY NEW objects in units. An unenclosed text endpoint may use its exact text endpoint ID from existingEndpoints; do not invent a container for it. Each relations entry MUST contain {from,to,direction,shaftBox_2d}; shaftBox_2d is a tight [ymin,xmin,ymax,xmax] box in the ENTIRE SHEET atlas frame around ONE complete original visible shaft and its arrowheads, excluding node bodies and labels. Use null if its full location is uncertain; never use a whole panel or another connector location. This is only a source-location proposal, with all original shaft/endpoint/source checks retained; direction is REQUIRED and is forward for from to to, backward for to to from, both for two arrowheads, undirected for a fully visible connector with no arrowheads at either end, unknown when unclear. Use from/to as either zero-based NEW units indices or exact string IDs in that region's existingEndpoints; never duplicate existing nodes in units or use another region's IDs. Require actual visible connectors, never reading order or presumed connectivity. Return empty arrays for insufficient evidence. TOTAL new units across ALL regions <=${capacity.objects}; TOTAL relations <=${capacity.relations}. Exact immutable regional bindings: ${JSON.stringify(bindings)}. These are inventory proposals, never source-pixel authority. `:'';}
module.exports={selectRegionalInventoryTargets,readRegionalInventoryObservations,applyRegionalInventoryReview,regionalInventoryPrompt,applySceneRegionBoundaryReview,sceneRegionalProgramBindings};
