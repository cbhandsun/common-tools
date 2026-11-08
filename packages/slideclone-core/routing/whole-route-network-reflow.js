// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {fitWholeRouteNativeNetwork}=require('./whole-route-network-fit');
const {createNativeRouteGeometry}=require('./source-route-native-elbow');
const {assertNativeRouteTopology}=require('./source-route-native-topology');
const {inspectWholeRouteNetworkPaths}=require('./whole-route-network-paths');
const {inspectWholeRouteNetworkTopology}=require('./whole-route-network-topology');
/** @typedef {{x:number,y:number}} Point */
const EPS=1e-6;
/** @param {Point[]} points */
function clean(points){
 /** @type {Point[]} */const out=[];
 for(const p of points){const q=out.at(-1);if(!q||Math.hypot(q.x-p.x,q.y-p.y)>EPS)out.push({...p});}
 for(let i=1;i<out.length-1;){const a=out[i-1],b=out[i],c=out[i+1];if(!a||!b||!c)throw new TypeError('Native network reflow is invalid');
  if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<EPS&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0)out.splice(i,1);else i++;}
 return out;
}
/** Explicit post-edit solve of the ENTIRE retained physical network.
 * Pins are resolved slide coordinates for graph terminals, not independently
 * quantized connector endpoints. Straight tracks share a coordinate variable;
 * a terminal edit updates every incident chain before joining whole relations.
 * Unsupported/crossing/over-capacity layouts return null without mutation.
 * This is geometry only: no source receipt, erasure, pixel or automatic Office
 * following claim. A host must explicitly invoke and apply the complete solve.
 * @param {unknown} input */
