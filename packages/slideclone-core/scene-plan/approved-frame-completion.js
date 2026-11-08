// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {record,list,fingerprint}=require('./approved-frame-application-input');
/** @typedef {{deck:Record<string,unknown>,page:Record<string,unknown>,context:unknown,source:string,compilation:string,slide:string,
 * frames:{regionId:string,approvedRegionId:string,shape:Record<string,unknown>,hash:string}[],approvalId:string,status:'pending'|'committed'|'revoked',sealed:boolean}} State */
/** Host application receipts, never serialized flags, authorize semantic
 * completion of a perimeter. Source census and strict coverage stay intact.
 * @type {WeakMap<object,State>} */const states=new WeakMap();
/** @type {AsyncLocalStorage<{context:unknown,closed:boolean}>} */const scopes=new AsyncLocalStorage();
/** @returns {never} */function fail(){throw new TypeError('approved-frame-completion-unverified');}
/** @param {Record<string,unknown>} page */
const sceneOf=page=>record(record(page.source).sourceScene);
/** Native finalization replaces its derived representation report. It is not
 * source evidence or perimeter authority; route receipts audit actual members.
 * Every other source-scene field remains bound byte for byte.
 * @param {Record<string,unknown>} page */
function sourceFingerprint(page){
 const scene=sceneOf(page);
 return fingerprint(Object.fromEntries(Object.entries(scene).filter(([key])=>key!=='routeRepresentations')));
}
/** @param {Record<string,unknown>} deck */
const compilationOf=deck=>record(record(deck.meta).sourceSceneCompilation);
/** Only an otherwise materialized region with exactly its own missing
 * perimeter can receive this exception. Counts do not replace inventory audit.
 * @param {Record<string,unknown>} scene @param {Record<string,unknown>} compilation @param {string} id */
function perimeterOnly(scene,compilation,id){
 const program=record(compilation.regionPrograms),coverage=record(program.coverage);
 const matches=list(coverage.rows,112).map(record).filter(row=>row.regionId===id),row=matches[0];
 if(matches.length!==1||!row||row.complete!==false||row.program!=='admitted'||coverage.sourceHash!==scene.sourceHash)fail();
 const objects=record(row.objects),relations=record(row.relations);
 if(!Number.isSafeInteger(objects.admitted)||Number(objects.admitted)<0||objects.admitted!==objects.materialized
  ||!Number.isSafeInteger(relations.admitted)||Number(relations.admitted)<0||relations.observed!==relations.admitted||relations.admitted!==relations.materialized)fail();
 const rejected=list(program.rejected,112).map(record).filter(item=>item.regionId===id);
 if(rejected.length!==1||rejected[0]?.reason!=='region-members-incomplete'
  ||fingerprint(rejected[0]?.missing)!==fingerprint([id]))fail();
 for(const unresolved of [scene.unresolved,compilation.unresolved]){
  const own=list(unresolved,112).map(record).filter(item=>item.id===id);
  if(own.length!==2||own.filter(item=>item.reason==='container-perimeter').length!==1
   ||own.filter(item=>item.reason==='region-members-incomplete').length!==1)fail();
 }
}
/** Called only after the host application consumes its verified draw receipt.
 * No new measurement, erasure permission or inventory membership is issued.
 * @param {unknown} context @param {unknown} frames @param {string} approvalId @param {string} sourceHash
 * @param {{width:number,height:number}} dimensions */
