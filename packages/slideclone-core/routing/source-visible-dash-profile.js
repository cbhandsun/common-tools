// @ts-check
'use strict';
const {sourceArrowCoveragePaint}=require('./source-arrow-coverage-paint');
const {sourceVisibleGapProfile,sourceVisibleGapGeometry}=require('./source-visible-gap-profile');
const {sourceDashCoveragePaint}=require('./source-dash-coverage-paint');
const {sourceDetachedDashHead}=require('./source-detached-dash-head');
const {sourceDashSpatialPaint}=require('./source-dash-spatial-paint');
/** A dash is a complete undirected stroke primitive, not a thin arrow shaft.
 * Use the filled-stroke observer's existing 1..25px width range and .75px
 * source geometry tolerance; the continuous thin-arrow gate stays unchanged.
 * @param {number[]} cells @param {number} width @param {boolean} horizontal
 * @param {Uint8Array} rgba @param {{checks:number}} work @param {number[]} background */
function measureDash(cells,width,horizontal,rgba,work,background){
 /** @type {Map<number,number[]>} */const columns=new Map();
 for(const n of cells){
  if(++work.checks>4000000)return null;
  const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
  const list=columns.get(a)??[];list.push(c);columns.set(a,list);
 }
 const keys=[...columns.keys()].sort((a,b)=>a-b),lo=keys[0],hi=keys.at(-1);
 if(lo===undefined||hi===undefined||hi-lo<1||hi-lo>512||keys.length!==hi-lo+1)return null;
 const sections=[],pixelColumns=[];
 /** @type {number[][]} */const colors=[];
 for(const a of keys){
  const values=columns.get(a);if(!values)return null;
  work.checks+=values.length*8;if(work.checks>4000000)return null;values.sort((a,b)=>a-b);
  const first=values[0],last=values.at(-1);if(first===undefined||last===undefined||values.length!==last-first+1)return null;
  const c=values[Math.floor(values.length/2)];if(c===undefined)return null;
  const i=(horizontal?c*width+a:a*width+c)*4;
  sections.push({span:last-first+1,center:(first+last)/2});colors.push([rgba[i]??0,rgba[i+1]??0,rgba[i+2]??0]);
  pixelColumns.push(values.map(c=>{const at=(horizontal?c*width+a:a*width+c)*4;return [rgba[at]??0,rgba[at+1]??0,rgba[at+2]??0];}));
 }
 const middle=sections.length>2?sections.slice(1,-1):sections,median=(/** @type {number[]} */v)=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)]??NaN;
 const widthPx=median(middle.map(s=>s.span)),axis=median(sections.map(s=>s.center));
 // A partial outermost raster column can contain only one corner of the
 // original flat cap. Audit its whole footprint against the native stroke;
 // its censored center is not an independently observed shaft axis.
 if(widthPx<1||widthPx>25||sections.some(s=>Math.abs(s.center-axis)+(s.span-1)/2>widthPx/2+1.25)
  ||middle.some(s=>Math.abs(s.center-axis)>1.25||Math.abs(s.span-widthPx)>1.5))return null;
 let rgb=[0,1,2].map(c=>median(colors.map(p=>p[c]??0)));
 const uniformCount=colors.filter(p=>p.every((v,c)=>Math.abs(v-(rgb[c]??0))<=18)).length;
 if(keys.length>=10&&uniformCount/colors.length<.7){
  if(!background)return null;
  const paint=sourceArrowCoveragePaint({columns:pixelColumns,background,firstBody:Math.floor(keys.length*.3),lastBody:Math.ceil(keys.length*.7)-1,work,colorMode:'contrast'});
  if(paint)rgb=paint;
  else if(uniformCount/colors.length<.45)return null;
 }
 if(background&&Math.max(...rgb.map((v,c)=>Math.abs(v-(background[c]??0))))<42)return null;
 return {lo,hi,axis,widthPx,rgb,support:1,minAcross:Math.min(...sections.map(s=>s.center-(s.span-1)/2)),
  maxAcross:Math.max(...sections.map(s=>s.center+(s.span-1)/2)),maxCenterlineErrorPx:Math.max(...middle.map(s=>Math.abs(s.center-axis)))};
}
/** Observe each complete dash separately. Blank intervals are recorded as
 * native spacing, never counted as supported shaft or granted paint rights.
 * This internal observer receives the enclosing gap boundary's original mask.
 * @param {{components:{cells:number[],boundary:boolean}[],width:number,horizontal:boolean,rgba:Uint8Array,
 * direction:string,increasing:boolean,work:{checks:number},background:number[]}} input */
