// @ts-check
'use strict';
const crypto=require('node:crypto'),path=require('node:path');
const {types}=require('node:util'),{AsyncLocalStorage}=require('node:async_hooks');
const {readPngBuffer}=require('../png');
const {record,list,box}=require('./source-scene-group-containment');
const {inventoryRevisionSnapshot,immutableInventoryRevisionCopy,inventoryRevisionFileBytes}=require('./source-inventory-revision-snapshot');
const {acceptMissingSceneText}=require('./source-scene-missing-text');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {matchSourceLocalGlyphDetailed}=require('./source-local-glyph');
const {captureNativeGlyphIcon,finalNativeGlyphIcon}=require('./source-glyph-native-icon');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('../ocr/ocr-result-admission').OcrLine} Line */
/** @typedef {Parameters<typeof acceptMissingSceneText>[0][number]} Proposal */
/** @typedef {Parameters<typeof acceptMissingSceneText>[1]} Observations */
/** @typedef {{sourceHash:string,rasterHash:string,width:number,height:number,index:number,parentId:string,parentDigest:string,regionId:string,parentBox:import('./source-scene-plan').Box,proposal:Proposal,observations:Observations,line:Line,representation:'text'|'native-icon',expires:number,used:boolean}} Issued */
/** @typedef {{index:number,proof?:NonNullable<ReturnType<typeof captureNativeGlyphIcon>>}} Witness */
/** @typedef {{issued:Issued[],built:Map<string,Witness[]>,sealed:string|null,closed:boolean}} Context */
/** @type {WeakMap<object,Issued>} */const tokens=new WeakMap();
/** @type {import('node:async_hooks').AsyncLocalStorage<Context>} */const contexts=new AsyncLocalStorage();
const invalid=()=>{throw new TypeError('Scene glyph recovery controls are invalid');};
/** Shared bounded plain-data hashing grants no inventory capability.
 * @param {unknown} value */
