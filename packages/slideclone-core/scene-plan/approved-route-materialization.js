// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {record,list,fingerprint}=require('./approved-frame-application-input');
const {unpackSceneInventoryMembers}=require('./source-scene-inventory-codec');
/** @typedef {import('./source-scene-observed-inventory').Finding} Finding */
/** @typedef {{type:'shape'|'image',id:string}} Member */
/** @typedef {{context:unknown,closed:boolean}} Finalizer */
/** @typedef {{deck:Record<string,unknown>,page:Record<string,unknown>,context:unknown,expires:number,
 * status:'pending'|'committed'|'revoked',sealed:boolean,inventory:string,unit:string,relationId:string,
 * retiredIds:string[],output:Record<string,unknown>,outputHash:string,endpoints:{id:string,hash:string}[],
 * slideSize:string,approvalId:string,sourceHash:string,selection?:{output:Record<string,unknown>,hash:string,onSelected:()=>void}}} State */
/** No serialized report, detector or expected-member count grants this capability.
 * The verified host transaction installs it on the actual output page identity.
 * @type {WeakMap<object,State>} */const states=new WeakMap();
/** @type {AsyncLocalStorage<Finalizer>} */const finalizers=new AsyncLocalStorage();
/** @type {AsyncLocalStorage<{state:State,closed:boolean}>} */const audits=new AsyncLocalStorage();
const fail=()=>{throw new TypeError('approved-route-materialization-unverified');};
/** @param {Record<string,unknown>} page */
function sceneOf(page){return record(record(page.source).sourceScene);}
/** @param {Record<string,unknown>} page */
function inventoryOf(page){return unpackSceneInventoryMembers(sceneOf(page).observedInventory);}
/** @param {Record<string,unknown>} page */
function outputs(page){return [...list(page.shapes??[],10000),...list(page.images??[],10000),...list(page.textBoxes??[],10000)].map(record);}
/** Capture source membership before replacement. This grants no pixel erasure
 * or strict equivalence. Legacy pages without a census receive no substitution.
 * Only prepareApprovedRouteApproximation calls this after policy validation.
 * @param {Record<string,unknown>} deck
 * @param {NonNullable<ReturnType<typeof import('./approved-route-approximation-input').approvedRouteApproximationOption>>} policy
 * @param {Record<string,unknown>[]} retired @param {Record<string,unknown>} output
 * @param {{output:Record<string,unknown>,onSelected:()=>void}|undefined} [selection] */
function prepareApprovedRouteMaterialization(deck,policy,retired,output,selection){
 const page=record(list(deck.pages,1)[0]);
 if(page.source===undefined||record(page.source).sourceScene===undefined)return null;
 const scene=sceneOf(page);
 if(scene.observedInventory===undefined)return null;
 try{
  const evidence=record(inventoryOf(page)),units=list(evidence.units,176).map(record);
  const matches=units.filter(u=>u.id===policy.relationId),unit=record(matches[0]);
  if(matches.length!==1||unit.kind!=='relation'||evidence.version===1||evidence.sourceHash!==policy.source.sha256
   ||scene.sourceHash!==policy.source.sha256||unit.regionId!==record(output.source).sceneRegionId)fail();
  const members=list(unit.members,32).map(record);
  if(members.length!==retired.length||members.some(m=>m.type!=='shape'||retired.filter(r=>r.id===m.id).length!==1)
   ||retired.some(r=>record(r.source).sceneInventoryId!==policy.relationId))fail();
  // Full original validation preserves source/revision, shared-graph, census and
  // endpoint rules. Unrelated incomplete observations remain audit findings.
  const original=require('./source-scene-observed-inventory').auditSceneInventory(
   scene.observedInventory,page.shapes,page.images,scene.sourceHash,page.textBoxes);
  if(original.some((/** @type {Finding} */ f)=>f.reason==='evidence-invalid'||f.reason==='inventory-revision-unverified'))fail();
  const inventory=fingerprint(evidence),unitHash=fingerprint(unit),slideSize=fingerprint(deck.slideSize);
  const selected=selection?{...selection,hash:fingerprint(selection.output)}:undefined;
  let published=false;
  return {publish(/** @type {unknown} */ context){
   try{
    if(published||record(context).deck!==deck||record(list(deck.pages,1)[0])!==page||states.has(page)
     ||fingerprint(inventoryOf(page))!==inventory||fingerprint(deck.slideSize)!==slideSize)fail();
    const all=outputs(page),replacements=all.filter(s=>s.id===output.id);
    if(replacements.length!==1||replacements[0]!==output||retired.some(r=>all.some(s=>s.id===r.id)))fail();
    const endpoints=policy.endpoints.map(e=>{
     const found=all.filter(s=>s.id===e.id);if(found.length!==1)fail();return {id:e.id,hash:fingerprint(found[0])};
    });
    /** @type {State} */const state={deck,page,context,expires:Date.now()+30*60*1000,status:'pending',sealed:false,
     inventory,unit:unitHash,relationId:policy.relationId,retiredIds:retired.map(r=>String(r.id)),output,outputHash:fingerprint(output),
     endpoints,slideSize,approvalId:policy.approvalId,sourceHash:policy.source.sha256,...(selected?{selection:selected}:{})};
    states.set(page,state);published=true;
    return {commit(){if(state.status!=='pending'||!state.sealed||!valid(state))fail();state.status='committed';},
     rollback(){state.status='revoked';if(states.get(page)===state)states.delete(page);}};
   }catch{fail();}
  }};
 }catch{fail();}
}
/** Bind the whole native object, exact source census, endpoint render fields,
 * retired-member absence and page/deck identity. Other units are still audited
 * normally; a replacement never supplies membership for a shared graph.
 * @param {State} state */
