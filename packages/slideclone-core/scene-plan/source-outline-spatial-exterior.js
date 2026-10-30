// @ts-check
'use strict';
const {record,list,numeric}=require('../typography/typography-contract');
/** Find the same independently uniform background on every side of the
 * already observed window. This supplies contrast only, never a solid fill.
 * Fixed corners may intersect neighbouring artwork. Two disjoint 9x9 patches
 * per side must corroborate a UNIQUE common color under the existing 6/.82
 * tolerances; ambiguous backgrounds remain rejected. No unobserved reads.
 * @param {unknown} input @param {(x:number,y:number)=>number[]} readPixel */
function measureSpatialOutlineExterior(input,readPixel){
 if(!record(input)||typeof readPixel!=='function')throw new TypeError('Source exterior controls are invalid');
 const x0=numeric(input.x0,0,16384),y0=numeric(input.y0,0,16384),x1=numeric(input.x1,0,16384),y1=numeric(input.y1,0,16384);
 if(![x0,y0,x1,y1].every(Number.isSafeInteger)||x1-x0<18||y1-y0<18)throw new TypeError('Source exterior window is invalid');
 /** @type {{x:number,y:number,w:number,h:number}[]} */const masks=list(input.textMasks,10000).map(m=>{
  if(!record(m))throw new TypeError('Source exterior mask is invalid');
  const box={x:numeric(m.x,0,16384),y:numeric(m.y,0,16384),w:numeric(m.w,.001,16384),h:numeric(m.h,.001,16384)};
  if(box.x+box.w>16384||box.y+box.h>16384)throw new TypeError('Source exterior mask bounds are invalid');
  return box;
 });
 /** @type {number[][][]} */const sides=[[],[],[],[]];let reads=0;
 for(let side=0;side<4;side++){
  const length=side<2?x1-x0:y1-y0,slots=Math.min(16,Math.floor(length/9));
  for(let slot=0;slot<slots;slot++){
   const start=Math.floor(slot*(length-9)/(slots-1));
   const px=side<2?x0+start:side===2?x0:x1-9,py=side<2?(side===0?y0:y1-9):y0+start;
   if(masks.some(m=>m.x<px+9&&m.x+m.w>px&&m.y<py+9&&m.y+m.h>py))continue;
   /** @type {number[][]} */const cells=[];
   for(let y=py;y<py+9;y++)for(let x=px;x<px+9;x++){
    const p=list(readPixel(x,y),4);reads++;
    if(p.length!==4||!p.every(c=>typeof c==='number'&&Number.isSafeInteger(c)&&c>=0&&c<=255))throw new TypeError('Source exterior pixel is invalid');
    cells.push(/** @type {number[]} */(p));
   }
   if(cells.some(p=>(p[3]??0)<240))continue;
   const color=[0,1,2].map(c=>cells.map(p=>p[c]??0).sort((a,b)=>a-b)[40]??0);
   if(cells.filter(p=>color.every((v,c)=>Math.abs(v-(p[c]??0))<=6)).length/81>=.82)sides[side]?.push(color);
  }
 }
 /** @param {number[]} a @param {number[]} b */const same=(a,b)=>a.every((v,c)=>Math.abs(v-(b[c]??0))<=6);
 const common=(sides[0]??[]).filter(color=>sides.every(side=>side.filter(p=>same(color,p)).length>=2));
 /** @type {number[][]} */const colors=[];for(const color of common)if(!colors.some(c=>same(c,color)))colors.push(color);
 return {fill:colors.length===1?colors[0]:null,reads,patches:sides.map(side=>side.length)};
}
module.exports={measureSpatialOutlineExterior};
