// @ts-check
'use strict';
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {sameSceneNativeGeometry,parseSceneNativeGeometry}=require('./source-scene-native-geometry');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {{id:string,regionId:string}} Member */
/** @typedef {{id:'global'|'local-consensus',members:Member[],reviewed?:string[],rejected:number}} Batch */
/** @typedef {{sourceHash:string,widthPx:number,heightPx:number,batches:Batch[],aliases:{id:string,canonicalId:string}[]}} ObjectBatches */
/** @param {unknown} value @returns {value is string} */
function identity(value){return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);}
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function collection(value,maximum){if(!list(value)||value.length>maximum)throw new TypeError('Scene object batch collection is invalid');return value;}
/** @param {unknown} value @param {number} maximum */
function count(value,maximum){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>maximum)
 throw new TypeError('Scene object batch count is invalid');return value;}
/** @param {unknown} value @returns {Member} */
function member(value){if(!record(value)||Reflect.ownKeys(value).length!==2||!identity(value.id)||!identity(value.regionId))
 throw new TypeError('Scene object batch member is invalid');return {id:value.id,regionId:value.regionId};}
/** Global failures retain their original slots, including malformed identities.
 * Only sanitized admission controls are read; no provider payload is persisted.
 * @param {Plan} plan */
function globalRejections(plan){
 const seen=new Set();
 if(plan.admission!==undefined&&(!record(plan.admission)||!list(plan.admission.rejections)||plan.admission.rejections.length>256))
  throw new TypeError('Scene object batch admission is invalid');
 for(const row of plan.admission?.rejections??[]){
  if(!record(row))throw new TypeError('Scene object batch admission is invalid');
  if(row.collection!=='object')continue;
  if(!Number.isSafeInteger(row.index)||row.index<0||row.index>=64||seen.has(row.index)||row.reason!=='object-contract')
   throw new TypeError('Scene object batch admission is invalid');seen.add(row.index);
 }
 return seen.size;
}
/** A ledger is internal control data, never accepted from model output. Bind
 * every slot to this source and owner. Source-proven aliases retain their slots;
 * neither deduplication nor a rejected proposal refunds capacity.
 * @param {Plan} plan @returns {ObjectBatches|undefined} */
