// @ts-check
'use strict';
const {sourceFilledArrowProfile}=require('./source-filled-arrow-profile');
const {sourceRouteCoverageWidth}=require('./source-route-coverage-width');
const {sourceFilledHeadProfile}=require('./source-filled-head-profile');
const {sourceRouteHeadCut}=require('./source-route-head-cut');
/** @typedef {{x:number,y:number}} Point */
/** Independently certify broad filled terminals and the COMPLETE remaining
 * thin shaft. A cut is a composition boundary through observed ink, never a
 * crop erasing inconvenient branches. Head and shaft certificates must cover
 * the original connected component exactly; all work shares the route ledger.
 * The thin observer's 1..5 width and 12-cell head rules remain unchanged.
 * @param {{mask:Uint8Array,width:number,height:number,rgba:Uint8Array,path:Point[],direction:string,
 * background:number[],work:{checks:number}}} input */
function partitionSourceCompoundRoute({mask,width,height,rgba,path,direction,background,work}){
 if(path.length<32||path.length>512||!['forward','backward','both'].includes(direction))return null;
 const observedShaft=sourceRouteCoverageWidth({path,rgba,width,height,background,work,cache:new Map()});
 if(observedShaft===null)return null;
 const first=path[0];if(!first)return null;
 const cells=[first.y*width+first.x],seen=new Uint8Array(mask.length);seen[cells[0]??0]=1;
 for(let i=0;i<cells.length;i++){
  const n=cells[i];if(n===undefined)return null;const x=n%width,y=Math.floor(n/width);
  if(!x||!y||x===width-1||y===height-1||cells.length>32768)return null;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return null;const xx=x+dx,yy=y+dy,k=yy*width+xx;
   if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[k]&&!seen[k]){seen[k]=1;cells.push(k);}
  }
 }
 const remaining=new Uint8Array(mask.length);for(const n of cells)remaining[n]=1;
 /** @param {boolean} end */
 const terminal=end=>{
  const ordered=end?[...path].reverse():path,tip=ordered[0];if(!tip)return null;
  for(const distance of [16,32,48,64,80,96,112,128]){
   const cut=ordered[distance];if(!cut||distance>=path.length/2)continue;
   for(const horizontal of [true,false]){
    const delta=horizontal?tip.x-cut.x:tip.y-cut.y;if(Math.abs(delta)<8)continue;
    const increasing=delta>0;
    /** @type {ReturnType<typeof sourceRouteHeadCut>} */let axisCut=null;
    // Preserve a successful ordinary head first. If its coordinate-axis cap
    // censors the neck, test a source-normal partition before the more costly
    // complete straight-arrow alternative. Every variant keeps all source
    // cells in the union and shares the same geometry allowance.
    for(const mode of [0,1,2]){
    /** @type {ReturnType<typeof sourceRouteHeadCut>} */
    const partition=mode===2?axisCut:sourceRouteHeadCut({remaining,width,height,tip,cut,horizontal,normal:mode===1,work});
    if(mode===0)axisCut=partition;
    if(!partition)continue;const {selected,shared}=partition;
    const head=mode===2?null:sourceFilledHeadProfile({cells:selected,width,tip,cut,horizontal,normalCut:mode===1,shaft:observedShaft,routeLength:path.length,work});
    const filled=mode===2?sourceFilledArrowProfile({cells:selected,geometryCells:selected,width,rgba,horizontal,direction:'forward',increasing,work}):null;
    const profile=head??filled;
    if(!profile)continue;
    if(filled){
     const along=increasing?filled.hi:filled.lo,across=filled.slope*along+filled.intercept;
     const observedTip=horizontal?{x:along,y:across}:{x:across,y:along};
     if(Math.hypot(tip.x-observedTip.x,tip.y-observedTip.y)>2)continue;
    }
    // Both cuts share ORIGINAL shaft ink. Keep the cut cross-section in the
    // shaft certificate; remove only the independently certified head side.
    for(const n of selected)if(!shared.has(n))remaining[n]=0;
    return {profile,selected:new Set(selected)};
    }
   }
  }
  return null;
 };
 const startHead=['backward','both'].includes(direction)?terminal(false):null;
 if(['backward','both'].includes(direction)&&!startHead)return null;
 const endHead=['forward','both'].includes(direction)?terminal(true):null;
 if(['forward','both'].includes(direction)&&!endHead)return null;
 const trimmed=path.filter(p=>remaining[p.y*width+p.x]);
 if(trimmed.length<16)return null;
 let shaft=sourceRouteCoverageWidth({path:trimmed,rgba,width,height,background,work,cache:new Map()});
 if(shaft===null||shaft<1||shaft>5)return null;
 const calibratedShaft=shaft;
 if([startHead,endHead].some(h=>h&&Math.abs(h.profile.widthPx-calibratedShaft)>2))return null;
 // The retained shaft cannot have a detached fragment concealed by a head
 // partition. Count the entire remaining component before using the original
 // exact width/branch observer, with NO terminal-head allowance at all.
 const seed=trimmed[0];if(!seed)return null;const queue=[seed.y*width+seed.x],visited=new Uint8Array(mask.length);visited[queue[0]??0]=1;
 for(let i=0;i<queue.length;i++){
  const n=queue[i];if(n===undefined)return null;const x=n%width,y=Math.floor(n/width);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return null;const xx=x+dx,yy=y+dy,k=yy*width+xx;
   if(xx>=0&&xx<width&&yy>=0&&yy<height&&remaining[k]&&!visited[k]){visited[k]=1;queue.push(k);}
  }
 }
 work.checks+=cells.length;if(work.checks>4000000||cells.some(n=>remaining[n]&&!visited[n]))return null;
 return {cells,queue,remaining,trimmed,shaft,startHead,endHead};
}
module.exports={partitionSourceCompoundRoute};
