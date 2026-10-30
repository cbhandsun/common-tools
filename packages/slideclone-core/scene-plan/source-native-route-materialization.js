// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {record,list}=require('./source-scene-group-containment');
const {unpackSceneInventoryMembers}=require('./source-scene-inventory-codec');
const {sharedOutputWork,sharedRouteOutputSnapshot}=require('../routing/source-shared-route-output-snapshot');
const {auditApprovedRouteMaterialization}=require('./approved-route-materialization');
const {isMeasuredFilledNativeSelection}=require('../routing/source-filled-route-native');
/** @typedef {import('../routing/source-shared-route-output-paint').Item} Item */
/** @typedef {{relationId:string,unit:string,retired:string[],output:Item,outputHash:string,endpoints:{id:string,hash:string}[]}} Replacement */
/** @typedef {{page:Record<string,unknown>,shapes:unknown,inventory:string,sourceHash:unknown,slideSize:string,replacements:Replacement[],committed:boolean,deck?:object}} State */
/** @type {WeakMap<object,State>} */const receipts=new WeakMap();
/** @type {WeakMap<object,State>} */const states=new WeakMap();
/** @type {AsyncLocalStorage<{state:State,closed:boolean,work:{checks:number}}>} */const audits=new AsyncLocalStorage();
const invalid=()=>new TypeError('Measured native route materialization is invalid');
/** @param {unknown} value @param {{checks:number}} work */
function fingerprint(value,work){const result=sharedRouteOutputSnapshot({source:{value}},work);if(result===null)throw invalid();return result;}
/** @param {Record<string,unknown>} page */
const sceneOf=page=>record(page.source)&&record(page.source.sourceScene)?page.source.sourceScene:null;
/** @param {Record<string,unknown>} page */
function outputs(page){const collections=[page.shapes??[],page.images??[],page.textBoxes??[]];
 if(!collections.every(a=>list(a)&&a.length<=10000&&a.every(record)))throw invalid();
 const all=collections.flatMap(a=>/** @type {Item[]} */(a));
 if(all.length>10000||all.some(p=>p.source!==undefined&&!record(p.source)||p.style!==undefined&&!record(p.style)))throw invalid();return all;}
/** Private measured selectors call this before retiring any original member.
 * Keep the original source census unchanged. Only the final structural audit
 * can resolve its exact relation against the selected single output member.
 * @param {{page:Record<string,unknown>,shapes:Item[],slideSize:unknown,selections:{parts:Item[],output:Item}[],work:{checks:number}}} input */
function prepareNativeRouteMaterialization({page,shapes,slideSize,selections,work}){
 if(!sharedOutputWork(work))throw invalid();
 const scene=sceneOf(page);if(!scene||scene.observedInventory===undefined||!selections.length)return null;
 const evidence=unpackSceneInventoryMembers(scene.observedInventory);
 if(!record(evidence)||!list(evidence.units)||!evidence.units.every(record)||evidence.sourceHash!==scene.sourceHash)throw invalid();
 const all=outputs(page),replacements=[],seen=new Set();
 for(const selected of selections){
  if(!isMeasuredFilledNativeSelection(selected,work,page))throw invalid();
  const relationId=selected.output.source?.sceneRelationId;
  if(typeof relationId!=='string'||seen.has(relationId))throw invalid();seen.add(relationId);
  const matches=evidence.units.filter(u=>u.id===relationId),unit=matches[0];
  if(matches.length!==1||!unit||unit.kind!=='relation'||!list(unit.members)||unit.members.length!==selected.parts.length
   ||unit.members.some(m=>!record(m)||m.type!=='shape'||selected.parts.filter(p=>p.id===m.id).length!==1))throw invalid();
  if(list(evidence.sharedRouteGraphs)&&evidence.sharedRouteGraphs.some(g=>record(g)&&list(g.paths)&&g.paths.some(p=>record(p)&&p.relationId===relationId)))throw invalid();
  const nodeIds=selected.output.source?.sourceNodeIds;
  if(!list(nodeIds)||nodeIds.length!==2||!nodeIds.every(id=>typeof id==='string'))throw invalid();
  const endpoints=nodeIds.map(id=>{const found=all.filter(p=>p.id===id);if(found.length!==1)throw invalid();return {id:String(id),hash:fingerprint(found[0],work)};});
  replacements.push({relationId,unit:fingerprint(unit,work),retired:selected.parts.map(p=>{if(typeof p.id!=='string')throw invalid();return p.id;}),
   output:selected.output,outputHash:fingerprint(selected.output,work),endpoints});
 }
 // Validate the original census before installing any substitution. Existing
 // incomplete units remain findings; malformed source/revision evidence fails.
 const findings=require('./source-scene-observed-inventory').auditSceneInventory(scene.observedInventory,page.shapes,page.images,scene.sourceHash,page.textBoxes);
 if(findings.some((/** @type {import('./source-scene-observed-inventory').Finding} */ f)=>f.reason==='evidence-invalid'||f.reason==='inventory-revision-unverified'))throw invalid();
 const state={page,shapes,inventory:fingerprint(evidence,work),sourceHash:scene.sourceHash,slideSize:fingerprint(slideSize,work),replacements,committed:false};
 const receipt=Object.freeze(Object.create(null));receipts.set(receipt,state);return receipt;
}
/** @param {State} state @param {unknown} deck @param {{checks:number}} work */
function valid(state,deck,work){
 if(!record(deck)||!list(deck.pages)||deck.pages.length!==1||deck.pages[0]!==state.page||state.page.shapes!==state.shapes
  ||fingerprint(deck.slideSize,work)!==state.slideSize)return false;
 const scene=sceneOf(state.page);if(!scene||scene.sourceHash!==state.sourceHash||fingerprint(unpackSceneInventoryMembers(scene.observedInventory),work)!==state.inventory)return false;
 const all=outputs(state.page);
 for(const row of state.replacements){
  const matches=all.filter(p=>p.id===row.output.id);
  if(matches.length!==1||matches[0]!==row.output||fingerprint(matches[0],work)!==row.outputHash
   ||row.retired.some(id=>id!==row.output.id&&all.some(p=>p.id===id))
   ||row.endpoints.some(e=>{const found=all.filter(p=>p.id===e.id);return found.length!==1||fingerprint(found[0],work)!==e.hash;}))return false;
  for(const item of all)for(const key of ['startAnchor','endAnchor']){const anchor=item.style?.[key];
   if(record(anchor)&&row.retired.includes(String(anchor.elementId)))return false;
  }
 }
 return true;
}
/** The composition root commits only after it has installed the exact selected
 * arrays on its original page and completed all other output transformations.
 * @param {unknown} input */
