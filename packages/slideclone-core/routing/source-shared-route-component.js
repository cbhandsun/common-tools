// @ts-check
'use strict';
const {observeSharedRouteGap}=require('./source-shared-route-gap');
/** Capacity applies to contacts of the candidate complete SOURCE component.
 * Other disconnected border fragments cannot spend that component's slots.
 * Every chosen component still contains all of its original source cells.
 * @param {{image:import('../png').PngImage,nodes:import('../scene-plan/source-scene-route').Node[],window:import('../scene-plan/source-scene-plan').Box,
 * mask:Uint8Array,contacts:import('../scene-plan/source-scene-route').Site[][],contactAlternatives?:Map<import('../scene-plan/source-scene-route').Site,import('../scene-plan/source-scene-route').Site[]>[],background:number[],
 * obstacles:import('../scene-plan/source-scene-plan').Box[],textMasks:import('../scene-plan/source-scene-plan').Box[],budget:{used:number},work:{checks:number},allContacts?:boolean}} input */
function chooseSharedRouteComponent({image,nodes,window,mask,contacts,contactAlternatives,background,obstacles,textMasks,budget,work,allContacts=false}){
 const labels=new Int32Array(mask.length).fill(-1),roots=contacts.flat().map(s=>s.index);
 if(!roots.length)for(let n=0;n<mask.length;n++){if(++work.checks>4000000)return {chosen:null,reason:'shared-geometry-budget'};if(mask[n])roots.push(n);}
 /** @type {{component:Uint8Array,sites:import('./source-shared-route-gap').SharedSite[],alternatives:import('./source-shared-route-gap').SharedSite[][],owners:number[]}|null} */let chosen=null;
 let ordinal=0,reason='shared-component-incomplete',matched=-1;
 for(const seed of roots){
  if(labels[seed]!==-1)continue;
  const cells=[seed],id=ordinal++;labels[seed]=id;let clipped=false;
  for(const n of cells){
   const x=n%window.w,y=Math.floor(n/window.w);if(!x||!y||x===window.w-1||y===window.h-1)clipped=true;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(++work.checks>4000000)return {chosen:null,reason:'shared-geometry-budget'};
    const xx=x+dx,yy=y+dy,k=yy*window.w+xx;
    if(xx>=0&&yy>=0&&xx<window.w&&yy<window.h&&mask[k]&&labels[k]===-1){labels[k]=id;cells.push(k);}
   }
  }
  if(clipped)continue;
  /** @type {import('./source-shared-route-gap').SharedSite[]} */const sites=[];
  /** @type {import('./source-shared-route-gap').SharedSite[][]} */const alternatives=[];
  /** @type {number[]} */const owners=[];
  for(const [i,node]of nodes.entries()){
   const candidates=(contacts[i]??[]).filter(s=>labels[s.index]===id);work.checks+=(contacts[i]??[]).length;
   if(work.checks>4000000)return {chosen:null,reason:'shared-geometry-budget'};
   if(candidates.length>32){if(i>matched){matched=i;reason='shared-contact-capacity';}break;}
   if(candidates.length>1&&!allContacts){if(i>matched){matched=i;reason='shared-ambiguous-ports';}break;}
   if(candidates.length){
    for(const physical of candidates){
     const span=contactAlternatives?.[i]?.get(physical)??[physical];
     work.checks+=span.length;if(work.checks>4000000)return {chosen:null,reason:'shared-geometry-budget'};
     sites.push(physical);alternatives.push(span.filter(s=>labels[s.index]===id));owners.push(i);
    }
    continue;
   }
   const otherNodes=nodes.filter(n=>n!==node).map(n=>n.box);
   const gap=observeSharedRouteGap({image,node,cells,window,background,obstacles:[...obstacles,...otherNodes],textMasks,budget,work});
   if(gap.reason==='shared-geometry-budget'||gap.reason==='shared-source-budget')return {chosen:null,reason:gap.reason};
   if(!gap.site){if(i>matched){matched=i;reason=gap.reason;}break;}
   sites.push(gap.site);
   alternatives.push([gap.site]);owners.push(i);
  }
  if(new Set(owners).size!==nodes.length)continue;
  if(sites.length>32)return {chosen:null,reason:'shared-contact-capacity'};
  if(new Set(sites.map(s=>s.index)).size!==sites.length)return {chosen:null,reason:'shared-ambiguous-ports'};
  if(chosen)return {chosen:null,reason:'shared-ambiguous-ports'};
  const component=new Uint8Array(mask.length);
  for(const n of cells){if(++work.checks>4000000)return {chosen:null,reason:'shared-geometry-budget'};component[n]=1;}
  chosen={component,sites,alternatives,owners};
 }
 return {chosen,reason:chosen?'shared-component-confirmed':reason};
}
module.exports={chooseSharedRouteComponent};
