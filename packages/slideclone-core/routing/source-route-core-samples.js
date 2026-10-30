// @ts-check
'use strict';
/** @typedef {{x:number,y:number}} Point */
/** Snap each centreline sample to the stroke CORE: the most contrasted cell of
 * its 3x3 neighbourhood against the locally observed background.
 *
 * A 1px thinning of an anti-aliased 2-4px stroke frequently lands on an edge
 * blend (especially along rounded elbows), so raw centreline colours mix
 * stroke paint with background. Paint fitting needs the stroke's own colour.
 * The returned path has the SAME length and order as the input so positions
 * along the route are preserved; it is used for paint sampling only and never
 * replaces measured geometry, coverage or contact evidence.
 * @param {{path:Point[],rgba:Uint8Array,width:number,height:number,
 *  backgroundAt:(index:number)=>number[],work:{checks:number},bgCache?:Map<number,number[]>}} input
 * @returns {Point[]|null} */
function sourceRouteCorePath({path,rgba,width,height,backgroundAt,work,bgCache=new Map()}){
 if(work.checks>4000000)return null;
 const contrast=(/** @type {number} */n)=>{let bg=bgCache.get(n);if(!bg){bg=backgroundAt(n);bgCache.set(n,bg);}return Math.max(...[0,1,2].map(c=>Math.abs((bg[c]??0)-(rgba[n*4+c]??0))));};
 const out=[];
 for(const p of path){
  let best=p,score=-1;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const x=p.x+dx,y=p.y+dy;if(x<0||y<0||x>=width||y>=height)continue;
   const n=y*width+x;if((rgba[n*4+3]??0)<240)continue;
   const s=contrast(n);if(s>score){score=s;best={x,y};}
  }
  if(work.checks>4000000)return null;
  out.push(best);
 }
 return out;
}
module.exports={sourceRouteCorePath};