function snapshot(value){try{return inventoryRevisionSnapshot(value);}catch(error){
 if(error instanceof TypeError&&/^Scene inventory revision snapshot /u.test(error.message))return invalid();throw error;
}}
/** @param {unknown} value @returns {value is string} */
const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,95}$/u.test(value);
/** @param {import('./source-scene-plan').Box} a @param {import('./source-scene-plan').Box} b */
const sameBox=(a,b)=>['x','y','w','h'].every(k=>Math.abs(a[/** @type {keyof typeof a} */(k)]-b[/** @type {keyof typeof b} */(k)])<=1e-6);
/** @param {unknown} value @param {number} index */
function validObservation(value,index){return record(value)&&Reflect.ownKeys(value).every(k=>['index','text','confidence','box','contextBox','color','rejection'].includes(String(k)))
 &&value.index===index&&(value.text===null||typeof value.text==='string'&&value.text.length>0&&value.text.length<=256&&!/[\p{Cc}\p{Cf}]/u.test(value.text))
 &&typeof value.confidence==='number'&&Number.isFinite(value.confidence)&&value.confidence>=0&&value.confidence<=1
 &&(value.box===undefined||box(value.box))&&(value.contextBox===undefined||box(value.contextBox))
 &&(value.color===undefined||typeof value.color==='string'&&/^#[a-f0-9]{6}$/iu.test(value.color))
 &&(value.rejection===undefined||value.rejection==='source-unit');}
/** A trusted host supplies two independently obtained observations of the
 * original physical candidate. No provider success flag, serialized receipt,
 * fitted background, or mere OCR string can issue a completion capability.
 * Original admission failures remain in the plan and are never rewritten.
 * @param {unknown} input */
function issueSceneGlyphRecovery(input){
 snapshot(input);
 if(!record(input)||Reflect.ownKeys(input).some(k=>!['plan','proposal','sourceFile','observations','budget','representation'].includes(String(k)))
  ||!record(input.plan)||!record(input.proposal)||input.representation!==undefined&&input.representation!=='text'&&input.representation!=='native-icon'
  ||typeof input.sourceFile!=='string'||!path.isAbsolute(input.sourceFile)||input.sourceFile.length>4096||/[\p{Cc}]/u.test(input.sourceFile)
  ||!record(input.budget)||!Number.isSafeInteger(input.budget.used)||Number(input.budget.used)<0||Number(input.budget.used)>4000000
  ||Object.getOwnPropertyDescriptor(input.budget,'used')?.writable!==true)return invalid();
 const p=input.proposal,plan=input.plan;
 if(!Number.isSafeInteger(p.index)||Number(p.index)<0||Number(p.index)>=512||p.text!==null||p.confidence!==0||!id(p.objectId)||!box(p.box)
  ||Reflect.ownKeys(p).some(k=>!['index','text','confidence','box','objectId','labelCandidate'].includes(String(k)))
  ||p.labelCandidate!==undefined&&p.labelCandidate!==true||!list(input.observations)||input.observations.length!==2
  ||input.observations.some(rows=>!list(rows)||rows.length!==1||!validObservation(rows[0],Number(p.index)))
  ||typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)
  ||![plan.widthPx,plan.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||!list(plan.objects)||plan.objects.length>96||!plan.objects.every(record)||!record(plan.admission)||!list(plan.admission.rejections)
  ||!plan.admission.rejections.every(record))return invalid();
 const parents=plan.objects.filter(o=>o.id===p.objectId),parent=parents[0];
 if(parents.length!==1||!parent||!box(parent.box)||!sameBox(parent.box,p.box)||!id(parent.regionId)
  ||input.representation==='native-icon'&&parent.kind!=='icon'
  ||!plan.admission.rejections.some(r=>r.collection==='missingText'&&r.index===p.index&&r.reason==='glyph-source-unit'))return invalid();
 let bytes;
 try{bytes=inventoryRevisionFileBytes(input.sourceFile,12*1024*1024);}catch(error){
  if(error instanceof TypeError&&/^Scene inventory revision /u.test(error.message))return invalid();throw error;
 }
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==plan.sourceHash)return invalid();
 const image=readPngBuffer(bytes,{maxFileBytes:12*1024*1024,maxPixels:40000000});
 if(image.width!==plan.widthPx||image.height!==plan.heightPx)return invalid();
 for(const rows of /** @type {Observations} */(input.observations))for(const row of rows)
  for(const b of[row.box,row.contextBox])if(b&&(b.x+b.w>image.width||b.y+b.h>image.height))return invalid();
 const proposal=/** @type {Proposal} */(p),observations=/** @type {Observations} */(input.observations);
 const accepted=acceptMissingSceneText([proposal],observations,image,/** @type {{used:number}} */(input.budget));
 const line=accepted.lines[0];if(accepted.lines.length!==1||accepted.rejected.length||!line)return invalid();
 const token=Object.freeze({});tokens.set(token,{sourceHash:plan.sourceHash,rasterHash:crypto.createHash('sha256').update(image.rgba).digest('hex'),width:image.width,height:image.height,index:proposal.index,
  parentId:p.objectId,parentDigest:snapshot(parent),regionId:parent.regionId,parentBox:{...parent.box},proposal:immutableInventoryRevisionCopy(proposal),
  observations:immutableInventoryRevisionCopy(observations),line:immutableInventoryRevisionCopy(line),representation:input.representation==='native-icon'?'native-icon':'text',expires:Date.now()+30*60*1000,used:false});return token;
}
/** @param {unknown} token */
function issued(token){const value=token!==null&&typeof token==='object'&&!types.isProxy(token)?tokens.get(token):undefined;
 if(!value||value.used||value.expires<Date.now())return invalid();return value;}
/** Reading a fresh source line grants no compiler or final-output rights.
 * @param {unknown} token */
