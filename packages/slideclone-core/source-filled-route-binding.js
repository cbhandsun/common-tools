// @ts-check
'use strict';
/** Bind an internal source-generated body to the page frame and freeze ALL
 * geometry before the caller records a private route capability. Metadata or
 * serialized copies never acquire that capability.
 * @param {import('./source-filled-route-geometry').FilledBody} body
 * @param {{x:number,y:number}} offset */
function bindSourceFilledRoute(body,offset){
 const parts=body.parts.map(part=>Object.freeze({
  box:Object.freeze({...part.box,x:part.box.x+offset.x,y:part.box.y+offset.y}),color:part.color,
  segments:Object.freeze(part.segments.map(s=>Object.freeze({type:s.type,
   points:Object.freeze(s.points.map(p=>Object.freeze({...p})))})))
 }));
 const links=body.links.map(link=>Object.freeze({...link,
  a:Object.freeze({x:link.a.x+offset.x,y:link.a.y+offset.y}),b:Object.freeze({x:link.b.x+offset.x,y:link.b.y+offset.y})}));
 return Object.freeze({parts:Object.freeze(parts),links:Object.freeze(links)});
}
module.exports={bindSourceFilledRoute};
