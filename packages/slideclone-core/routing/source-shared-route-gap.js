// @ts-check
'use strict';
const {sourceVisibleGapPort}=require('./source-visible-gap-exterior');
const {certifySharedGapBackdrop}=require('./source-shared-gap-backdrop');
/** @typedef {import('../scene-plan/source-scene-route').Site&{attachmentKind?:'visible-gap-logical'}} SharedSite */
/** A complete component nominates its own terminal. Its actual tip is never
 * moved to the node. The private projected port and the entire blank strip
 * establish logical attachment only; subsequent full head/tree checks still
 * decide whether this is a real terminal of the requested shared component.
 * @param {{image:import('../png').PngImage,node:import('../scene-plan/source-scene-route').Node,
 * cells:number[],window:import('../scene-plan/source-scene-plan').Box,background:number[],
 * obstacles:import('../scene-plan/source-scene-plan').Box[],textMasks:import('../scene-plan/source-scene-plan').Box[],
 * budget:{used:number},work:{checks:number}}} input
 * @returns {{site:SharedSite|null,reason:string}} */
function observeSharedRouteGap({image,node,cells,window,background,obstacles,textMasks,budget,work}){
 /** @type {SharedSite[]} */const sites=[];
 let failure='shared-gap-terminal',rank=0;
 /** @param {number} at @param {string} reason */const rejected=(at,reason)=>{if(at>rank){rank=at;failure=reason;}};
 for(const side of ['left','right','top','bottom']){
  const horizontal=side==='left'||side==='right',positive=side==='left'||side==='top';
  const boundary=horizontal?(side==='left'?node.box.x:node.box.x+node.box.w):(side==='top'?node.box.y:node.box.y+node.box.h);
  let extreme=positive?-Infinity:Infinity;
  /** @type {number[]} */let terminal=[];
  for(const n of cells){
   if(++work.checks>4000000)return {site:null,reason:'shared-geometry-budget'};
   const x=n%window.w+window.x,y=Math.floor(n/window.w)+window.y,axis=horizontal?y:x,along=horizontal?x:y;
   if(axis<=(horizontal?node.box.y:node.box.x)||axis>=(horizontal?node.box.y+node.box.h:node.box.x+node.box.w)
    ||(positive?along>=boundary:along<=boundary))continue;
   if(positive?along>extreme:along<extreme){extreme=along;terminal=[n];}else if(along===extreme)terminal.push(n);
  }
  if(!terminal.length)continue;
  rejected(1,'shared-gap-terminal-profile');if(terminal.length>7)continue;
  const axes=terminal.map(n=>horizontal?Math.floor(n/window.w)+window.y:n%window.w+window.x);
  if(Math.max(...axes)-Math.min(...axes)+1!==terminal.length)continue;
  const centre=axes.reduce((sum,n)=>sum+n,0)/axes.length;
  const index=terminal.slice().sort((a,b)=>Math.abs((horizontal?Math.floor(a/window.w)+window.y:a%window.w+window.x)-centre)
   -Math.abs((horizontal?Math.floor(b/window.w)+window.y:b%window.w+window.x)-centre))[0];
  if(index===undefined)continue;
  const tip={x:index%window.w+window.x,y:Math.floor(index/window.w)+window.y},axis=horizontal?tip.y:tip.x;
  rejected(2,'shared-gap-private-port');
  const port=sourceVisibleGapPort(image,node,axis,side);if(!port)continue;
  const gap=((horizontal?port.x:port.y)-(horizontal?tip.x:tip.y))*(positive?1:-1);
  rejected(3,'shared-gap-distance');
  if(gap<=0||gap>512)continue;
  const low=Math.floor(Math.min(horizontal?tip.x:tip.y,horizontal?port.x:port.y))+1;
  const high=Math.ceil(Math.max(horizontal?tip.x:tip.y,horizontal?port.x:port.y))-1;
  // Logical attachment requires actual independently observed blank cells,
  // even inside the physical probe's geometric 2px envelope. That probe has
  // already rejected contact; its distance allowance cannot prove touching.
  // The strip checks below reject empty gaps and certify every remaining cell.
  // Original 1..5px shaft and terminal witness permit a maximum half-width
  // of three source cells. This proves the full strip, not a center sample.
  const radius=3,strip=horizontal?{x:low,y:axis-radius,w:high-low+1,h:radius*2+1}:{x:axis-radius,y:low,w:radius*2+1,h:high-low+1};
  work.checks+=obstacles.length+textMasks.length;
  const intersects=(/** @type {import('../scene-plan/source-scene-plan').Box} */b)=>b.x<strip.x+strip.w&&strip.x<b.x+b.w&&b.y<strip.y+strip.h&&strip.y<b.y+b.h;
  if(work.checks>4000000)return {site:null,reason:'shared-geometry-budget'};
  rejected(4,'shared-gap-obstacle');
  if(strip.w<1||strip.h<1||strip.x<0||strip.y<0||strip.x+strip.w>image.width||strip.y+strip.h>image.height
   ||strip.w*strip.h+window.w*window.h>262144||obstacles.some(intersects)||textMasks.some(intersects))continue;
  const backdrop=certifySharedGapBackdrop({image,node,strip,window,horizontal,positive,axis,background,budget,work});
  if(backdrop==='shared-source-budget'||backdrop==='shared-geometry-budget')return {site:null,reason:backdrop};
  rejected(5,'shared-gap-background');if(backdrop!=='shared-gap-background-confirmed')continue;
  const position=horizontal?(axis-node.box.y)/node.box.h:(axis-node.box.x)/node.box.w;
  const base=horizontal?{x:side==='left'?node.box.x:node.box.x+node.box.w,y:axis}:{x:axis,y:side==='top'?node.box.y:node.box.y+node.box.h};
  sites.push({index,point:tip,side,position,offset:{x:tip.x-base.x,y:tip.y-base.y},distance:gap,attachmentKind:'visible-gap-logical'});
 }
 return sites.length===1?{site:sites[0]??null,reason:'shared-gap-confirmed'}:{site:null,reason:sites.length?'shared-gap-ambiguous':failure};
}
module.exports={observeSharedRouteGap};
