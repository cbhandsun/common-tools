// @ts-check
'use strict';
const {record,list,box}=require('../scene-plan/source-scene-group-containment');
const {createHash}=require('node:crypto');
const {sourceRaster}=require('../typography/residual-text-mask');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('../scene-plan/source-scene-fill-raster-cache');
const {hasMeasuredScenePortFrame,measuredScenePortBodyMask}=require('../scene-plan/source-scene-port-evidence');
const {thinSourceRoute}=require('./source-route-centerline');
const {collectSharedRouteContacts}=require('./source-shared-route-contacts');
const {sharedRouteBackgroundAt}=require('./source-shared-route-background');
const {observeRouteAntialiasBackground}=require('./source-route-antialias-background');

const {inspectSourceSharedShaftTree,inspectSourceSharedShaftNetwork}=require('./source-shared-shaft-tree');
const {partitionSharedRouteHeads}=require('./source-shared-route-heads');

const {chooseSharedRouteComponent}=require('./source-shared-route-component');
const {sourceSharedContactTerminals,refineSharedContactTerminals}=require('./source-shared-contact-terminals');
const {measureSharedRouteEdges}=require('./source-shared-route-edges');
const {consolidateSharedHeadContacts}=require('./source-shared-head-contacts');
const {checkSharedSourceCurveFootprint,sharedSourceFittingInk,sourceRouteTransverseTargets}=require('./source-shared-curve-footprint');

/** @typedef {import('../scene-plan/source-scene-route').Node&{endpointId:string,arrow:boolean}} Endpoint */
/** @typedef {{window:import('../scene-plan/source-scene-plan').Box,nodes:Endpoint[],sites:import('./source-shared-route-gap').SharedSite[],
 * cuts:number[],edges:import('./source-shared-route-edges').SharedMeasuredEdge[],workChecks:number,cycleCount?:number}} SharedRouteFit */
/** @type {WeakMap<object,{pixels:Uint8Array,digest:string,width:number,height:number,component:Uint8Array,blocked:Uint8Array,shaft:Uint8Array,shaftCells:readonly number[],joints:number[],window:import('../scene-plan/source-scene-plan').Box}>} */const proofs=new WeakMap();
/** A complete source-backed shared tree, or an explicitly requested physical
 * network. Location hints do not create paths; the compiler must separately
 * prove a unique logical path through a measured network.
 * All endpoint bodies need private measured ports. Different colors crossing
 * cannot acquire a joint: each complete edge must retain its paint witness.
 * @param {unknown} input */