function sourceVisibleDashProfile({components,width,horizontal,rgba,direction,increasing,work,background}){
 if(!['undirected','forward','backward'].includes(direction)||components.length<2||components.length>24)return null;
 /** @type {typeof components[number]|null} */let headComponent=null;
 let dashComponents=components;
 if(direction!=='undirected'){
  const isEnd=(direction==='forward'&&increasing)||(direction==='backward'&&!increasing);
  const getAlong=(/** @type {typeof components[number]} */c)=>c.cells.reduce((acc,n)=>{
   const val=horizontal?n%width:Math.floor(n/width);
   return isEnd?Math.max(acc,val):Math.min(acc,val);
  },isEnd?-Infinity:Infinity);
  const sorted=[...components].sort((a,b)=>isEnd?getAlong(b)-getAlong(a):getAlong(a)-getAlong(b));
  headComponent=sorted[0]??null;
  // Every original component must be independently represented. Filtering
  // short fragments here would later give their unmeasured pixels the same
  // private paint receipt as the complete dashes.
  dashComponents=components.filter(c=>c!==headComponent);
 }
 /** @type {NonNullable<ReturnType<typeof measureDash>>[]} */const runs=[];
 // A single break in a solid arrow is not independent evidence of a dash
 // pattern. Require at least two complete shaft primitives, plus its head.
 if(dashComponents.length<2)return null;
 for(const component of dashComponents){
  if(component.boundary)return null;
  const fit=measureDash(component.cells,width,horizontal,rgba,work,background);
  if(!fit)return null;
  runs.push(fit);
 }
 runs.sort((a,b)=>a.lo-b.lo);const first=runs[0],last=runs.at(-1);if(!first||!last||last.hi-first.lo>512)return null;
 const median=(/** @type {number[]} */v)=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)]??NaN;
 const strokeRgb=[0,1,2].map(c=>median(runs.map(r=>r.rgb[c]??0)));
 const strokeWidth=median(runs.map(r=>r.widthPx));
 const strokeAxis=median(runs.map(r=>r.axis));
 let uniform=true;
 for(const run of runs){
  if(++work.checks>4000000)return null;
  // One native stroke has one axis, width and ink. Do not average unlike
  // components into a dashed relation or discard an intervening fragment.
  if(Math.max(Math.abs(run.minAcross-strokeAxis),Math.abs(run.maxAcross-strokeAxis))>strokeWidth/2+1.5
   ||Math.abs(run.widthPx-strokeWidth)>1.5)return null;
  if(run.rgb.some((v,c)=>Math.abs(v-(strokeRgb[c]??0))>38))uniform=false;
 }
 let lo=first.lo,hi=last.hi;
 /** @type {{lo:number,hi:number}[]} */const physicalRuns=[...runs];
 /** @type {NonNullable<ReturnType<typeof sourceVisibleGapGeometry>>|undefined} */let headGeometry;
 /** @type {NonNullable<ReturnType<typeof sourceDetachedDashHead>>|undefined} */let detachedHead;
 if(headComponent){
  if(headComponent.boundary)return null;
  // A bounding box cannot prove an arrow: reuse the complete continuous
  // observer's original terminal, body, branch, direction and paint gates.
  const head=sourceVisibleGapProfile({cells:headComponent.cells,width,horizontal,rgba,direction,increasing,work,background});
  if(!head||strokeRgb.some((v,c)=>Math.abs(v-Number.parseInt(head.color.slice(1+c*2,3+c*2),16))>38))uniform=false;
  if(!head)headGeometry=sourceVisibleGapGeometry({cells:headComponent.cells,width,horizontal,rgba,direction,increasing,work,background})??undefined;
  if(!head&&!headGeometry)detachedHead=sourceDetachedDashHead({cells:headComponent.cells,width,horizontal,rgba,direction,increasing,
   axis:strokeAxis,widthPx:strokeWidth,runs,work})??undefined;
  const geometry=head??headGeometry??detachedHead;
  if(!geometry||Math.abs(geometry.axis-strokeAxis)>2||Math.abs(geometry.widthPx-strokeWidth)>1.5)return null;
  if(!uniform){
   headGeometry??=sourceVisibleGapGeometry({cells:headComponent.cells,width,horizontal,rgba,direction,increasing,work,background})??undefined;
   if(!headGeometry?.complete&&!detachedHead)return null;
  }
  lo=Math.min(lo,geometry.lo);hi=Math.max(hi,geometry.hi);
  physicalRuns.push(geometry);
 }
 let color=strokeRgb;
 /** @type {import('./source-route-spatial-paint').SpatialPaint|undefined} */let spatial;
 if(!uniform){
  if(detachedHead){
   const paint=sourceDashSpatialPaint({components:dashComponents,head:detachedHead,width,horizontal,rgba,background,work});
   if(!paint)return null;color=[0,1,2].map(c=>Number.parseInt(paint.color.slice(1+c*2,3+c*2),16));spatial=paint.spatial;
  }else{
   if(!headGeometry)return null;
   const paint=sourceDashCoveragePaint({components:dashComponents,head:headGeometry,width,horizontal,rgba,background,work});
   if(!paint)return null;color=paint;
  }
 }
 physicalRuns.sort((a,b)=>a.lo-b.lo);
 const pattern=[],ordered=increasing?physicalRuns:[...physicalRuns].reverse();
 for(let i=0;i<ordered.length;i++){
  if(++work.checks>4000000)return null;
  const run=ordered[i],next=ordered[i+1];if(!run)return null;
  const gap=next?(increasing?next.lo-run.hi-1:run.lo-next.hi-1):1;
  if(gap<1)return null;
  pattern.push([run.hi-run.lo+1,gap].map(n=>n/strokeWidth));
 }
 return {...first,axis:strokeAxis,widthPx:strokeWidth,lo,hi,color:'#'+color.map(v=>v.toString(16).padStart(2,'0')).join(''),
  support:Math.min(...runs.map(r=>r.support)),strokeDashPattern:JSON.stringify(pattern),...(spatial?{spatial}: {})};
}
module.exports={sourceVisibleDashProfile};
