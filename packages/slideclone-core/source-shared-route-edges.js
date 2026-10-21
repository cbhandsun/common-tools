// @ts-check
'use strict';
const {simplifySourceRoute}=require('./source-route-centerline');
const {minimumSourceRoutePolyline}=require('./source-route-minimum-polyline');
const {sourceRouteCoverageWidth}=require('./source-route-coverage-width');
const {measureSourceRoutePaint}=require('./source-route-paint');
const {sourceRouteCorePath}=require('./source-route-core-samples');
const {sourceSharedRouteCoverage}=require('./source-shared-route-coverage');
/** @typedef {NonNullable<ReturnType<typeof import('./source-shared-shaft-tree').sourceSharedShaftTree>>['edges'][number]&{
 * path:{x:number,y:number}[],widthPx:number,paint:NonNullable<ReturnType<typeof measureSourceRoutePaint>>}} SharedMeasuredEdge */
/** Measure every complete source edge, native control capacity and exterior
 * flanks under the caller's original ledger. This stage grants no independent
 * source proof; the composition root signs only after all stages succeed.
 * @param {{tree:NonNullable<ReturnType<typeof import('./source-shared-shaft-tree').sourceSharedShaftTree>>,
 * partition:NonNullable<ReturnType<typeof import('./source-shared-route-heads').partitionSharedRouteHeads>['partition']>,
 * terminals:{index:number,arrow:boolean}[],raster:{width:number,height:number,rgba:Uint8Array},background:number[],
 * backgroundAt:(index:number)=>number[],work:{checks:number}}} input */
function measureSharedRouteEdges({tree,partition,terminals,raster,background,backgroundAt,work}){
 const window={w:raster.width,h:raster.height};
 /** @param {string} reason */const reject=reason=>{return {edges:/** @type {SharedMeasuredEdge[]|null} */(null),reason};};
 const measured=[],cache=new Map(),bgCache=new Map(),priorStopsList=[];
 for(const edge of tree.edges){
  
  const shaftPath=edge.cells.map(n=>({x:n%window.w,y:Math.floor(n/window.w)}));
  // A complete bent edge can put an elbow inside the old 30..70% width
  // window. Calibrate each measured straight run in its own source frame;
  // the unchanged full-ink coverage and exterior flank proofs follow below.
  let widthPx=sourceRouteCoverageWidth({path:shaftPath,rgba:raster.rgba,width:window.w,height:window.h,background,backgroundAt,work,cache});
  if(widthPx===null&&work.checks<=4000000){
   const widths=[];let previous=0;
   for(const point of edge.points.slice(1)){
   const end=shaftPath.findIndex((p,i)=>i>previous&&p.x===point.x&&p.y===point.y);
   if(++work.checks>4000000)return reject('shared-geometry-budget');
   if(end<0)return reject('shared-shaft-width');
   // A one-cell bevel has no independent interior tangent window. It stays
   // in the complete path/coverage proof, but cannot calibrate stroke width.
   if(end-previous<4){previous=end;continue;}
   const width=sourceRouteCoverageWidth({path:shaftPath.slice(previous,end+1),rgba:raster.rgba,width:window.w,height:window.h,background,backgroundAt,work,cache});
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
   if(edge.from===cut){
    path=[...head.path.slice(0,-1),...path];
    headPrefix=[head.path[0]];
   }
   if(edge.to===cut){
    path=[...path,...head.path.slice(0,-1).reverse()];
    headSuffix=[head.path[0]];
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
  measured.push({...edge,points,path,widthPx,paint});
 }
 
  const jointParts=tree.joints.filter(n=>!partition.cuts.includes(n)).length;
 const maxParts=Math.max(32,(terminals.length-1)*20);
 let partCount=measured.reduce((n,e)=>n+(e.points.length-1)*2-1,0)+jointParts;
 
 if(partCount>maxParts){
  for (const [idx, edge] of measured.entries()) {
   
   if (edge.path.length > 100 || (edge.path.length === edge.cells.length && edge.points?.length <= 16)) continue;
   
   const points = minimumSourceRoutePolyline({points: edge.path, work});
   if (points) edge.points = points;
  }
  
  partCount=measured.reduce((n,e)=>n+(e.points.length-1)*2-1,0)+jointParts;
 }
 if(partCount>maxParts)return reject('shared-parts-budget');
 if(!sourceSharedRouteCoverage({mask:partition.remaining,width:window.w,height:window.h,edges:measured,
  joints:tree.joints,work}))return reject('shared-unrepresented-ink');
 // Matching 90% background flanks remain mandatory; junction/head pixels are
 // source-proven paint and do not become fabricated background samples.
 for(const [idx, edge] of measured.entries()){let samples=0,matching=0;
  const fromCut = partition.cuts.includes(edge.from), toCut = partition.cuts.includes(edge.to);
   const fromJoint = tree.joints.includes(edge.from), toJoint = tree.joints.includes(edge.to);
   const skipFrom = fromCut ? Math.min(16, Math.max(8, Math.floor(edge.cells.length * 0.35))) : fromJoint ? Math.min(8, Math.floor(edge.cells.length * 0.35)) : 0;
   const skipTo = toCut ? Math.min(16, Math.max(8, Math.floor(edge.cells.length * 0.35))) : toJoint ? Math.min(8, Math.floor(edge.cells.length * 0.35)) : 0;
   for(let i=2;i<edge.cells.length-2;i++){
    if(i < skipFrom || i >= edge.cells.length - skipTo) continue;
   const p=edge.cells[i],a=edge.cells[i-2],b=edge.cells[i+2];if(p===undefined||a===undefined||b===undefined)return reject('shared-flanks #1');
   const dx=b%window.w-a%window.w,dy=Math.floor(b/window.w)-Math.floor(a/window.w),length=Math.hypot(dx,dy);if(!length)continue;
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
 return {edges:measured,reason:'shared-edges-confirmed'};
}
module.exports={measureSharedRouteEdges};

