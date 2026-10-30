// @ts-check
'use strict';
const {types}=require('node:util');
/** @typedef {{owned:Uint8Array,count:number}} Owner */
/** @typedef {{owner:Owner,indices:number[]}} Entry */
/** @typedef {{evidence:{glyphOwnedPixels:number},active:Entry[]|null,portfolio:Entry[]|null}} Ledger */
/** @type {WeakMap<object,Ledger>} */const ledgers=new WeakMap();
/** @type {WeakMap<object,{ledger:Ledger,entries:Entry[],consumed:boolean,parent:Entry[]|null}>} */const choices=new WeakMap();
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @returns {value is Uint8Array} */
function validCells(value){return !types.isProxy(value)&&types.isUint8Array(value)
 &&[Uint8Array.prototype,Buffer.prototype].includes(Object.getPrototypeOf(value))
 &&['length','buffer','byteLength','byteOffset'].every(key=>!Object.hasOwn(value,key))
 &&types.isArrayBuffer(Reflect.get(Object.getPrototypeOf(Uint8Array.prototype),'buffer',value));}
/** Private ownership accounting; source scanning is deliberately absent.
 * A provisional measurement spends the same ceiling and releases only newly
 * acquired cells when it finishes. Its immutable source evidence remains cached.
 * @param {{glyphOwnedPixels:number}} evidence */
function createSceneGlyphChoiceLedger(evidence){
 if(!record(evidence)||evidence.glyphOwnedPixels!==0)throw new TypeError('Scene glyph choice ledger is invalid');
 const token=Object.freeze({});ledgers.set(token,{evidence,active:null,portfolio:null});return token;
}
/** @param {unknown} token */
function ledgerFor(token){const ledger=token!==null&&typeof token==='object'?ledgers.get(token):undefined;
 if(!ledger||!record(ledger.evidence)||!Number.isSafeInteger(ledger.evidence.glyphOwnedPixels)||ledger.evidence.glyphOwnedPixels<0||ledger.evidence.glyphOwnedPixels>100000)
  throw new TypeError('Scene glyph choice ledger is invalid');return ledger;}
/** Trusted compiler arrays describe a complete requested footprint. Validate
 * before atomically applying any new cell. A failure never applies a prefix.
 * @param {unknown} token @param {Owner} owner @param {Uint8Array} cells */
function acquireSceneGlyphChoiceCells(token,owner,cells){
 const ledger=ledgerFor(token);
 if(!record(owner)||!validCells(owner.owned)||!validCells(cells)
  ||owner.owned.length!==cells.length||cells.length>262144||!Number.isSafeInteger(owner.count)||owner.count<0||owner.count>100000)
  throw new TypeError('Scene glyph choice cells are invalid');
 const indices=[];let existing=0;
 for(let i=0;i<cells.length;i++){
  if((cells[i]!==0&&cells[i]!==1)||(owner.owned[i]!==0&&owner.owned[i]!==1))throw new TypeError('Scene glyph choice cell is invalid');
  if(owner.owned[i])existing++;
  if(cells[i]&&!owner.owned[i])indices.push(i);
 }
 if(existing!==owner.count)throw new TypeError('Scene glyph choice ownership is invalid');
 if(ledger.evidence.glyphOwnedPixels+indices.length>100000)return false;
 for(const i of indices)owner.owned[i]=1;
 owner.count+=indices.length;ledger.evidence.glyphOwnedPixels+=indices.length;
 const pending=ledger.active??ledger.portfolio;if(indices.length&&pending)pending.push({owner,indices});return true;
}
/** A candidate cannot persist provisional rights. Release in reverse order
 * even when a source or geometry predicate throws. No source scan is refunded.
 * @template T @param {unknown} token @param {()=>T} measure
 * @returns {{value:T,receipt:object}} */
