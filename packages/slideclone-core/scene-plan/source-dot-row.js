// @ts-check
'use strict';
const {types}=require('node:util');
const {record,box:validBox}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** Independently measure a complete horizontal three-dot glyph. Provider ink
 * colors are not segmentation boundaries: antialias halos can complete each
 * dot. Every component still needs twelve contrasting source pixels. This
 * measurement grants no transcription, drawing, erasure or admission rights.
 * @param {unknown} input */
function measureSourceDotRow(input){
 const invalid=()=>{throw new TypeError('Source dot row controls are invalid');};
 if(!record(input)||Reflect.ownKeys(input).length!==3||!record(input.image)||!validBox(input.box)||!record(input.budget))return invalid();
 const im=input.image,b=input.box,budget=input.budget;
 if(![im.width,im.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(im.width)*Number(im.height)>40000000||types.isProxy(im.rgba)||!types.isUint8Array(im.rgba)
  ||!Number.isSafeInteger(budget.used)||Number(budget.used)<0||Number(budget.used)>4000000
  ||Object.getOwnPropertyDescriptor(budget,'used')?.writable!==true)return invalid();
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',im.rgba),offset=Reflect.get(proto,'byteOffset',im.rgba),length=Reflect.get(proto,'length',im.rgba);
 if(!types.isArrayBuffer(buffer)||length!==Number(im.width)*Number(im.height)*4)return invalid();
 const rgba=new Uint8Array(buffer,offset,length),image={width:Number(im.width),height:Number(im.height),rgba};
 const x0=Math.floor(b.x),y0=Math.floor(b.y),w=Math.ceil(b.x+b.w)-x0,h=Math.ceil(b.y+b.h)-y0,area=w*h;
 if(x0<0||y0<0||x0+w>image.width||y0+h>image.height||w>256||h>256||area>16384)return invalid();
 if(w<8||h<5)return null;
 // Bound the raster scan, component flood and geometry pass together. A
 // budget failure does not expose a partially measured symbol.
 if(Number(budget.used)+area*3>4000000)throw new RangeError('Scene crop pixel budget exceeded');
 budget.used=Number(budget.used)+area*3;
 /** @type {{x:number,y:number,color:number[]}[]} */const pixels=[];
 /** @type {{x:number,y:number,color:number[]}[]} */const rim=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=((y+y0)*image.width+x+x0)*4;
  if(rgba[i+3]!==255)return null;
  const p={x:x-(w-1)/2,y:y-(h-1)/2,color:[rgba[i]??0,rgba[i+1]??0,rgba[i+2]??0]};pixels.push(p);
  if(x===0||y===0||x===w-1||y===h-1)rim.push(p);
 }
 const mean=[0,1,2].map(c=>rim.reduce((sum,p)=>sum+(p.color[c]??0),0)/rim.length);
 const xx=rim.reduce((sum,p)=>sum+p.x*p.x,0),yy=rim.reduce((sum,p)=>sum+p.y*p.y,0);
 const dx=[0,1,2].map(c=>rim.reduce((sum,p)=>sum+p.x*(p.color[c]??0),0)/xx);
 const dy=[0,1,2].map(c=>rim.reduce((sum,p)=>sum+p.y*(p.color[c]??0),0)/yy);
 const residual=(/** @type {typeof pixels[number]} */p)=>p.color.map((v,c)=>v-(mean[c]??0)-(dx[c]??0)*p.x-(dy[c]??0)*p.y);
 if([...dx,...dy].some(s=>Math.abs(s)>1)||rim.some(p=>residual(p).some(v=>Math.abs(v)>6)))return null;
 const mask=Uint8Array.from(pixels,p=>Math.max(...residual(p).map(Math.abs))>=42?1:0),queue=new Int32Array(area);
 /** @type {{box:Box,count:number,cx:number,cy:number,color:number[]}[]} */const dots=[];
 for(let seed=0;seed<area;seed++){
  if(!mask[seed])continue;
  let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=seed;mask[seed]=0;
  /** @type {number[]} */const cells=[];
  while(head<tail){
   const n=queue[head++]??0,x=n%w,y=Math.floor(n/w);cells.push(n);
   minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const next of[x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1])if(next>=0&&mask[next]){mask[next]=0;queue[tail++]=next;}
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,fill=tail/(bw*bh);
  if(dots.length===3||tail<12||bw<3||bh<3||bw>16||bh>16||Math.max(bw,bh)/Math.min(bw,bh)>1.5
   ||fill<.55||fill>.95||minX<2||minY<2||maxX>w-3||maxY>h-3)return null;
  // A solid dot cannot contain a counter, split scanline or disconnected
  // corners. Three ring glyphs must not become an ellipsis.
  for(const axis of[0,1]){
   const rows=new Map();
   for(const n of cells){const x=n%w,y=Math.floor(n/w),key=axis?x:y,v=axis?y:x;
    const row=rows.get(key)??{min:v,max:v,count:0};row.min=Math.min(row.min,v);row.max=Math.max(row.max,v);row.count++;rows.set(key,row);}
   if([...rows.values()].some(row=>row.max-row.min+1!==row.count))return null;
  }
  const cx=cells.reduce((s,n)=>s+n%w+.5,0)/tail,cy=cells.reduce((s,n)=>s+Math.floor(n/w)+.5,0)/tail;
  const vx=cells.reduce((s,n)=>s+(n%w+.5-cx)**2,0)/tail,vy=cells.reduce((s,n)=>s+(Math.floor(n/w)+.5-cy)**2,0)/tail;
  const cov=cells.reduce((s,n)=>s+(n%w+.5-cx)*(Math.floor(n/w)+.5-cy),0)/tail;
  const spread=Math.hypot(vx-vy,2*cov),major=vx+vy+spread,minor=vx+vy-spread;
  if(minor<=0||major>2.5*minor)return null;
  const strength=(/** @type {number} */n)=>{const p=pixels[n];return p?Math.max(...residual(p).map(Math.abs)):0;};
  const core=cells.slice().sort((a,b)=>strength(b)-strength(a))
   .slice(0,Math.ceil(tail/3));
  const color=[0,1,2].map(c=>Math.round(core.reduce((s,n)=>s+(pixels[n]?.color[c]??0),0)/core.length));
  dots.push({box:{x:x0+minX,y:y0+minY,w:bw,h:bh},count:tail,cx:x0+cx,cy:y0+cy,color});
 }
 if(dots.length!==3)return null;
 dots.sort((a,b)=>a.cx-b.cx);const [a,c,d]=dots;if(!a||!c||!d)return null;
 const spacing=[c.cx-a.cx,d.cx-c.cx],diameters=dots.map(dot=>(dot.box.w+dot.box.h)/2);
 if(Math.max(...dots.map(dot=>dot.cy))-Math.min(...dots.map(dot=>dot.cy))>.75
  ||Math.max(...diameters)-Math.min(...diameters)>1.5||Math.abs((spacing[0]??0)-(spacing[1]??0))>1
  ||spacing.some(s=>s<Math.max(...diameters)*1.25||s>Math.min(...diameters)*6)
  ||dots.some(dot=>dot.color.some((v,i)=>Math.abs(v-(a.color[i]??0))>18)))return null;
 const left=Math.min(...dots.map(dot=>dot.box.x)),top=Math.min(...dots.map(dot=>dot.box.y));
 return {box:{x:left,y:top,w:Math.max(...dots.map(dot=>dot.box.x+dot.box.w))-left,h:Math.max(...dots.map(dot=>dot.box.y+dot.box.h))-top},dots};
}
/** Require two independent, valid localizations of the same exact glyph.
 * The search is restricted to their original source owner; no failed model
 * coordinate is repaired or converted into source authority here.
 * @param {Raster} image @param {Box} outer @param {Box} a @param {Box} b @param {{used:number}} budget */
