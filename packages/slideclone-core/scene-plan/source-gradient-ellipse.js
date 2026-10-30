// @ts-check
'use strict';
const {parseBandBackground}=require('./source-scene-band-geometry');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {fitObservedSurfaceGradient}=require('./source-surface-gradient');
const {fitPreparedSceneFillGeometry}=require('./source-scene-fill-geometry');
/** @typedef {import('./source-scene-plan').Box} Box */
/** A fallback for an independently closed, HIGH-CONTRAST graded ellipse.
 * Color is appearance only. Connectivity comes from visible source contrast,
 * while every exterior-facing cell must follow the complete ellipse envelope.
 * This rejects clipped bodies, open rings and narrow attached route branches.
 * OCR masks only exclude appearance samples; they never connect source cells.
 * @param {unknown} input */
function measureSourceGradientEllipse(input){
 const {image,hint,textMasks,budget}=parseBandBackground(input);
 const pad=12,x=Math.max(0,Math.floor(hint.x-pad)),y=Math.max(0,Math.floor(hint.y-pad));
 const window={x,y,w:Math.min(image.width,Math.ceil(hint.x+hint.w+pad))-x,h:Math.min(image.height,Math.ceil(hint.y+hint.h+pad))-y};
 const area=window.w*window.h;
 if(area>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const raster=readSceneFillRaster(image,window,budget),w=window.w,h=window.h;
 /** @param {number} cell */const color=cell=>[0,1,2].map(c=>raster.rgba[cell*4+c]??0);
 /** @type {number[][]} */const corners=[];
 // Four independently visible corner patches, not the often unrelated outer
 // search frame. No corner may borrow pixels from another corner or outside.
 const used=new Set();
 for(const cx of [Math.floor(hint.x)-x,Math.ceil(hint.x+hint.w)-1-x])for(const cy of [Math.floor(hint.y)-y,Math.ceil(hint.y+hint.h)-1-y]){
  for(const dx of [0,1])for(const dy of [0,1]){
   const sx=cx+dx,sy=cy+dy,cell=sy*w+sx;
   if(sx<0||sy<0||sx>=w||sy>=h||used.has(cell)||(raster.rgba[cell*4+3]??0)<250)return null;
   used.add(cell);corners.push(color(cell));
  }
 }
 const background=[0,1,2].map(c=>corners.map(p=>p[c]??0).sort((a,b)=>a-b)[8]??0);
 if(corners.some(p=>p.some((v,c)=>Math.abs(v-(background[c]??0))>18)))return null;
 /** @param {number} cell */const ink=cell=>(raster.rgba[cell*4+3]??0)>=250&&color(cell).some((v,c)=>Math.abs(v-(background[c]??0))>=42);
 const seen=new Uint8Array(area),queue=new Int32Array(area);
 /** @type {{cells:number[],box:Box,score:number}[]} */const candidates=[];
 for(let seed=0;seed<area;seed++){
  if(seen[seed])continue;seen[seed]=1;if(!ink(seed))continue;
  let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0,clipped=false;queue[0]=seed;
  while(head<tail){
   const cell=queue[head++]??0,cx=cell%w,cy=Math.floor(cell/w);
   minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
   clipped ||=cx===0||cy===0||cx===w-1||cy===h-1;
   for(const n of [cx?cell-1:-1,cx<w-1?cell+1:-1,cy?cell-w:-1,cy<h-1?cell+w:-1]){
    if(n<0||seen[n])continue;seen[n]=1;if(ink(n))queue[tail++]=n;
   }
  }
  const box={x:x+minX,y:y+minY,w:maxX-minX+1,h:maxY-minY+1};
  if(clipped||box.w<hint.w*.7||box.w>hint.w*1.35||box.h<hint.h*.55||box.h>hint.h*1.6||tail/(box.w*box.h)<.58)continue;
  const intersection=Math.max(0,Math.min(box.x+box.w,hint.x+hint.w)-Math.max(box.x,hint.x))*Math.max(0,Math.min(box.y+box.h,hint.y+hint.h)-Math.max(box.y,hint.y));
  if(!intersection)continue;
  candidates.push({box,cells:Array.from(queue.subarray(0,tail)),score:intersection/(box.w*box.h+hint.w*hint.h-intersection)});
 }
 candidates.sort((a,b)=>b.score-a.score);const best=candidates[0];
 if(!best||candidates[1]&&candidates[1].score>=best.score*.9)return null;
 const owned=new Uint8Array(area);for(const cell of best.cells)owned[cell]=1;
 // Flood only the externally visible background. Enclosed label holes are
 // excluded from paint samples, without inferring or owning their pixels.
 const exterior=new Uint8Array(area);let head=0,tail=1;queue[0]=0;exterior[0]=1;
 while(head<tail){const cell=queue[head++]??0,cx=cell%w,cy=Math.floor(cell/w);
  for(const n of [cx?cell-1:-1,cx<w-1?cell+1:-1,cy?cell-w:-1,cy<h-1?cell+w:-1]){
   if(n<0||exterior[n]||owned[n])continue;exterior[n]=1;queue[tail++]=n;
  }
 }
 const rx=best.box.w/2,ry=best.box.h/2,mx=best.box.x+rx,my=best.box.y+ry;
 let boundary=0;
 for(const cell of best.cells){
  if(![cell-1,cell+1,cell-w,cell+w].some(n=>exterior[n]))continue;
  boundary++;
  const px=x+cell%w+.5,py=y+Math.floor(cell/w)+.5,u=(px-mx)/rx,v=(py-my)/ry,r=Math.hypot(u,v);
  if(!r||Math.abs(r-1)*Math.hypot((px-mx)/r,(py-my)/r)>1.5)return null;
  // Every exterior-facing transition must have two distinct, opaque source
  // witnesses matching the observed local background, within the same 18.
  let witnessed=false;
  for(const d of [-1,1,-w,w]){
   let consecutive=0;
   for(let step=1;step<=12;step++){
    const n=cell+step*d;
    if(n<0||n>=area||!exterior[n]||ink(n)||(raster.rgba[n*4+3]??0)<250
     ||(d===1||d===-1)&&Math.floor(n/w)!==Math.floor(cell/w))break;
    consecutive=color(n).every((v,c)=>Math.abs(v-(background[c]??0))<=18)?consecutive+1:0;
    if(consecutive===2){witnessed=true;break;}
   }
   if(witnessed)break;
  }
  if(!witnessed)return null;
 }
 if(boundary<12)return null;
 const points=best.cells.map(cell=>({x:x+cell%w,y:y+Math.floor(cell/w)}));
 const geometry=fitPreparedSceneFillGeometry({points,box:best.box,wide:false,bridged:false,compound:false});
 if(!geometry||geometry.parts)return null;
 const rgba=Buffer.alloc(raster.rgba.length);
 for(const cell of best.cells)for(let c=0;c<4;c++)rgba[cell*4+c]=raster.rgba[cell*4+c]??0;
 const gradient=fitObservedSurfaceGradient({...raster,rgba},{...best.box,x:best.box.x-x,y:best.box.y-y},textMasks.map(m=>({...m,x:m.x-x,y:m.y-y})));
 if(!gradient||gradient.stops[0]?.color===gradient.stops[1]?.color)return null;
 const fit={box:best.box,fill:gradient.stops[0]?.color??'#000000',support:best.cells.length/(best.box.w*best.box.h),...geometry,gradient};
 return {fit,points,image};
}
module.exports={measureSourceGradientEllipse};
