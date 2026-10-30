// @ts-check
'use strict';
const {joinWholeRouteGeometry}=require('./source-whole-route-geometry');
const {measureSourceSpatialPaint}=require('./source-route-spatial-paint');
const {nativeSourceRouteGradient,sourceRouteGradientInFrame}=require('./source-route-native-gradient');
const {sourceRaster}=require('../typography/residual-text-mask');
const {chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {fitWholeRoutePaint}=require('./source-whole-route-paint');
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
/** Assemble logical identities AFTER binding the complete measured network.
 * The old physical graph remains the footprint witness. Its shared edges are
 * rendered inside complete paths; unused arms survive as separate source paint.
 * This function is internal to the measured compiler, never an erasure API.
 * @param {Parameters<typeof import('./source-shared-output-footprint').assertSharedOutputFootprint>[0]&{
 * sourcePaths:Map<string,{x:number,y:number}[]>}} input */
function compileWholeSharedRoutes({fit,image,parts,graph,sourcePaths,sourceSegments,sx,sy,work}){
 const byId=new Map(parts.map(p=>[p.id,p])),used=new Set(),widths=new Map();
 /** @type {Item[]} */const whole=[];
 const rgba=sourceRaster(image).rgba;
 for(const path of graph.paths){
  if(!chargeSharedOutput(work,path.edges.length*32+parts.length))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
  const members=path.edges.map(ref=>{const edge=graph.edges.find(e=>e.id===ref.id),part=edge&&byId.get(edge.memberId);
   if(!edge||!part)throw new TypeError('Scene whole route member is invalid');used.add(edge.id);return {part,reversed:ref.reversed,edge};});
  const drawing=joinWholeRouteGeometry(members),samples=sourcePaths.get(path.relationId);
  if(!samples)throw new TypeError('Scene whole route samples are invalid');
  const coreSamples=members.flatMap((member,i)=>{
   const segment=sourceSegments.get(member.edge.id),original=segment&&fit.edges.find(e=>e.path===segment.path);
   if(!segment||!original||original.paintPath.length!==original.path.length)throw new TypeError('Scene whole route paint samples are invalid');
   const cells=original.paintPath.slice(segment.low,segment.high+1);if(member.reversed)cells.reverse();
   return (i?cells.slice(1):cells).map(p=>({x:p.x+fit.window.x,y:p.y+fit.window.y}));
  });
  if(coreSamples.length!==samples.length)throw new TypeError('Scene whole route paint samples are invalid');
  const colors=coreSamples.map(p=>[0,1,2].map(c=>rgba[(p.y*image.width+p.x)*4+c]??0));
  /** @param {number[]} rgb */const hex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
  const median=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
  if(!chargeSharedOutput(work,colors.length*4))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
  const solid=colors.filter(p=>p.every((v,c)=>Math.abs(v-(median[c]??0))<=18)).length/colors.length>=.9;
  const spatial=solid?undefined:measureSourceSpatialPaint(coreSamples,colors,work);
  // A source-space gradient need not ALSO fit a path-distance gradient.
  // The spatial solver already checks every original core cell at .9/18.
  const paint=solid?{color:hex(median)}:spatial?{color:hex(median),stops:'stops' in spatial?spatial.stops:[{position:0,color:hex(spatial.color)},{position:1,color:hex(spatial.color)}],
   positions:coreSamples.map(()=>0),spatial}:null;
  let gradient=paint?.stops&&paint.positions?nativeSourceRouteGradient(coreSamples,{stops:paint.stops,positions:paint.positions,...(paint.spatial?{spatial:paint.spatial}:{})},
   [{x:drawing.box.x/sx,y:drawing.box.y/sy},{x:(drawing.box.x+drawing.box.w)/sx,y:(drawing.box.y+drawing.box.h)/sy}]):undefined;
  const planar=!paint||paint.stops&&!gradient?fitWholeRoutePaint({points:coreSamples,colors,
   bounds:{x:drawing.box.x/sx,y:drawing.box.y/sy,w:drawing.box.w/sx,h:drawing.box.h/sy},work}):null;
  if(planar)gradient=planar.gradient;
  if(!paint&&!planar||paint?.stops&&!gradient)throw new TypeError('Scene whole route paint is invalid');
  const width=Math.max(...members.map(m=>Number(m.part.style?.strokeWidthPt)));
  if(!Number.isFinite(width)||width<=0||width>100)throw new TypeError('Scene whole route width is invalid');
  for(const member of members)widths.set(member.edge.id,Math.min(width,widths.get(member.edge.id)??Infinity));
  const first=members[0],last=members.at(-1);if(!first||!last)throw new TypeError('Scene whole route endpoints are invalid');
  const head=first.part.style??{},tail=last.part.style??{},start=first.reversed?'end':'start',end=last.reversed?'start':'end';
  const source={...first.part.source,sceneInventoryId:graph.id,sceneRelationId:path.relationId,
   sourceNodeIds:[head[start+'Anchor']&&/** @type {Record<string,unknown>} */(head[start+'Anchor']).elementId,
    tail[end+'Anchor']&&/** @type {Record<string,unknown>} */(tail[end+'Anchor']).elementId],
   sourceRouteParts:1,nativeConnectorRoute:drawing.type==='line',nativeRoutePoints:drawing.points};
  const frame='connectorFrame' in drawing.style?drawing.style.connectorFrame:undefined;
  whole.push({id:'scene-'+path.relationId,type:drawing.type,box:drawing.box,source,
   style:{fill:'none',stroke:planar?.color??paint?.color,strokeWidthPt:width,lineCap:'round',...drawing.style,
    ...(gradient?{strokeGradient:frame?sourceRouteGradientInFrame(gradient,frame):gradient}:{}),
    startAnchor:head[start+'Anchor'],endAnchor:tail[end+'Anchor'],
    ...Object.fromEntries(['Arrow','ArrowWidth','ArrowLength'].flatMap(key=>[
     ...(head[start+key]!==undefined?[[`start${key}`,head[start+key]]]:[]),
     ...(tail[end+key]!==undefined?[[`end${key}`,tail[end+key]]]:[])]))}});
 }
 const unused=graph.edges.filter(e=>!used.has(e.id)),retained=new Set(unused.map(e=>e.memberId));
 for(const edge of unused)for(const id of [edge.from,edge.to]){const node=graph.nodes.find(n=>n.id===id);if(node?.endpointId===null)retained.add(node.nativeId);}
 for(const part of parts)if(retained.has(/** @type {string} */(part.id))){
  const source={...part.source};
  if(part.type!=='rect'){source.role='source-network-arm';source.nativeComponentRole='source-network-arm';}
  whole.push({...part,source});
 }
 // Exact command concatenation preserves every physical curve. Use the
 // minimum REAL whole-path stroke covering an edge for conservative coverage.
 // These witnesses are local objects; no JSON field can submit alternatives.
 const footprintParts=parts.map(part=>{const edge=graph.edges.find(e=>e.memberId===part.id),width=edge&&widths.get(edge.id);
  return width===undefined?part:{...part,style:{...part.style,strokeWidthPt:width}};});
 return {parts:whole,footprintParts,graph:{...graph,rendering:/** @type {const} */('whole-native-paths-v1'),
  renderedPaths:graph.paths.map(p=>({relationId:p.relationId,memberId:'scene-'+p.relationId}))},
  relations:new Map(graph.paths.map(p=>[p.relationId,['scene-'+p.relationId]])),
  unusedPhysicalEdges:unused.map(e=>e.id)};
}
module.exports={compileWholeSharedRoutes};
