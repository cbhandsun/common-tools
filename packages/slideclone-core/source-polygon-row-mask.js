// @ts-check
'use strict';
/** Rasterize the same even-odd, pixel-center predicate as insidePolygon.
 * Work is charged for every edge/row, sort and candidate cell. Observed ring
 * cells are added separately by the private source-frame consumer. This pure
 * geometry helper supplies no source, enclosure, occlusion or paint authority.
 * The caller supplies private validated vertices and a validated bounded window.
 * @param {{x:number,y:number}[]} vertices
 * @param {{x:number,y:number,w:number,h:number}} window
 * @param {{x:number,y:number,w:number,h:number}} bounds
 * @param {{checks:number}} work @returns {Uint8Array|null} */
function sourcePolygonRowMask(vertices,window,bounds,work){
 const mask=new Uint8Array(window.w*window.h);
 const left=Math.max(window.x,Math.ceil(bounds.x-.5)),right=Math.min(window.x+window.w,Math.ceil(bounds.x+bounds.w-.5));
 const top=Math.max(window.y,Math.ceil(bounds.y-.5)),bottom=Math.min(window.y+window.h,Math.ceil(bounds.y+bounds.h-.5));
 if(right<=left||bottom<=top)return mask;
 for(let y=top;y<bottom;y++){
  work.checks+=vertices.length+Math.max(0,right-left);if(work.checks>4000000)return null;
  const py=y+.5,intersections=[];
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
   const a=vertices[i],b=vertices[j];if(!a||!b)return null;
   if((a.y>py)!==(b.y>py))intersections.push((b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x);
  }
  work.checks+=Math.ceil(intersections.length*Math.log2(Math.max(1,intersections.length)));
  if(work.checks>4000000||intersections.length%2)return null;
  intersections.sort((a,b)=>a-b);
  for(let i=0;i<intersections.length;i+=2){
   const a=intersections[i],b=intersections[i+1];if(a===undefined||b===undefined)return null;
   const start=Math.max(left,Math.ceil(a-.5)),end=Math.min(right,Math.ceil(b-.5));
   if(start<end)mask.fill(1,(y-window.y)*window.w+start-window.x,(y-window.y)*window.w+end-window.x);
  }
 }
 return mask;
}
module.exports={sourcePolygonRowMask};
