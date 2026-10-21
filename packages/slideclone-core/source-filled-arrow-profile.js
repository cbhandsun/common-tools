// @ts-check
'use strict';
const {traceNativeMaskContours}=require('./native-mask-contours');
const {measureSourceOutlineColor}=require('./source-outline-color');
const {sourceFilledArrowSlices}=require('./source-filled-arrow-slices');
const {sourceFilledArrowBody}=require('./source-filled-arrow-body');
/** Observe a filled arrow through its original source cross-sections
 * and complete contour. Its measured width feeds a standard Office connector.
 * The separate thin-stroke observer and all of its limits remain unchanged.
 * @param {{cells:number[],geometryCells:number[],width:number,rgba:Uint8Array,horizontal:boolean,direction:string,increasing:boolean,work:{checks:number}}} input */
function sourceFilledArrowProfile(input){
 const measured=measureFilledArrowProfile(input);if(measured)return measured;
 const body=sourceFilledArrowBody({cells:input.geometryCells,width:input.width,horizontal:input.horizontal,work:input.work});
 return body?measureFilledArrowProfile(input,body):null;
}
/** @param {Parameters<typeof sourceFilledArrowProfile>[0]} input
 * @param {ReturnType<typeof sourceFilledArrowBody>} [normalBody] */
function measureFilledArrowProfile({cells,geometryCells,width,rgba,horizontal,direction,increasing,work},normalBody=null){
 if(geometryCells.length<16||cells.length>32768)return null;
 /** @type {Map<number,number[]>} */const columns=new Map();
 for(const n of geometryCells){const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
  const values=columns.get(a)??[];values.push(c);columns.set(a,values);}
 const keys=[...columns.keys()].sort((a,b)=>a-b),lo=keys[0],hi=keys.at(-1);
 if(lo===undefined||hi===undefined||hi-lo<8||hi-lo>512||keys.length!==hi-lo+1)return null;
 work.checks+=cells.length*32+keys.length*256;if(work.checks>4000000)return null;
 const widths=keys.map(a=>{const v=columns.get(a)??[];return Math.max(...v)-Math.min(...v)+1;});
 const centers=keys.map(a=>{const v=columns.get(a)??[];return (Math.max(...v)+Math.min(...v))/2;});
 /** @type {{first:number,last:number}[]} */const runs=[];
 for(let first=0;first<keys.length;first++){
  let last=first,min=widths[first]??0,max=min;
  while(last<keys.length){
   const w=widths[last]??0,nextMin=Math.min(min,w),nextMax=Math.max(max,w);
   // One raster cell at each observed boundary can change the span by two;
   // every actual cell and the resulting width variation stay in the path.
   if(nextMax-nextMin>2||(columns.get(keys[last]??-1)?.length??0)!==w)break;
   min=nextMin;max=nextMax;last++;
  }
  if(last-first>=Math.max(8,2*max))runs.push({first,last});
 }
 runs.sort((a,b)=>(b.last-b.first)-(a.last-a.first));const body=runs[0];if(!body&&!normalBody)return null;
 const first=body?.first??0,last=body?.last??keys.length;
 const bodyKeys=keys.slice(first,last),mean=bodyKeys.reduce((s,a)=>s+a,0)/bodyKeys.length;
 const middle=centers.slice(first,last),meanC=middle.reduce((s,c)=>s+c,0)/middle.length;let numerator=0,denominator=0;
 for(let i=first;i<last;i++){numerator+=((keys[i]??0)-mean)*((centers[i]??0)-meanC);denominator+=((keys[i]??0)-mean)**2;}
 const slope=normalBody?.slope??numerator/denominator,scale=Math.hypot(1,slope),intercept=normalBody?.intercept??meanC-slope*mean;
 // Axis alignment is not a reason to discard a filled arrow. Its complete
 // body, terminal expansion, contour and attachment proofs below apply in
 // either column system, including a zero-slope horizontal or vertical axis.
 if(!Number.isFinite(slope)||(hi-lo)*scale>512
  ||!normalBody&&middle.some((c,i)=>Math.abs(c-slope*(bodyKeys[i]??0)-intercept)>2))return null;
 const shaft=normalBody?.shaft??[...widths.slice(first,last)].sort((a,b)=>a-b)[Math.floor(middle.length/2)]??0;
 // Filled-path geometry has no stroke-width fiction. Keep a genuine body:
 // at least twice as long as wide, with terminal heads wider than that body.
 const bodyLength=normalBody?normalBody.lastBody-normalBody.firstBody+1:bodyKeys.length*scale;
 if(shaft<1||shaft/scale>25||bodyLength<2*shaft/scale)return null;
 const slices=normalBody?.slices??sourceFilledArrowSlices({cells:geometryCells,width,horizontal,slope,intercept,work});if(!slices)return null;
 const ts=slices.map(s=>s.t),t0=ts[0],t1=ts.at(-1);
 if(t0===undefined||t1===undefined||t1-t0>512||ts.length!==t1-t0+1)return null;
 const normalWidths=slices.map(s=>s.hi-s.lo),normalCenters=slices.map(s=>(s.hi+s.lo)/2);
 const firstBody=normalBody?.firstBody??Math.ceil((bodyKeys[0]??0)*scale),lastBody=normalBody?.lastBody??Math.floor((bodyKeys.at(-1)??0)*scale);
 const bodyWidths=normalWidths.filter((_,i)=>(ts[i]??0)>=firstBody&&(ts[i]??0)<=lastBody).sort((a,b)=>a-b);
 const bodyWidth=bodyWidths[Math.floor(bodyWidths.length/2)]??0;
 if(!bodyWidths.length||bodyWidth<1||slices.some(s=>s.t>=firstBody&&s.t<=lastBody&&s.gaps>1e-8))return null;
 const rightArrow=increasing?direction==='forward'||direction==='both':direction==='backward'||direction==='both';
 const leftArrow=increasing?direction==='backward'||direction==='both':direction==='forward'||direction==='both';
 /** @param {boolean} right @param {boolean} arrow */
 const terminal=(right,arrow)=>{
  const ws=right?[...normalWidths].reverse():normalWidths,cs=right?[...normalCenters].reverse():normalCenters;
  const bodyAt=right?t1-lastBody:firstBody-t0;
  if(!arrow){
   // A native filled connector can have a flared, non-pointed base. Retain
   // its complete paint; require a single taper into the stable shaft and
   // keep it strictly below the independently witnessed head expansion.
   // At a flat raster endpoint the outermost oblique unit slab may intersect
   // only a corner of an ORIGINAL cell. Its short normal span is censored,
   // not a pointed tail. Classify complete slabs only; keep ALL original
   // source cells, including these partial boundary slabs, in the path.
   const complete=right?[...slices].reverse():slices;
   const base=ws.slice(0,bodyAt).map((w,i)=>({w,c:cs[i]??0})).filter((_,i)=>complete[i]?.complete);
   if((base[0]?.w??bodyWidth)<bodyWidth-2){
    // A rounded source cap is not a flat base or an arrowhead. Its entire
    // taper must fit inside half the measured body width, remain centered,
    // have no expansion beyond that body and widen monotonically toward it.
    // Keep every original cap cell in the emitted source contour.
    return bodyAt<=Math.ceil(bodyWidth/2)&&base.length>0&&base.every(({w,c},i)=>
     w>0&&w<=bodyWidth+2&&Math.abs(c)<=w/2+2&&(i===0||w+1e-8>=(base[i-1]?.w??0)));
   }
   return base.every(({w,c},i)=>w<=2*bodyWidth&&Math.abs(c)<=w/2+2
    &&(i===0||w<=(base[i-1]?.w??0)+Math.SQRT2+1e-8));
  }
  if(bodyAt<3)return false;
  const witness=ws.slice(0,Math.min(bodyAt,12)),peak=Math.max(...witness);
  if(witness.length<3||(ws[0]??0)>bodyWidth+2||peak<(ws[0]??0)+2)return false;
  const section=ws.slice(0,bodyAt),max=Math.max(...section),at=section.indexOf(max);
  if(max<bodyWidth*2+2||max>(t1-t0)/2)return false;
  for(let i=1;i<=at;i++)if((section[i]??0)+Math.SQRT2+1e-8<(section[i-1]??0))return false;
  for(let i=at+1;i<section.length;i++)if((section[i]??0)>(section[i-1]??0)+Math.SQRT2+1e-8)return false;
  // A filled head may be asymmetric. Its actual polygon is emitted intact;
  // require the independently measured shaft axis to pass through EVERY
  // head slice, rather than fitting a symmetric line head over that paint.
  return cs.slice(0,bodyAt).every((c,i)=>Math.abs(c)<=(ws[i]??0)/2+2);
 };
 if(!terminal(false,leftArrow)||!terminal(true,rightArrow))return null;
 let minX=Infinity,minY=Infinity,maxX=0,maxY=0;
 const points=cells.map(n=>{const x=n%width,y=Math.floor(n/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);return {x,y};});
 const box={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1},state={checks:work.checks,exhausted:false};
 const segments=traceNativeMaskContours(points,box,{tolerancePx:.75,workState:state,fastFail:true});work.checks=state.checks;
 // Preserve all real holes and diagonal cell contacts in this connected
 // component. Never discard an inner loop or invent a filled silhouette.
 if(!segments||state.exhausted||work.checks>4000000||segments.filter(s=>s.type==='moveTo').length>32)return null;
 const colors=new Map(cells.map(n=>[n,[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0]]));
 const color=measureSourceOutlineColor({points,colors,width});
 return {lo,hi,slope,intercept,widthPx:shaft/scale,color,support:1,sourcePath:{box,segments}};
}
module.exports={sourceFilledArrowProfile};
