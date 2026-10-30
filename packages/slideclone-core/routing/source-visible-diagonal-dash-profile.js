// @ts-check
'use strict';
const {sourceVisibleDashProfile}=require('./source-visible-dash-profile');
const {sourceObliqueDashProfile}=require('./source-oblique-dash-profile');
/** @typedef {{components:{cells:number[],bounded:boolean}[],width:number,rgba:Uint8Array,horizontal:boolean,
 * increasing:boolean,sign:number,background:number[],work:{checks:number}}} DashInput */
/** Integer shear preserves every original source cell and its paint. Only
 * complete, independently straight dash components can share a native line.
 * Opposite slopes cannot describe the nominated endpoints; parallel source
 * lines remain ambiguous rather than being selected by distance.
 * @param {DashInput} input */
function sourceVisibleDiagonalDashProfile(input){
 return shearedDashProfile(input)??sourceObliqueDashProfile(input);
}
/** @param {DashInput} input */
function shearedDashProfile({components,width,rgba,horizontal,increasing,sign,background,work}){
 if(components.length<2||components.length>128)return null;
 /** @type {{component:{cells:number[],bounded:boolean},keys:number[],centers:number[],slope:number,intercept:number,lo:number,hi:number}[]} */const strokes=[];
 for(const component of components){
  if(!component.bounded||component.cells.length>32768)continue;
  /** @type {Map<number,number[]>} */const columns=new Map();
  for(const n of component.cells){
   if(++work.checks>4000000)return null;
   const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   const values=columns.get(a)??[];values.push(c);columns.set(a,values);
  }
  const keys=[...columns.keys()].sort((a,b)=>a-b),lo=keys[0],hi=keys.at(-1);
  if(lo===undefined||hi===undefined||hi-lo<8||hi-lo>512||keys.length!==hi-lo+1)continue;
  const centers=keys.map(a=>{const v=columns.get(a)??[];return (Math.min(...v)+Math.max(...v))/2;});
  const middle=keys.slice(1,-1),mean=middle.reduce((s,n)=>s+n,0)/middle.length;
  const center=centers.slice(1,-1).reduce((s,n)=>s+n,0)/middle.length;
  let numerator=0,denominator=0;
  for(let i=1;i<keys.length-1;i++){
   if(++work.checks>4000000)return null;
   numerator+=((keys[i]??0)-mean)*((centers[i]??0)-center);denominator+=((keys[i]??0)-mean)**2;
  }
  const slope=numerator/denominator,intercept=center-slope*mean;
  if(!Number.isFinite(slope)||Math.abs(slope)<.05||Math.abs(slope)>1||slope*sign<=0
   ||centers.slice(1,-1).some((c,i)=>Math.abs(c-slope*(keys[i+1]??0)-intercept)>.75))continue;
  strokes.push({component,keys,centers,slope,intercept,lo,hi});
 }
 /** @type {Map<string,typeof strokes>} */const groups=new Map();
 for(const seed of strokes){
  const group=strokes.filter(stroke=>{
   work.checks+=stroke.keys.length;if(work.checks>4000000)return false;
   return stroke.centers.slice(1,-1).every((c,i)=>Math.abs(c-seed.slope*(stroke.keys[i+1]??0)-seed.intercept)<=.75);
  });
  if(work.checks>4000000)return null;
  if(group.length>=2&&group.length<=16)groups.set(group.map(s=>strokes.indexOf(s)).join(','),group);
 }
 const fitted=[];
 for(const group of groups.values()){
  const samples=group.flatMap(s=>s.keys.slice(1,-1).map((a,i)=>({a,c:s.centers[i+1]??0})));
  const mean=samples.reduce((s,p)=>s+p.a,0)/samples.length,center=samples.reduce((s,p)=>s+p.c,0)/samples.length;
  let numerator=0,denominator=0;
  for(const p of samples){if(++work.checks>4000000)return null;numerator+=(p.a-mean)*(p.c-center);denominator+=(p.a-mean)**2;}
  const slope=numerator/denominator,scale=Math.hypot(1,slope),lo=Math.min(...group.map(s=>s.lo)),hi=Math.max(...group.map(s=>s.hi));
  if(!Number.isFinite(slope)||Math.abs(slope)>1||scale*(hi-lo)>512)continue;
  const cells=group.flatMap(s=>s.component.cells),shift=(/** @type {number} */a)=>Math.round(slope*(a-lo));
  const across=cells.map(n=>{const a=horizontal?n%width:Math.floor(n/width);return (horizontal?Math.floor(n/width):n%width)-shift(a);});
  const bottom=Math.min(...across)-1,top=Math.max(...across)+1,w=hi-lo+1,h=top-bottom+1;
  if(h>40||w*h>262144)continue;
  const pixels=new Uint8Array(w*h*4);let index=0;
  const mapped=group.map(s=>({boundary:false,cells:s.component.cells.map(n=>{
   if(++work.checks>4000000)return -1;
   const a=horizontal?n%width:Math.floor(n/width),c=(across[index++]??0)-bottom,k=c*w+a-lo;
   pixels.set(rgba.subarray(n*4,n*4+4),k*4);return k;
  })}));
  if(work.checks>4000000)return null;
  const profile=sourceVisibleDashProfile({components:mapped,width:w,horizontal:true,rgba:pixels,direction:'undirected',increasing,work,background});
  if(!profile||profile.widthPx/scale<1)continue;
  const intercept=bottom+profile.axis-slope*lo;
  if(samples.some(p=>Math.abs(p.c-slope*p.a-intercept)/scale>.75))continue;
  // A rejected or branched component on this same complete stroke cannot
  // disappear into a manufactured long dash gap. Keep foreign ink outside
  // the stroke unowned; any intersecting original component rejects it.
  const selected=new Set(group.map(s=>s.component));let foreign=false;
  for(const component of components)if(!selected.has(component))for(const n of component.cells){
   if(++work.checks>4000000)return null;
   const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   if(a>=lo&&a<=hi&&Math.abs(c-slope*a-intercept)/scale<=profile.widthPx/scale/2+.75){foreign=true;break;}
  }
  if(foreign)continue;
  const pattern=/** @type {number[][]} */(JSON.parse(profile.strokeDashPattern)).map(pair=>pair.map(v=>v*scale*scale));
  fitted.push({...profile,lo,hi,slope,intercept,widthPx:profile.widthPx/scale,cells,strokeDashPattern:JSON.stringify(pattern)});
 }
 return fitted.length===1?fitted[0]:null;
}
module.exports={sourceVisibleDiagonalDashProfile,sourceVisibleShearedDashProfile:shearedDashProfile};
