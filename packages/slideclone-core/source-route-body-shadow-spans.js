// @ts-check
'use strict';
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** Use actual end-cap runs of an already validated private body mask. A
 * rounded/sloped end does not occupy the corners of its bounding rectangle.
 * These spans only nominate background observations; the existing continuous
 * flank and 90% original-pixel certificate must still accept each full strip.
 * No disconnected run is joined and no range is extrapolated.
 * @param {{box:Box,mask:Uint8Array}} body @param {number} width @param {number} height
 * @param {{checks:number}} work @returns {Box[]|null} */
function sourceRouteBodyShadowSpans(body,width,height,work){
 /** @type {Box[]} */const result=[];
 const seen=new Set();
 /** @param {Box} span */const add=span=>{
  if(span.w<8||span.h<8||span.w===width&&span.h===height)return;
  const key=[span.x,span.y,span.w,span.h].join(':');if(!seen.has(key)){seen.add(key);result.push(span);}
 };
 for(const horizontal of [true,false]){
  let added=false;
  const along=horizontal?body.box.h:body.box.w,across=horizontal?body.box.w:body.box.h;
  for(const direction of [1,-1]){
   for(let i=direction===1?0:along-1;i>=0&&i<along;i+=direction){
    let first=-1,last=-1,disconnected=false;
    for(let j=0;j<across;j++){
     if(++work.checks>4000000)return null;
     const x=body.box.x+(horizontal?j:i),y=body.box.y+(horizontal?i:j);
     if(!body.mask[y*width+x])continue;
     if(first<0)first=j;else if(j!==last+1)disconnected=true;
     last=j;
    }
    if(first<0)continue;
    if(!disconnected){
     add(horizontal?{x:body.box.x+first,y:0,w:last-first+1,h:height}
      :{x:0,y:body.box.y+first,w:width,h:last-first+1});
     added=true;
    }
    // The nearest occupied section is the actual cap. Do not search inward
    // until a more convenient certificate can be found.
    break;
   }
  }
  if(!added)add(horizontal?{x:body.box.x,y:0,w:body.box.w,h:height}:{x:0,y:body.box.y,w:width,h:body.box.h});
 }
 return result;
}
module.exports={sourceRouteBodyShadowSpans};
