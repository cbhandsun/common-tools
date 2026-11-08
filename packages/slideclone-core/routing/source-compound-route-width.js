// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
const {sourceRouteCoverageWidth}=require('./source-route-coverage-width');
const {sourceRouteScanlineBackground}=require('./source-route-scanline-background');
const {simplifySourceRoute}=require('./source-route-centerline');
const {sourceRouteLinearSections}=require('./source-route-linear-sections');
/** @typedef {{x:number,y:number}} Point */
/** Calibrate EVERY retained shaft sample. Preserve successful original
 * measurements; a failed sample can use a separately observed full-scanline
 * field and the chord of its independently simplified source run. The
 * complete head/shaft union, source footprint, paint and flanks are proved
 * separately by the caller. No samples, masks or source pixels are changed.
 * @param {unknown} input @returns {number|null} */
function sourceCompoundShaftWidth(input){
 if(!record(input)||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0
  ||Number(input.work.checks)>4000000||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true
  ||!list(input.background)||input.background.length!==3||input.background.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>255))
  throw new TypeError('Compound shaft input is invalid');
 const image=sourceRaster({width:input.width,height:input.height,rgba:input.rgba});
 if(image.width*image.height>262144)throw new RangeError('Compound shaft exceeds the unit budget');
 for(const ps of [input.path,input.trimmed])if(!list(ps)||ps.length>512||!ps.every(p=>record(p)
  &&typeof p.x==='number'&&typeof p.y==='number'&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)
  &&p.x>=0&&p.x<image.width&&p.y>=0&&p.y<image.height))throw new TypeError('Compound shaft path is invalid');
 const path=/** @type {Point[]} */(input.path),trimmed=/** @type {Point[]} */(input.trimmed),work=/** @type {{checks:number}} */(input.work);
 if(path.length<5||trimmed.length<5)return null;
 const background=/** @type {number[]} */(input.background),base={rgba:image.rgba,width:image.width,height:image.height,background,work};
 // A retained shaft must be one unchanged contiguous section of the source
 // path. A proposal cannot skip a difficult sample or change its order.
 const offset=path.findIndex(p=>p.x===trimmed[0]?.x&&p.y===trimmed[0]?.y);
 work.checks+=path.length+trimmed.length;if(work.checks>4000000)return null;
 if(offset<0||!trimmed.every((p,i)=>p.x===path[offset+i]?.x&&p.y===path[offset+i]?.y))return null;
 const original=sourceRouteCoverageWidth({...base,path:trimmed,complete:true,cache:new Map()});
 if(original!==null||work.checks>4000000)return original;
 // A broad head's internal skeleton can exceed the native shaft's vertex
 // capacity. That disables only the optional straight-run frame; independent
 // scanline observations still calibrate every original retained sample.
 // Complete output geometry must separately satisfy its unchanged capacity.
 const points=simplifySourceRoute(path,work),sections=points?sourceRouteLinearSections({path,points,work}):[];
 if(work.checks>4000000||!sections)return null;
 const at=sourceRouteScanlineBackground({image,background,work}),cache=new Map(),localCache=new Map(),values=[];
 for(let i=2;i<trimmed.length-2;i++){
  const p=trimmed[i],q=trimmed[i+2];if(!p||!q)return null;
  // The five-cell request preserves the original forward-two-cell frame and
  // asks the coverage primitive to check exactly this original sample.
  const request={...base,path:[p,p,p,q,q],complete:true,cache};
  let value=sourceRouteCoverageWidth(request);
  if(value===null&&work.checks<=4000000){
   value=sourceRouteCoverageWidth({...request,backgroundAt:at,cache:localCache});
   work.checks+=sections.length;if(work.checks>4000000)return null;
   const section=sections.find(s=>s.low<=offset+i&&s.high>=offset+i+2);
   if(value===null&&section)value=sourceRouteCoverageWidth({...request,backgroundAt:at,cache:localCache,linearDirection:section.direction});
  }
  if(value===null||work.checks>4000000)return null;values.push(value);
 }
 work.checks+=values.length*2;if(work.checks>4000000)return null;
 values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]??null;
}
module.exports={sourceCompoundShaftWidth};
