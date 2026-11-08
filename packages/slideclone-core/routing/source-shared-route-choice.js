// @ts-check
'use strict';
const crypto=require('node:crypto');
const {record,list,box}=require('../scene-plan/source-scene-group-containment');
const {hasSharedSourceRoute}=require('./source-shared-route-measurement');
/** @typedef {{id:string,reversed:boolean}} Step */
/** @typedef {{kind:'source-edges-v1',sourceHash:string,networkHash:string,steps:Step[]}} Choice */
/** @typedef {{sourceHash:string,networkHash:string,widthPx:number,heightPx:number,window:import('../scene-plan/source-scene-plan').Box,
 * relationIds:string[],contacts:{id:string,endpointId:string|null,arrow:boolean,point:{x:number,y:number}}[],
 * edges:{id:string,from:string,to:string,points:{x:number,y:number}[]}[]}} Catalog */
/** @param {string} value */const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
/** @param {unknown} value @returns {value is string} */const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
/** @param {unknown} value @returns {value is string} */const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** Pure source naming only; this cannot issue a measurement capability.
 * @param {{x:number,y:number}[]} path @param {import('../scene-plan/source-scene-plan').Box} window */
function sourceEdgeKey(path,window){
 const cells=path.map(p=>[p.x+window.x,p.y+window.y]),forward=JSON.stringify(cells),backward=JSON.stringify([...cells].reverse());
 const reversed=backward<forward;return {id:'ink-'+digest(reversed?backward:forward).slice(0,24),reversed};
}
/** @param {unknown} value @returns {Choice} */
function parseSourceRouteChoice(value){
 if(!record(value)||Object.keys(value).length!==4||value.kind!=='source-edges-v1'||!hash(value.sourceHash)||!hash(value.networkHash)
  ||!list(value.steps)||value.steps.length<1||value.steps.length>15
  ||value.steps.some(s=>!record(s)||Object.keys(s).length!==2||typeof s.id!=='string'||!/^ink-[a-f0-9]{24}$/u.test(s.id)||typeof s.reversed!=='boolean')
  ||new Set(value.steps.map(s=>record(s)?s.id:null)).size!==value.steps.length)throw new TypeError('Scene source edge choice is invalid');
 return {kind:'source-edges-v1',sourceHash:value.sourceHash,networkHash:value.networkHash,
  steps:value.steps.map(s=>{if(!record(s))throw new TypeError('Scene source edge choice is invalid');return {id:String(s.id),reversed:s.reversed===true};})};
}
/** Public descriptions carry NO source/paint authority. Recompute their full
 * fingerprint before using them to nominate a review; final fitting recomputes
 * it from a new private source proof. No candidate path list is transmitted.
 * @param {unknown} value @returns {Catalog} */
function parseSourceRouteCatalog(value){
 if(!record(value)||Object.keys(value).length!==8||!hash(value.sourceHash)||!hash(value.networkHash)
  ||![value.widthPx,value.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||!box(value.window)||![value.window.x,value.window.y,value.window.w,value.window.h].every(Number.isSafeInteger)
  ||value.window.w*value.window.h>262144
  ||value.window.x+value.window.w>Number(value.widthPx)||value.window.y+value.window.h>Number(value.heightPx)
  ||!list(value.relationIds)||value.relationIds.length<2||value.relationIds.length>48||!value.relationIds.every(id)
  ||new Set(value.relationIds).size!==value.relationIds.length
  ||!list(value.contacts)||value.contacts.length<2||value.contacts.length>128
  ||!list(value.edges)||value.edges.length<1||value.edges.length>128)throw new TypeError('Scene source edge catalog is invalid');
 const window=value.window,contacts=value.contacts;
 if(Reflect.ownKeys(window).length!==4)throw new TypeError('Scene source edge catalog window is invalid');
 const point=(/** @type {unknown} */p)=>record(p)&&Object.keys(p).length===2&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n))
  &&Number(p.x)>=window.x&&Number(p.y)>=window.y
  &&Number(p.x)<=window.x+window.w&&Number(p.y)<=window.y+window.h;
 if(contacts.some(c=>!record(c)||Object.keys(c).length!==4||typeof c.id!=='string'||!/^contact-[a-f0-9]{24}$/u.test(c.id)||!(c.endpointId===null||id(c.endpointId))||typeof c.arrow!=='boolean'||!point(c.point))
  ||new Set(contacts.map(c=>record(c)?c.id:null)).size!==contacts.length
  ||value.edges.some(e=>!record(e)||Object.keys(e).length!==4||typeof e.id!=='string'||!/^ink-[a-f0-9]{24}$/u.test(e.id)
   ||!contacts.some(c=>record(c)&&c.id===e.from)||!contacts.some(c=>record(c)&&c.id===e.to)||e.from===e.to
   // A shared physical edge can use the aggregate network capacity. Its
   // public description must carry the same bounded vertices as the measured
   // edge and writer (120), without granting source or paint authority.
   ||!list(e.points)||e.points.length<2||e.points.length>120||!e.points.every(point))
  ||new Set(value.edges.map(e=>record(e)?e.id:null)).size!==value.edges.length)throw new TypeError('Scene source edge catalog is invalid');
 const result=/** @type {Catalog} */(structuredClone(value));
 if(catalogHash(result)!==result.networkHash)throw new TypeError('Scene source edge catalog fingerprint is invalid');
 return result;
}
/** @param {Omit<Catalog,'networkHash'>|Catalog} catalog */
function catalogHash(catalog){return digest(JSON.stringify({sourceHash:catalog.sourceHash,widthPx:catalog.widthPx,heightPx:catalog.heightPx,window:catalog.window,
 relationIds:[...catalog.relationIds].sort(),contacts:[...catalog.contacts].sort((a,b)=>a.id.localeCompare(b.id)),edges:[...catalog.edges].sort((a,b)=>a.id.localeCompare(b.id))}));}