function sceneObjectBatches(plan){
 if(!record(plan)||!list(plan.objects)||plan.objects.length>96||plan.objects.some(o=>!record(o)||!identity(o.id)||!identity(o.regionId))
  ||new Set(plan.objects.map(o=>o.id)).size!==plan.objects.length)throw new TypeError('Scene object batch inventory is invalid');
 const value=plan.objectBatches;
 if(value===undefined){if(plan.objects.length>64)throw new TypeError('Scene object batch legacy capacity is invalid');return undefined;}
 if(!record(value)||Reflect.ownKeys(value).some(k=>!['sourceHash','widthPx','heightPx','batches','aliases'].includes(String(k)))
  ||value.sourceHash!==plan.sourceHash||typeof value.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(value.sourceHash)
  ||value.widthPx!==plan.widthPx||value.heightPx!==plan.heightPx
  ||![value.widthPx,value.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(value.widthPx)*Number(value.heightPx)>40000000)throw new TypeError('Scene object batch source is invalid');
 const names=new Set(),members=new Map();
 const batches=collection(value.batches,2).map(raw=>{
  if(!record(raw)||Reflect.ownKeys(raw).some(k=>!['id','members','reviewed','rejected'].includes(String(k)))
   ||(raw.id!=='global'&&raw.id!=='local-consensus')||names.has(raw.id)||raw.id==='global'&&raw.reviewed!==undefined)
   throw new TypeError('Scene object batch binding is invalid');
  names.add(raw.id);const maximum=raw.id==='global'?64:32;
  const current=collection(raw.members,maximum).map(member),reviewed=collection(raw.reviewed??[],32);
  const rejected=count(raw.rejected,maximum);
  if(current.length+reviewed.length+rejected>maximum||reviewed.some(id=>!identity(id)))throw new TypeError('Scene object batch capacity is invalid');
  for(const unit of current){if(members.has(unit.id))throw new TypeError('Scene object batch identities conflict');members.set(unit.id,unit);}
  return {id:/** @type {Batch['id']} */(raw.id),members:current,rejected,...(raw.id==='local-consensus'?{reviewed:/** @type {string[]} */([...reviewed])}:{})};
 });
 if(!names.has('global')||batches.find(b=>b.id==='global')?.rejected!==globalRejections(plan))throw new TypeError('Scene object batch admission binding is invalid');
 const aliases=collection(value.aliases,96).map(raw=>{
  if(!record(raw)||Reflect.ownKeys(raw).length!==2||!identity(raw.id)||!identity(raw.canonicalId))throw new TypeError('Scene object batch alias is invalid');
  return {id:raw.id,canonicalId:raw.canonicalId};
 });
 if(new Set(aliases.map(a=>a.id)).size!==aliases.length)throw new TypeError('Scene object batch aliases conflict');
 const actual=new Map(plan.objects.map(o=>[o.id,o]));
 for(const unit of members.values()){
  const object=actual.get(unit.id),alias=aliases.find(a=>a.id===unit.id),canonical=alias?actual.get(alias.canonicalId):undefined;
  if(object?(alias!==undefined||object.regionId!==unit.regionId):(!canonical||canonical.regionId!==unit.regionId))
   throw new TypeError('Scene object batch owner is invalid');
 }
 if(plan.objects.some(o=>!members.has(o.id))||aliases.some(a=>!members.has(a.id))
  ||batches.some(b=>b.reviewed?.some(id=>!members.has(id))))throw new TypeError('Scene object batch coverage is invalid');
 return {sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,batches,aliases};
}
/** Called once after strict global admission. Old serialized plans receive no
 * implicit upgrade. Raw responses cannot choose batches or reset the ledger.
 * @param {Plan} plan @returns {Plan} */
function initializeSceneObjectBatches(plan){
 if(plan.objectBatches!==undefined)throw new TypeError('Scene object batch initialization is invalid');
 sceneObjectBatches(plan);
 const result={...plan,objectBatches:{sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,
  batches:[{id:/** @type {const} */('global'),members:plan.objects.map(o=>({id:o.id,regionId:o.regionId})),rejected:globalRejections(plan)}],aliases:/** @type {{id:string,canonicalId:string}[]} */([])}};
 sceneObjectBatches(result);return result;
}
/** @param {Plan} plan */
function sceneObjectLimit(plan){return sceneObjectBatches(plan)?96:64;}
/** The two local views corroborate one proposal batch. Repeated corrections
 * are charged again; agreeing with an unchanged object still uses a slot.
 * @param {Plan|undefined} plan */
function sceneLocalObjectCapacity(plan){
 if(!plan)return 0;const ledger=sceneObjectBatches(plan);
 if(!ledger)return 64-plan.objects.length;
 const local=ledger.batches.find(b=>b.id==='local-consensus');
 return 32-(local?.members.length??0)-(local?.reviewed?.length??0)-(local?.rejected??0);
}
/** Compiler header recoveries use only unspent original global slots. They
 * cannot borrow local proposal capacity or refund aliases/rejections.
 * @param {Plan} plan */
function sceneHeaderObjectCapacity(plan){
 if(record(plan)&&plan.objectBatches===undefined&&list(plan.objects))return 64-plan.objects.length;
 const ledger=sceneObjectBatches(plan);if(!ledger)return 64-plan.objects.length;
 const global=ledger.batches.find(b=>b.id==='global');return 64-(global?.members.length??0)-(global?.rejected??0);
}
/** Record an atomic admitted transition; never mutate or refund its input.
 * @param {Plan} original @param {Plan} result @param {string[]} added
 * @param {string[]} [reviewed] @param {number} [rejected] @returns {Plan} */
function recordSceneLocalObjectBatch(original,result,added,reviewed=[],rejected=0){
 const ledger=sceneObjectBatches(original);count(rejected,32);
 const additions=collection(added,32),reviews=collection(reviewed,32);
 if(!record(result)||!list(result.objects)||result.objects.some(o=>!record(o)||!validBox(o.box)
  ||!['container','icon','unknown'].includes(o.kind)||o.box.x+o.box.w>original.widthPx+1e-6||o.box.y+o.box.h>original.heightPx+1e-6)
  ||original.objects.some(o=>!record(o.box))
  ||additions.some(id=>!identity(id))||reviews.some(id=>!identity(id))||new Set(additions).size!==additions.length
  ||original.sourceHash!==result.sourceHash||original.widthPx!==result.widthPx||original.heightPx!==result.heightPx
  ||result.objectBatches!==original.objectBatches)throw new TypeError('Scene object batch transition is invalid');
 for(const object of result.objects){const geometry=parseSceneNativeGeometry(object.nativeGeometry);
  if(geometry&&object.kind!=='container')throw new TypeError('Scene object batch geometry owner is invalid');}
 if(!ledger){sceneObjectBatches(result);return result;}
 if(!list(original.regions)||original.regions.some(r=>!record(r))||result.regions!==original.regions
  ||result.objects.some(o=>!original.regions.some(r=>r.id===o.regionId)))throw new TypeError('Scene object batch transition owner is invalid');
 if(added.length+reviewed.length+rejected>sceneLocalObjectCapacity(original))throw new RangeError('Scene local object proposal capacity exceeded');
 const prior=new Map(original.objects.map(o=>[o.id,o])),next=new Map(result.objects.map(o=>[o.id,o]));
 const same=(/** @type {Plan['objects'][number]} */a,/** @type {Plan['objects'][number]|undefined} */b)=>b!==undefined
  &&['id','regionId','kind','parentObjectId','pictorialContent','nativePictorial'].every(k=>a[/** @type {keyof typeof a} */(k)]===b[/** @type {keyof typeof b} */(k)])
  &&['x','y','w','h'].every(k=>a.box[/** @type {keyof typeof a.box} */(k)]===b.box[/** @type {keyof typeof b.box} */(k)])
  &&sameSceneNativeGeometry(a.nativeGeometry,b.nativeGeometry);
 if(next.size!==result.objects.length||result.objects.some(o=>!prior.has(o.id)&&!added.includes(o.id))
  ||added.some(id=>prior.has(id)||!next.has(id))||original.objects.some(o=>!next.has(o.id)
   ||!reviewed.includes(o.id)&&!same(o,next.get(o.id)))
  ||reviewed.some(id=>!prior.has(id)))throw new TypeError('Scene object batch transition membership is invalid');
 if(!added.length&&!reviewed.length&&!rejected){sceneObjectBatches(result);return result;}
 const previous=ledger.batches.find(b=>b.id==='local-consensus');
 const local={id:/** @type {const} */('local-consensus'),members:[...(previous?.members??[]),...added.map(id=>member({id,regionId:next.get(id)?.regionId}))],
  reviewed:[...(previous?.reviewed??[]),...reviewed],rejected:(previous?.rejected??0)+rejected};
 const batches=[...ledger.batches.filter(b=>b.id==='global'),local].map(b=>({...b,members:b.members.map(m=>{
  const object=next.get(m.id)??next.get(ledger.aliases.find(a=>a.id===m.id)?.canonicalId??'');
  return {...m,regionId:object?.regionId??m.regionId};
 })}));
 const plan={...result,objectBatches:{...ledger,batches}};sceneObjectBatches(plan);return plan;
}
/** Only the existing source-proven alias consumer calls this operation.
 * @param {Plan} original @param {Plan} result @param {{id:string,canonicalId:string}[]} aliases @returns {Plan} */
function recordSceneObjectAliases(original,result,aliases){
 const ledger=sceneObjectBatches(original);if(!ledger)return result;
 const canonical=new Map(aliases.map(a=>[a.id,a.canonicalId]));
 const previous=ledger.aliases.map(a=>({...a,canonicalId:canonical.get(a.canonicalId)??a.canonicalId}));
 const plan={...result,objectBatches:{...ledger,aliases:[...previous,...aliases]}};sceneObjectBatches(plan);return plan;
}
/** Serialized inventory has no source-pixel privileges. Complete membership
 * and source binding must survive the same ledger validation as compilation.
 * @param {unknown} value @param {Member[]} objects @param {string} sourceHash */
function sceneInventoryObjectBatchesValid(value,objects,sourceHash){
 if(!record(value))return false;
 try{
  const global=collection(value.batches,2).find(b=>record(b)&&b.id==='global');
  if(!record(global))return false;
  const result=sceneObjectBatches(/** @type {Plan} */({sourceHash,widthPx:value.widthPx,heightPx:value.heightPx,objects,objectBatches:value,
   admission:{rejections:Array.from({length:count(global.rejected,64)},(_,index)=>({collection:'object',index,reason:'object-contract'}))}}));
  return result!==undefined;
 }catch(error){if(!(error instanceof TypeError&&/^Scene object batch /u.test(error.message)))throw error;return false;}
}
module.exports={sceneObjectBatches,initializeSceneObjectBatches,sceneObjectLimit,sceneLocalObjectCapacity,sceneHeaderObjectCapacity,
 recordSceneLocalObjectBatch,recordSceneObjectAliases,sceneInventoryObjectBatchesValid};