function stageSceneGlyphChoice(token,measure){
 const ledger=ledgerFor(token);
 if(typeof measure!=='function'||types.isProxy(measure)||ledger.active!==null)throw new TypeError('Scene glyph choice measurement is invalid');
 /** @type {Entry[]} */const entries=[];ledger.active=entries;
 try{
  const value=measure();
  if(types.isPromise(value))throw new TypeError('Scene glyph choice measurement must be synchronous');
  const receipt=Object.freeze({});choices.set(receipt,{ledger,entries,consumed:false,parent:ledger.portfolio});return {value,receipt};
 }finally{
  for(let n=entries.length-1;n>=0;n--){const entry=entries[n];if(!entry)continue;
   for(const i of entry.indices)entry.owner.owned[i]=0;
   entry.owner.count-=entry.indices.length;ledger.evidence.glyphOwnedPixels-=entry.indices.length;
  }
  ledger.active=null;
 }
}
/** Stage a complete surface alternative, including nested seed choices. Seed
 * decisions remain atomic; their commits belong to this parent transaction.
 * Discarding the surface releases both direct queries and selected child seeds.
 * Source observation work is never refunded. @template T
 * @param {unknown} token @param {()=>T} measure @returns {{value:T,receipt:object}} */
function stageSceneGlyphPortfolio(token,measure){
 const ledger=ledgerFor(token);
 if(typeof measure!=='function'||types.isProxy(measure)||ledger.active!==null||ledger.portfolio!==null)
  throw new TypeError('Scene glyph portfolio measurement is invalid');
 /** @type {Entry[]} */const entries=[];ledger.portfolio=entries;
 try{
  const value=measure();if(types.isPromise(value))throw new TypeError('Scene glyph portfolio measurement must be synchronous');
  const receipt=Object.freeze({});choices.set(receipt,{ledger,entries,consumed:false,parent:null});return {value,receipt};
 }finally{
  for(let n=entries.length-1;n>=0;n--){const entry=entries[n];if(!entry)continue;
   for(const i of entry.indices)entry.owner.owned[i]=0;
   entry.owner.count-=entry.indices.length;ledger.evidence.glyphOwnedPixels-=entry.indices.length;
  }
  ledger.portfolio=null;
 }
}
/** Read the actual additional union cost of a private candidate. This is a
 * snapshot, never a reservation or authorization to paint. @param {unknown} token
 * @param {unknown} receipt */
function sceneGlyphChoiceCost(token,receipt){
 const ledger=ledgerFor(token),choice=receipt!==null&&typeof receipt==='object'?choices.get(receipt):undefined;
 if(!choice||choice.ledger!==ledger||choice.consumed||choice.parent!==null||ledger.active!==null||ledger.portfolio!==null)
  throw new TypeError('Scene glyph choice receipt is invalid');
 /** @type {Map<Owner,Set<number>>} */const pending=new Map();let added=0;
 for(const {owner,indices}of choice.entries){const cells=pending.get(owner)??new Set();pending.set(owner,cells);
  for(const i of indices)if(!owner.owned[i]&&!cells.has(i)){cells.add(i);added++;}}
 return added;
}
/** Commit only a private measurement receipt on the same ledger. Other
 * selected candidates may now share its cells; count the actual union again.
 * An exhausted choice stays rejected atomically and never steals old rights.
 * @param {unknown} token @param {unknown} receipt */
function commitSceneGlyphChoice(token,receipt){
 const ledger=ledgerFor(token),choice=receipt!==null&&typeof receipt==='object'?choices.get(receipt):undefined;
 if(!choice||choice.ledger!==ledger||choice.consumed||ledger.active!==null||choice.parent!==null&&choice.parent!==ledger.portfolio)
  throw new TypeError('Scene glyph choice receipt is invalid');
 /** @type {Map<Owner,Set<number>>} */const pending=new Map();let added=0;
 for(const {owner,indices}of choice.entries){
  /** @type {Set<number>} */const cells=pending.get(owner)??new Set();pending.set(owner,cells);
  for(const i of indices)if(!owner.owned[i]&&!cells.has(i)){cells.add(i);added++;}
 }
 if(ledger.evidence.glyphOwnedPixels+added>100000)return false;
 for(const [owner,cells]of pending){for(const i of cells)owner.owned[i]=1;owner.count+=cells.size;
  if(cells.size&&ledger.portfolio)ledger.portfolio.push({owner,indices:[...cells]});}
 ledger.evidence.glyphOwnedPixels+=added;choice.consumed=true;return true;
}
module.exports={createSceneGlyphChoiceLedger,acquireSceneGlyphChoiceCells,stageSceneGlyphChoice,commitSceneGlyphChoice,
 stageSceneGlyphPortfolio,sceneGlyphChoiceCost};