function reflowWholeRouteNativeNetwork(input){
 const invalid=()=>new TypeError('Native network reflow is invalid');
 if(!record(input)||!sharedOutputWork(input.work)||types.isProxy(input.endpointPins)||!Array.isArray(input.endpointPins)
  ||input.endpointPins.length<2||input.endpointPins.length>128||!list(input.endpointPins))throw invalid();
 const {work}=input;
 /** @param {number} n */const charge=n=>{if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @type {Map<string,Point>} */const pins=new Map();
 for(const raw of input.endpointPins){
  charge(8);if(!record(raw)||typeof raw.nodeId!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(raw.nodeId)||pins.has(raw.nodeId)||!record(raw.point))throw invalid();
  const {x,y}=raw.point;if(typeof x!=='number'||typeof y!=='number'||![x,y].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))throw invalid();
  pins.set(raw.nodeId,{x:x===0?0:x,y:y===0?0:y});
 }
 const network=fitWholeRouteNativeNetwork(input);if(!network)return null;
 const terminals=new Set(network.nodes.filter(n=>n.endpointId!==null).map(n=>n.id));
 for(const path of network.paths){const first=path.chains[0],last=path.chains.at(-1),a=first&&network.chains[first.index],b=last&&network.chains[last.index];
  if(!first||!last||!a||!b)throw invalid();terminals.add(first.reversed?a.to:a.from);terminals.add(last.reversed?b.from:b.to);}
 if(terminals.size!==pins.size||[...pins.keys()].some(id=>!terminals.has(id)))throw invalid();
 /** @type {Map<string,Point>} */const points=new Map();
 for(const n of network.nodes){if(!n.point)throw invalid();points.set(n.id,{...n.point});}
 const keys=network.chains.map((chain,i)=>{const own=chain.points;if(!own)throw invalid();return own.map((point,j)=>{
  charge(4);let id=j===0?chain.from:j===own.length-1?chain.to:`reflow-corner-${i}-${j}`;
  if(j>0&&j<own.length-1)while(points.has(id)){charge(1);id+='-';}
  const prior=points.get(id);if(prior&&Math.hypot(prior.x-point.x,prior.y-point.y)>EPS)throw invalid();
  if(!prior)points.set(id,{...point});return id;
 });});
 const deformed=new Map([...points].map(([id,p])=>[id,{...p}]));
 // A rigid terminal translation moves the entire retained skeleton, including
 // tracks without a terminal on their axis. Leaving those tracks at old slide
 // coordinates can collapse a valid cycle. Nonuniform edits keep the original
 // independent-track solve and all subsequent crossing/topology checks.
 /** @type {Point|undefined} */let translation;
 for(const [id,p]of pins){
  charge(4);const previous=points.get(id);if(!previous)throw invalid();
  const delta={x:p.x-previous.x,y:p.y-previous.y};
  if(translation&&(Math.abs(delta.x-translation.x)>EPS||Math.abs(delta.y-translation.y)>EPS)){translation=undefined;break;}
  translation=delta;
 }
 if(translation)for(const p of deformed.values()){
  charge(2);p.x+=translation.x;p.y+=translation.y;
  if(![p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))return null;
 }
 for(const axis of /** @type {const} */(['x','y'])){
  const roots=new Map([...points.keys()].map(id=>[id,id]));
  /** @param {string} id @returns {string} */const root=id=>{for(let i=0;i<=points.size;i++){charge(1);const next=roots.get(id);if(next===id)return id;if(!next)throw invalid();id=next;}throw invalid();};
  for(const chain of keys)for(let j=1;j<chain.length;j++){
   const a=chain[j-1],b=chain[j],p=a&&points.get(a),q=b&&points.get(b);if(!a||!b||!p||!q)throw invalid();
   if(Math.min(Math.abs(p.x-q.x),Math.abs(p.y-q.y))>EPS)return null;
   if(Math.abs(p[axis]-q[axis])<EPS)roots.set(root(a),root(b));
  }
  /** @type {Map<string,number>} */const fixed=new Map();
  for(const [id,p]of pins){const at=root(id),prior=fixed.get(at);if(prior!==undefined&&Math.abs(prior-p[axis])>EPS)return null;fixed.set(at,p[axis]);}
  for(const [id,p]of deformed){const value=fixed.get(root(id));if(value!==undefined)p[axis]=value;}
 }
 const chains=network.chains.map((chain,i)=>({...chain,points:(keys[i]??[]).map(id=>{const point=deformed.get(id);if(!point)throw invalid();return {...point};})}));
 try{assertNativeRouteTopology({vertices:network.nodes.map(n=>({id:n.id,point:deformed.get(n.id)})),edges:chains,work});}
 catch(error){if(error instanceof TypeError&&error.message==='Native route topology is invalid')return null;throw error;}
 const geometry=createNativeRouteGeometry(work);
 /** @param {Point[]} points */const drawing=points=>{
  const connector=geometry.nativeElbowConnector(clean(points));if(!connector)return null;
  const actual=geometry.nativeElbowVertices(connector),a=actual[0],b=actual.at(-1);if(!a||!b)throw invalid();
  return {connector,points:actual,part:{type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style:{...connector,fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round'}}};
 };
 const paths=[];
 for(const path of network.paths){/** @type {Point[]} */const joined=[];
  for(const ref of path.chains){const chain=chains[ref.index];if(!chain)throw invalid();charge(chain.points.length);joined.push(...(ref.reversed?chain.points.slice().reverse():chain.points));}
  const out=drawing(joined);if(!out)return null;
  out.part.style.strokeWidthPt=Math.max(...path.chains.map(ref=>{const chain=chains[ref.index];if(!chain)throw invalid();return chain.widthPx;}));
  paths.push({...path,...out});
 }
 const used=new Set(paths.flatMap(p=>p.chains.map(ref=>ref.index))),arms=[];
 for(const [chainIndex,chain]of chains.entries())if(!used.has(chainIndex)){
  const out=drawing(chain.points);if(!out)return null;out.part.style.strokeWidthPt=chain.widthPx;arms.push({chainIndex,reversed:false,...out});
 }
 const result={...network,chains,nodes:network.nodes.map(n=>({...n,point:deformed.get(n.id)})),paths};
 const correspondence=inspectWholeRouteNetworkPaths({network:result,relations:paths.map(p=>({relationId:p.relationId,part:p.part})),arms,work});if(!correspondence)return null;
 const sampledTopology=inspectWholeRouteNetworkTopology({parts:[...paths,...arms].map(p=>p.part),work});
 if(!sampledTopology||sampledTopology.connectedComponents!==1||sampledTopology.cycles!==network.cycleRank)return null;
 // Synthetic paint is private to the bounded diagnostic. Callers receive
 // geometry only and must preserve/reframe their actual stroke and gradient.
 return {...result,paths:paths.map(p=>({relationId:p.relationId,chains:p.chains,connector:p.connector,points:p.points})),
  arms:arms.map(a=>({chainIndex:a.chainIndex,reversed:a.reversed,connector:a.connector,points:a.points})),
  correspondence,sampledTopology,operation:'explicit-native-network-reflow',sourceOwnershipGranted:false,sourceFootprintVerified:false,
  fullActualTopologyVerified:false,nodeFollowingVerified:false,automaticOfficeFollowingVerified:false};
}
module.exports={reflowWholeRouteNativeNetwork};
