// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {hasSharedSourceRoute,sharedSourceRouteFittingInk}=require('./source-shared-route-measurement');
const {sourceRouteSegmentGradient}=require('./source-route-paint');
const {bindSharedSourceRelations}=require('./source-shared-route-bindings');
const {parseSourceRouteCatalogs}=require('./source-shared-route-reprojection');
const {createSharedRouteOutput}=require('./source-shared-route-output');
const {orthogonalSourceTree,nativeElbowConnector,nativeElbowVertices}=require('./source-route-native-elbow');
const {parseConnectorCornerMode,roundedSourceRoute}=require('./source-route-corner-mode');
const {nativeSourceRouteGradient,sourceRouteGradientInFrame}=require('./source-route-native-gradient');
const {parseScenePathProgram}=require('../scene-plan/source-scene-path-program');
const {sourceRoutePolyline}=require('./source-route-polyline');
const {createSourceRouteCatalog,parseSourceRouteChoice}=require('./source-shared-route-choice');
const {fitNativeSourceRouteChain}=require('./source-route-native-chain');
const {assertNativeRouteTopology}=require('./source-route-native-topology');
const {compileSharedSourceCurves}=require('./source-shared-route-curves');
const output=createSharedRouteOutput();
/** @param {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
 * image:import('../png').PngImage,relations:import('../scene-plan/source-scene-plan').Relation[],id:string,sourceHash:string,slideSize:{widthPt:number,heightPt:number},connectorCornerMode?:import('./source-route-corner-mode').ConnectorCornerMode,allowUnboundRelations?:boolean,sourceRouteCatalogs?:unknown,wholeRelations?:boolean,prepareNativeGeometry?:boolean}} input */
