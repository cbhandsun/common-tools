// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
/** Observe each requested COMPLETE row/column using two opaque pixels at
 * EACH exterior flank and 90% original-pixel support at the existing 18 RGB
 * tolerance. This field is independent of route proposals, body masks and
 * centerline colors. It estimates background only and grants no source ink,
 * erasure, port or topology authority. Disagreeing fields are never averaged.
 * Construction and queries consume the caller's original geometry ledger.
 * @param {unknown} input @returns {(index:number)=>number[]} */
function sourceRouteScanlineBackground(input){
 if(!record(input)||!list(input.background)||input.background.length!==3
  ||input.background.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>255)
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0
  ||Number(input.work.checks)>4000000||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true)
  throw new TypeError('Route scanline background input is invalid');
 const image=sourceRaster(input.image),background=/** @type {number[]} */(input.background),work=/** @type {{checks:number}} */(input.work);
 if(image.width*image.height>262144)throw new RangeError('Route scanline background exceeds the unit budget');
 /** @typedef {{left:number[],right:number[]}} Field */
 /** @type {Map<number,Field|null>} */const rows=new Map(),columns=new Map();
 /** @param {number[]} a @param {number[]} b */const agrees=(a,b)=>a.every((v,c)=>Math.abs(v-(b[c]??0))<=18);
 /** @param {number} n */const rgb=n=>[0,1,2].map(c=>image.rgba[n*4+c]??0);
 /** @param {Field} field @param {number} position @param {number} across */
 const interpolate=(field,position,across)=>field.left.map((v,c)=>v+((field.right[c]??0)-v)*(position-.5)/(across-2));
 /** @param {boolean} horizontal @param {number} along @returns {Field|null} */
 const observe=(horizontal,along)=>{
  const cache=horizontal?rows:columns,across=horizontal?image.width:image.height;
  work.checks+=1;if(work.checks>4000000)return null;
  if(cache.has(along))return cache.get(along)??null;
  cache.set(along,null);if(across<8)return null;
  /** @param {number} position */const cell=position=>horizontal?along*image.width+position:position*image.width+along;
  const flanks=[0,1,across-2,across-1].map(cell),colors=flanks.map(rgb);
  work.checks+=32;if(work.checks>4000000)return null;
  if(flanks.some(n=>(image.rgba[n*4+3]??0)<240)||!agrees(colors[0]??[],colors[1]??[])
   ||!agrees(colors[2]??[],colors[3]??[]))return null;
  const field={left:[0,1,2].map(c=>((colors[0]?.[c]??0)+(colors[1]?.[c]??0))/2),
   right:[0,1,2].map(c=>((colors[2]?.[c]??0)+(colors[3]?.[c]??0))/2)};
  let matching=0;
  for(let j=0;j<across;j++){
   work.checks+=8;if(work.checks>4000000)return null;
   const n=cell(j);
   if((image.rgba[n*4+3]??0)>=240&&agrees(rgb(n),interpolate(field,j,across)))matching++;
  }
  if(matching/across<.9)return null;
  cache.set(along,field);return field;
 };
 return index=>{
  if(work.checks>4000000)return background;
  work.checks+=1;if(work.checks>4000000)return background;
  if(!Number.isSafeInteger(index)||index<0||index>=image.width*image.height)return background;
  const x=index%image.width,y=Math.floor(index/image.width),row=observe(true,y),column=observe(false,x);
  work.checks+=8;if(work.checks>4000000)return background;
  const a=row?interpolate(row,x,image.width):null,b=column?interpolate(column,y,image.height):null;
  if(a&&b&&!agrees(a,b))return background;
  return a??b??background;
 };
}
module.exports={sourceRouteScanlineBackground};
