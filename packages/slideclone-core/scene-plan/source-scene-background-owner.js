// @ts-check
'use strict';
const {measuredSceneGroupBounds,measuredSceneContainsGroup,measuredScenePortBodyMask}=require('./source-scene-port-evidence');
/** A plain background's source-resolution coverage must belong entirely to a
 * measured body or its actual observed perimeter cells. A rounded fill's
 * polygon alone excludes some of its stroke; this never dilates that polygon
 * or guesses missing perimeter pixels. No source erasure is authorized.
 * @template {{proposalId:string,node:{portFrame:object|null}}} T
 * @param {import('../png').PngImage} image @param {T[]} nodes
 * @param {{x:number,y:number}[]} polygon @param {{used:number,exhausted:boolean}} work
 * @returns {T|null} */
function measuredSceneBackgroundOwner(image,nodes,polygon,work){
 const x=Math.floor(Math.min(...polygon.map(p=>p.x))),y=Math.floor(Math.min(...polygon.map(p=>p.y)));
 const right=Math.ceil(Math.max(...polygon.map(p=>p.x))),bottom=Math.ceil(Math.max(...polygon.map(p=>p.y)));
 const window={x,y,w:right-x,h:bottom-y};
 if(x<0||y<0||right>image.width||bottom>image.height||window.w<=0||window.h<=0||window.w*window.h>262144||work.exhausted)return null;
 /** @type {{owner:T,bounds:NonNullable<ReturnType<typeof measuredSceneGroupBounds>>}[]} */const matches=[];
 for(const owner of nodes){
  if(++work.used>4000000){work.exhausted=true;return null;}
  const bounds=measuredSceneGroupBounds(image,owner.node.portFrame);
  if(!bounds||polygon.some(p=>p.x<bounds.x||p.x>bounds.x+bounds.w||p.y<bounds.y||p.y>bounds.y+bounds.h))continue;
  const ledger={checks:work.used},mask=measuredScenePortBodyMask(image,owner.node.portFrame,bounds,window,ledger);
  work.used=ledger.checks;
  if(work.used>4000000){work.exhausted=true;return null;}
  if(!mask)continue;
  let covered=true;
  for(const cell of mask){if(++work.used>4000000){work.exhausted=true;return null;}if(cell!==1){covered=false;break;}}
  if(covered)matches.push({owner,bounds});
 }
 matches.sort((a,b)=>a.bounds.w*a.bounds.h-b.bounds.w*b.bounds.h);
 const first=matches[0];if(!first)return null;
 const b=first.bounds,body=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
 if(matches.slice(1).some(other=>other.bounds.w*other.bounds.h<=b.w*b.h
  ||!measuredSceneContainsGroup(image,other.owner.node.portFrame,other.bounds,body,work))||work.exhausted)return null;
 return first.owner;
}
module.exports={measuredSceneBackgroundOwner};
