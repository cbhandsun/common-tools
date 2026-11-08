// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&['x','y','w','h'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k]))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=16384&&Number(value.y)+Number(value.h)<=16384;}
/** Propose the empty side of each original label row. A label on the right
 * does not own the entire horizontal band. These rectangles are seeds only;
 * the unchanged full-parent source isolation, text, native-part and scan gates
 * still decide every pixel. No text contents or image-specific geometry is used.
 * @param {unknown} parentInput @param {unknown} textInput
 * @returns {{seed:Box,area:number}[]} */
function sceneInteriorRowTargets(parentInput,textInput){
 if(!box(parentInput)||!list(textInput)||textInput.length>10000||!textInput.every(box))
  throw new TypeError('Scene interior row controls are invalid');
 const b=parentInput,lines=textInput.filter(t=>t.x>=b.x&&t.x+t.w<=b.x+b.w&&t.y>=b.y&&t.y+t.h<=b.y+b.h)
  .sort((a,b)=>a.y-b.y||a.x-b.x||a.h-b.h||a.w-b.w);
 /** @type {{top:number,bottom:number,left:number,right:number}[]} */const rows=[];
 for(const line of lines){const row=rows.at(-1);
  if(row&&line.y<row.bottom){row.bottom=Math.max(row.bottom,line.y+line.h);row.left=Math.min(row.left,line.x);row.right=Math.max(row.right,line.x+line.w);}
  else rows.push({top:line.y,bottom:line.y+line.h,left:line.x,right:line.x+line.w});
 }
 const candidates=[];
 for(const [index,row]of rows.entries()){
  const previous=rows[index-1],next=rows[index+1];
  const top=previous?(previous.bottom+row.top)/2:b.y+2,bottom=next?(row.bottom+next.top)/2:b.y+b.h-2;
  const left={x:b.x+2,w:row.left-b.x-4},right={x:row.right+2,w:b.x+b.w-row.right-4};
  const side=left.w>=right.w?left:right,height=bottom-top;
  // Reuse the original interior seed's 2px inset, 6px minimum and central half.
  if(side.w<6||height<6)continue;
  candidates.push({seed:{x:side.x+side.w*.25,y:top+height*.25,w:side.w*.5,h:height*.5},area:side.w*height});
 }
 return candidates.sort((a,b)=>b.area-a.area||a.seed.y-b.seed.y||a.seed.x-b.seed.x).slice(0,32);
}
module.exports={sceneInteriorRowTargets};