/** Issue names for ALL measured physical edges, independent of DFS, relation
 * enumeration, writer mode and edge direction. Exact source samples name an
 * edge; its bounded measured vertices locate it visually. No pixel is added.
 * @param {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
 * image:import('../png').PngImage,sourceHash:string,relations:import('../scene-plan/source-scene-plan').Relation[],work:{checks:number}}} input */
function createSourceRouteCatalog({fit,image,sourceHash,relations,work}){
 if(!hasSharedSourceRoute(fit,image)||!hash(sourceHash))throw new TypeError('Scene source edge catalog proof is invalid');
 const contact=(/** @type {number} */cell)=>{
  const terminal=fit.cuts.indexOf(cell),node=fit.nodes[terminal],site=fit.sites[terminal];
  return {id:'contact-'+digest(String(cell%fit.window.w+fit.window.x)+','+String(Math.floor(cell/fit.window.w)+fit.window.y)).slice(0,24),
   endpointId:node?.endpointId??null,arrow:node?.arrow===true,
   point:site?.point??{x:cell%fit.window.w+fit.window.x,y:Math.floor(cell/fit.window.w)+fit.window.y}};
 };
 const contacts=new Map(),edgeKeys=new Map();
 const edges=fit.edges.map(edge=>{
  work.checks+=edge.path.length+edge.points.length+2;if(work.checks>4000000)throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
  const {id:key,reversed}=sourceEdgeKey(edge.path,fit.window);
  if(edgeKeys.has(edge.path))throw new TypeError('Scene source edge catalog proof is invalid');
  edgeKeys.set(edge.path,{id:key,reversed});
  const from=contact(reversed?edge.to:edge.from),to=contact(reversed?edge.from:edge.to);contacts.set(from.id,from);contacts.set(to.id,to);
  const points=edge.points.map(p=>({x:p.x+fit.window.x,y:p.y+fit.window.y}));if(reversed)points.reverse();
  return {id:key,from:from.id,to:to.id,points};
 });
 const base={sourceHash,widthPx:image.width,heightPx:image.height,window:{...fit.window},relationIds:relations.map(r=>r.id),contacts:[...contacts.values()],edges};
 const catalog=parseSourceRouteCatalog({...base,networkHash:catalogHash(base)});
 return {catalog,edgeKeys};
}
/** A response only narrows an independently measured complete route. Adjacent
 * writer segments of one physical edge form one step; partial edges cannot
 * enter a source network because graph joints retain all source endpoints.
 * @param {Choice} choice @param {Catalog} catalog @param {Step[]} candidate */
function sourceRouteChoiceMatches(choice,catalog,candidate){return choice.sourceHash===catalog.sourceHash&&choice.networkHash===catalog.networkHash
 &&choice.steps.length===candidate.length&&choice.steps.every((s,i)=>s.id===candidate[i]?.id&&s.reversed===candidate[i]?.reversed);}
/** @type {WeakMap<object,Catalog>} */const failures=new WeakMap();
/** @param {string} reason @param {Catalog} catalog */
function sourceRouteChoiceFailure(reason,catalog){const error=new TypeError('Scene shared path binding failed: '+reason);failures.set(error,catalog);return error;}
/** Only privately registered failures expose a bounded source description.
 * @param {unknown} error */
function sourceRouteChoiceFailureCatalog(error){return error!==null&&typeof error==='object'?failures.get(error):undefined;}
module.exports={parseSourceRouteChoice,parseSourceRouteCatalog,createSourceRouteCatalog,sourceRouteChoiceMatches,sourceRouteChoiceFailure,sourceRouteChoiceFailureCatalog,sourceEdgeKey};
