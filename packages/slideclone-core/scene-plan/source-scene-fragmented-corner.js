// @ts-check
'use strict';
const {sourceCornerFragmentDirection}=require('./source-corner-fragment-direction');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{box:{x:number,y:number,w:number,h:number},points:Point[]}} Component */
/** Repeated rails may meet through an actually dashed rounded turn. Certify
 * complete observed fragments against one quarter-circle corridor; never add
 * cells in its gaps or use the fitted circle as drawable geometry. Both axis
 * tangencies and an independent diagonal fragment must be witnessed. Different
 * fragment inventories are ambiguous even when their circles fit equally.
 * Inputs are private components from the bounded source observation.
 * @param {{components:Component[],x:number,y:number,farX:boolean,farY:boolean,limit:number,horizontalThickness:number,verticalThickness:number,work:{checks:number,exhausted:boolean}}} input
 * @returns {Component[]|null} */
function sourceFragmentedCorner({components,x,y,farX,farY,limit,horizontalThickness,verticalThickness,work}){
 if(work.exhausted)return null;
 const sx=farX?-1:1,sy=farY?-1:1;
 const tx=x+(farX?-verticalThickness/2:verticalThickness/2),ty=y+(farY?-horizontalThickness/2:horizontalThickness/2);
 const tolerance=Math.max(horizontalThickness,verticalThickness)/2+1.5;
 const nearby=components.filter(c=>c.points.length>=4&&c.box.w<=limit&&c.box.h<=limit
  &&c.points.every(p=>{if(++work.checks>4000000){work.exhausted=true;return false;}
   const u=(p.x+.5-tx)*sx,v=(p.y+.5-ty)*sy;
   return u>=-tolerance&&v>=-tolerance&&u<=limit&&v<=limit;}));
 if(work.exhausted||nearby.length<3||nearby.length>32)return null;
 /** @type {Map<string,Component[]>} */const inventories=new Map();
 /** Source moments are measured at most once per complete component. */
 const directions=new Map();
 /** @param {Component} component */
 const oblique=component=>{
  if(!directions.has(component))directions.set(component,sourceCornerFragmentDirection({points:component.points,sx,sy,
   thickness:Math.max(horizontalThickness,verticalThickness),work}));
  return directions.get(component)===true;
 };
 /** Four-neighbour raster components can touch diagonally. Only actual cells
  * from BOTH immediately adjacent, angularly ordered corridor fragments may
  * corroborate a compact middle mark. Keep the same direction thresholds and
  * return the original whole components; no contact or gap cell is drawn.
  * @type {Map<string,boolean>} */
 const contactProofs=new Map();
 /** @param {{component:Component,index:number,low:number,high:number}[]} rows @param {number} index */
 const contactDirection=(rows,index)=>{
  const row=rows[index],before=rows[index-1],after=rows[index+1];
  if(!row||!before||!after||before.high>row.low||after.low<row.high)return false;
  const key=`${before.index},${row.index},${after.index}`;
  if(contactProofs.has(key))return contactProofs.get(key)===true;
  const base=new Set(row.component.points.map(p=>`${p.x},${p.y}`)),points=row.component.points.slice();
  for(const neighbour of[before,after]){
   let contacts=0;
   for(const p of neighbour.component.points){
    let touching=false;
    for(let dy=-1;dy<=1&&!touching;dy++)for(let dx=-1;dx<=1;dx++){
     if(++work.checks>4000000){work.exhausted=true;return false;}
     if(base.has(`${p.x+dx},${p.y+dy}`)){touching=true;break;}
    }
    if(touching){contacts++;points.push(p);if(points.length>4096)return false;}
   }
   if(!contacts){contactProofs.set(key,false);return false;}
  }
  const result=sourceCornerFragmentDirection({points,sx,sy,thickness:Math.max(horizontalThickness,verticalThickness),work});
  contactProofs.set(key,result);return result;
 };
 for(let radius=4;radius<=Math.min(64,Math.floor(limit));radius++){
  const candidates=nearby.map((component,index)=>{
   let low=Infinity,high=-Infinity;
   for(const p of component.points){
    if(++work.checks>4000000){work.exhausted=true;return null;}
    const u=(p.x+.5-tx)*sx,v=(p.y+.5-ty)*sy;
    // A complete terminal dash may continue along the measured straight rail
    // beyond its tangent. Preserve it whole; the quarter circle alone would
    // incorrectly censor that real straight continuation.
    const distance=u>radius?Math.abs(v):v>radius?Math.abs(u):Math.abs(Math.hypot(radius-u,radius-v)-radius);
    if(distance>tolerance)return null;
    const angle=u>radius?Math.PI/2:v>radius?0:Math.atan2(radius-v,radius-u);low=Math.min(low,angle);high=Math.max(high,angle);
   }
   return {component,index,low,high};
  }).filter(c=>c!==null).sort((a,b)=>a.low-b.low);
  if(work.exhausted)return null;
  if(candidates.length<3)continue;
  const first=candidates[0],last=candidates.at(-1);if(!first||!last)continue;
  // Witness each tangent within the original source-contour tolerance.
  if(first.low*radius>tolerance||((Math.PI/2)-last.high)*radius>tolerance)continue;
  const diagonal=candidates.some((c,i)=>c.low>0&&c.high<Math.PI/2
   &&((c.component.box.w>verticalThickness+1.5&&c.component.box.h>horizontalThickness+1.5)||oblique(c.component)||contactDirection(candidates,i)));
  if(work.exhausted)return null;
  if(!diagonal)continue;
  // A gap may not exceed a complete neighbouring source dash. No missing
  // middle quadrant or distant corner can be supplied by the circle model.
  let complete=true;
  for(let i=1;i<candidates.length;i++){
   const a=candidates[i-1],b=candidates[i];if(!a||!b)return null;
   const allowance=Math.max(Math.hypot(a.component.box.w,a.component.box.h),Math.hypot(b.component.box.w,b.component.box.h));
   if(Math.max(0,b.low-a.high)*radius>allowance){complete=false;break;}
  }
  if(complete)inventories.set(candidates.map(c=>c.index).sort((a,b)=>a-b).join(','),candidates.map(c=>c.component));
 }
 return inventories.size===1?[...inventories.values()][0]??null:null;
}
module.exports={sourceFragmentedCorner};
