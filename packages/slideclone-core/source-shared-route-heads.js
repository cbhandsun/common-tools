// @ts-check
'use strict';
const {sourceSharedHeadBranch}=require('./source-shared-head-branch');
const {sourceRouteCoverageWidth}=require('./source-route-coverage-width');
const {sourceRouteHeadCut}=require('./source-route-head-cut');
const {sourceFilledHeadProfile}=require('./source-filled-head-profile');
/** @typedef {{remaining:Uint8Array,cuts:number[],arrows:boolean[],heads:{index:number,path:{x:number,y:number}[],selected:Set<number>,shaft:number}[]}} SharedHeadPartition */
/** Independently certify every terminal head before removing its cells from
 * the shaft topology. Cuts share original ink; no gap or branch is invented.
 * @param {{mask:Uint8Array,skeleton:Uint8Array,width:number,height:number,rgba:Uint8Array,background:number[],
 * terminals:{index:number,arrow:boolean}[],backgroundAt?:(index:number)=>number[],work:{checks:number},inferArrows?:boolean}} input */
function partitionSharedRouteHeads({mask,skeleton,width,height,rgba,background,backgroundAt,terminals,work,inferArrows=false}){
 /** @param {string} reason */const reject=reason=>({partition:/** @type {SharedHeadPartition|null} */(null),reason});
 const remaining=mask.slice();
 /** @type {{index:number,path:{x:number,y:number}[],selected:Set<number>,shaft:number}[]} */const heads=[];
 const cuts=terminals.map(t=>t.index);
 const arrows=terminals.map(t=>inferArrows?false:t.arrow);
 const hasKnownArrows = terminals.some(t => t.arrow);
  for(const [ordinal,terminal]of terminals.entries()){
  if(!terminal.arrow && (!inferArrows || hasKnownArrows)) continue;
  const path=sourceSharedHeadBranch({mask:skeleton,width,height,start:terminal.index,terminals:terminals.map(t=>t.index),work});
  if(!path)return reject('shared-head-path');
  const tip=path[0];if(!tip)return reject('shared-head-path');
  let proven=false,widthObserved=false;const cache=new Map();
  for(const distance of [16,28,48,64,80,96,112,128]){
   const cut=path[distance];if(!cut||(distance>=path.length/2&&distance>28))continue;
   // Calibrate on this head/neck partition's own source prefix. Even its
   // terminal branch may contain a distant elbow whose tangent has no
   // relation to the local neck. Every later shaft edge is still measured.
   const shaft=sourceRouteCoverageWidth({path:path.slice(0,distance+1),rgba,width,height,background,...(backgroundAt?{backgroundAt}:{}),work,cache});
   if(shaft===null)continue;widthObserved=true;
   profiles: for(const horizontal of [true,false])for(const normal of [false,true]){
    const partition=sourceRouteHeadCut({remaining,width,height,tip,cut,horizontal,normal,work});if(!partition)continue;
    const profile=sourceFilledHeadProfile({cells:partition.selected,width,tip,cut,horizontal,normalCut:normal,shaft,routeLength:path.length,work});
    if(!profile)continue;
    if(terminals.some(t=>t!==terminal&&partition.selected.includes(t.index)))continue;
    const retained=path.findIndex(p=>partition.shared.has(p.y*width+p.x));if(retained<1)continue;
    for(const n of partition.selected)if(!partition.shared.has(n))remaining[n]=0;
    const point=path[retained];if(!point)return reject('shared-head-cut');cuts[ordinal]=point.y*width+point.x;
    heads.push({index:terminal.index,path:path.slice(0,retained+1),selected:new Set(partition.selected),shaft});
    proven=true;arrows[ordinal]=true;break profiles;
   }
   if(proven)break;
  }
  if(work.checks>4000000)return reject('shared-geometry-budget');
  if(!proven&&!inferArrows)return reject(widthObserved?'shared-head-profile':'shared-head-shaft-width');
 }
 return {partition:{remaining,cuts,heads,arrows},reason:'shared-head-confirmed'};
}
module.exports={partitionSharedRouteHeads};
