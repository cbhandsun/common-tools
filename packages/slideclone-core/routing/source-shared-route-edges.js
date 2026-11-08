// @ts-check
'use strict';
const {simplifySourceRoute}=require('./source-route-centerline');
const {minimumSourceRoutePolyline}=require('./source-route-minimum-polyline');
const {sourceRouteCoverageWidth}=require('./source-route-coverage-width');
const {sourceRouteVisibleBackground}=require('./source-route-visible-background');
const {measureSourceRoutePaint}=require('./source-route-paint');
const {sourceRouteCorePath}=require('./source-route-core-samples');
const {sourceSharedRouteCoverage}=require('./source-shared-route-coverage');
const {sourceRoutePolyline}=require('./source-route-polyline');
const {nativeSourceRouteGradient}=require('./source-route-native-gradient');
const {sourceRouteLinearSections}=require('./source-route-linear-sections');
const {sharedJunctionArmsInked}=require('./source-shared-junction-arms');
/** @typedef {NonNullable<ReturnType<typeof import('./source-shared-shaft-tree').sourceSharedShaftTree>>['edges'][number]&{
 * path:{x:number,y:number}[],paintPath:{x:number,y:number}[],widthPx:number,paint:NonNullable<ReturnType<typeof measureSourceRoutePaint>>,fromHead:boolean,toHead:boolean,nativePolyline?:true}} SharedMeasuredEdge */
/** Measure every complete source edge, native control capacity and exterior
 * flanks under the caller's original ledger. This stage grants no independent
 * source proof; the composition root signs only after all stages succeed.
 * @param {{tree:NonNullable<ReturnType<typeof import('./source-shared-shaft-tree').sourceSharedShaftTree>>,
 * partition:NonNullable<ReturnType<typeof import('./source-shared-route-heads').partitionSharedRouteHeads>['partition']>,
 * terminals:{index:number,arrow:boolean}[],raster:{width:number,height:number,rgba:Uint8Array},background:number[],
 * backgroundAt:(index:number)=>number[],work:{checks:number}}} input */
