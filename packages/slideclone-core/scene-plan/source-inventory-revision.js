// @ts-check
'use strict';
const crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {record,list,box}=require('./source-scene-group-containment');
const {inventoryRevisionSnapshot:snapshot,immutableInventoryRevisionCopy:copy,inventoryRevisionFileBytes:fileBytes}=require('./source-inventory-revision-snapshot');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Admission['rejections'][number]} Rejection */
/** @typedef {{id:string,regionId:string,fromId:string,toId:string,direction:string,shaftBox:import('./source-scene-plan').Box}} RelationCore */
/** @typedef {Pick<Plan,'observedInventory'|'pendingRegionPrograms'|'resolvedRegionPrograms'|'admission'|'objectBatches'|'relationBatches'>} Historical */
/** @typedef {Readonly<{version:1,revisionId:string,parentPlanHash:string,sourceHash:string,widthPx:number,heightPx:number,regionId:string,
 * confirmationId:string,relations:RelationCore[],historical:Historical,supersededProgramIndex:number,supersededRelationRejection:Rejection}>} Revision */
/** @typedef {{revision:Revision,parentHash:string,viewHash:string,compilerViewHash:string,view:Plan,expiresAt:number,used:boolean}} Issued */
/** @typedef {{issued:Issued,runToken:object,consumed:boolean,sealed:boolean,closed:boolean}} Context */
/** @type {WeakMap<object,Issued>} */const receipts=new WeakMap();
/** @type {import('node:async_hooks').AsyncLocalStorage<Context>} */const contexts=new AsyncLocalStorage();
const LIFETIME_MS=30*60*1000;
const historyKeys=/** @type {const} */(['observedInventory','pendingRegionPrograms','resolvedRegionPrograms','admission','objectBatches','relationBatches']);
/** @param {unknown} value @returns {value is string} */
function identity(value){return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);}
/** @param {unknown} value @param {string[]} keys */
function exact(value,keys){return record(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
/** @param {unknown} raw @returns {RelationCore} */
function core(raw){
 if(!exact(raw,['id','regionId','fromId','toId','direction','shaftBox'])||!record(raw)
  ||![raw.id,raw.regionId,raw.fromId,raw.toId].every(identity)||raw.fromId===raw.toId
  ||typeof raw.direction!=='string'||!['forward','backward','both','undirected'].includes(raw.direction)
  ||!box(raw.shaftBox)||Reflect.ownKeys(raw.shaftBox).length!==4)throw new TypeError('Scene inventory revision relation is invalid');
 return /** @type {RelationCore} */(raw);
}
/** @param {Plan['relations'][number]} relation */
function relationCore(relation){return core({id:relation.id,regionId:relation.regionId,fromId:relation.fromId,toId:relation.toId,direction:relation.direction,shaftBox:relation.shaftBox});}
/** @param {unknown} value @returns {Rejection[]} */
function rejections(value){
 if(!list(value)||value.length>256)throw new TypeError('Scene inventory revision admission is invalid');
 const seen=new Set();
 for(const row of value){
  if(!record(row)||Reflect.ownKeys(row).some(key=>!['collection','index','reason','detailCode'].includes(String(key)))
   ||typeof row.collection!=='string'||!['object','relation','program','missingText'].includes(row.collection)
   ||!Number.isSafeInteger(row.index)||Number(row.index)<0||Number(row.index)>=(row.collection==='object'?64:row.collection==='missingText'?512:24)
   ||typeof row.reason!=='string'||!/^[a-z][a-zA-Z-]{0,63}$/u.test(row.reason)
   ||row.detailCode!==undefined&&(typeof row.detailCode!=='string'||!/^[a-z][a-zA-Z-]{0,63}$/u.test(row.detailCode))
   ||seen.has(row.collection+':'+row.index))throw new TypeError('Scene inventory revision admission is invalid');
  seen.add(row.collection+':'+row.index);
 }
 return /** @type {Rejection[]} */(value);
}
/** Validate existing contracts outside the review context. Lazy imports avoid
 * cycles with consumers which read the effective inventory/program view.
 * @param {Plan} plan @param {string} regionId @param {RelationCore[]} declared */
function validate(plan,regionId,declared){
 require('./source-scene-program-tasks').sceneProgramTaskRevision(plan,regionId);
 const programs=require('./source-scene-region-program').validateCompiledRegionPrograms(plan);
 const tasks=require('./source-scene-program-obligations').pendingSceneProgramObligations(plan);
 const batches=require('./source-scene-relation-batches').sceneInventoryRelationBatches(plan);
 require('./source-scene-object-batches').sceneObjectBatches(plan);
 const owner=plan.regions.find(row=>row.id===regionId),current=programs.filter(row=>row.regionId===regionId),program=current[0];
 const relations=plan.relations.filter(row=>row.regionId===regionId).map(relationCore).sort((a,b)=>a.id.localeCompare(b.id));
 if(!owner||owner.kind!=='diagram'||plan.objects.some(row=>row.regionId===regionId)||current.length!==1||!program
  ||program.objects.length||program.labels.length||!relations.length||relations.length>48
  ||snapshot(declared)!==snapshot(relations))throw new TypeError('Scene inventory revision scope is invalid');
 if(!list(plan.observedInventory)||plan.observedInventory.length!==plan.regions.length
  ||plan.observedInventory.some(row=>!exact(row,['regionId','containers','icons','relations'])
   ||!plan.regions.some(region=>region.id===row.regionId)
   ||[row.containers,row.icons,row.relations].some(n=>n!==null&&(!Number.isSafeInteger(n)||Number(n)<0||Number(n)>10000)))
  ||new Set(plan.observedInventory.map(row=>row.regionId)).size!==plan.regions.length)
  throw new TypeError('Scene inventory revision census is invalid');
 const observed=plan.observedInventory.find(row=>row.regionId===regionId);
 if(!observed||observed.containers!==0||observed.icons!==0||observed.relations!==relations.length+1)
  throw new TypeError('Scene inventory revision census is invalid');
 if(!record(plan.admission)||plan.admission.complete!==false)throw new TypeError('Scene inventory revision admission is invalid');
 const rejected=rejections(plan.admission.rejections),relationRejected=rejected.filter(row=>row.collection==='relation');
 const task=tasks[0],global=batches.find(row=>row.id==='global'),rejection=relationRejected[0];
 if(tasks.length!==1||!task||task.program.regionId!==regionId||task.program.objects.length||task.program.labels.length
  ||relationRejected.length!==1||!rejection||rejection.reason!=='relation-contract'||rejection.detailCode!=='tuple'
  ||!global||global.rejected!==1||batches.some(batch=>batch.reserved.length)
  ||rejected.filter(row=>row.collection==='program'&&row.index===task.index&&row.reason==='program-contract'&&row.detailCode==='program-member').length!==1)
  throw new TypeError('Scene inventory revision historical obligation is invalid');
 const missing=task.program.relations.filter(id=>!plan.relations.some(row=>row.id===id));
 if(missing.length!==1||missing[0]!==`relation-n${200+rejection.index}`
  ||task.program.relations.some(id=>id!==missing[0]&&!relations.some(row=>row.id===id)))
  throw new TypeError('Scene inventory revision historical identity is invalid');
 return {relations,observedInventory:plan.observedInventory,supersededProgramIndex:task.index,supersededRelationRejection:rejection};
}
/** A trusted host calls this ONLY after an explicit complete human declaration.
 * Provider/serialized flags are never accepted as confirmation capabilities.
 * @param {unknown} input @returns {object} */
function issueSceneInventoryRevision(input){
 if(contexts.getStore())throw new TypeError('Scene inventory revision confirmation cannot nest');
 const request=copy(input);
 if(!exact(request,['plan','sourceFile','regionId','relations','confirmationId'])||!record(request)||!record(request.plan)
  ||!identity(request.regionId)||typeof request.confirmationId!=='string'||!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(request.confirmationId)
  ||!list(request.relations)||!request.relations.length||request.relations.length>48)
  throw new TypeError('Scene inventory revision confirmation is invalid');
 const plan=/** @type {Plan} */(/** @type {unknown} */(request.plan));
 const declared=request.relations.map(core).sort((a,b)=>a.id.localeCompare(b.id));
 if(new Set(declared.map(row=>row.id)).size!==declared.length)throw new TypeError('Scene inventory revision relation is invalid');
 const checked=validate(plan,request.regionId,declared),parentHash=snapshot(plan);
 const bytes=fileBytes(request.sourceFile),sourceHash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(sourceHash!==plan.sourceHash)throw new TypeError('Scene inventory revision source is invalid');
 try{
  const image=require('../png').readPngBuffer(bytes,{maxFileBytes:12*1024*1024,maxPixels:40000000,maxDimension:16384});
  if(image.width!==plan.widthPx||image.height!==plan.heightPx)throw new Error();
 }catch{throw new TypeError('Scene inventory revision source is invalid');}
 /** @type {Historical} */const historical={};
 for(const key of historyKeys)if(Object.hasOwn(plan,key))Object.defineProperty(historical,key,{value:plan[key],enumerable:true,writable:true,configurable:true});
 const base={version:/** @type {const} */(1),parentPlanHash:parentHash,sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,
  regionId:request.regionId,confirmationId:request.confirmationId,relations:checked.relations,historical,
  supersededProgramIndex:checked.supersededProgramIndex,supersededRelationRejection:checked.supersededRelationRejection};
 const revision=copy({...base,revisionId:snapshot(base)});
 const view=copy({...plan,observedInventory:checked.observedInventory.map(row=>row.regionId===request.regionId?{...row,relations:declared.length}:row)});
 // Match the standard no-alias rebinder's one deterministic membership order.
 // No set-wise comparison or ignored field can authorize another plan view.
 const compilerViewHash=snapshot({...view,regionPrograms:(view.regionPrograms??[]).map(program=>({...program,
  objects:view.objects.filter(row=>row.regionId===program.regionId).map(row=>row.id),
  relations:view.relations.filter(row=>row.regionId===program.regionId).map(row=>row.id)}))});
 const receipt=Object.freeze({});
 receipts.set(receipt,{revision,parentHash,viewHash:snapshot(view),compilerViewHash,view,expiresAt:Date.now()+LIFETIME_MS,used:false});
 return receipt;
}
/** @returns {Context|undefined} */
function context(){
 const active=contexts.getStore();
 if(active&&(active.closed||Date.now()>=active.issued.expiresAt))throw new TypeError('Scene inventory revision context is unavailable');
 return active;
}
/** @template T @param {unknown} receipt @param {()=>T|Promise<T>} callback @returns {Promise<T>} */
async function withSceneInventoryRevision(receipt,callback){
 if(contexts.getStore())throw new TypeError('Scene inventory revision context cannot nest');
 const issued=receipt!==null&&typeof receipt==='object'?receipts.get(receipt):undefined;
 if(!issued||issued.used||Date.now()>=issued.expiresAt||typeof callback!=='function')throw new TypeError('Scene inventory revision receipt is invalid');
 issued.used=true;
 const active={issued,runToken:Object.freeze({}),consumed:false,sealed:false,closed:false};
 return contexts.run(active,async()=>{
  try{
   const result=await callback();context();
   if(!active.consumed||!active.sealed)throw new TypeError('Scene inventory revision run is incomplete');
   return result;
  }finally{active.closed=true;}
 });
}
/** Only the active census changes. Every original history and drawable control
 * remains byte-for-data equivalent to the full parent snapshot.
 * @param {Plan} plan @param {string} [sourceFile] @returns {Plan} */
function effectiveSceneInventoryPlan(plan,sourceFile){
 const active=context();if(!active)return plan;
 const hash=snapshot(plan),issued=active.issued;
 if(hash!==issued.parentHash&&hash!==issued.viewHash)throw new TypeError('Scene inventory revision plan binding is invalid');
 if(sourceFile!==undefined&&crypto.createHash('sha256').update(fileBytes(sourceFile)).digest('hex')!==issued.revision.sourceHash)
  throw new TypeError('Scene inventory revision source is invalid');
 active.consumed=true;return issued.view;
}
/** A parent snapshot cannot acquire supersession by being queried directly.
 * @param {Plan} plan @returns {Revision|undefined} */
function sceneInventoryRevisionForPlan(plan){
 const active=context();if(!active)return undefined;
 const hash=snapshot(plan);
 if(hash===active.issued.parentHash)return undefined;
 if((hash!==active.issued.viewHash&&hash!==active.issued.compilerViewHash)||!active.consumed)
  throw new TypeError('Scene inventory revision plan binding is invalid');
 return active.issued.revision;
}
/** @returns {Readonly<{revision:Revision,runToken:object}>|undefined} */
function currentSceneInventoryRevision(){
 const active=context();return active?Object.freeze({revision:active.issued.revision,runToken:active.runToken}):undefined;
}
/** Called only by the trusted final-output sealer after normal compilation. */
function markSceneInventoryRevisionSealed(){
 const active=context();if(!active||!active.consumed)throw new TypeError('Scene inventory revision seal is unavailable');
 active.sealed=true;
}
module.exports={issueSceneInventoryRevision,withSceneInventoryRevision,effectiveSceneInventoryPlan,sceneInventoryRevisionForPlan,currentSceneInventoryRevision,markSceneInventoryRevisionSealed};