function batch(token){
 if(Array.isArray(token)&&!types.isProxy(token)&&token.length>32)return invalid();
 const values=list(token)?token.length>0&&token.length<=32?token.map(issued):invalid():[issued(token)];
 const first=values[0];if(!first||new Set(values).size!==values.length||new Set(values.map(r=>r.index)).size!==values.length
  ||values.some(r=>r.sourceHash!==first.sourceHash||r.rasterHash!==first.rasterHash||r.width!==first.width||r.height!==first.height))return invalid();
 if(values.some((r,i)=>values.slice(0,i).some(other=>{
  const a=r.line.box,b=other.line.box;return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))
   *Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y))>=Math.min(a.w*a.h,b.w*b.h)*.2;
 })))return invalid();
 return values;
}
/** @param {unknown} token */
function sceneGlyphRecoveryLines(token){return structuredClone(batch(token).filter(r=>r.representation==='text').map(r=>r.line));}
/** @template T @param {unknown} token @param {()=>T|Promise<T>} operation @returns {Promise<T>} */
async function withSceneGlyphRecovery(token,operation){
 const values=batch(token);if(typeof operation!=='function'||types.isProxy(operation)||contexts.getStore())return invalid();for(const value of values)value.used=true;
 /** @type {Context} */const context={issued:values,built:new Map(),sealed:null,closed:false};
 return contexts.run(context,async()=>{try{return await operation();}finally{context.closed=true;}});
}
/** @param {Context} state @param {Plan} plan @param {Issued} r */
function bound(state,plan,r){
 snapshot({sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,objects:plan.objects,admission:plan.admission});
 const parents=plan.objects.filter(o=>o.id===r.parentId),parent=parents[0];
 return !state.closed&&Date.now()<=r.expires&&plan.sourceHash===r.sourceHash&&plan.widthPx===r.width&&plan.heightPx===r.height&&parents.length===1&&!!parent
  &&parent.regionId===r.regionId&&sameBox(parent.box,r.parentBox)&&snapshot(parent)===r.parentDigest
  &&plan.admission?.rejections.some(row=>row.collection==='missingText'&&row.index===r.index&&row.reason==='glyph-source-unit');
}
/** @param {Issued} r @param {{textBoxes:({id?:string,text:string,box:import('./source-scene-plan').Box,source?:Record<string,unknown>})[]}} page
 * @param {{widthPt:number,heightPt:number}} size */
function locate(r,page,size){
 const source=sourceSceneTextBoxes(page.textBoxes,{width:r.width,height:r.height},size),sx=r.width/size.widthPt,sy=r.height/size.heightPt;
 const boxes=source.map(t=>({x:t.box.x*sx,y:t.box.y*sy,w:t.box.w*sx,h:t.box.h*sy}));
 const matches=source.map((text,index)=>({text,index})).filter(({text,index})=>text.text===r.line.text
  &&text.source?.evidenceBox!==undefined&&!!boxes[index]&&sameBox(boxes[index],r.line.box));
 if(matches.length!==1)return null;
 const match=matches[0];if(!match||!id(match.text.id)||page.textBoxes.filter(t=>t.id===match.text.id).length!==1)return null;
 const b=r.line.box;
 if(boxes.some((other,index)=>index!==match.index&&Math.max(0,Math.min(b.x+b.w,other.x+other.w)-Math.max(b.x,other.x))
  *Math.max(0,Math.min(b.y+b.h,other.y+other.h)-Math.max(b.y,other.y))>=Math.min(b.w*b.h,other.w*other.h)*.2))return null;
 return page.textBoxes[match.index]??null;
}
/** Mandatory final compilation remeasures the two valid views on this exact
 * source and finds the actual native label; preflight cannot discharge it.
 * @param {{plan:Plan,image:import('../png').PngImage,page:Parameters<typeof locate>[1],slideSize:{widthPt:number,heightPt:number},budget:{used:number},preflight:boolean,nativeIcons?:unknown[]}} input */
