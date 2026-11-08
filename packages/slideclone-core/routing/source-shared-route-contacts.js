// @ts-check
'use strict';
const {sourceSceneRouteSite}=require('../scene-plan/source-scene-route');
const {sourceRouteContactCentres}=require('./source-route-contact-centres');
const {verifyMeasuredScenePort}=require('../scene-plan/source-scene-port-evidence');
/** Geometry proposes contacts; only the private source port can admit them.
 * Unattached perimeter fringe must not spend the capacity of real contacts.
 * No pixels are removed from the component mask and the original attachment
 * allowance, complete-component checks and scan/work budgets are unchanged.
 * @param {{image:import('../png').PngImage,node:import('../scene-plan/source-scene-route').Node,
 * window:import('../scene-plan/source-scene-plan').Box,mask:Uint8Array,rgba:Uint8Array,
 * textMasks:import('../scene-plan/source-scene-plan').Box[],background:number[],budget:{used:number},work:{checks:number}}} input */
function collectSharedRouteContacts({image,node,window,mask,rgba,textMasks,background,budget,work}){
 /** @type {import('../scene-plan/source-scene-route').Site[]} */const sites=[];
 /** @type {Map<import('../scene-plan/source-scene-route').Site,import('../scene-plan/source-scene-route').Site[]>} */const alternatives=new Map();
 let candidates=0;
 /** @param {string} reason */const reject=reason=>{alternatives.clear();return {sites:/** @type {import('../scene-plan/source-scene-route').Site[]} */([]),alternatives,candidates,proven:sites.length,reason};};
 // The former full-window loop immediately discarded cells outside this
 // SAME inclusive endpoint rectangle. Visit its exact integer intersection
 // in the original row-major order; do not crop or change the source mask.
 // Whole-component, ports, head, topology and paint checks remain separate.
 work.checks+=8;if(work.checks>4000000)return reject('shared-geometry-budget');
 const left=Math.max(0,Math.ceil(node.box.x-2-window.x)),right=Math.min(window.w-1,Math.floor(node.box.x+node.box.w+2-window.x));
 const top=Math.max(0,Math.ceil(node.box.y-2-window.y)),bottom=Math.min(window.h-1,Math.floor(node.box.y+node.box.h+2-window.y));
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  if(++work.checks>4000000)return reject('shared-geometry-budget');const n=y*window.w+x;if(!mask[n])continue;
  const site=sourceSceneRouteSite(n,window.w,window,image,node,work);if(!site)continue;candidates++;
  // The existing verifier reads a 4 by 3 source window and itself requires
  // that capacity even when the raster cache already owns those cells.
  if(budget.used+12>4000000)return reject('shared-source-budget');
  const color='#'+[0,1,2].map(c=>(rgba[n*4+c]??0).toString(16).padStart(2,'0')).join('');
  if(verifyMeasuredScenePort({image,token:node.portFrame,box:node.box,point:site.point,side:site.side,color,textMasks,budget}))sites.push(site);
 }
 const centres=sourceRouteContactCentres({sites,mask,rgba,width:window.w,background,work});
 if(!centres||work.checks>4000000)return reject('shared-geometry-budget');
 for(const [site,representative]of centres){
  if(++work.checks>4000000)return reject('shared-geometry-budget');
  const span=alternatives.get(representative)??[];span.push(site);alternatives.set(representative,span);
 }
 const contacts=[...new Set(centres.values())];
 return {sites:contacts,alternatives,candidates,proven:sites.length,reason:contacts.length?null:candidates?'shared-private-contact':'shared-contact-missing'};
}
module.exports={collectSharedRouteContacts};
