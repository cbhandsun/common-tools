// Frozen full-window implementation for independent differential regression.
// @ts-check
'use strict';
const {sourceSceneRouteSite}=require('../../packages/slideclone-core/scene-plan/source-scene-route');
const {sourceRouteContactCentres}=require('../../packages/slideclone-core/routing/source-route-contact-centres');
const {verifyMeasuredScenePort}=require('../../packages/slideclone-core/scene-plan/source-scene-port-evidence');
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
 for(let n=0;n<mask.length;n++){
  if(++work.checks>4000000)return reject('shared-geometry-budget');if(!mask[n])continue;
  const x=n%window.w+window.x,y=Math.floor(n/window.w)+window.y;
  if(x<node.box.x-2||x>node.box.x+node.box.w+2||y<node.box.y-2||y>node.box.y+node.box.h+2)continue;
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

