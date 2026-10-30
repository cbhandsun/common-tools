// @ts-check
"use strict";
const {types}=require('node:util');
const {planSceneCropLayout}=require('./source-scene-crop-layout');
/** @typedef {{index:number,x:number,y:number,w:number,h:number}} Crop */
/** @typedef {{box:Crop,ids:number[]}} Tile */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** Gutter labels list all identities sharing a tile; source pixels are never
 * annotated. A target's crop remains a strict subwindow of that shared tile.
 * @param {Tile} tile */
function width(tile){return Math.max(tile.box.w,tile.ids.reduce((n,id)=>n+String(id).length*4+4,0)-8);}
/** @param {Tile} tile */
function area(tile){return (width(tile)+16)*(tile.box.h+16);}
/** @param {Tile} a @param {Tile} b @returns {Tile|null} */
function union(a,b){
 if(a.box.x+a.box.w<=b.box.x||b.box.x+b.box.w<=a.box.x||a.box.y+a.box.h<=b.box.y||b.box.y+b.box.h<=a.box.y)return null;
 const x=Math.min(a.box.x,b.box.x),y=Math.min(a.box.y,b.box.y);
 return {box:{index:a.box.index,x,y,w:Math.max(a.box.x+a.box.w,b.box.x+b.box.w)-x,h:Math.max(a.box.y+a.box.h,b.box.y+b.box.h)-y},ids:[...a.ids,...b.ids].sort((a,b)=>a-b)};
}
/** Bounded, deterministic context sharing within ONE observation. All source
 * windows and identities survive; a second observation gets its own atlas.
 * Cost and rendering use this same plan, including gutters and packing waste.
 * @param {unknown} input */
function planSceneCropAtlas(input){
 if(!Array.isArray(input)||types.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype||input.length<1||input.length>32
  ||Reflect.ownKeys(input).length!==input.length+1||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p)))throw new TypeError('Scene atlas targets are invalid');
 const seen=new Set();
 /** @type {Crop[]} */const crops=input.map(v=>{
  if(!record(v)||![v.index,v.x,v.y,v.w,v.h].every(n=>typeof n==='number'&&Number.isSafeInteger(n))
   ||Number(v.index)<0||Number(v.index)>=512||seen.has(v.index)||Number(v.x)<0||Number(v.y)<0||Number(v.w)<1||Number(v.h)<1
   ||Number(v.x)+Number(v.w)>16384||Number(v.y)+Number(v.h)>16384)throw new TypeError('Scene atlas target is invalid');
  seen.add(v.index);return {index:Number(v.index),x:Number(v.x),y:Number(v.y),w:Number(v.w),h:Number(v.h)};
 });
 const original=crops.map(box=>({box,ids:[box.index]}));let tiles=original.slice();
 // At most 31 merges of at most 496 pairs; no source scan or model call.
 for(let step=0;step<31;step++){
  /** @type {{a:number,b:number,tile:Tile,gain:number}|null} */let best=null;
  for(let a=0;a<tiles.length;a++)for(let b=a+1;b<tiles.length;b++){
   const first=tiles[a],second=tiles[b];if(!first||!second)continue;
   const tile=union(first,second);if(!tile)continue;
   const gain=area(first)+area(second)-area(tile);
   if(gain>0&&(!best||gain>best.gain))best={a,b,tile,gain};
  }
  if(!best)break;
  const selected=best;tiles=tiles.filter((_,i)=>i!==selected.a&&i!==selected.b);tiles.push(selected.tile);
 }
 tiles.sort((a,b)=>a.box.index-b.box.index);
 /** @param {Tile[]} rows */
 const fit=rows=>{try{return planSceneCropLayout(rows.map(t=>({index:t.box.index,w:width(t),h:t.box.h})));}
  catch(error){if(!(error instanceof RangeError))throw error;return null;}};
 const separate=fit(original);let layout=fit(tiles);
 if(separate&&(!layout||separate.width*separate.height<layout.width*layout.height)){tiles=original;layout=separate;}
 if(!layout)throw new RangeError('Scene sheet exceeds pixel budget');
 const positions=layout.placements;
 const placed=tiles.map((t,i)=>{const p=positions[i];if(!p||p.index!==t.box.index)throw new TypeError('Scene atlas tile binding failed');return {...t,x:p.x,y:p.y};});
 const placements=crops.map(c=>{const t=placed.find(t=>t.ids.includes(c.index));if(!t)throw new TypeError('Scene atlas crop binding failed');
  return {index:c.index,x:t.x+c.x-t.box.x,y:t.y+c.y-t.box.y};});
 const annotations=placed.flatMap(t=>{let offset=0;return t.ids.map(index=>{const result={index,x:t.x+offset,y:t.y};offset+=String(index).length*4+4;return result;});});
 return {width:layout.width,height:layout.height,placements,annotations,tiles:placed.map(t=>({x:t.x,y:t.y,cropBox:t.box,indices:t.ids}))};
}
module.exports={planSceneCropAtlas};