function matchSourceDotRowGlyph(image,outer,a,b,budget){
 /** @param {Box} seed */
 const window=seed=>{
  const x=Math.max(outer.x,seed.x-3),y=Math.max(outer.y,seed.y-3),right=Math.min(outer.x+outer.w,seed.x+seed.w+3),bottom=Math.min(outer.y+outer.h,seed.y+seed.h+3);
  if(right<=x||bottom<=y)return null;
  const w=Math.ceil(right)-Math.floor(x),h=Math.ceil(bottom)-Math.floor(y);
  if(x<0||y<0||right>image.width||bottom>image.height||w>256||h>256||w*h>16384)return null;
  return {x,y,w:right-x,h:bottom-y};
 };
 const wa=window(a),wb=window(b);if(!wa||!wb)return null;
 const cost=(/** @type {Box} */box)=>(Math.ceil(box.x+box.w)-Math.floor(box.x))*(Math.ceil(box.y+box.h)-Math.floor(box.y))*3;
 // This optional alternative cannot consume a prefix and then starve the
 // legacy glyph check. Reserve both bounded observations before scanning.
 if(budget.used+cost(wa)+cost(wb)>4000000)return null;
 /** @param {Box} seed @param {Box} box */
 const measure=(seed,box)=>{
  const result=measureSourceDotRow({image,box,budget});
  // Fractional provider coordinates describe intersected source pixel cells.
  // Compare the complete measured glyph to those cells, not a fractional area
  // that can reject the same visible pixels. Neither view may omit a cell of
  // the glyph, even if its proposed rectangle has a larger total area.
  return result&&result.box.x>=Math.floor(seed.x)&&result.box.y>=Math.floor(seed.y)
   &&result.box.x+result.box.w<=Math.ceil(seed.x+seed.w)&&result.box.y+result.box.h<=Math.ceil(seed.y+seed.h)?result:null;
 };
 const first=measure(a,wa),second=measure(b,wb);
 if(!first||!second||!['x','y','w','h'].every(k=>first.box[/** @type {keyof Box} */(k)]===second.box[/** @type {keyof Box} */(k)]))return null;
 return first.box;
}
module.exports={measureSourceDotRow,matchSourceDotRowGlyph};