function valid(state){
 try{
  if(state.status==='revoked'||Date.now()>state.expires||record(list(state.deck.pages,1)[0])!==state.page
   ||fingerprint(state.deck.slideSize)!==state.slideSize||fingerprint(inventoryOf(state.page))!==state.inventory
   ||sceneOf(state.page).sourceHash!==state.sourceHash)return false;
  const all=outputs(state.page),part=all.filter(s=>s.id===state.output.id);
  if(part.length!==1||part[0]!==state.output||fingerprint(part[0])!==state.outputHash
   ||state.retiredIds.some(id=>all.some(s=>s.id===id)))return false;
  if(state.endpoints.some(e=>{const rows=all.filter(s=>s.id===e.id);return rows.length!==1||fingerprint(rows[0])!==e.hash;}))return false;
  for(const item of all)if(item.style!==undefined){const style=record(item.style);
   for(const key of ['startAnchor','endAnchor'])if(style[key]!==undefined&&state.retiredIds.includes(String(record(style[key]).elementId)))return false;
  }
  return true;
 }catch{return false;}
}
/** Synchronous finalization is the only place a prepared transaction can seal.
 * Closing the scope prevents promises/timers retaining provisional authority.
 * Commit and rollback are owned by the existing application lifecycle.
 * @template T @param {unknown} context @param {()=>T} operation @returns {T} */
function withApprovedRouteMaterializationFinalizer(context,operation){
 let state;
 try{const data=record(context),deck=record(data.deck),page=record(list(deck.pages,1)[0]);state=states.get(page);}
 catch{return operation();}
 if(!state)return operation();
 if(state.context!==context||state.status!=='pending'||state.sealed||!valid(state)||finalizers.getStore())return fail();
 // Earlier pixel applications consume the exact reviewed drawing. Only after
 // ALL applications succeed may this same private transaction select its
 // precomputed native representation. No source/pixel approval is rebound.
 if(state.selection){
  const selected=state.selection;
  if(fingerprint(selected.output)!==selected.hash||selected.output.id!==state.output.id)fail();
  state.page.shapes=list(state.page.shapes,10000).map(part=>part===state.output?selected.output:part);
  state.output=selected.output;state.outputHash=selected.hash;delete state.selection;
  selected.onSelected();if(!valid(state))fail();
 }
 const scope={context,closed:false};state.sealed=true;
 try{return finalizers.run(scope,()=>{const result=operation();if(!valid(state))fail();return result;});}
 finally{scope.closed=true;}
}
/** A narrow, process-local overlay for the final structural audit only. The
 * caller retains the ordinary strict findings alongside this separate result.
 * @template T @param {unknown} deck @param {unknown} page @param {()=>T} operation
 * @returns {{status:'absent'|'invalid',approvals:never[]}|{status:'verified',approvals:{relationId:string,approvalId:string,sourceMembers:number,outputMembers:number,strictSourceEquivalent:false}[],result:T}} */
function auditApprovedRouteMaterialization(deck,page,operation){
 try{
  const d=record(deck),p=record(page),state=states.get(p);
  if(!state){
   // Absence is a receipt lookup, not a second whole-page snapshot gate.
   // Exact approved output/endpoints retain their bounded fingerprints in
   // valid(). Unrelated glyph geometry cannot consume this receipt's budget.
   const all=outputs(p);if(all.includes(p))return {status:'invalid',approvals:[]};
   const claimed=all.some(s=>s.source!==undefined&&record(s.source).detector==='approved-native-route-approximation');
   return {status:claimed?'invalid':'absent',approvals:[]};
  }
  const scope=finalizers.getStore();
  if(state.deck!==d||!state.sealed||!valid(state)||state.status!=='committed'&&(!scope||scope.closed||scope.context!==state.context)||audits.getStore())
   return {status:'invalid',approvals:[]};
  const audit={state,closed:false};
  try{
   const result=audits.run(audit,operation);
   if(result&&typeof result==='object'&&'then' in result||!valid(state))return {status:'invalid',approvals:[]};
   return {status:'verified',approvals:[{relationId:state.relationId,approvalId:state.approvalId,
    sourceMembers:state.retiredIds.length,outputMembers:1,strictSourceEquivalent:false}],result};
  }finally{audit.closed=true;}
 }catch{return {status:'invalid',approvals:[]};}
}
/** Only the active verified structural audit may resolve one exact unit. This
 * does not change units.members or the ordinary strict inspector's result.
 * @param {unknown} unit @param {unknown} shapes @param {unknown} images @param {unknown} texts @returns {Member[]|undefined} */
function approvedRouteMaterializedMembers(unit,shapes,images,texts){
 const scope=audits.getStore();if(!scope||scope.closed)return undefined;
 const state=scope.state;
 if(shapes!==state.page.shapes||images!==state.page.images||texts!==state.page.textBoxes
  ||record(unit).id!==state.relationId)return undefined;
 if(fingerprint(unit)!==state.unit||!valid(state))return fail();
 return [{type:'shape',id:String(state.output.id)}];
}
module.exports={prepareApprovedRouteMaterialization,withApprovedRouteMaterializationFinalizer,
 auditApprovedRouteMaterialization,approvedRouteMaterializedMembers};
