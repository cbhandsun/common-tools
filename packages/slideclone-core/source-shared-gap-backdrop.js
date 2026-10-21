// @ts-check
'use strict';
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {measuredScenePortOwnsCell}=require('./source-scene-port-evidence');
/** Certify a smooth exterior field from FOUR separate flank pixels per row,
 * connected to three independently observed global-background sections at
 * the tip end. The field is interpolated only between those measured flanks;
 * no center pixel, missing paint or extension is inferred. The entire blank
 * corridor retains alpha/42-contrast and 90%/18-channel support requirements.
 * @param {{image:import('./png').PngImage,node:import('./source-scene-route').Node,
 * strip:import('./source-scene-plan').Box,window:import('./source-scene-plan').Box,
 * horizontal:boolean,positive:boolean,axis:number,background:number[],budget:{used:number},work:{checks:number}}} input */
function certifyGapStrip({image,node,strip,window,horizontal,positive,axis,background,budget,work}){
 const first=horizontal?strip.x:strip.y,last=first+(horizontal?strip.w:strip.h)-1;
 const lo=positive?first-3:first,hi=positive?last:last+3;
 const witness=horizontal?{x:lo,y:axis-7,w:hi-lo+1,h:15}:{x:axis-7,y:lo,w:15,h:hi-lo+1};
 if(witness.x<0||witness.y<0||witness.x+witness.w>image.width||witness.y+witness.h>image.height
  ||window.w*window.h+witness.w*witness.h>262144)return 'shared-gap-background';
 if(budget.used+sceneFillRasterReadCost(image,witness,budget)>4000000)return 'shared-source-budget';
 const raster=readSceneFillRaster(image,witness,budget),length=hi-lo+1;
 /** @param {number} along @param {number} across */const at=(along,across)=>horizontal?across*raster.width+along:along*raster.width+across;
 /** @param {number} cell */const rgb=cell=>[0,1,2].map(c=>raster.rgba[cell*4+c]??0);
 /** @param {number[]} a @param {number[]} b */const agrees=(a,b)=>a.every((v,c)=>Math.abs(v-(b[c]??0))<=18);
 /** @type {{left:number[],right:number[]}|null} */let previous=null;
 let samples=0,matching=0;
 for(let step=0;step<length;step++){
  const along=positive?step:length-1-step,cells=[at(along,0),at(along,1),at(along,13),at(along,14)],colors=cells.map(rgb);
  work.checks+=16;if(work.checks>4000000)return 'shared-geometry-budget';
  if(cells.some(n=>(raster.rgba[n*4+3]??0)<240)||!colors.every(c=>agrees(c,colors[0]??[])))return 'shared-gap-background';
  const left=[0,1,2].map(c=>((colors[0]?.[c]??0)+(colors[1]?.[c]??0))/2);
  const right=[0,1,2].map(c=>((colors[2]?.[c]??0)+(colors[3]?.[c]??0))/2);
  if(step<3&&colors.some(c=>!agrees(c,background))||previous&&(!agrees(left,previous.left)||!agrees(right,previous.right)))return 'shared-gap-background';
  previous={left,right};
  const global=lo+along;if(global<first||global>last)continue;
  for(let across=4;across<=10;across++){
   if(++work.checks>4000000)return 'shared-geometry-budget';
   const x=horizontal?global:axis+across-7,y=horizontal?axis+across-7:global;
   if(measuredScenePortOwnsCell(image,node.portFrame,node.box,y*image.width+x))continue;
   const n=at(along,across),color=rgb(n),expected=left.map((v,c)=>v+((right[c]??0)-v)*(across-.5)/13);
   if((raster.rgba[n*4+3]??0)<240||expected.some((v,c)=>Math.abs(v-(color[c]??0))>=42))return 'shared-gap-background';
    samples++;if(agrees(color,expected)){matching++;continue;}
    // Anti-alias falloff of the tip: only in the row adjacent to the tip,
    // a cell whose paint lies between the tip-side cell and the expected
    // field (and is lighter than that tip-side cell) is the tip's edge
    // blend, not paint inside the gap. Ink-contrast cells failed above.
    if(global===(positive?first:last)){
     const tip=rgb(at(along+(positive?-1:1),across));
     if(color.every((v,c)=>v>=Math.min(tip[c]??0,expected[c]??0)-6&&v<=Math.max(tip[c]??0,expected[c]??0)+6)
      &&Math.max(...color.map((v,c)=>Math.abs(v-(expected[c]??0))))<Math.max(...tip.map((v,c)=>Math.abs(v-(expected[c]??0)))))matching++;
    }
  }
 }
 return samples&&matching/samples>=.9?'shared-gap-background-confirmed':'shared-gap-background';
}
/** The node-adjacent row of a strip may be the anti-aliased falloff of the
 * node's own outline: a band that is uniform across the whole 15-cell witness
 * and differs from the row before it. Such a row belongs to the outline, not
 * to the gap; it is trimmed once and the remaining strip is certified with
 * the unchanged rules. Paint inside the gap is never trimmed because a shaft
 * or tip is not uniform across the witness.
 * @param {Parameters<typeof certifyGapStrip>[0]} input */
function certifySharedGapBackdrop(input){
 const result=certifyGapStrip(input);
 const {image,strip,horizontal,positive,axis,work}=input;
 const length=horizontal?strip.w:strip.h;
 if(result!=='shared-gap-background'||length<2)return result;
 const first=horizontal?strip.x:strip.y,last=first+length-1,edge=positive?last:first,inner=positive?last-1:first+1;
 /** @param {number} along @param {number} across */
 const rgb=(along,across)=>{const x=horizontal?along:axis+across,y=horizontal?axis+across:along;
  if(x<0||y<0||x>=image.width||y>=image.height)return null;const n=(y*image.width+x)*4;
  return (image.rgba[n+3]??0)<240?null:[0,1,2].map(c=>image.rgba[n+c]??0);};
 work.checks+=30;if(work.checks>4000000)return 'shared-geometry-budget';
 /** @type {number[][]} */
 const band=[];
 /** @type {number[][]} */
 const before=[];
for(let across=-7;across<=7;across++){const p=rgb(edge,across),q=rgb(inner,across);if(!p||!q)return result;band.push(p);before.push(q);}
 const ref=band[0]??[];
 if(!band.every(p=>p.every((v,c)=>Math.abs(v-(ref[c]??0))<=18)))return result;
 const differs=band.filter((p,i)=>p.some((v,c)=>Math.abs(v-(before[i]?.[c]??0))>18)).length;
 if(differs<band.length*.9)return result;
 const trimmed=horizontal?{...strip,x:positive?strip.x:strip.x+1,w:strip.w-1}:{...strip,y:positive?strip.y:strip.y+1,h:strip.h-1};
 return certifyGapStrip({...input,strip:trimmed});
}
module.exports={certifySharedGapBackdrop};
