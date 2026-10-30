// @ts-check
"use strict";
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** A linear fit to two flat tones extrapolates colors that were never graded
 * across the surface. Require the dominant channel's medians to progress in
 * three spatial bands. Reuse admitted samples; no extra pixels or authority.
 * @param {{x:number,y:number,c:number[]}[]} samples @param {'x'|'y'} axis
 * @param {number[][]} coeff */
function hasGradedSurfaceSamples(samples,axis,coeff){
 const channel=coeff.reduce((best,c,index)=>Math.abs(c[1]??0)>Math.abs(coeff[best]?.[1]??0)?index:best,0);
 const slope=coeff[channel]?.[1]??0;if(!slope)return false;
 const positions=samples.map(s=>s[axis]),low=Math.min(...positions),span=Math.max(...positions)-low;if(span<=0)return false;
 /** @type {number[][]} */const bands=[[],[],[]];
 for(const sample of samples)bands[Math.min(2,Math.floor((sample[axis]-low)/span*3))]?.push(sample.c[channel]??0);
 if(bands.some(b=>!b.length))return false;
 const medians=bands.map(b=>b.sort((a,b)=>a-b)[Math.floor(b.length/2)]??0);
 return ((medians[1]??0)-(medians[0]??0))*slope>0&&((medians[2]??0)-(medians[1]??0))*slope>0;
}
/** Fit appearance after independent body measurement. Reuse the original
 * 24x24 sample, 12 samples, 18-channel and 82% support gates in the caller's
 * charged immutable window. @param {{width:number,height:number,rgba:Uint8Array}} raster
 * @param {Box} box @param {Box[]} masks */
function fitObservedSurfaceGradient(raster,box,masks){
 /** @type {{x:number,y:number,c:number[]}[]} */const samples=[];
 for(let row=0;row<24;row++)for(let col=0;col<24;col++){
  const x=Math.floor(box.x+box.w*(.18+.64*(col+.5)/24)),y=Math.floor(box.y+box.h*(.18+.64*(row+.5)/24));
  if(x<0||y<0||x>=raster.width||y>=raster.height||masks.some(m=>x>=m.x&&x<m.x+m.w&&y>=m.y&&y<m.y+m.h))continue;
  const at=(y*raster.width+x)*4;if((raster.rgba[at+3]??0)<250)continue;
  samples.push({x:(x-box.x)/box.w-.5,y:(y-box.y)/box.h-.5,c:[0,1,2].map(c=>raster.rgba[at+c]??0)});
 }
 if(samples.length<12)return null;
 const median=[0,1,2].map(c=>samples.map(s=>s.c[c]??0).sort((a,b)=>a-b)[Math.floor(samples.length/2)]??0);
 /** @type {{axis:'x'|'y',error:number,support:number,coeff:number[][]}[]} */const fits=[];
 for(const axis of /** @type {const} */(['x','y'])){
  let used=samples.filter(s=>s.c.every((v,c)=>Math.abs(v-(median[c]??0))<=18));
  /** @type {number[][]|null} */let coeff=null;
  for(let pass=0;pass<3;pass++){
   const n=used.length,sumV=used.reduce((s,p)=>s+p[axis],0),sumV2=used.reduce((s,p)=>s+p[axis]**2,0),d=n*sumV2-sumV**2;
   if(n<12||d<1e-6){coeff=null;break;}
   coeff=[0,1,2].map(c=>{const sumC=used.reduce((s,p)=>s+(p.c[c]??0),0),sumVC=used.reduce((s,p)=>s+p[axis]*(p.c[c]??0),0);
    const slope=(n*sumVC-sumV*sumC)/d;return [(sumC-slope*sumV)/n,slope];});
   const model=coeff;used=samples.filter(s=>s.c.every((v,c)=>Math.abs(v-(model[c]?.[0]??0)-(model[c]?.[1]??0)*s[axis])<=18));
  }
  if(!coeff||used.length/samples.length<.82||!hasGradedSurfaceSamples(used,axis,coeff))continue;
  const model=coeff,error=used.reduce((sum,s)=>sum+s.c.reduce((v,c,k)=>v+Math.abs(c-(model[k]?.[0]??0)-(model[k]?.[1]??0)*s[axis]),0),0)/(used.length*3);
  fits.push({axis,error,support:used.length/samples.length,coeff});
 }
 fits.sort((a,b)=>a.error-b.error);const best=fits[0];if(!best)return null;
 /** @param {number} position */const color=position=>'#'+best.coeff.map(c=>Math.max(0,Math.min(255,Math.round((c[0]??0)+(c[1]??0)*position))).toString(16).padStart(2,'0')).join('');
 return {type:'linear',angleDeg:best.axis==='y'?90:0,stops:[{position:0,color:color(-.5)},{position:1,color:color(.5)}]};
}
module.exports={fitObservedSurfaceGradient};