function compileSharedSourceRoute(input){
 if(!record(input)||!record(input.slideSize)||!list(input.relations)||input.relations.length<2||input.relations.length>48
  ||input.relations.some(r=>!record(r))
  ||input.allowUnboundRelations!==undefined&&typeof input.allowUnboundRelations!=='boolean'
  ||input.wholeRelations!==undefined&&typeof input.wholeRelations!=='boolean'
  ||input.prepareNativeGeometry!==undefined&&typeof input.prepareNativeGeometry!=='boolean'
  ||new Set(input.relations.map(r=>r.id)).size!==input.relations.length
  ||typeof input.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/u.test(input.id)
  ||typeof input.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(input.sourceHash)
  ||![input.slideSize.widthPt,input.slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))throw new TypeError('Scene shared writer controls are invalid');
 const {fit,image,relations,id,slideSize}=input;
 const previousCatalogs=parseSourceRouteCatalogs(input.sourceRouteCatalogs);
 const mode=parseConnectorCornerMode(input.connectorCornerMode);
 if(!hasSharedSourceRoute(fit,image))throw new TypeError('Scene shared source proof is invalid');
 const regionId=relations[0]?.regionId;
 if(!regionId||relations.some(r=>!record(r)||r.regionId!==regionId||typeof r.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(r.id)
  ||!['forward','backward','both','undirected'].includes(r.direction)))throw new TypeError('Scene shared relations are invalid');
 for(const relation of relations)parseScenePathProgram(relation.visiblePath,{widthPx:image.width,heightPx:image.height,
  coordinateSpace:'compiled-source-pixels',owner:{x:0,y:0,w:image.width,h:image.height},...(relation.shaftBox?{shaftBox:relation.shaftBox}: {})});
 for(const relation of relations)if(relation.sourcePathChoice!==undefined){
  parseSourceRouteChoice(relation.sourcePathChoice);
  if(relation.visiblePath!==undefined)throw new TypeError('Scene source edge choice conflicts with a path program');
 }
 const sx=slideSize.widthPt/image.width,sy=slideSize.heightPt/image.height;
 const bindingWork={checks:fit.workChecks};
 const useChains=!!fit.cycleCount&&mode==='reroutable-elbow'&&!input.wholeRelations;
 const fittingInk=useChains?sharedSourceRouteFittingInk(fit,image,bindingWork):null;
 // Whole logical output consumes source-exact geometry first. Native preset
 // approximation is selected only after source erasure, never as its witness.
 const curves=fit.cycleCount&&(mode!=='reroutable-elbow'||input.wholeRelations)?compileSharedSourceCurves({fit,image,sx,sy,work:bindingWork}):null;
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
    points:[start,...edge.points.slice(1,-1).map(p=>{if(!p)throw new TypeError('Scene shared source point is invalid');return {x:p.x+tree.window.x,y:p.y+tree.window.y};}),end]});
  }
  const solved=orthogonalSourceTree({joints,fixed:new Set(tree.cuts),edges});
  
  if(solved.routes.some(r=>!r))return null;
  const routes=/** @type {{x:number,y:number}[][]} */(solved.routes);
  const connectors=routes.map(r=>nativeElbowConnector(r.map(p=>({x:p.x*sx,y:p.y*sy}))));
  if(connectors.some(c=>!c))return null;
  return {joints:solved.joints,routes,connectors};
 };
 /** @type {import('../scene-plan/source-scene-shared-route-inventory').SharedGraph} */const graph={id,regionId,sourceHash:input.sourceHash,nodes:[],edges:[],paths:[],...(fit.cycleCount?{topology:/** @type {const} */('source-network-v1')}: {})};
 /** @type {{id:string,type:string,box:{x:number,y:number,w:number,h:number},style:Record<string,unknown>,source:Record<string,unknown>}[]} */const parts=[];
 const vertices=new Map();
 /** @type {Map<string,{x:number,y:number}[]>} */const nativeRoutes=new Map();
 /** @type {Map<string,{path:{x:number,y:number}[],low:number,high:number}>} */const sourceSegments=new Map();
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-shared-route',sceneRegionId:regionId,sceneInventoryId:id,
  nativeComponentGroupId:'scene-network-'+id};
 // A spatial axis must explain every edge before replacing its measured paint.
 // Otherwise retain the original segment gradients for the complete tree.
 // Tree regularization may coalesce nearby junctions. Until a network-aware
 // geometric proof exists, cycles keep their measured polyline vertices and
 // every arm instead of moving the vertices with the tree-only solver.
 const native=fit.cycleCount||fit.edges.some(edge=>edge.paint.stops&&edge.paint.positions&&!nativeSourceRouteGradient(edge.path,{stops:edge.paint.stops,positions:edge.paint.positions,...(edge.paint.spatial?{spatial:edge.paint.spatial}: {})}))?null:nativeSharedTree(fit);
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
  const polyline=edge.nativePolyline===true&&(mode!=='reroutable-elbow'||input.wholeRelations);
  /** Terminals are already global; only internal measured vertices are local.
   * @param {number} cell @param {{x:number,y:number}|undefined} local */
  const globalPoint=(cell,local)=>{
   if(!local)throw new TypeError('Scene shared source point is invalid');
   const terminal=fit.cuts.indexOf(cell);return terminal>=0?fit.sites[terminal]?.point:{x:local.x+fit.window.x,y:local.y+fit.window.y};
  };
  const chain=useChains?fitNativeSourceRouteChain({
   points:[globalPoint(edge.from,points[0]),...points.slice(1,-1).map(p=>({x:p.x+fit.window.x,y:p.y+fit.window.y})),globalPoint(edge.to,points.at(-1))],
   indices:points.map(p=>edge.path.findIndex(q=>q.x===p.x&&q.y===p.y)),samples:edge.path,paint:edge.paint,
   sourceOrigin:{x:fit.window.x,y:fit.window.y},widthPx:edge.widthPx,sx,sy,work:bindingWork,sourceInk:fittingInk?.[ordinal]}):null;
  const spans=chain?chain.pieces.map(p=>[p.low,p.high]):native||polyline?[[0,points.length-1]]:points.slice(1).map((_,i)=>[i,i+1]);
  for(const [lowPoint,highPoint]of spans){
   const i=/** @type {number} */(highPoint),a=points[/** @type {number} */(lowPoint)],b=points[i];if(!a||!b)throw new TypeError('Scene shared source edge is invalid');
   // Merged spans share the same ORIGINAL point index at each boundary.
   const from=vertex(lowPoint===0?edge.from:-((ordinal+1)*128+/** @type {number} */(lowPoint)+1),a),
    to=vertex(i===points.length-1?edge.to:-((ordinal+1)*128+i+1),b);
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
    const piece=chain?.pieces.find(p=>p.low===lowPoint&&p.high===highPoint);
    if(piece){
     const pixels=piece.route,route=pixels.map(p=>({x:p.x*sx,y:p.y*sy}));nativeRoutes.set(edgeId,pixels);
     parts.push({id:memberId,type:'line',box:{x:from.point.x*sx,y:from.point.y*sy,w:(to.point.x-from.point.x)*sx,h:(to.point.y-from.point.y)*sy},
      style:{...common,...piece.connector,...(piece.gradient?{strokeGradient:sourceRouteGradientInFrame(piece.gradient,piece.connector.connectorFrame)}:{})},
      source:{...source,nativeComponentRole:'relationship',role:'relationship',connector:true,connectorCornerMode:'reroutable-elbow',nativeConnectorRoute:true,nativeRoutePoints:route,...attachment}});
     if(parts.length>Math.max(32,relations.length*20)||graph.nodes.length>128||graph.edges.length>128)throw new TypeError('Scene shared complete parts are invalid');
     continue;
    }
    const solved=native?.connectors[ordinal];
    if(native&&solved){
     const pixels=/** @type {{x:number,y:number}[]} */(native.routes[ordinal]);nativeRoutes.set(edgeId,pixels);
     const route=pixels.map(p=>({x:p.x*sx,y:p.y*sy}));
     const rounded=roundedSourceRoute({measured:edge.points.map(p=>{if(!p)throw new TypeError('Scene shared source point is invalid');return {x:p.x+fit.window.x,y:p.y+fit.window.y};}),route:pixels,sx,sy,mode});
     const drawing=rounded?[{x:rounded.box.x/sx,y:rounded.box.y/sy},{x:(rounded.box.x+rounded.box.w)/sx,y:(rounded.box.y+rounded.box.h)/sy}]
      :nativeElbowVertices(solved).map(p=>({x:p.x/sx,y:p.y/sy}));
     const gradient=nativeSourceRouteGradient(edge.path,edge.paint.stops&&edge.paint.positions?{stops:edge.paint.stops,positions:edge.paint.positions,...(edge.paint.spatial?{spatial:edge.paint.spatial}: {})}:undefined,
      drawing.map(p=>({x:p.x-fit.window.x,y:p.y-fit.window.y})));
     parts.push({id:memberId,type:rounded?'freeform':'line',box:rounded?.box??{x:from.point.x*sx,y:from.point.y*sy,w:(to.point.x-from.point.x)*sx,h:(to.point.y-from.point.y)*sy},
      style:rounded?{...common,...rounded.style,...(gradient?{strokeGradient:gradient}:{})}:{...common,...solved,...(gradient?{strokeGradient:sourceRouteGradientInFrame(gradient,solved.connectorFrame)}:{})},
      source:{...source,nativeComponentRole:'relationship',role:'relationship',connector:true,connectorCornerMode:rounded?'rounded-freeform':'reroutable-elbow',nativeConnectorRoute:!rounded,nativeRoutePoints:route,...attachment}});
     continue;
    }
    if(polyline){
     const curve=curves?.get(ordinal);
     const pixels=[from.point,...points.slice(1,-1).map(p=>({x:p.x+fit.window.x,y:p.y+fit.window.y})),to.point];
     const drawing=curve??sourceRoutePolyline({points:pixels,sx,sy});
     const bounds=drawing?[{x:drawing.box.x/sx-fit.window.x,y:drawing.box.y/sy-fit.window.y},
      {x:(drawing.box.x+drawing.box.w)/sx-fit.window.x,y:(drawing.box.y+drawing.box.h)/sy-fit.window.y}]:undefined;
     const gradient=nativeSourceRouteGradient(edge.path,edge.paint.stops&&edge.paint.positions?
      {stops:edge.paint.stops,positions:edge.paint.positions,...(edge.paint.spatial?{spatial:edge.paint.spatial}:{})}:undefined,bounds);
     if(!drawing||edge.paint.stops&&!gradient)throw new TypeError('Scene shared complete parts are invalid');
     nativeRoutes.set(edgeId,curve?.route??pixels);
     parts.push({id:memberId,type:'freeform',box:drawing.box,
      style:{...common,...drawing.style,...(gradient?{strokeGradient:gradient}:{})},
      source:{...source,nativeComponentRole:'relationship',role:'relationship',connector:true,connectorCornerMode:mode,
       nativePathGeometry:curve?'source-cubic-v1':'source-polyline-v1',nativeConnectorRoute:false,nativeRoutePoints:curve?.tangents??drawing.route,...attachment}});
     continue;
    }
    const positions=edge.paint.positions,stops=edge.paint.stops;
     const pLow=positions?.[low]??NaN,pHigh=positions?.[high]??NaN;
    parts.push({id:memberId,type:'line',box:{x:from.point.x*sx,y:from.point.y*sy,w:(to.point.x-from.point.x)*sx,h:(to.point.y-from.point.y)*sy},
     style:{...common,
      ...(positions&&stops?{strokeGradient:sourceRouteSegmentGradient(stops,pLow,pHigh,Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)}:{})},
     source:{...source,nativeComponentRole:'relationship',role:'relationship',...attachment}});
  }
 }
 const used=new Set(),pathPoints=new Map(),sourcePaths=new Map();
 const bindingVertices=[...vertices.values()].map(v=>({id:v.row.id,endpointId:v.row.endpointId,arrow:v.node?.arrow===true,point:v.point}));
 if(useChains)assertNativeRouteTopology({vertices:bindingVertices,edges:graph.edges.map(e=>({from:e.from,to:e.to,points:nativeRoutes.get(e.id)})),work:bindingWork});
 const choiceContext=createSourceRouteCatalog({fit,image,sourceHash:input.sourceHash,relations,work:bindingWork});
 const {bindings,unbound,reprojectedChoices}=bindSharedSourceRelations({relations,graph,vertices:bindingVertices,segments:sourceSegments,window:fit.window,work:bindingWork,routes:nativeRoutes,choiceContext,allowUnboundRelations:input.allowUnboundRelations===true,previousCatalogs});
 for(const [relationId,{refs,points,samples}]of bindings){
  for(const ref of refs)used.add(ref.id);
  graph.paths.push({relationId,edges:refs});pathPoints.set(relationId,points);sourcePaths.set(relationId,samples);
 }
  const maxParts=Math.max(32,relations.length*20);
 if(parts.length>maxParts||graph.nodes.length>128||graph.edges.length>128||!fit.cycleCount&&used.size!==graph.edges.length)throw new TypeError('Scene shared complete parts are invalid');
 const context={fit,image,parts,slideSize,graph,sourceSegments,sx,sy,work:bindingWork};
 const complete=input.wholeRelations?output.captureWhole({...context,sourcePaths,prepareNativeGeometry:mode==='reroutable-elbow'||input.prepareNativeGeometry===true}):undefined;
 if(!complete)output.capture(context);
 return {parts:complete?.parts??parts,graph:complete?.graph??graph,pathPoints,sourcePaths,unbound,catalog:choiceContext.catalog,reprojectedChoices,
  wholeRelations:complete?.relations,unusedPhysicalEdges:complete?.unusedPhysicalEdges};
}
module.exports={compileSharedSourceRoute,measuredSharedSceneRoutePaintGroups:output.read,measuredSharedSceneRouteResidualPaintGroups:output.readResidual,
 sealMeasuredSharedRouteGroups:output.seal,sealSourceNativeNetworks:output.sealNative,readSourceNativeNetworks:output.readNative,readSourceNativeFilledRoutes:output.readNativeFilled};