function measureSharedRouteEdges({tree,partition,terminals,raster,background,backgroundAt,work}){
 const window={w:raster.width,h:raster.height};
 /** @param {string} reason @returns {{edges:null,shaftCells:null,reason:string}} */
 const reject=reason=>({edges:null,shaftCells:null,reason});
 for(const joint of tree.joints.filter(n=>!partition.cuts.includes(n))){
  if(tree.edges.filter(e=>e.from===joint||e.to===joint).length!==3)return reject('shared-crossing-ambiguous');
  if(!sharedJunctionArmsInked({edges:tree.edges,joint,raster,backgroundAt,work}))return reject(work.checks>4000000?'shared-geometry-budget':'shared-junction-paint');
 }
 /** @type {SharedMeasuredEdge[]} */const measured=[];
 const cache=new Map(),visibleCache=new Map(),bgCache=new Map(),priorStopsList=[];
 /** @type {((index:number)=>number[])|undefined} */let visibleBackground;
 /** A failed field can only be replaced by independently observed VISIBLE
  * background. Keep its cache separate from the original field; every sample
  * still needs its own transverse proof, including each short cycle arm.
  * @param {{x:number,y:number}[]} path @param {{x:number,y:number}} [linearDirection] */
 const widthOf=(path,linearDirection)=>{
  const input={path,rgba:raster.rgba,width:window.w,height:window.h,background,backgroundAt,work,cache,
   ...(linearDirection?{linearDirection}:{})};
  const original=sourceRouteCoverageWidth(input);
  if(original!==null||work.checks>4000000)return original;
  visibleBackground??=sourceRouteVisibleBackground({image:raster,background,backgroundAt,work});
  return sourceRouteCoverageWidth({...input,backgroundAt:visibleBackground,cache:visibleCache});
 };
 for(const edge of tree.edges){
  
  const shaftPath=edge.cells.map(n=>({x:n%window.w,y:Math.floor(n/window.w)}));
  // A complete bent edge can put an elbow inside the old 30..70% width
  // window. Calibrate each measured straight run in its own source frame;
  // the unchanged full-ink coverage and exterior flank proofs follow below.
  let widthPx=widthOf(shaftPath);
  if(widthPx===null&&work.checks<=4000000){
   const widths=[];let previous=0;
   for(const point of edge.points.slice(1)){
   const end=shaftPath.findIndex((p,i)=>i>previous&&p.x===point.x&&p.y===point.y);
   if(++work.checks>4000000)return reject('shared-geometry-budget');
   if(end<0)return reject('shared-shaft-width');
   // A one-cell bevel has no independent interior tangent window. It stays
   // in the complete path/coverage proof, but cannot calibrate stroke width.
   if(end-previous<4){previous=end;continue;}
   const start=shaftPath[previous];if(!start)return reject('shared-shaft-width');
   // edge.points was independently simplified from these exact source cells.
   // Its straight-run chord is a stable transverse frame; a two-cell raster
   // staircase chord can instead point into a neighboring physical arm.
   const width=widthOf(shaftPath.slice(previous,end+1),{x:point.x-start.x,y:point.y-start.y});
   if(width===null)return reject(work.checks>4000000?'shared-geometry-budget #' + 6:'shared-shaft-width');
    widths.push(width);previous=end;
   }
   widths.sort((a,b)=>a-b);widthPx=widths[Math.floor(widths.length/2)]??null;
  }
  if(work.checks>4000000)return reject('shared-geometry-budget #' + 2);
  if(widthPx===null)return reject('shared-shaft-width');
  let path=shaftPath;
  let headPrefix=null,headSuffix=null;
  for(const [i,cut]of partition.cuts.entries()){
   const head=partition.heads.find(h=>h.index===terminals[i]?.index);if(!head)continue;
   const tip=head.path[0];if(!tip)return reject('shared-edge-paint');
   if(edge.from===cut){
    path=[...head.path.slice(0,-1),...path];
    headPrefix=[tip];
   }
   if(edge.to===cut){
    path=[...path,...head.path.slice(0,-1).reverse()];
    headSuffix=[tip];
   }
  }
   const corePath=sourceRouteCorePath({path,rgba:raster.rgba,width:window.w,height:window.h,backgroundAt,work,bgCache});
   if(!corePath)return reject('shared-geometry-budget #' + 3);
   let points;
   if(edge.points){
    points=[...(headPrefix??[]),...edge.points,...(headSuffix??[])];
   }else{
    points=simplifySourceRoute(path,work);
   }
   const paint=measureSourceRoutePaint(corePath,raster.rgba,window.w,work,priorStopsList);
   
   if(paint?.stops)priorStopsList.push(paint.stops);
  if(!points||!paint)return reject(work.checks>4000000?'shared-geometry-budget #' + 7:'shared-edge-paint');
  // A cyclic graph must keep its junction coordinates. An open native path
  // can retain ALL its measured vertices without the tree-only regularizer.
  // Spatial paint still needs an independent fit before joining segments.
  let nativePolyline=false;
  if(tree.cycleCount&&points.length>2){
   work.checks+=(points.length+path.length)*32;if(work.checks>4000000)return reject('shared-geometry-budget');
   nativePolyline=!!sourceRoutePolyline({points,sx:1,sy:1})&&(!paint.stops||!!paint.positions&&!!nativeSourceRouteGradient(path,
    {stops:paint.stops,positions:paint.positions,...(paint.spatial?{spatial:paint.spatial}:{})}));
  }
  measured.push({...edge,points,path,paintPath:corePath,widthPx,paint,fromHead:headPrefix!==null,toHead:headSuffix!==null,
   ...(nativePolyline?{nativePolyline:/** @type {const} */(true)}:{})});
 }
 
  const jointParts=tree.joints.filter(n=>!partition.cuts.includes(n)).length;
 const maxParts=Math.max(32,(terminals.length-1)*20);
 const countParts=()=>measured.reduce((n,e)=>n+(e.nativePolyline?1:(e.points.length-1)*2-1),0)+jointParts;
 let partCount=countParts();
 
 if(partCount>maxParts){
  for (const edge of measured) {
   
   if (edge.nativePolyline || edge.path.length > 100 || (edge.path.length === edge.cells.length && edge.points?.length <= 16)) continue;
   
   const points = minimumSourceRoutePolyline({points: edge.path, work,maxVertices:Math.min(120,Math.floor((maxParts+3)/2))});
   if (points) edge.points = points;
  }
  
  partCount=countParts();
 }
 if(partCount>maxParts)return reject('shared-parts-budget');
 /** @type {number[]} */const shaftCells=[];
 if(!sourceSharedRouteCoverage({mask:partition.remaining,width:window.w,height:window.h,edges:measured,
  joints:tree.joints,captureCells:shaftCells,work}))return reject(work.checks>4000000?'shared-geometry-budget':'shared-unrepresented-ink');
 // Matching 90% background flanks remain mandatory; junction/head pixels are
 // source-proven paint and do not become fabricated background samples.
 for(const edge of measured){let samples=0,matching=0;
  const sections=sourceRouteLinearSections({path:edge.cells.map(n=>({x:n%window.w,y:Math.floor(n/window.w)})),points:edge.points,work});
  if(!sections)return reject(work.checks>4000000?'shared-geometry-budget':'shared-flanks #1');
  const fromCut = partition.cuts.includes(edge.from), toCut = partition.cuts.includes(edge.to);
   const fromJoint = tree.joints.includes(edge.from), toJoint = tree.joints.includes(edge.to);
   const skipFrom = fromCut ? Math.min(16, Math.max(8, Math.floor(edge.cells.length * 0.35))) : fromJoint ? Math.min(8, Math.floor(edge.cells.length * 0.35)) : 0;
   const skipTo = toCut ? Math.min(16, Math.max(8, Math.floor(edge.cells.length * 0.35))) : toJoint ? Math.min(8, Math.floor(edge.cells.length * 0.35)) : 0;
   for(let i=2;i<edge.cells.length-2;i++){
    if(i < skipFrom || i >= edge.cells.length - skipTo) continue;
   const p=edge.cells[i],a=edge.cells[i-2],b=edge.cells[i+2];if(p===undefined||a===undefined||b===undefined)return reject('shared-flanks #1');
   work.checks+=sections.length;if(work.checks>4000000)return reject('shared-geometry-budget');
   // Keep the original symmetric frame at joins/bevels. A straight-run frame
   // applies only when the entire original stencil is inside that same run.
   const section=sections.find(s=>s.low<i-2&&s.high>i+2);
   const dx=section?.direction.x??b%window.w-a%window.w,dy=section?.direction.y??Math.floor(b/window.w)-Math.floor(a/window.w),length=Math.hypot(dx,dy);if(!length)continue;
   for(const sign of [-1,1]){if(work.checks>4000000)return reject('shared-geometry-budget #' + 4);
    const x=Math.round(p%window.w-sign*dy/length*(edge.widthPx/2+4)),y=Math.round(Math.floor(p/window.w)+sign*dx/length*(edge.widthPx/2+4));
    if(x<0||y<0||x>=window.w||y>=window.h){return reject('shared-flanks #2');}const n=y*window.w+x;
    if(partition.heads.some(head=>head.selected.has(n)))continue;samples++;
    const observed=backgroundAt(n);if(work.checks>4000000)return reject('shared-geometry-budget #' + 5);
    const ok = (raster.rgba[n*4+3]??0)>=240&&observed.every((v,c)=>Math.abs(v-(raster.rgba[n*4+c]??0))<=18); if(ok)matching++;
   }
  }
   if(!samples||matching/samples<.9)return reject('shared-flanks #3');
 }
 return {edges:measured,shaftCells,reason:'shared-edges-confirmed'};
}
module.exports={measureSharedRouteEdges};

