// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {record,list}=require('./source-scene-group-containment');
const {inventoryRevisionSnapshot,inventoryRevisionFileBytes}=require('./source-inventory-revision-snapshot');
const {sceneInventoryRevisionForPlan,currentSceneInventoryRevision,markSceneInventoryRevisionSealed}=require('./source-inventory-revision');
/** @typedef {import('./source-inventory-revision').Revision} Revision */
/** @typedef {import('./source-scene-observed-inventory').InventoryEvidence} Inventory */
/** @typedef {{built:Set<string>,seals:{inventory:string,output:string,root:string,slideSize:unknown}[]}} Registry */
/** Per-run identities cannot be restored from JSON or reused by another run.
 * @type {WeakMap<object,Registry>} */const runs=new WeakMap();
/** @returns {Registry|undefined} */
function registry(){
 const context=currentSceneInventoryRevision();if(!context)return undefined;
 let state=runs.get(context.runToken);if(!state){state={built:new Set(),seals:[]};runs.set(context.runToken,state);}return state;
}
/** Only the normal builder registers a complete evidence snapshot. Revisions
 * preserve historical budgets and rejections; they grant no source paint.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {Inventory} evidence @returns {Inventory} */
function reviseSceneInventoryEvidence(plan,evidence){
 const revision=sceneInventoryRevisionForPlan(plan);if(!revision)return evidence;
 if(evidence.version!==5)throw new TypeError('Scene inventory revision requires logical relations');
 const result={...evidence,version:/** @type {const} */(6),inventoryRevision:revision};
 const state=registry();if(!state||state.built.size>=64)throw new TypeError('Scene inventory revision evidence exceeds capacity');
 state.built.add(inventoryRevisionSnapshot(result));return result;
}
/** Validate trust separately from structural parsing. An expected revision
 * cannot disappear by deleting the marker or downgrading to legacy evidence.
 * @param {unknown} evidence @returns {Revision|undefined|null} */
function trustedSceneInventoryRevision(evidence){
 const context=currentSceneInventoryRevision();
 if(!record(evidence))return context?null:undefined;
 const value=evidence.inventoryRevision;
 if(!context)return value!==undefined||evidence.version===6?null:undefined;
 if(evidence.version!==6||value===undefined||inventoryRevisionSnapshot(value)!==inventoryRevisionSnapshot(context.revision))return null;
 return registry()?.built.has(inventoryRevisionSnapshot(evidence))?context.revision:null;
}
/** Hash every rendering field, in order, and actual image bytes. Only the
 * inventory itself is excluded: it is bound independently by its full digest.
 * @param {Record<string,unknown>} page @param {unknown} slideSize @param {string} root @param {unknown} compilation */
