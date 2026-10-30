// @ts-check
"use strict";
const {parseTypographyDeck,box,record,numeric}=require("./typography-contract");
/** Expand paragraph output frames into declared container whitespace. Source observations stay immutable.
 * No font shrinking, object movement, pixel ownership or source erasure is authorized here.
 * @param {unknown} input */
function proposeContainerParagraphLayout(input){
 const deck=parseTypographyDeck(input);let expanded=0;
 for(const page of deck.pages){const originals=page.textBoxes.map(t=>({...t,box:{...t.box}}));
  for(const text of page.textBoxes){
   if(text.style?.textLayout!=="paragraph"||text.rotation||!['body','list','caption','footnote'].includes(String(text.style.typographyRole))
    ||text.source?.typographyContainerBox===undefined)continue;
   const frame=text.box,container=box(text.source.typographyContainerBox);
   if(container.x>frame.x||container.y>frame.y||container.x+container.w<frame.x+frame.w-1e-6
    ||container.y+container.h<frame.y+frame.h-1e-6||container.x+container.w>deck.slideSize.widthPt+1e-6
    ||container.y+container.h>deck.slideSize.heightPt+1e-6)throw new TypeError("Invalid paragraph container");
   // A physical node's interior requires its own container evidence, not the enclosing region.
   if(typeof text.source.nativeComponentGroupId==='string'&&text.source.nativeComponentGroupId!==text.id)continue;
   const images=Array.isArray(page.images)?page.images:[];
   const obstacles=[...originals.filter(t=>t.id!==text.id).map(t=>t.box),...images.map(image=>{
    if(!record(image))throw new TypeError("Invalid paragraph image obstacle");return box(image.box);
   }),...(page.shapes??[]).flatMap(shape=>{
    if(!shape.box)return [];if(!record(shape.box))throw new TypeError("Invalid paragraph shape obstacle");
    const raw=shape.box,x=numeric(raw.x,-100000,100000),y=numeric(raw.y,-100000,100000),w=numeric(raw.w,-100000,100000),h=numeric(raw.h,-100000,100000);
    const pad=shape.type==='line'?.5:0;
    const b={x:Math.min(x,x+w)-pad,y:Math.min(y,y+h)-pad,w:Math.abs(w)+pad*2,h:Math.abs(h)+pad*2};
    return b.x<=frame.x&&b.y<=frame.y&&b.x+b.w>=frame.x+frame.w&&b.y+b.h>=frame.y+frame.h?[]:[b];})];
   let right=Math.max(frame.x+frame.w,container.x+container.w-2),bottom=Math.max(frame.y+frame.h,container.y+container.h-2);
   for(const other of obstacles){if(other.x>=frame.x+frame.w&&other.y<frame.y+frame.h&&other.y+other.h>frame.y)right=Math.min(right,Math.max(frame.x+frame.w,other.x-2));}
   for(const other of obstacles){if(other.y>=frame.y+frame.h&&other.x<right&&other.x+other.w>frame.x)bottom=Math.min(bottom,Math.max(frame.y+frame.h,other.y-2));}
   const proposed={...frame,w:right-frame.x,h:bottom-frame.y};
   const overlaps=(/** @type {import('./typography-contract').Box} */ a,/** @type {import('./typography-contract').Box} */ b)=>
    Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
   if(obstacles.some(other=>overlaps(proposed,other)>overlaps(frame,other)+1e-6))continue;
   if(proposed.w>frame.w+1e-6||proposed.h>frame.h+1e-6){text.box=proposed;expanded++;}
  }
 }
 return {deck,report:{expanded}};
}
module.exports={proposeContainerParagraphLayout};