function publishApprovedFrameCompletion(context,frames,approvalId,sourceHash,dimensions){
 const data=record(context),deck=record(data.deck),page=record(list(deck.pages,1)[0]);
 if(page.source===undefined||record(page.source).sourceScene===undefined)return null;
 const scene=sceneOf(page);
 if(scene.version!==1||scene.observedInventory===undefined)return null;
 const compilation=compilationOf(deck),drawn=list(frames,3).map(record);
 const incomplete=new Set(list(scene.unresolved,112).map(record).map(item=>item.id));
 // A complete scene needs no perimeter exception. Legacy inventory-only
 // scenes need not carry a region tree; returning no receipt leaves normal
 // route finalization and every independent output audit in force.
 if(!incomplete.size)return null;
 const slide=record(deck.slideSize);
 if(![dimensions.width,dimensions.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=32768)
  ||dimensions.width*dimensions.height>40000000||typeof slide.widthPt!=='number'||typeof slide.heightPt!=='number'
  ||![slide.widthPt,slide.heightPt].every(n=>Number.isFinite(n)&&n>0))fail();
 const sx=dimensions.width/slide.widthPt,sy=dimensions.height/slide.heightPt;
 const regions=list(scene.regionTree,112).map(record);
 const selected=drawn.flatMap(shape=>{
  const frame=record(record(shape.source).approximateFrame),approvedRegionId=frame.regionId,bounds=record(shape.box);
  if(typeof approvedRegionId!=='string')return fail();
  // A model ID can change between recognitions. Match the unchanged approved
  // drawing to ONE currently incomplete container in the SAME source frame.
  // The 5px proposal-envelope tolerance grants no pixels, erasure or fit change.
  const matches=regions.filter(region=>{
   if(!incomplete.has(region.id)||!['card','container'].includes(String(region.kind)))return false;
   const box=record(region.box);
   return ['x','y','w','h'].every(key=>typeof box[key]==='number'&&typeof bounds[key]==='number'
    &&Number.isFinite(box[key])&&Number.isFinite(bounds[key])
    &&Math.abs(Number(box[key])-Number(bounds[key]))*(key==='x'||key==='w'?sx:sy)<=5);
  });
  if(matches.length>1||!matches.length&&incomplete.has(approvedRegionId))return fail();
  if(!matches.length)return [];
  const regionId=matches[0]?.id;if(typeof regionId!=='string')return fail();
  return [{shape,regionId,approvedRegionId}];
 });
 if(!selected.length)return null;
 if(states.has(page)||scene.sourceHash!==sourceHash||typeof approvalId!=='string'||!approvalId.length)fail();
 const bindings=selected.map(({shape,regionId,approvedRegionId})=>{
  const source=record(shape.source),frame=record(source.approximateFrame);
  if(typeof regionId!=='string'||frame.approvalId!==approvalId||frame.sourceSha256!==sourceHash
   ||source.editable!==true||shape.type!=='roundRect'||frame.strictMeasurement!==false||frame.sourceErasure!==false)fail();
  perimeterOnly(scene,compilation,String(regionId));
  return {regionId,approvedRegionId,shape,hash:fingerprint(shape)};
 });
 if(new Set(bindings.map(row=>row.regionId)).size!==bindings.length)fail();
 /** @type {State} */const state={deck,page,context,source:sourceFingerprint(page),compilation:fingerprint(compilation),slide:fingerprint(deck.slideSize),
  frames:bindings,approvalId,status:'pending',sealed:false};
 states.set(page,state);
 return {commit(){if(state.status!=='pending'||!state.sealed||!valid(state))fail();state.status='committed';},
  rollback(){state.status='revoked';if(states.get(page)===state)states.delete(page);}};
}
/** @param {State} state */
function valid(state){
 try{
  if(state.status==='revoked'||list(state.deck.pages,1)[0]!==state.page||fingerprint(state.deck.slideSize)!==state.slide
   ||sourceFingerprint(state.page)!==state.source||fingerprint(compilationOf(state.deck))!==state.compilation)return false;
  const all=[...list(state.page.shapes,10000),...list(state.page.images,10000),...list(state.page.textBoxes,10000)].map(record);
  return state.frames.every(row=>{const found=all.filter(item=>item.id===row.shape.id);
   return found.length===1&&found[0]===row.shape&&fingerprint(found[0])===row.hash;});
 }catch{return false;}
}
/** @template T @param {unknown} context @param {()=>T} operation @returns {T} */
function withApprovedFrameCompletionFinalizer(context,operation){
 // Generic asset transactions can have no scene/deck. Absence grants no
 // exception; keep their existing finalizer and rollback contract intact.
 let state;
 try{const deck=record(record(context).deck),page=record(list(deck.pages,1)[0]);state=states.get(page);}
 catch{return operation();}
 if(!state)return operation();
 if(state.context!==context||state.status!=='pending'||state.sealed||scopes.getStore()||!valid(state))return fail();
 const scope={context,closed:false};state.sealed=true;
 try{return scopes.run(scope,()=>{const result=operation();if(!valid(state))fail();return result;});}
 finally{scope.closed=true;}
}
/** Read-only semantic overlay; strict unresolved and coverage are never edited.
 * Cloned/persisted reports confer no process-local receipt.
 * @param {unknown} deckInput @param {unknown} pageInput
 * @returns {{status:'absent'|'invalid'|'verified',regionIds:string[],approvals:{regionId:string,approvedRegionId:string,outputId:unknown,approvalId:string,policy:string,strictSourceEquivalent:boolean,sourcePixelsChanged:number}[]}} */
function auditApprovedFrameCompletion(deckInput,pageInput){
 try{
  const deck=record(deckInput),page=record(pageInput),state=states.get(page);
  if(!state)return {status:/** @type {const} */('absent'),regionIds:[],approvals:[]};
  const scope=scopes.getStore();
  if(state.deck!==deck||!state.sealed||!valid(state)||state.status!=='committed'&&(!scope||scope.closed||scope.context!==state.context))fail();
  return {status:/** @type {const} */('verified'),regionIds:state.frames.map(row=>row.regionId),
   approvals:state.frames.map(row=>({regionId:row.regionId,approvedRegionId:row.approvedRegionId,outputId:row.shape.id,approvalId:state.approvalId,
    policy:'approved-perimeter-semantic-completion-v1',strictSourceEquivalent:false,sourcePixelsChanged:0}))};
 }catch{return {status:/** @type {const} */('invalid'),regionIds:[],approvals:[]};}
}
module.exports={publishApprovedFrameCompletion,withApprovedFrameCompletionFinalizer,auditApprovedFrameCompletion};
