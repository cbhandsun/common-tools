// @ts-check
'use strict';
const {sourceFilledArrowSlices}=require('./source-filled-arrow-slices');
const {traceNativeMaskContours}=require('../scene-plan/native-mask-contours');
/** A filled terminal on a curved shaft has no obligation to contain a long
 * straight body. Certify its whole taper, neck and contour independently;
 * the caller must still prove the entire remaining thin shaft and composition
 * joint. This is separate from the unchanged 12-cell thin-head observer.
 * @param {{cells:number[],width:number,tip:{x:number,y:number},cut:{x:number,y:number},
 * horizontal:boolean,normalCut?:boolean,shaft:number,routeLength:number,work:{checks:number}}} input */
function sourceFilledHeadProfile({cells,width,tip,cut,horizontal,normalCut=true,shaft,routeLength,work}){
 if(cells.length<16||cells.length>32768||shaft<1||shaft>5||routeLength>512)return null;
 const da=horizontal?tip.x-cut.x:tip.y-cut.y,dc=horizontal?tip.y-cut.y:tip.x-cut.x;
 if(Math.abs(da)<8||Math.abs(dc)>Math.abs(da))return null;
 let slope=dc/da,intercept=(horizontal?tip.y:tip.x)-slope*(horizontal?tip.x:tip.y);
 let slices=sourceFilledArrowSlices({cells,width,horizontal,slope,intercept,work});if(!slices||slices.length<8)return null;
 // A curved neck's tangent is only an axis hypothesis. Refine it ONCE from
 // the actual widest source head section and actual tip, then re-observe all
 // original cells with identical slab/taper/contour gates and work counter.
 const initial=slices.map(s=>s.hi-s.lo),base=slices[initial.indexOf(Math.max(...initial))];
 if(!base)return null;const normal=(base.lo+base.hi)/2,scale=Math.hypot(1,slope);
 if(Math.abs(normal)>.5){
  const a=(base.t-slope*normal)/scale,c=(slope*base.t+normal)/scale+intercept;
  const tipA=horizontal?tip.x:tip.y,tipC=horizontal?tip.y:tip.x;
  if(Math.abs(tipA-a)<8)return null;const refined=(tipC-c)/(tipA-a);
  if(!Number.isFinite(refined)||Math.abs(refined)>1)return null;
  slope=refined;intercept=tipC-slope*tipA;
  slices=sourceFilledArrowSlices({cells,width,horizontal,slope,intercept,work});if(!slices||slices.length<8)return null;
 }
 const ordered=da>0?[...slices].reverse():slices;
 if(ordered.some((s,i)=>i>0&&Math.abs(s.t-(ordered[i-1]?.t??0))!==1))return null;
 const widths=ordered.map(s=>s.hi-s.lo),peak=Math.max(...widths),at=widths.indexOf(peak);
 // Keep the original broad-arrow bound against the COMPLETE route length,
 // rather than incorrectly demanding a long straight shaft inside this head.
 if(at<3||at>=ordered.length-3||peak<shaft*2+2||peak>routeLength/2||(widths[0]??0)>shaft+2)return null;
 // Reuse the EXISTING filled-arrow taper certificate (including asymmetric
 // source heads); the thin observer's linear 12-cell head model is separate.
 for(let i=1;i<=at;i++){
  const w=widths[i]??0,prior=widths[i-1]??0;
  if(w+Math.SQRT2<prior)return null;
 }
 for(let i=at+1;i<widths.length;i++)if((widths[i]??0)>(widths[i-1]??0)+Math.SQRT2)return null;
 // The oblique cut can intersect the last unit slab only partially. That
 // censored cap is still retained in the complete contour below; only three
 // COMPLETE source slabs can witness the stable neck's width and continuity.
 // The source extrema alone do not prove that an oblique cap was fully
 // observed: its last slab can contain disconnected pieces of cut cells.
 // Require the whole slab rectangle, plus the original unit-cell support,
 // to lie on the observed side of the actual partition plane. Censored
 // slabs remain in every taper and contour check above and below.
 const nx=normalCut?tip.x-cut.x:horizontal?Math.sign(tip.x-cut.x):0;
 const ny=normalCut?tip.y-cut.y:horizontal?0:Math.sign(tip.y-cut.y);
 const cellSupport=(Math.abs(nx)+Math.abs(ny))/2;
 const cutScale=Math.hypot(1,slope);
 const neck=ordered.filter(s=>{
  if(!s.complete)return false;
  for(const t of [s.t-.5,s.t+.5])for(const v of [s.lo,s.hi]){
   if(++work.checks>4000000)return false;
   const a=(t-slope*v)/cutScale,c=(slope*t+v)/cutScale+intercept;
   const x=horizontal?a:c,y=horizontal?c:a;
   if((x-cut.x)*nx+(y-cut.y)*ny<cellSupport)return false;
  }
  return true;
 }).slice(-3);
 if(work.checks>4000000)return null;
 if(neck.length!==3)return null;
 const neckWidths=neck.map(s=>s.hi-s.lo),minNeck=Math.min(...neckWidths),maxNeck=Math.max(...neckWidths);
 // Slabs measure the full ORIGINAL unit-cell extent, including source
 // antialias fringes; coverage width measures opaque-equivalent paint. Reuse
 // the filled observer's 1..25px stable neck and 2x+2 head expansion here.
 // The separate remaining-shaft certificate MUST still prove 1..5px actual
 // coverage and every source cell at the composition cut. No width is
 // inferred from this head certificate or substituted into that thin gate.
 if(neck.some(s=>s.gaps>1e-8)||minNeck<1||maxNeck>25||maxNeck-minNeck>2||peak<maxNeck*2+2)return null;
 // The observed tangent must pass through all the actual head slices. A
 // neighboring triangular decoration cannot borrow this shaft's endpoint.
 if(ordered.some(s=>s.lo>2||s.hi< -2))return null;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const points=cells.map(n=>{const x=n%width,y=Math.floor(n/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);return {x,y};});
 const box={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1},state={checks:work.checks,exhausted:false};
 const contour=traceNativeMaskContours(points,box,{tolerancePx:.75,workState:state,fastFail:true});work.checks=state.checks;
 if(!contour||state.exhausted||work.checks>4000000||contour.filter(s=>s.type==='moveTo').length!==1)return null;
 // Contact consolidation needs the taper itself, never the long neck that
 // this partition may also retain. The nominated tip must be an observed
 // extreme of the complete head; a shaft contact cannot stand in for a tip.
 const tipA=horizontal?tip.x:tip.y,tipC=horizontal?tip.y:tip.x;
 const tipT=(tipA+slope*(tipC-intercept))/cutScale,firstT=ordered[0]?.t??NaN,peakT=ordered[at]?.t??NaN;
 const contactCells=new Set();
 if(Math.abs(firstT-tipT)<=1){
  for(const n of cells){
   if(++work.checks>4000000)return null;
   const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   const t=(a+slope*(c-intercept))/cutScale;
   if(Math.sign(da)*(t-peakT)>=-.5)contactCells.add(n);
  }
 }
 return {widthPx:shaft,contactCells};
}
module.exports={sourceFilledHeadProfile};