function resolveSceneGlyphRecoveries(input){
 const state=contexts.getStore();if(!state||input.preflight)return null;
 const rasterHash=crypto.createHash('sha256').update(input.image.rgba).digest('hex');
 /** @type {{index:number,parentObjectId:string,sourceBox:Line['box'],textHash:string,historicalReason:string,textId?:string,representation?:string,nativePartIds?:string[]}[]} */const items=[];
 /** @type {Witness[]} */const witnesses=[];
 for(const r of state.issued){
 if(!bound(state,input.plan,r)||input.image.width!==r.width||input.image.height!==r.height||rasterHash!==r.rasterHash)return invalid();
 const accepted=acceptMissingSceneText([r.proposal],r.observations,input.image,input.budget);
 if(accepted.rejected.length||accepted.lines.length!==1||snapshot(accepted.lines[0])!==snapshot(r.line))return null;
 const item={index:r.index,parentObjectId:r.parentId,sourceBox:{...r.line.box},textHash:crypto.createHash('sha256').update(r.line.text).digest('hex'),historicalReason:'glyph-source-unit'};
 if(r.representation==='native-icon'){
  const a=r.observations[0]?.[0]?.box,b=r.observations[1]?.[0]?.box;if(!a||!b)return null;
  const glyph=matchSourceLocalGlyphDetailed(input.image,r.parentBox,a,b,input.budget);if(!glyph||!sameBox(glyph.box,r.line.box))return null;
  const proofs=(input.nativeIcons??[]).map(compiled=>captureNativeGlyphIcon({image:input.image,compiled,parentId:r.parentId,cells:glyph.cells,slideSize:input.slideSize,budget:input.budget})).filter(p=>p!==null);
  const proof=proofs[0];if(proofs.length!==1||!proof||!nativeTextSeparate(r,input.page,input.slideSize)||!finalNativeGlyphIcon(input.page,proof))return null;
  items.push({...item,representation:'native-icon',nativePartIds:proof.ids});witnesses.push({index:r.index,proof});
 }else{const text=locate(r,input.page,input.slideSize);if(!text||!id(text.id))return null;items.push({...item,textId:text.id});witnesses.push({index:r.index});}
 }
 const report={version:1,sourceHash:state.issued[0]?.sourceHash,items};
 if(state.built.size>=64)return invalid();state.built.set(snapshot(report),witnesses);return report;
}
/** Source-isolated native icons own their glyph once; no OCR overlay is emitted.
 * @param {Issued} r @param {Parameters<typeof locate>[1]} page @param {{widthPt:number,heightPt:number}} size */
function nativeTextSeparate(r,page,size){
 const sx=r.width/size.widthPt,sy=r.height/size.heightPt,b=r.line.box;
 return sourceSceneTextBoxes(page.textBoxes,{width:r.width,height:r.height},size).every(t=>{
  const c={x:t.box.x*sx,y:t.box.y*sy,w:t.box.w*sx,h:t.box.h*sy};
  return Math.max(0,Math.min(b.x+b.w,c.x+c.w)-Math.max(b.x,c.x))*Math.max(0,Math.min(b.y+b.h,c.y+c.h)-Math.max(b.y,c.y))<Math.min(b.w*b.h,c.w*c.h)*.2;
 });
}
/** This changes representation preference only. Final recovery still needs a
 * private complete-icon receipt and proof that its paint retains the glyph.
 * @param {Plan} plan @param {import('../png').PngImage} image @param {string} parentId */
