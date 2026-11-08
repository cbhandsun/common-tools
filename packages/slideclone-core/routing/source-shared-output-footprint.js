// @ts-check
'use strict';
const {readNativeFreeformSegments}=require('../scene-plan/native-freeform-path');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {nativeElbowVertices}=require('./source-route-native-elbow');
const {chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {sharedSourceCurveFootprint}=require('./source-shared-route-measurement');
const {certifySourceRouteCurveGeometry}=require('./source-route-curve-geometry');
const {certifySourceRouteCurveTopology}=require('./source-route-curve-topology');
/** @typedef {{x:number,y:number}} Point */
/** Inspect actual generated geometry; nativeRoutePoints and mode metadata are
 * deliberately unused. This check precedes both compiler-local registries.
 * It issues no capability and never substitutes serialized data for live fit.
 * @param {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
 * image:import('../png').PngImage,parts:import('./source-shared-route-output-paint').Item[],
 * graph:import('../scene-plan/source-scene-shared-route-inventory').SharedGraph,
 * sourceSegments:Map<string,{path:Point[],low:number,high:number}>,sx:number,sy:number,
 * work:import('./source-shared-route-output-snapshot').Work}} input */
function assertSharedOutputFootprint({fit,image,parts,graph,sourceSegments,sx,sy,work}){
 /** @param {number} count */const charge=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @returns {never} */const invalid=()=>{throw new TypeError('Scene shared output footprint is invalid');};
 charge(parts.length*2+fit.edges.length*4+graph.edges.length*4);
 const byId=new Map(parts.map(part=>[part.id,part])),ordinals=new Map(fit.edges.map((edge,i)=>[edge.path,i]));
 const rows=fit.edges.map(()=>({widthPx:Infinity,curves:/** @type {Point[][]} */([])}));
 /** @type {{from:string,to:string,curves:Point[][]}[]} */const actualEdges=[];
 /** @param {Point} p */const local=p=>({x:p.x/sx-fit.window.x,y:p.y/sy-fit.window.y});
 for(const edge of graph.edges){
  const segment=sourceSegments.get(edge.id),ordinal=segment?ordinals.get(segment.path):undefined,part=byId.get(edge.memberId);
  if(ordinal===undefined||!part||!record(part.style)||part.source?.role!=='relationship')return invalid();
  const row=rows[ordinal],style=part.style,b=part.box;
  if(!row||style.fill!=='none'||typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<=0
   ||[style.rotationDeg,style.rotation,style.flipH,style.flipV].some(v=>v!==undefined))return invalid();
  row.widthPx=Math.min(row.widthPx,style.strokeWidthPt/Math.max(sx,sy));
  const start=row.curves.length;
  if(part.type==='freeform'){
   charge(typeof style.freeformPath==='string'?style.freeformPath.length:120*16);
   const raw=readNativeFreeformSegments(style);
   if(!list(raw)||!raw.length||raw.length>120)return invalid();
   /** @type {Point|null} */let previous=null;
   for(const command of raw){
    if(!record(command)||!list(command.points))return invalid();charge(command.points.length*8+1);
    const points=command.points.map(p=>{if(!record(p)||typeof p.x!=='number'||typeof p.y!=='number'||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))return invalid();return local({x:b.x+p.x*b.w,y:b.y+p.y*b.h});});
    if(command.type==='moveTo'&&previous===null&&points.length===1){previous=points[0]??null;continue;}
    if(!previous||command.type!=='lnTo'&&command.type!=='cubicBezTo'||points.length!==(command.type==='lnTo'?1:3))return invalid();
    row.curves.push([previous,...points]);previous=points.at(-1)??null;
   }
  }else if(part.type==='line'){
   let points=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h}];
   if(style.connectorFrame!==undefined){
    const frame=style.connectorFrame,adjustments=style.connectorAdjustments;
    if(!record(frame)||![frame.x,frame.y,frame.w,frame.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)
     ||Number(frame.w)<0||Number(frame.h)<0||![0,90,180,270].includes(Number(frame.rotationDeg))
     ||typeof frame.flipH!=='boolean'||typeof frame.flipV!=='boolean'
     ||style.connectorType!==undefined&&!['elbow-3','elbow-4','elbow-5'].includes(String(style.connectorType))
     ||adjustments!==undefined&&(!list(adjustments)||adjustments.length>3||!adjustments.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=2000000)))return invalid();
    points=nativeElbowVertices(/** @type {NonNullable<ReturnType<typeof import('./source-route-native-elbow').nativeElbowConnector>>} */(style));
   }else if(style.connectorType!==undefined)return invalid();
   charge(points.length*4);
   for(let i=1;i<points.length;i++)row.curves.push([local(/** @type {Point} */(points[i-1])),local(/** @type {Point} */(points[i]))]);
  }else return invalid();
  actualEdges.push({from:edge.from,to:edge.to,curves:row.curves.slice(start)});
 }
 if(rows.some(row=>row.curves.some(c=>c.length===4))){
  for(const [ordinal,row]of rows.entries()){
   const edge=fit.edges[ordinal];if(!edge)return invalid();if(!edge.nativePolyline)continue;
   charge(edge.path.length*3+16);const points=edge.path.map(p=>({...p}));
   for(const [index,cell]of [[0,edge.from],[-1,edge.to]])if(fit.cuts.includes(/** @type {number} */(cell))){
    const port=fit.sites[fit.cuts.indexOf(/** @type {number} */(cell))]?.point,p=index===0?points[0]:points.at(-1);if(!port||!p)return invalid();
    const localPort={x:port.x-fit.window.x,y:port.y-fit.window.y};
    if(Math.hypot(localPort.x-p.x,localPort.y-p.y)>1e-12){if(index===0)points.unshift(localPort);else points.push(localPort);}
   }
   if(!certifySourceRouteCurveGeometry({points,curves:row.curves,work}).passed)return invalid();
  }
  if(!certifySourceRouteCurveTopology({edges:actualEdges,work}).passed)return invalid();
 }
 if(!sharedSourceCurveFootprint(fit,image,rows,work))return invalid();
}
module.exports={assertSharedOutputFootprint};
