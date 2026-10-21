// @ts-check
'use strict';
const {sourceArrowCoveragePaint}=require('./source-arrow-coverage-paint');
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
 let headComponent=null,dashComponents=components;
 if(direction!=='undirected'){
  const isEnd=(direction==='forward'&&increasing)||(direction==='backward'&&!increasing);
  const getAlong=c=>c.cells.reduce((acc,n)=>{
   const val=horizontal?n%width:Math.floor(n/width);
   return isEnd?Math.max(acc,val):Math.min(acc,val);
  },isEnd?-Infinity:Infinity);
  const isHeadCandidate=c=>{
   const along=c.cells.map(n=>horizontal?n%width:Math.floor(n/width));
   return Math.max(...along)-Math.min(...along)>=2;
  };
  const candidates=components.filter(isHeadCandidate);
  const sorted=[...candidates].sort((a,b)=>isEnd?getAlong(b)-getAlong(a):getAlong(a)-getAlong(b));
  headComponent=sorted[0]??null;
  dashComponents=components.filter(c=>c!==headComponent&&isHeadCandidate(c));
 }
 const runs=[];
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
 const pattern=[],ordered=increasing?runs:[...runs].reverse();
 for(let i=0;i<ordered.length;i++){
  if(++work.checks>4000000)return null;
  const run=ordered[i],next=ordered[i+1];if(!run)return null;
  // One native stroke has one axis, width and ink. Do not average unlike
  // components into a dashed relation or discard an intervening fragment.
  if(Math.max(Math.abs(run.minAcross-strokeAxis),Math.abs(run.maxAcross-strokeAxis))>strokeWidth/2+1.5
   ||Math.abs(run.widthPx-strokeWidth)>1.5||run.rgb.some((v,c)=>Math.abs(v-(strokeRgb[c]??0))>38))return null;
  const gap=next?(increasing?next.lo-run.hi-1:run.lo-next.hi-1):1;
  if(gap<1)return null;
  pattern.push([run.hi-run.lo+1,gap].map(n=>n/strokeWidth));
 }
 let lo=first.lo,hi=last.hi;
 if(headComponent){
  if(headComponent.boundary)return null;
  const headAlong=headComponent.cells.map(n=>horizontal?n%width:Math.floor(n/width));
  const headLo=Math.min(...headAlong),headHi=Math.max(...headAlong);
  const headAcross=headComponent.cells.map(n=>horizontal?Math.floor(n/width):n%width);
  const headMinAcross=Math.min(...headAcross),headMaxAcross=Math.max(...headAcross);
  const headCenter=(headMinAcross+headMaxAcross)/2,headWidth=headMaxAcross-headMinAcross+1;
  if(Math.abs(headCenter-strokeAxis)>2||headWidth<strokeWidth*1.5)return null;
  if((direction==='forward'&&increasing)||(direction==='backward'&&!increasing))hi=Math.max(hi,headHi);
  else lo=Math.min(lo,headLo);
 }
 return {...first,axis:strokeAxis,widthPx:strokeWidth,lo,hi,color:'#'+strokeRgb.map(v=>v.toString(16).padStart(2,'0')).join(''),
  support:Math.min(...runs.map(r=>r.support)),strokeDashPattern:JSON.stringify(pattern)};
}
module.exports={sourceVisibleDashProfile};
