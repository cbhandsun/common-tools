// @ts-check
"use strict";
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {number[][]} colors */
function uniformColor(colors){
 if(colors.length<12)return null;
 /** @type {Map<string,number[][]>} */const bins=new Map();
 for(const color of colors){const key=color.map(v=>Math.floor(v/32)).join(":");
  const bin=bins.get(key)||[];bin.push(color);bins.set(key,bin);
 }
 const dominant=[...bins.values()].sort((a,b)=>b.length-a.length)[0];if(!dominant)return null;
 /** @param {number[][]} samples */
 const median=samples=>[0,1,2].map(c=>samples.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(samples.length/2)]??0);
 let rgb=median(dominant);
 /** @param {number[]} center */
 const support=center=>colors.filter(p=>p.every((v,c)=>Math.abs(v-(center[c]??0))<=18)).length/colors.length;
 if(support(rgb)<.82){rgb=median(colors);if(support(rgb)<.82)return null;}
 return rgb;
}
/** Source-only polarity evidence for already admitted horizontal OCR. Provider
 * colors have no authority. A surrounding uniform surface and an independently
 * uniform, contrasting light ink core must pass the 82% / 18 color gate.
 * Antialias transitions are not the core ink color. The core must also own
 * at least 58% of contrasting observations. This selects a font color only;
 * it cannot authorize a background fill, glyph mask or OCR classification.
 * Ambiguous or clipped context retains the default style.
 * The caller shares the existing 4M source-analysis allowance; this optional
 * measurement cannot consume pixels reserved by prior graphic admission.
 * @param {{width:number,height:number,rgba:Uint8Array}} image
 * @param {Box} box @param {{remaining:number}} budget */
function sampleLightOcrInkColor(image,box,budget){
 if(!Number.isSafeInteger(budget.remaining)||budget.remaining<0)throw new TypeError("OCR ink budget is invalid");
 const x0=Math.floor(box.x),y0=Math.floor(box.y),x1=Math.ceil(box.x+box.w),y1=Math.ceil(box.y+box.h);
 const margin=6;
 const area=(x1-x0)*(y1-y0);
 if(![box.x,box.y,box.w,box.h].every(Number.isFinite)||box.w<=0||box.h<=0
  ||x0<margin||y0<margin||x1+margin>=image.width||y1+margin>=image.height||area<12||area>262144)return null;
 const cost=128+576;if(budget.remaining<cost)return null;budget.remaining-=cost;
 /** @type {number[][]} */const surrounding=[];
 /** @type {number[][]} */const interior=[];
 let opaque=true;
 /** @param {number} x @param {number} y @param {number[][]} target */
 const read=(x,y,target)=>{const n=(y*image.width+x)*4;
  if((image.rgba[n+3]??0)<240){opaque=false;return;}
  target.push([image.rgba[n]??0,image.rgba[n+1]??0,image.rgba[n+2]??0]);
 };
 for(let i=0;i<32;i++){
  const x=Math.floor(x0+(x1-x0)*(i+.5)/32),y=Math.floor(y0+(y1-y0)*(i+.5)/32);
  read(x,y0-margin,surrounding);read(x,y1+margin-1,surrounding);read(x0-margin,y,surrounding);read(x1+margin-1,y,surrounding);
 }
 for(let row=0;row<24;row++)for(let col=0;col<24;col++)
  read(Math.floor(box.x+box.w*(col+.5)/24),Math.floor(box.y+box.h*(row+.5)/24),interior);
 if(!opaque)return null;
 const background=uniformColor(surrounding);if(!background)return null;
 const contrasts=interior.map(p=>Math.max(...p.map((v,c)=>Math.abs(v-(background[c]??0)))));
 const minContrast=Math.max(42,Math.max(0,...contrasts)*.82);
 const contrasted=interior.filter((_,i)=>(contrasts[i]??0)>=minContrast);
 /** @type {Map<string,number[][]>} */const inkBins=new Map();
 for(const p of contrasted){const key=p.map(v=>Math.floor(v/32)).join(":");
  const bin=inkBins.get(key)||[];bin.push(p);inkBins.set(key,bin);
 }
 const core=[...inkBins.values()].sort((a,b)=>b.length-a.length)[0];
 const ink=(core?uniformColor(core):null)||uniformColor(contrasted);
 if(!ink)return null;
 if(contrasted.filter(p=>p.every((v,c)=>Math.abs(v-(ink[c]??0))<=18)).length/contrasted.length<.58)return null;
 /** @param {number[]} rgb */const luminance=rgb=>(rgb[0]??0)*.2126+(rgb[1]??0)*.7152+(rgb[2]??0)*.0722;
 if(luminance(ink)-luminance(background)<42)return null;
 return `#${ink.map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase()}`;
}
module.exports={sampleLightOcrInkColor};