function outputDigest(page,slideSize,root,compilation){
 inventoryRevisionSnapshot({page,slideSize,compilation});
 if(!list(page.images)||page.images.length>10000||typeof root!=='string'||!path.isAbsolute(root))throw new TypeError('Scene inventory revision output is invalid');
 const base=fs.realpathSync(root),assets=new Set();let bytesUsed=0;
 const source=record(page.source)?page.source:undefined,scene=source&&record(source.sourceScene)?source.sourceScene:undefined;
 for(const image of page.images){
  if(!record(image)||typeof image.assetPath!=='string')throw new TypeError('Scene inventory revision asset is invalid');
  assets.add(image.assetPath);
  if(record(image.style)&&image.style.assetPath!==undefined){
   if(typeof image.style.assetPath!=='string')throw new TypeError('Scene inventory revision asset is invalid');assets.add(image.style.assetPath);
  }
 }
 if(page.sourceImage!==undefined){if(typeof page.sourceImage!=='string')throw new TypeError('Scene inventory revision source is invalid');assets.add(page.sourceImage);}
 const artifact=record(compilation)?compilation.observedInventory:undefined;
 if(artifact!==undefined){
  if(!record(artifact)||typeof artifact.assetPath!=='string'||typeof artifact.sha256!=='string'||!/^[a-f0-9]{64}$/u.test(artifact.sha256)
   ||artifact.version!==6)throw new TypeError('Scene inventory revision evidence asset is invalid');
  assets.add(artifact.assetPath);
 }
 const hashes=[];
 for(const asset of assets){
  if(asset.length>4096||asset.includes('\0')||path.isAbsolute(asset))throw new TypeError('Scene inventory revision asset is invalid');
  const file=path.resolve(base,asset),relative=path.relative(base,file);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new TypeError('Scene inventory revision asset is invalid');
  const real=fs.realpathSync(file),realRelative=path.relative(base,real);
  if(realRelative!==relative)throw new TypeError('Scene inventory revision asset is invalid');
  const bytes=inventoryRevisionFileBytes(file,record(artifact)&&asset===artifact.assetPath?1024*1024:12*1024*1024);bytesUsed+=bytes.length;
  if(bytesUsed>64*1024*1024)throw new TypeError('Scene inventory revision assets exceed capacity');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  if(record(artifact)&&asset===artifact.assetPath){
   const inline=require('./source-scene-inventory-codec').unpackSceneInventoryMembers(scene?.observedInventory);
   if(sha256!==artifact.sha256||!record(inline)||artifact.sourceHash!==inline.sourceHash
    ||inventoryRevisionSnapshot(JSON.parse(bytes.toString('utf8')))!==inventoryRevisionSnapshot(inline))
    throw new TypeError('Scene inventory revision evidence asset is invalid');
  }
  hashes.push({asset,sha256});
 }
 const {observedInventory:ignored,...rest}=scene??{};void ignored;
 return inventoryRevisionSnapshot({slideSize,shapes:page.shapes,images:page.images,textBoxes:page.textBoxes,tables:page.tables,
  charts:page.charts,icons:page.icons,background:page.background,sourceImage:page.sourceImage,outputEditGroups:page.outputEditGroups,
  source:source?{...source,...(scene?{sourceScene:rest}:{})}:undefined,assets:hashes,compilation});
}
/** @param {Record<string,unknown>} deck @returns {unknown} */
function compilationOf(deck){
 if(deck.meta===undefined)return undefined;
 if(!record(deck.meta))throw new TypeError('Scene inventory revision metadata is invalid');
 return deck.meta.sourceSceneCompilation;
}
/** Called after normal finalizers, provenance normalization and compaction.
 * All source files are read once per asset for each seal/check. Fixed public
 * errors never expose paths, content or underlying OS diagnostics.
 * @param {unknown} deck @param {string} root */
function sealSceneInventoryRevisionDeck(deck,root){
 if(!currentSceneInventoryRevision())return;
 try{
  if(!record(deck)||!list(deck.pages)||deck.pages.length!==1||!record(deck.pages[0]))throw Error();
  const page=deck.pages[0],scene=record(page.source)&&record(page.source.sourceScene)?page.source.sourceScene:null;
  const inventory=require('./source-scene-inventory-codec').unpackSceneInventoryMembers(scene?.observedInventory);
  if(!record(inventory)||!trustedSceneInventoryRevision(inventory))throw Error();
  const output=outputDigest(page,deck.slideSize,root,compilationOf(deck)),state=registry();if(!state)throw Error();
  if(state.seals.length)throw Error();
  state.seals.push({inventory:inventoryRevisionSnapshot(inventory),output,root,slideSize:structuredClone(deck.slideSize)});
  markSceneInventoryRevisionSealed();
 }catch{throw new TypeError('Scene inventory revision final output is unverified');}
}
/** Missing context and any evidence/output/asset mutation fail closed.
 * A serialized marker alone cannot establish a human confirmation.
 * @param {unknown} page @param {unknown} slideSize @param {unknown} [compilation] @returns {boolean} */
function verifySceneInventoryRevisionPage(page,slideSize,compilation){
 try{
  if(!record(page))return false;
  const source=record(page.source)?page.source:undefined,scene=source&&record(source.sourceScene)?source.sourceScene:undefined;
  const evidence=require('./source-scene-inventory-codec').unpackSceneInventoryMembers(scene?.observedInventory);
  const context=currentSceneInventoryRevision();
  if(!context)return !record(evidence)||(evidence.version!==6&&evidence.inventoryRevision===undefined);
  if(!record(evidence)||!trustedSceneInventoryRevision(evidence))return false;
  const digest=inventoryRevisionSnapshot(evidence);
  return registry()?.seals.some(seal=>seal.inventory===digest&&inventoryRevisionSnapshot(seal.slideSize)===inventoryRevisionSnapshot(slideSize)
   &&seal.output===outputDigest(page,slideSize,seal.root,compilation))??false;
 }catch{return false;}
}
module.exports={reviseSceneInventoryEvidence,trustedSceneInventoryRevision,sealSceneInventoryRevisionDeck,verifySceneInventoryRevisionPage};