function commitNativeRouteMaterialization(input){
 if(!record(input))throw invalid();if(input.receipt===null||input.receipt===undefined)return;
 const state=typeof input.receipt==='object'?receipts.get(input.receipt):undefined;
 if(!state||state.committed||!record(input.deck)||states.has(state.page)||!valid(state,input.deck,{checks:0}))throw invalid();
 state.deck=input.deck;state.committed=true;states.set(state.page,state);
}
/** @template T @param {unknown} deck @param {unknown} page @param {()=>T} operation */
function auditMeasured(deck,page,operation){
 if(!record(page))return {status:/** @type {const} */('invalid')};
 const state=states.get(page);
 if(!state){const scene=sceneOf(page),claimed=scene?.observedInventory!==undefined&&outputs(page).some(p=>p.source?.nativeFilledRoute===true);
  return {status:/** @type {'invalid'|'absent'} */(claimed?'invalid':'absent')};}
 const work={checks:0};
 if(state.deck!==deck||!state.committed||audits.getStore()||!valid(state,deck,work))return {status:/** @type {const} */('invalid')};
 const scope={state,closed:false,work};
 try{const result=audits.run(scope,operation);if(result&&typeof result==='object'&&'then'in result||!valid(state,deck,work))return {status:/** @type {const} */('invalid')};
  return {status:/** @type {const} */('verified'),result,nativeRepresentations:state.replacements.map(r=>({relationId:r.relationId,sourceMembers:r.retired.length,outputMembers:1,
   policy:'measured-whole-native-route-v1',strictSourceEquivalent:false}))};
 }finally{scope.closed=true;}
}
/** Combine independent host-approved and compiler-measured output receipts;
 * neither changes the default strict source-inventory audit.
 * @template T @param {unknown} deck @param {unknown} page @param {()=>T} inspect */
function auditFinalRouteMaterialization(deck,page,inspect){
 const measured=auditMeasured(deck,page,()=>{const approved=auditApprovedRouteMaterialization(deck,page,inspect);
  return {approved,result:approved.status==='verified'?approved.result:inspect()};});
 if(measured.status==='invalid')return {status:/** @type {const} */('invalid'),approvals:/** @type {never[]} */([]),nativeRepresentations:/** @type {never[]} */([])};
 if(measured.status==='absent')return {...auditApprovedRouteMaterialization(deck,page,inspect),nativeRepresentations:/** @type {never[]} */([])};
 const result=measured.result;if(!result||result.approved.status==='invalid'||result.result&&typeof result.result==='object'&&'then'in result.result)return {status:/** @type {const} */('invalid'),approvals:/** @type {never[]} */([]),nativeRepresentations:/** @type {never[]} */([])};
 return {status:/** @type {const} */('verified'),result:result.result,approvals:result.approved.status==='verified'?result.approved.approvals:[],nativeRepresentations:measured.nativeRepresentations};
}
/** Resolve only the exact unchanged unit inside the synchronous private audit.
 * @param {unknown} unit @param {unknown} shapes @param {unknown} images @param {unknown} texts */
function measuredNativeRouteMembers(unit,shapes,images,texts){
 const scope=audits.getStore();if(!scope||scope.closed||!record(unit))return undefined;
 const state=scope.state,row=state.replacements.find(r=>r.relationId===unit.id);if(!row)return undefined;
 if(shapes!==state.page.shapes||images!==state.page.images||texts!==state.page.textBoxes||fingerprint(unit,scope.work)!==row.unit
  ||!valid(state,state.deck,scope.work))throw invalid();
 return [{type:'shape',id:row.output.id}];
}
module.exports={prepareNativeRouteMaterialization,commitNativeRouteMaterialization,auditFinalRouteMaterialization,measuredNativeRouteMembers};