function measureSharedSourceRoute(input){
 if(!record(input)||input.inferContacts!==undefined&&typeof input.inferContacts!=='boolean'
  ||input.sourceNetwork!==undefined&&typeof input.sourceNetwork!=='boolean'
  ||!list(input.nodes)||input.nodes.length<(input.inferContacts===true?2:3)||input.nodes.length>32
  ||input.nodes.some(n=>!record(n)||typeof n.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(n.id)
   ||typeof n.endpointId!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(n.endpointId)||!box(n.box)||typeof n.arrow!=='boolean')
  ||new Set(input.nodes.map(n=>record(n)?n.endpointId:null)).size!==input.nodes.length||!box(input.window)
  ||!list(input.textMasks)||input.textMasks.length>10000||!input.textMasks.every(box)
  ||input.obstacles!==undefined&&(!list(input.obstacles)||input.obstacles.length>10000||!input.obstacles.every(box))
  ||!record(input.budget)||typeof input.budget.used!=='number'||!Number.isSafeInteger(input.budget.used)||input.budget.used<0||input.budget.used>4000000)
  throw new TypeError('Scene shared source controls are invalid');
 const source=sourceRaster(input.image);
 if(!record(input.image)||!Buffer.isBuffer(input.image.rgba))throw new TypeError('Scene shared source raster is invalid');
 const image={...source,rgba:input.image.rgba},nodes=/** @type {Endpoint[]} */(input.nodes),window=input.window,budget=/** @type {{used:number}} */(input.budget);
 const textMasks=/** @type {import('../scene-plan/source-scene-plan').Box[]} */(input.textMasks);
 const obstacles=/** @type {import('../scene-plan/source-scene-plan').Box[]} */(input.obstacles??[]);
 if(![window.x,window.y,window.w,window.h].every(Number.isSafeInteger)||window.x<0||window.y<0||window.x+window.w>image.width||window.y+window.h>image.height
  ||nodes.some(n=>n.box.x<0||n.box.y<0||n.box.x+n.box.w>image.width||n.box.y+n.box.h>image.height))throw new TypeError('Scene shared source window is invalid');
 if(input.textMasks.some(b=>b.x<0||b.y<0||b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError('Scene shared source masks are invalid');
 if(obstacles.some(b=>b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError('Scene shared source obstacles are invalid');
 /** @param {string} reason */const reject=reason=>{return {fit:/** @type {SharedRouteFit|null} */(null),reason};};
 if(nodes.some(n=>!hasMeasuredScenePortFrame(image,n.portFrame,n.box)))return reject('shared-private-ports');
 if(window.w*window.h>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return reject('shared-source-budget');
 const raster=readSceneFillRaster(image,window,budget),area=window.w*window.h,blocked=new Uint8Array(area),work={checks:0};
 /** @type {{box:import('../scene-plan/source-scene-plan').Box,mask:Uint8Array}[]} */const endpointBodies=[];
 for(const node of nodes){const body=measuredScenePortBodyMask(image,node.portFrame,node.box,window,work);if(!body)return reject('shared-geometry-budget');
  work.checks+=Math.min(area,4096);if(work.checks>4000000)return reject('shared-geometry-budget');for(let n=0;n<area;n++)blocked[n]=(blocked[n]??0)|(body[n]??0);
  const x=Math.max(0,Math.ceil(node.box.x-window.x)),y=Math.max(0,Math.ceil(node.box.y-window.y));
  const right=Math.min(window.w,Math.ceil(node.box.x+node.box.w-window.x)),bottom=Math.min(window.h,Math.ceil(node.box.y+node.box.h-window.y));
  if(right>x&&bottom>y)endpointBodies.push({box:{x,y,w:right-x,h:bottom-y},mask:body});}
 const bodies=blocked.slice();
 for(const b of input.textMasks){
  const x=Math.max(0,Math.ceil(b.x-window.x-.5)),right=Math.min(window.w,Math.ceil(b.x+b.w-window.x-.5));
  const y=Math.max(0,Math.ceil(b.y-window.y-.5)),bottom=Math.min(window.h,Math.ceil(b.y+b.h-window.y-.5));
  if(right<=x||bottom<=y)continue;
  work.checks+=(right-x)*(bottom-y);if(work.checks>4000000)return reject('shared-geometry-budget');
  for(let row=y;row<bottom;row++)blocked.fill(1,row*window.w+x,row*window.w+right);
 }
 /** @type {number[][]} */const perimeter=[];
 for(let n=0;n<area;n++)if(!blocked[n]&&(n<window.w||n>=area-window.w||n%window.w===0||n%window.w===window.w-1)){
  if((raster.rgba[n*4+3]??0)<240)return reject('shared-alpha');perimeter.push([0,1,2].map(c=>raster.rgba[n*4+c]??0));}
 if(perimeter.length<8)return reject('shared-background');
 work.checks+=perimeter.length*32;if(work.checks>4000000)return reject('shared-geometry-budget');
 const background=[0,1,2].map(c=>perimeter.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(perimeter.length/2)]??0);
 const backgroundAt=sharedRouteBackgroundAt({raster,bodies,endpointBodies,background,work});
 if(!backgroundAt)return reject('shared-geometry-budget');
 const mask=new Uint8Array(area);
 for(let n=0;n<area;n++){if(++work.checks>4000000)return reject('shared-geometry-budget');if(blocked[n])continue;
  if((raster.rgba[n*4+3]??0)<240)return reject('shared-alpha');
  const observed=backgroundAt(n);if(work.checks>4000000)return reject('shared-geometry-budget');
  mask[n]=Math.max(...observed.map((v,c)=>Math.abs(v-(raster.rgba[n*4+c]??0))))>=42?1:0;}
 const contacts=nodes.map(node=>collectSharedRouteContacts({image,node,window,mask,rgba:raster.rgba,textMasks,background,budget,work}));
 if(work.checks>4000000)return reject('shared-geometry-budget');
 const failure=contacts.find(c=>c.reason==='shared-source-budget'||c.reason==='shared-geometry-budget');
 const endpointContacts=contacts.map((c,i)=>({id:nodes[i]?.endpointId??'',count:c.sites.length,candidates:c.candidates,proven:c.proven}));
 if(failure)return {...reject(failure.reason??'shared-source-budget'),endpointContacts};
 const candidates=contacts.map(c=>c.sites);
 const inferContacts=input.inferContacts===true;
 const selected=chooseSharedRouteComponent({image,nodes,window,mask,contacts:candidates,contactAlternatives:contacts.map(c=>c.alternatives),background,obstacles,textMasks,budget,work,allContacts:inferContacts}),chosen=selected.chosen;
 if(!chosen)return {...reject(selected.reason),endpointContacts};
 if(input.inferContacts===true){
  const retained=consolidateSharedHeadContacts({mask:chosen.component,width:window.w,height:window.h,rgba:raster.rgba,background,backgroundAt,
   terminals:chosen.sites.map((s,i)=>({index:s.index,owner:chosen.owners[i]??-1})),work});
  if(!retained)return reject('shared-geometry-budget');
  const keep=new Set(retained);
  chosen.sites=chosen.sites.filter((_,i)=>keep.has(i));
  chosen.alternatives=chosen.alternatives.filter((_,i)=>keep.has(i));
  chosen.owners=chosen.owners.filter((_,i)=>keep.has(i));
 }
 const contactNodes=chosen.owners.map(index=>nodes[index]);
 /** @type {{index:number,alternatives:number[],fixed:boolean}[]} */const contactSpans=[];
 for(const [i,s]of chosen.sites.entries()){
  const span=chosen.alternatives[i]??[s];work.checks+=span.length+1;if(work.checks>4000000)return reject('shared-geometry-budget');
  contactSpans.push({index:s.index,alternatives:span.map(site=>site.index),fixed:inferContacts||contactNodes[i]?.arrow===true||s.attachmentKind==='visible-gap-logical'});
 }
 const protectedCells=new Uint8Array(area);
 for(const span of contactSpans)if(span.fixed)protectedCells[span.index]=1;
 const skeleton=thinSourceRoute(chosen.component,window.w,window.h,work,protectedCells);if(!skeleton)return reject('shared-geometry-budget');
 const bound=sourceSharedContactTerminals({skeleton,width:window.w,height:window.h,contacts:contactSpans,work});
 if(!bound)return reject(work.checks>4000000?'shared-geometry-budget':'shared-contact-topology');
 // Each alternative was privately verified against THIS source and body in
 // collectSharedRouteContacts. Reuse that exact site, including its contour
 // point/offset, rather than copying the representative's anchor to a new cell.
 const boundSites=bound.map((index,i)=>{
  const span=chosen.alternatives[i]??[];work.checks+=span.length;
  return span.find(site=>site.index===index);
 });
 if(work.checks>4000000)return reject('shared-geometry-budget');
 if(boundSites.some(site=>!site))return reject('shared-contact-topology');
 const sites=/** @type {import('./source-shared-route-gap').SharedSite[]} */(boundSites);
 const terminals=sites.map((s,i)=>({index:s.index,arrow:contactNodes[i]?.arrow===true}));
 const observedHeads=partitionSharedRouteHeads({mask:chosen.component,skeleton,width:window.w,height:window.h,rgba:raster.rgba,background,backgroundAt,terminals,work,inferArrows:inferContacts}),partition=observedHeads.partition;

 if(!partition)return reject(work.checks>4000000?'shared-geometry-budget':observedHeads.reason);
 if(inferContacts){
  const refined=refineSharedContactTerminals({component:chosen.component,width:window.w,height:window.h,work,
   contacts:contactSpans.map((span,i)=>({...span,fixed:partition.arrows[i]===true||sites[i]?.attachmentKind==='visible-gap-logical'}))});
  if(!refined)return reject(work.checks>4000000?'shared-geometry-budget':'shared-contact-topology');
  for(const [i,index]of refined.entries()){
   const site=chosen.alternatives[i]?.find(s=>s.index===index);if(!site)return reject('shared-contact-topology');
   sites[i]=site;const terminal=terminals[i];if(!terminal)return reject('shared-contact-topology');
   terminal.index=index;terminal.arrow=partition.arrows[i]===true;if(!terminal.arrow)partition.cuts[i]=index;
  }
 }
 const inspect=input.sourceNetwork===true?inspectSourceSharedShaftNetwork:inspectSourceSharedShaftTree;
 const topology=inspect({mask:partition.remaining,width:window.w,height:window.h,terminals:partition.cuts,work}),tree=topology.tree;
 if(!tree)return reject(work.checks>4000000?'shared-geometry-budget':topology.reason);
 const edgeResult=measureSharedRouteEdges({tree,partition,terminals,raster,background,backgroundAt,work});
 if(!edgeResult.edges||!edgeResult.shaftCells)return reject(edgeResult.reason);
 const measured=edgeResult.edges;
 const fit={window:{...window},nodes:contactNodes.map((n,i)=>{
  if(!n)throw new TypeError('Scene shared source contact owner is invalid');
  return {id:n.id,endpointId:n.endpointId,arrow:partition.arrows[i]===true,box:{...n.box},portFrame:n.portFrame};}),
  sites,cuts:partition.cuts,edges:measured,workChecks:work.checks,...(tree.cycleCount?{cycleCount:tree.cycleCount}:{})};
 /** Freeze only newly owned results and already frozen private tokens.
  * @param {unknown} value */const freeze=value=>{if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
   for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
 freeze(fit);
 proofs.set(fit,{pixels:image.rgba,digest:createHash('sha256').update(source.rgba).digest('hex'),
  width:image.width,height:image.height,component:chosen.component,blocked,shaft:partition.remaining,shaftCells:Object.freeze(edgeResult.shaftCells),joints:tree.joints,window:fit.window});
 return {fit,reason:'shared-source-confirmed'};
}
/** Buffer identity alone cannot bind a source: an alias can change its bytes
 * after measurement or output capture. Recheck the immutable digest against a
 * bounded canonical view, without invoking typed-array property accessors.
 * This identity check grants no geometry, color support or paint ownership.
 * @param {unknown} fit @param {unknown} image */
function sharedSourceProof(fit,image){
 const proof=fit!==null&&typeof fit==='object'?proofs.get(fit):undefined;
 if(!proof||!record(image)||proof.pixels!==image.rgba||proof.width!==image.width||proof.height!==image.height)return null;
 let source;
 try{source=sourceRaster(image);}catch(error){if(error instanceof TypeError)return null;throw error;}
 return createHash('sha256').update(source.rgba).digest('hex')===proof.digest?proof:null;
}
/** @param {unknown} fit @param {unknown} image */
function hasSharedSourceRoute(fit,image){return sharedSourceProof(fit,image)!==null;}
/** Only a live complete source proof can supply the original shaft mask.
 * Detached/serialized curve rows describe output geometry, never authority.
 * Every physical source edge must have actual output curves at its own width.
 * A true result is a representation predicate, not a new paint receipt.
 * @param {unknown} fit @param {unknown} image @param {unknown} rows @param {unknown} work */
function sharedSourceCurveFootprint(fit,image,rows,work){
 const proof=sharedSourceProof(fit,image);if(!proof)return false;
 return checkSharedSourceCurveFootprint(/** @type {SharedRouteFit} */(fit),proof,rows,work);
}
/** Detached fitting observations are available only from a live source proof.
 * @param {unknown} fit @param {unknown} image @param {import('./source-shared-route-output-snapshot').Work} work */
function sharedSourceRouteFittingInk(fit,image,work){
 const proof=sharedSourceProof(fit,image);if(!proof)throw new TypeError('Scene shared source proof is invalid');
 return sharedSourceFittingInk(/** @type {SharedRouteFit} */(fit),proof,work);
}
/** Read original source sections only after live source identity validation.
 * Returned targets are detached geometric observations, never authority.
 * @param {unknown} fit @param {unknown} image @param {import('./source-shared-route-output-snapshot').Work} work */
function sharedSourceRouteTransverseTargets(fit,image,work){
 const proof=sharedSourceProof(fit,image);if(!proof)throw new TypeError('Scene shared source proof is invalid');
 return sourceRouteTransverseTargets(/** @type {SharedRouteFit} */(fit),proof,work);
}
/** Detached original ink of one COMPLETE measured graph. This never unions
 * independently measured relations and cannot be minted from serialized IR.
 * Reading consumes the replacement caller's existing geometry ledger.
 * @param {unknown} fit @param {unknown} image @param {unknown} work
 * @returns {Set<number>|null} */
function sharedSourcePaintCells(fit,image,work){
 const proof=sharedSourceProof(fit,image);
 if(!proof)return null;
 if(!record(work)||typeof work.checks!=='number'||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000
  ||Object.getOwnPropertyDescriptor(work,'checks')?.writable!==true)
  throw new TypeError('Scene shared paint budget is invalid');
 const cells=new Set(),window=proof.window;
 if(work.checks+proof.component.length>4000000){work.checks=4000001;return null;}
 work.checks+=proof.component.length;
 for(let n=0;n<proof.component.length;n++){
  if(proof.component[n])cells.add((Math.floor(n/window.w)+window.y)*proof.width+n%window.w+window.x);
 }
 return cells;
}
/** Only a live source proof supplies the core and exclusion masks. These are
 * observations, not public erasure receipts; the residual reader must still
 * verify complete real output and the erasure roster.
 * @param {unknown} fit @param {unknown} image @param {unknown} work */
function sharedSourceAntialiasBackground(fit,image,work){
 const proof=sharedSourceProof(fit,image);if(!proof)return null;
 if(!record(work)||typeof work.checks!=='number'||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000
  ||Object.getOwnPropertyDescriptor(work,'checks')?.writable!==true)throw new TypeError('Scene shared paint budget is invalid');
 return observeRouteAntialiasBackground({image:{width:proof.width,height:proof.height,rgba:proof.pixels},
  window:proof.window,component:proof.component,blocked:proof.blocked,work:/** @type {{checks:number}} */(work)},
  {shaft:proof.shaft,edges:/** @type {SharedRouteFit} */(fit).edges});
}
module.exports={measureSharedSourceRoute,hasSharedSourceRoute,sharedSourcePaintCells,sharedSourceAntialiasBackground,sharedSourceCurveFootprint,sharedSourceRouteFittingInk,sharedSourceRouteTransverseTargets};

