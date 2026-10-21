// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {hasSharedSourceRoute}=require('./source-shared-route-measurement');
const {sourceRouteSegmentGradient}=require('./source-route-paint');
const {bindSharedSourcePath}=require('./source-shared-route-path-binding');
const {createSharedRouteOutputPaintRegistry}=require('./source-shared-route-output-paint');
const {orthogonalSourceTree,nativeElbowConnector}=require('./source-route-native-elbow');
const outputPaint=createSharedRouteOutputPaintRegistry();
/** @param {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
 * image:import('./png').PngImage,relations:import('./source-scene-plan').Relation[],id:string,sourceHash:string,slideSize:{widthPt:number,heightPt:number}}} input */
function compileSharedSourceRoute(input){
 if(!record(input)||!record(input.slideSize)||!list(input.relations)||input.relations.length<2||input.relations.length>48
  ||input.relations.some(r=>!record(r))
  ||typeof input.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/u.test(input.id)
  ||typeof input.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(input.sourceHash)
  ||![input.slideSize.widthPt,input.slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))throw new TypeError('Scene shared writer controls are invalid');
 const {fit,image,relations,id,slideSize}=input;
 if(!hasSharedSourceRoute(fit,image))throw new TypeError('Scene shared source proof is invalid');
 const regionId=relations[0]?.regionId;
 if(!regionId||relations.some(r=>!record(r)||r.regionId!==regionId||typeof r.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(r.id)
  ||!['forward','backward','both','undirected'].includes(r.direction)))throw new TypeError('Scene shared relations are invalid');
 const sx=slideSize.widthPt/image.width,sy=slideSize.heightPt/image.height;
 /** Regularize the measured tree to orthogonal legs and solve one Office
  * connector per edge. All-or-nothing: a partially native tree would mix
  * straight segments and elbows around the same junction.
  * @param {typeof fit} tree */
 const nativeSharedTree=tree=>{
  const point=(/** @type {number} */cell,/** @type {{x:number,y:number}} */local)=>{const t=tree.cuts.indexOf(cell);return t>=0?tree.sites[t]?.point:{x:local.x+tree.window.x,y:local.y+tree.window.y};};
  /** @type {Map<number,{x:number,y:number}>} */const joints=new Map();
  const edges=[];
  for(const edge of tree.edges){
   const first=edge.points[0],last=edge.points[edge.points.length-1];if(!first||!last)return null;
   const start=point(edge.from,first),end=point(edge.to,last);if(!start||!end)return null;
   joints.set(edge.from,start);joints.set(edge.to,end);
   edges.push({from:edge.from,to:edge.to,widthPx:edge.widthPx,
    points:[start,...edge.points.slice(1,-1).map(p=>({x:p.x+tree.window.x,y:p.y+tree.window.y})),end]});
  }
  const solved=orthogonalSourceTree({joints,fixed:new Set(tree.cuts),edges});
  
  if(solved.routes.some(r=>!r))return null;
  const connectors=solved.routes.map(r=>nativeElbowConnector(/** @type {{x:number,y:number}[]} */(r).map(p=>({x:p.x*sx,y:p.y*sy}))));
  if(connectors.some(c=>!c))return null;
  return {joints:solved.joints,routes:solved.routes,connectors};
 };
 /** @type {import('./source-scene-shared-route-inventory').SharedGraph} */const graph={id,regionId,sourceHash:input.sourceHash,nodes:[],edges:[],paths:[]};
 /** @type {{id:string,type:string,box:{x:number,y:number,w:number,h:number},style:Record<string,unknown>,source:Record<string,unknown>}[]} */const parts=[];
 const vertices=new Map();
 /** @type {Map<string,{x:number,y:number}[]>} */const nativeRoutes=new Map();
 /** @type {Map<string,{path:{x:number,y:number}[],low:number,high:number}>} */const sourceSegments=new Map();
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-shared-route',sceneRegionId:regionId,sceneInventoryId:id};
 const native=nativeSharedTree(fit);
 /** A measured arrow tip that stops short of its node along the side normal
  * is a source-visible gap: attach logically to that side (existing writer
  * contract) so Office keeps the connection when the node moves.
  * @param {{side:string,offset:{x:number,y:number}}} site */
 const outwardGap=site=>{const o=site.offset;return site.side==='top'?o.x===0&&o.y<0:site.side==='bottom'?o.x===0&&o.y>0
  :site.side==='left'?o.y===0&&o.x<0:site.side==='right'?o.y===0&&o.x>0:false;};
 /** @param {number} cell @param {{x:number,y:number}} point */
 const vertex=(cell,point)=>{
  const known=vertices.get(cell);if(known)return known;
  const terminal=fit.cuts.indexOf(cell),node=terminal>=0?fit.nodes[terminal]:undefined,site=terminal>=0?fit.sites[terminal]:undefined;
  const vertexId='vertex-'+graph.nodes.length,nativeId=node?.id??id+'-joint-'+graph.nodes.length;
  const global=site?.point??native?.joints.get(cell)??{x:point.x+fit.window.x,y:point.y+fit.window.y};
  const row={id:vertexId,endpointId:node?.endpointId??null,nativeId};graph.nodes.push(row);
  if(!node)parts.push({id:nativeId,type:'rect',box:{x:global.x*sx-.05,y:global.y*sy-.05,w:.1,h:.1},
   style:{fill:'none',stroke:'none',strokeWidthPt:0},source:{...source,nativeComponentRole:'relationship-route-control',routeControl:true}});
  const result={row,point:global,node,site};vertices.set(cell,result);return result;
 };
 for(const [ordinal,edge]of fit.edges.entries()){
  const points=edge.points;
  // One native Office connector per measured tree edge whenever the whole
  // tree regularizes to orthogonal legs; otherwise the measured polyline.
  const spans=native?[[0,points.length-1]]:points.slice(1).map((_,i)=>[i,i+1]);
  for(const [lowPoint,highPoint]of spans){
   const i=/** @type {number} */(highPoint),a=points[/** @type {number} */(lowPoint)],b=points[i];if(!a||!b)throw new TypeError('Scene shared source edge is invalid');
   const from=vertex(lowPoint===0?edge.from:-((ordinal+1)*32+i),a),to=vertex(i===points.length-1?edge.to:-((ordinal+1)*32+i+1),b);
   const startArrow=from.node?.arrow===true,endArrow=to.node?.arrow===true;
   const memberId=id+'-edge-'+graph.edges.length,edgeId='edge-'+graph.edges.length;
   graph.edges.push({id:edgeId,from:from.row.id,to:to.row.id,memberId,direction:startArrow?(endArrow?'both':'backward'):endArrow?'forward':'undirected'});
   /** @param {typeof from} target */const anchor=target=>target.site?{elementId:target.row.nativeId,side:target.site.side,position:target.site.position,
    dxPt:target.site.offset.x*sx,dyPt:target.site.offset.y*sy,...(outwardGap(target.site)?{siteOffsetKind:'source-visible-gap'}:{})}:{elementId:target.row.nativeId,side:'top',position:.5,dyPt:.05};
    const low=edge.path.findIndex(p=>p.x===a.x&&p.y===a.y),high=edge.path.findIndex(p=>p.x===b.x&&p.y===b.y);
     if(low<0||high<=low)throw new TypeError('Scene shared source sequence is invalid');
     sourceSegments.set(edgeId,{path:edge.path,low,high});
    const common={fill:'none',stroke:edge.paint.color,strokeWidthPt:edge.widthPx*(sx+sy)/2,lineCap:'round',startAnchor:anchor(from),endAnchor:anchor(to),
     ...(startArrow?{startArrow:'triangle',startArrowWidth:'large',startArrowLength:'large'}:{}),
     ...(endArrow?{endArrow:'triangle',endArrowWidth:'large',endArrowLength:'large'}:{})};
    const attachment=[from.site,to.site].some(site=>site?.attachmentKind==='visible-gap-logical')?{sourceAttachmentKind:'visible-gap-logical',sourcePhysicalAttachment:false}:{};
    const solved=native?.connectors[ordinal];
    if(native&&solved){
     const pixels=/** @type {{x:number,y:number}[]} */(native.routes[ordinal]);nativeRoutes.set(edgeId,pixels);
     const route=pixels.map(p=>({x:p.x*sx,y:p.y*sy}));
     parts.push({id:memberId,type:'line',box:{x:from.point.x*sx,y:from.point.y*sy,w:(to.point.x-from.point.x)*sx,h:(to.point.y-from.point.y)*sy},
      style:{...common,...solved},source:{...source,nativeComponentRole:'relationship',role:'relationship',nativeConnectorRoute:true,nativeRoutePoints:route,...attachment}});
     continue;
    }
    const positions=edge.paint.positions,stops=edge.paint.stops;
     let pLow = positions?.[low], pHigh = positions?.[high];
     if (typeof pLow !== 'number' || !Number.isFinite(pLow) || typeof pHigh !== 'number' || !Number.isFinite(pHigh) || pHigh <= pLow) {
       pLow = Math.max(0, Math.min(0.999, low / (edge.path.length - 1)));
       pHigh = Math.max(pLow + 0.001, Math.min(1, high / (edge.path.length - 1)));
     }
    parts.push({id:memberId,type:'line',box:{x:from.point.x*sx,y:from.point.y*sy,w:(to.point.x-from.point.x)*sx,h:(to.point.y-from.point.y)*sy},
     style:{...common,
      ...(positions&&stops?{strokeGradient:sourceRouteSegmentGradient(stops,pLow,pHigh,Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)}:{})},
     source:{...source,nativeComponentRole:'relationship',role:'relationship',...attachment}});
  }
 }
 const used=new Set(),pathPoints=new Map(),sourcePaths=new Map();
 const bindingVertices=[...vertices.values()].map(v=>({id:v.row.id,endpointId:v.row.endpointId,arrow:v.node?.arrow===true,point:v.point}));
 const bindingWork={checks:fit.workChecks};
 for(const relation of relations){
  const selected=bindSharedSourcePath({relation,graph,vertices:bindingVertices,segments:sourceSegments,window:fit.window,work:bindingWork,routes:nativeRoutes});
  if(!selected.binding)throw new TypeError('Scene shared path binding failed: '+selected.reason);
  const {refs,points,samples}=selected.binding;
  for(const ref of refs)used.add(ref.id);
  graph.paths.push({relationId:relation.id,edges:refs});pathPoints.set(relation.id,points);sourcePaths.set(relation.id,samples);
 }
  const maxParts=Math.max(32,relations.length*20);
 if(parts.length>maxParts||used.size!==graph.edges.length)throw new TypeError('Scene shared complete parts are invalid');
 outputPaint.capture({fit,image,parts,slideSize,work:bindingWork});
 return {parts,graph,pathPoints,sourcePaths};
}
module.exports={compileSharedSourceRoute,measuredSharedSceneRoutePaintGroups:outputPaint.read};
