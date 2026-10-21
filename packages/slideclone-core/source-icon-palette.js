// @ts-check
"use strict";
const { sourceRaster } = require("./residual-text-mask");
const { traceNativeMaskContours } = require("./native-mask-contours");
/** Source-isolated icons may retain small color distinctions as native row
 * paths. This is internal paint for an already isolated complete icon, never
 * a physical-region or source-ownership proof. Reject the whole representation
 * above the original 32 parts / 120 commands limits; never truncate paint.
 * @param {unknown} raster @param {{x:number,y:number,w:number,h:number}} box
 * @param {string} idPrefix */
function sourceIconPaletteShapes(raster, box, idPrefix) {
  const image = sourceRaster(raster), area = image.width * image.height;
  if (area > 262144 || !box || ![box.x,box.y,box.w,box.h].every(Number.isFinite)
    || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || !/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(idPrefix)) throw new TypeError("source icon palette input is invalid");
  /** @type {Map<number,{count:number,sum:number[]}>} */ const bins = new Map();
  for (let i=0;i<area;i++) {
    if ((image.rgba[i*4+3]??0)<32) continue;
    const rgb=[0,1,2].map(c=>image.rgba[i*4+c]??0),key=((rgb[0]??0)>>4)*256+((rgb[1]??0)>>4)*16+((rgb[2]??0)>>4);
    const bin=bins.get(key)??{count:0,sum:[0,0,0]};bin.count++;
    for(let c=0;c<3;c++)bin.sum[c]=(bin.sum[c]??0)+(rgb[c]??0);bins.set(key,bin);
  }
  if (!bins.size) return [];
  const samples=[...bins.values()].map(b=>({count:b.count,rgb:b.sum.map(v=>v/b.count)})).sort((a,b)=>b.count-a.count);
  /** @type {number[][]} */ const palette=[];
  /** @param {readonly number[]} a @param {readonly number[]} b */
  const distance=(a,b)=>a.reduce((s,v,c)=>s+(v-(b[c]??0))**2,0);
  while(palette.length<Math.min(8,samples.length)) {
    const next=samples.reduce((a,b)=>{
      const score=(/** @type {typeof b} */s)=>palette.length?Math.min(...palette.map(p=>distance(s.rgb,p)))*s.count:s.count;
      return score(b)>score(a)?b:a;
    });
    if(palette.length&&palette.some(p=>distance(p,next.rgb)<1))break;
    palette.push(next.rgb.slice());
  }
  /** @param {readonly number[]} rgb */
  const nearest=rgb=>{let best=0,delta=Infinity;for(let p=0;p<palette.length;p++){const d=distance(rgb,palette[p]??[]);if(d<delta){delta=d;best=p;}}return best;};
  for(let iteration=0;iteration<5;iteration++) {
    const sums=palette.map(()=>({count:0,rgb:[0,0,0]}));
    for(const sample of samples){const sum=sums[nearest(sample.rgb)];if(!sum)continue;sum.count+=sample.count;
      for(let c=0;c<3;c++)sum.rgb[c]=(sum.rgb[c]??0)+(sample.rgb[c]??0)*sample.count;}
    for(let p=0;p<palette.length;p++){const sum=sums[p];if(sum?.count)palette[p]=sum.rgb.map(v=>v/sum.count);}
  }
  const labels=new Int8Array(area).fill(-1);
  for(let i=0;i<area;i++)if((image.rgba[i*4+3]??0)>=32)labels[i]=nearest([0,1,2].map(c=>image.rgba[i*4+c]??0));
  /** @type {{x:number,y:number,w:number,h:number}[][]} */ const runs=palette.map(/** @returns {{x:number,y:number,w:number,h:number}[]} */()=>[]);
  /** @type {Map<string,{x:number,y:number,w:number,h:number}>} */ let active=new Map();
  let count=0;
  for(let y=0;y<image.height;y++){
   /** @type {typeof active} */const next=new Map();
   for(let x=0;x<image.width;){
    const label=labels[y*image.width+x]??-1,start=x++;if(label<0)continue;
    while(x<image.width&&labels[y*image.width+x]===label)x++;
    const key=`${label}:${start}:${x-start}`,previous=active.get(key);
    if(previous){previous.h++;next.set(key,previous);}
    else {if(++count>32*24)return [];const rect={x:start,y,w:x-start,h:1};runs[label]?.push(rect);next.set(key,rect);}
   }
   active=next;
  }
  /** @type {{id:string,type:string,box:typeof box,style:Record<string,unknown>,source:Record<string,unknown>}[]} */ const shapes=[];
  for(let p=0;p<runs.length;p++){
    const rows=runs[p]??[],fill="#"+(palette[p]??[]).map(c=>Math.round(c).toString(16).padStart(2,"0")).join("");
    for(let start=0;start<rows.length;){
      let chunk=rows.slice(start,start+24);
      let union=null;
      for(const size of [24,48,72,96]){
        const candidate=rows.slice(start,start+size);
        if(candidate.length<=chunk.length&&size!==24)break;
        const cells=candidate.flatMap(r=>Array.from({length:r.w*r.h},(_,i)=>({x:r.x+i%r.w,y:r.y+Math.floor(i/r.w)})));
        const x=Math.min(...candidate.map(r=>r.x)),y=Math.min(...candidate.map(r=>r.y));
        const w=Math.max(...candidate.map(r=>r.x+r.w))-x,h=Math.max(...candidate.map(r=>r.y+r.h))-y;
        const contour=traceNativeMaskContours(cells,{x,y,w,h},{tolerancePx:0,fastFail:true});
        if(!contour)break;
        chunk=candidate;union=contour;
      }
      start+=chunk.length;
      const left=Math.min(...chunk.map(r=>r.x)),top=Math.min(...chunk.map(r=>r.y));
      const width=Math.max(...chunk.map(r=>r.x+r.w))-left,height=Math.max(...chunk.map(r=>r.y+r.h))-top;
      const segments=union??chunk.flatMap(r=>[
        {type:"moveTo",points:[{x:(r.x-left)/width,y:(r.y-top)/height}]},
        {type:"lnTo",points:[{x:(r.x+r.w-left)/width,y:(r.y-top)/height}]},
        {type:"lnTo",points:[{x:(r.x+r.w-left)/width,y:(r.y+r.h-top)/height}]},
        {type:"lnTo",points:[{x:(r.x-left)/width,y:(r.y+r.h-top)/height}]},
        {type:"close",points:[]}]);
      shapes.push({id:`${idPrefix}-palette-${shapes.length+1}`,type:"freeform",box:{x:box.x+left*box.w/image.width,y:box.y+top*box.h/image.height,w:width*box.w/image.width,h:height*box.h/image.height},
        style:{fill,stroke:"none",strokeWidthPt:0,freeformSegments:segments},
        source:{editable:true,nativeRebuild:true,detector:"source-scene-palette-native",nativeComponentRole:"pictorial",semanticPictorialNative:true,pictorialVectorized:true,sourceIconBox:{...box}}});
      if(shapes.length>32)return [];
    }
  }
  return shapes;
}
module.exports={sourceIconPaletteShapes};
