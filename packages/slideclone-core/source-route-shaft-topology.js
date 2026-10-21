// @ts-check
'use strict';
const {thinSourceRoute}=require('./source-route-centerline');
/** Prove that the COMPLETE remaining source shaft has one path, with two
 * ends, no fork and no loop. Ignore a diagonal graph shortcut only when an
 * original cardinal neighbour already connects those same skeleton cells.
 * This preserves digital connectivity without treating each raster stair as
 * a triangular cycle. This grants no paint, width or attachment authority.
 * @param {{mask:Uint8Array,width:number,height:number,work:{checks:number}}} input */
function sourceRouteShaftTopology({mask,width,height,work}){
 if(!(mask instanceof Uint8Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<3||height<3||width*height>262144||mask.length!==width*height
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>=4000000)return null;
 const skeleton=thinSourceRoute(mask,width,height,work);if(!skeleton)return null;
 /** @type {Map<number,number[]>} */const graph=new Map();
 const ends=[];
 for(let n=0;n<skeleton.length;n++){
  if(++work.checks>4000000)return null;if(!skeleton[n])continue;
  const x=n%width,y=Math.floor(n/width),neighbours=[];
  if(!x||!y||x===width-1||y===height-1)return null;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return null;if(!dx&&!dy)continue;
   if(dx&&dy&&(skeleton[n+dx]||skeleton[n+dy*width]))continue;
   const k=n+dy*width+dx;if(skeleton[k])neighbours.push(k);
  }
  if(neighbours.length===1)ends.push(n);else if(neighbours.length!==2)return null;
  graph.set(n,neighbours);if(graph.size>512)return null;
 }
 if(ends.length!==2)return null;
 const path=[],visited=new Set();let at=ends[0];
 while(at!==undefined){
  if(++work.checks>4000000||visited.has(at))return null;
  visited.add(at);path.push({x:at%width,y:Math.floor(at/width)});
  at=graph.get(at)?.find(n=>!visited.has(n));
 }
 return visited.size===graph.size?path:null;
}
module.exports={sourceRouteShaftTopology};
