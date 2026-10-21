// @ts-check
'use strict';
/** @typedef {{x:number,y:number}} Point */
/** Partition an ORIGINAL component by a plane through observed source ink.
 * Its normal is a source tip/cut hypothesis, never a new route. No raster
 * rotation, cell interpolation, dilation or disconnected head is permitted.
 * Unit cells intersecting the cut remain shared by both certificates.
 * @param {{remaining:Uint8Array,width:number,height:number,tip:Point,cut:Point,horizontal:boolean,normal:boolean,work:{checks:number}}} input */
function sourceRouteHeadCut({remaining,width,height,tip,cut,horizontal,normal,work}){
 if(!(remaining instanceof Uint8Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<1||height<1||width*height>262144||remaining.length!==width*height
  ||![tip.x,tip.y].every(Number.isSafeInteger)||tip.x<0||tip.y<0||tip.x>=width||tip.y>=height
  ||![cut.x,cut.y].every(Number.isFinite)||cut.x<0||cut.y<0||cut.x>=width||cut.y>=height
  ||typeof horizontal!=='boolean'||typeof normal!=='boolean'
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>=4000000)return null;
 const vx=normal?tip.x-cut.x:horizontal?Math.sign(tip.x-cut.x):0;
 const vy=normal?tip.y-cut.y:horizontal?0:Math.sign(tip.y-cut.y);
 if(!vx&&!vy)return null;
 /** @param {number} n */const projection=n=>(n%width-cut.x)*vx+(Math.floor(n/width)-cut.y)*vy;
 /** @param {number} n */const included=n=>!!remaining[n]&&projection(n)>=0;
 const seed=tip.y*width+tip.x;if(!included(seed))return null;
 const selected=[seed],visited=new Uint8Array(remaining.length);visited[seed]=1;
 for(let i=0;i<selected.length;i++){
  const n=selected[i];if(n===undefined)return null;const x=n%width,y=Math.floor(n/width);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return null;const xx=x+dx,yy=y+dy,k=yy*width+xx;
   if(xx>=0&&xx<width&&yy>=0&&yy<height&&!visited[k]&&included(k)){visited[k]=1;selected.push(k);}
  }
 }
 const half=(Math.abs(vx)+Math.abs(vy))/2;
 const shared=new Set();
 for(const n of selected){if(++work.checks>4000000)return null;if(projection(n)<=half)shared.add(n);}
 return {selected,shared};
}
module.exports={sourceRouteHeadCut};
