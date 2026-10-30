// @ts-check
'use strict';
const {types}=require('node:util');
const {record}=require('../scene-plan/source-scene-group-containment');
const {wholeRouteCurves}=require('./source-whole-route-geometry');
const {sharedOutputWork,sharedOutputRecord,sharedOutputList,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @param {Point[]} points */
function canonical(points){
 /** @type {Point[]} */const out=[];
 for(const p of points){const last=out.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>1e-6)out.push(p);}
 for(let i=1;i<out.length-1;){const a=out[i-1],b=out[i],c=out[i+1];if(!a||!b||!c)throw new TypeError('Native network paths are invalid');
  if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<1e-6&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0)out.splice(i,1);else i++;}
 return out;
}
/** Compare each emitted preset with its independently assembled ordered chain
 * path. Counts/cycles alone cannot detect switched sides. The only tolerance
 * is derived from Office's integer adjustment and EMU frame quantization;
 * this is NOT a source-pixel tolerance, erasure grant or Office behaviour test.
 * @param {unknown} input */
function inspectWholeRouteNetworkPaths(input){
 const invalid=()=>new TypeError('Native network paths are invalid');
 if(!record(input)||!sharedOutputWork(input.work))throw invalid();const {work}=input;
 /** @param {number} n */const charge=n=>{if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @param {unknown} v @returns {Record<string,unknown>} */const obj=v=>{if(!sharedOutputRecord(v,work)){charge(0);throw invalid();}return v;};
 /** @param {unknown} v @param {number} min @param {number} max @returns {unknown[]} */const array=(v,min,max)=>{
  if(types.isProxy(v)||!Array.isArray(v)||v.length<min||v.length>max||!sharedOutputList(v,work)){charge(0);throw invalid();}return v;};
 /** @param {unknown} v @returns {Point} */const point=v=>{const p=obj(v);if(typeof p.x!=='number'||typeof p.y!=='number'
  ||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))throw invalid();return {x:p.x,y:p.y};};
 /** @param {unknown} v @returns {v is string} */const id=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(v);
 const network=obj(input.network),chains=array(network.chains,1,128).map(raw=>{const c=obj(raw);return array(c.points,2,6).map(point);});
 const seen=new Set(),used=new Set();
 const paths=array(network.paths,1,48).map(raw=>{const p=obj(raw);if(!id(p.relationId)||seen.has(p.relationId))throw invalid();seen.add(p.relationId);
  /** @type {Point[]} */const points=[];const own=new Set();
  for(const rawRef of array(p.chains,1,128)){const ref=obj(rawRef);if(typeof ref.index!=='number'||!Number.isSafeInteger(ref.index)||ref.index<0
    ||ref.index>=chains.length||typeof ref.reversed!=='boolean'||own.has(ref.index))throw invalid();
   const chain=chains[ref.index];if(!chain)throw invalid();used.add(ref.index);own.add(ref.index);charge(chain.length);
   const oriented=ref.reversed?chain.slice().reverse():chain,a=points.at(-1),b=oriented[0];
   if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)>1e-6)throw invalid();points.push(...(points.length?oriented.slice(1):oriented));}
  return {relationId:p.relationId,points:canonical(points)};});
 const members=array(input.relations,1,48).map(raw=>{const row=obj(raw);if(!id(row.relationId))throw invalid();return {relationId:row.relationId,part:obj(row.part)};});
 const arms=array(input.arms,0,128).map(raw=>{const row=obj(raw);if(typeof row.chainIndex!=='number'||!Number.isSafeInteger(row.chainIndex)
  ||row.chainIndex<0||row.chainIndex>=chains.length||typeof row.reversed!=='boolean')throw invalid();return {chainIndex:row.chainIndex,reversed:row.reversed,part:obj(row.part)};});
 if(members.length!==paths.length||new Set(members.map(p=>p.relationId)).size!==members.length||members.some(p=>!seen.has(p.relationId))
  ||arms.length!==chains.length-used.size||new Set(arms.map(a=>a.chainIndex)).size!==arms.length||arms.some(a=>used.has(a.chainIndex)))return null;
 /** @param {Record<string,unknown>} part @param {Point[]} expected */const match=(part,expected)=>{
  const style=obj(part.style),box=obj(part.box);if(part.type!=='line')return null;
  const curves=wholeRouteCurves(/** @type {import('./source-shared-route-output-paint').Item} */(part));
  if(curves.some(c=>c.length!==2))return null;
  const first=curves[0]?.[0];if(!first)throw invalid();const actual=canonical([first,...curves.map(c=>{const p=c.at(-1);if(!p)throw invalid();return p;})]);
  if(actual.length!==expected.length)return null;charge(actual.length*8);
  const frame=style.connectorFrame===undefined?box:obj(style.connectorFrame),adjustments=style.connectorAdjustments===undefined?[]:array(style.connectorAdjustments,0,3);
  if(adjustments.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>2000000))throw invalid();
  const w=frame.w,h=frame.h;if(typeof w!=='number'||typeof h!=='number'||!Number.isFinite(w)||!Number.isFinite(h))throw invalid();
  const scale=Math.max(Math.abs(w),Math.abs(h)),adjust=Math.max(1,.../** @type {number[]} */(adjustments).map(n=>Math.abs(n)/100000));
  const quantizationBoundPt=Math.SQRT2*scale/200000+(6+adjust*2)/12700+1e-6;
  const error=Math.max(...actual.map((p,i)=>{const q=expected[i];if(!q)throw invalid();return Math.hypot(p.x-q.x,p.y-q.y);}));
  return error<=quantizationBoundPt?{vertices:actual.length,maxPointErrorPt:error,quantizationBoundPt}:null;
 };
 const relations=paths.map(p=>{const member=members.find(m=>m.relationId===p.relationId);if(!member)throw invalid();return {relationId:p.relationId,match:match(member.part,p.points)};});
 const retainedArms=arms.map(a=>{const chain=chains[a.chainIndex];if(!chain)throw invalid();return {chainIndex:a.chainIndex,match:match(a.part,canonical(a.reversed?chain.slice().reverse():chain))};});
 if(relations.some(p=>!p.match)||retainedArms.some(a=>!a.match))return null;
 return {basis:'ordered-preset-path-correspondence-v1',relations,retainedArms,orderedPathsVerified:true,
  sourceFootprintVerified:false,fullActualTopologyVerified:false,nodeFollowingVerified:false};
}
module.exports={inspectWholeRouteNetworkPaths};