function sceneGlyphRecoveryIcon(plan,image,parentId){
 const state=contexts.getStore(),r=state?.issued.find(item=>item.parentId===parentId&&item.representation==='native-icon');
 if(!state||!r)return false;
 if(!bound(state,plan,r)||crypto.createHash('sha256').update(image.rgba).digest('hex')!==r.rasterHash)return invalid();return true;
}
/** @param {Context} state @param {unknown} page @param {{widthPt:number,heightPt:number}} size */
function output(state,page,size){
 snapshot({page,size});
 if(!record(page)||!record(page.source)||!record(page.source.sourceScene)||!list(page.textBoxes))return null;
 const scene=page.source.sourceScene,report=scene.missingGlyphRecovery;
 const witnesses=record(report)?state.built.get(snapshot(report)):undefined;
 if(scene.sourceHash!==state.issued[0]?.sourceHash||!witnesses)return null;
 /** @type {unknown[]} */const units=[];
 for(const r of state.issued){
 if(Date.now()>r.expires)return null;
 if(r.representation==='native-icon'){
  const proof=witnesses.find(w=>w.index===r.index)?.proof;
  const parts=proof?finalNativeGlyphIcon(page,proof):null;
  if(!parts||!nativeTextSeparate(r,/** @type {Parameters<typeof locate>[1]} */(page),size))return null;units.push(parts);continue;
 }
 const text=/** @type {unknown} */(locate(r,/** @type {Parameters<typeof locate>[1]} */(page),size));
 if(!record(text)||!record(text.font)||typeof text.font.sizePt!=='number'||!Number.isFinite(text.font.sizePt)||text.font.sizePt<=0
  ||typeof text.font.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(text.font.color)
  ||text.font.opacity!==undefined&&(typeof text.font.opacity!=='number'||!Number.isFinite(text.font.opacity)||text.font.opacity<=0||text.font.opacity>1))return null;
 if(text.style!==undefined&&(!record(text.style)||text.style.visibility==='hidden'
  ||text.style.opacity!==undefined&&(typeof text.style.opacity!=='number'||!Number.isFinite(text.style.opacity)||text.style.opacity<=0||text.style.opacity>1)))return null;
 for(const key of['runs','positionedRuns'])if(text[key]!==undefined){
  const runs=text[key];if(!list(runs)||!runs.every(run=>record(run)&&typeof run.text==='string')
   ||runs.map(run=>/** @type {Record<string,unknown>} */(run).text).join('')!==text.text)return null;
  for(const entry of runs){const run=/** @type {Record<string,unknown>} */(entry),paint=run[key==='runs'?'font':'fontOverride'];
   if(paint!==undefined&&(!record(paint)||paint.opacity!==undefined
    &&(typeof paint.opacity!=='number'||!Number.isFinite(paint.opacity)||paint.opacity<=0||paint.opacity>1)))return null;
   if(key==='positionedRuns'&&(!box(run.box)||run.box.x+run.box.w>size.widthPt||run.box.y+run.box.h>size.heightPt))return null;
  }
 }
 units.push(text);
 }
 return snapshot({report,units,size});
}
/** Seal only the final normal pipeline output, after all native and raster
 * postprocessing. A later deletion, duplication or rendering edit fails again.
 * @param {unknown} deck */
function sealSceneGlyphRecoveryDeck(deck){
 const state=contexts.getStore();if(!state)return;
 snapshot(deck);if(state.closed||state.sealed!==null||state.issued.some(r=>Date.now()>r.expires)||!record(deck)||!list(deck.pages)||deck.pages.length!==1||!record(deck.slideSize))return invalid();
 const digest=output(state,deck.pages[0],/** @type {{widthPt:number,heightPt:number}} */(deck.slideSize));
 if(!digest)return invalid();state.sealed=digest;
}
/** JSON cannot restore this per-run completion receipt. No active recovery
 * leaves ordinary pages unchanged; claimed or expected recovery must be sealed.
 * @param {unknown} page @param {{widthPt:number,heightPt:number}} size */
function verifySceneGlyphRecoveryPage(page,size){
 try{
 const state=contexts.getStore();
 if(!state){if(!record(page)||!record(page.source)||!record(page.source.sourceScene))return true;return page.source.sourceScene.missingGlyphRecovery===undefined;}
 if(state.closed||!state.sealed||state.issued.some(r=>Date.now()>r.expires))return false;
 return output(state,page,size)===state.sealed;
 }catch{return false;}
}
module.exports={issueSceneGlyphRecovery,sceneGlyphRecoveryLines,withSceneGlyphRecovery,resolveSceneGlyphRecoveries,sealSceneGlyphRecoveryDeck,verifySceneGlyphRecoveryPage,sceneGlyphRecoveryIcon};
