// @ts-check
'use strict';
const {record}=require('../scene-plan/source-scene-group-containment');
const {contractWholeRouteNetwork}=require('./whole-route-network-contract');
const {createNativeRouteGeometry}=require('./source-route-native-elbow');
const {assertNativeRouteTopology}=require('./source-route-native-topology');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** Drop only duplicate and forward-collinear vertices, never backtracking.
 * @param {Point[]} points */
function cleanRoute(points){
 /** @type {Point[]} */const out=[];
 for(const p of points){const last=out.at(-1);if(!last||Math.hypot(p.x-last.x,p.y-last.y)>1e-6)out.push({...p});}
 for(let i=1;i<out.length-1;){const a=out[i-1],b=out[i],c=out[i+1];if(!a||!b||!c)throw new TypeError('Whole route network state is invalid');
  if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<1e-6&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0)out.splice(i,1);else i++;}
 return out;
}
/** Fit the ENTIRE physical network before joining logical relations.
 * Explicit semantic approximation affects output geometry only. It cannot
 * grant source ownership, erasure, pixel equivalence or Office interaction.
 * Unsupported topology/preset capacity returns null, never partial success.
 * @param {unknown} input */
function fitWholeRouteNativeNetwork(input){
 if(!record(input)||input.approximation!=='semantic-native'||!sharedOutputWork(input.work))throw new TypeError('Whole route network controls are invalid');
 const {work}=input;
 /** @param {number} n */const charge=n=>{if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 const network=contractWholeRouteNetwork(input);if(!network)return null;
 const {nodes,chains,logical}=network,geometry=createNativeRouteGeometry(work),index=new Map(nodes.map((n,i)=>[n.id,i]));
 /** @param {string} id */const number=id=>{const i=index.get(id);if(i===undefined)throw new TypeError('Whole route network state is invalid');return i;};
 const original=new Map(nodes.map(n=>{const p=network.joints.get(n.id);if(!p)throw new TypeError('Whole route network state is invalid');return [number(n.id),p];}));
 const fixed=new Set(nodes.filter(n=>n.endpointId!==null).map(n=>number(n.id)));
 // Path endpoints must also stay put even for graphs without external labels.
 for(const path of logical){const first=path.chains[0],last=path.chains.at(-1),a=first&&chains[first.index],b=last&&chains[last.index];
  if(!first||!last||!a||!b)throw new TypeError('Whole route network state is invalid');
  fixed.add(number(first.reversed?a.to:a.from));fixed.add(number(last.reversed?b.from:b.to));}
 const initial=geometry.orthogonalSourceTree({joints:original,fixed,edges:chains.map(c=>({...c,from:number(c.from),to:number(c.to)}))});
 const states=[initial.joints];
 if(initial.routes.some(r=>!r))for(const [i,c]of chains.entries())if(!initial.routes[i]){
  for(const [a,b]of [[number(c.from),number(c.to)],[number(c.to),number(c.from)]]){
   if(a===undefined||b===undefined||fixed.has(a))continue;
   for(const axis of /** @type {const} */(['x','y'])){charge(nodes.length*4);const next=new Map([...initial.joints].map(([id,p])=>[id,{...p}]));
    const p=next.get(a),q=next.get(b);if(!p||!q)throw new TypeError('Whole route network state is invalid');p[axis]=q[axis];states.push(next);}
  }
 }
 /** @param {Point[][]} routes */const join=routes=>logical.map(path=>{
  /** @type {Point[]} */const points=[];
  for(const ref of path.chains){const r=routes[ref.index];if(!r)throw new TypeError('Whole route network state is invalid');charge(r.length);
   const own=ref.reversed?r.slice().reverse():r,a=points.at(-1),b=own[0];if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)>1e-6)throw new TypeError('Whole route network state is invalid');
   points.push(...(points.length?own.slice(1):own));}
  return cleanRoute(points);
 });
 let attempts=0;
 for(const joints of states){
  const options=chains.map((c,i)=>{
   const a=joints.get(number(c.from)),b=joints.get(number(c.to));if(!a||!b)throw new TypeError('Whole route network state is invalid');
   const prior=initial.routes[i];/** @type {Point[][]} */const candidates=[];
   if(prior){const p=prior.map(q=>({...q})),s=prior[0],e=prior.at(-1),second=prior[1],penultimate=prior.at(-2);
    if(!s||!e||!second||!penultimate)throw new TypeError('Whole route network state is invalid');p[0]={...a};p[p.length-1]={...b};
    if(p.length>2){const q=p[1],r=p.at(-2);if(!q||!r)throw new TypeError('Whole route network state is invalid');
     if(Math.abs(s.x-second.x)<1e-6)q.x=a.x;else q.y=a.y;if(Math.abs(e.x-penultimate.x)<1e-6)r.x=b.x;else r.y=b.y;}
    candidates.push(cleanRoute(p));}
   candidates.push(cleanRoute([a,b]),cleanRoute([a,{x:a.x,y:b.y},b]),cleanRoute([a,{x:b.x,y:a.y},b]));
   const local=[number(c.from),number(c.to)].map(id=>{const at=joints.get(id),before=original.get(id);if(!at||!before)throw new TypeError('Whole route network state is invalid');
    return {at,radius:Math.hypot(at.x-before.x,at.y-before.y)};}).filter(j=>j.radius>0);
   const seen=new Set();return candidates.filter(p=>{charge(p.length*4);const key=JSON.stringify(p);if(seen.has(key))return false;seen.add(key);
    if(p.length<2||!p.slice(1).every((q,j)=>{const prev=p[j];return prev&&Math.min(Math.abs(q.x-prev.x),Math.abs(q.y-prev.y))<1e-6;}))return false;
    if(geometry.faithfulSourceRoute(c.points,p,c.widthPx,local))return true;
    if(prior)return false;
    // Output-only fallback uses the existing incident-scale movement bound.
    // Failed strict fitting remains failed; no source receipt is manufactured.
    const margin=Math.max(16,c.widthPx*5),xs=c.points.map(q=>q.x),ys=c.points.map(q=>q.y);
    return local.every(j=>j.radius<=margin)&&p.every(q=>q.x>=Math.min(...xs)-margin&&q.x<=Math.max(...xs)+margin
     &&q.y>=Math.min(...ys)-margin&&q.y<=Math.max(...ys)+margin);
   });
  });
  if(options.some(o=>!o.length))continue;
  /** @type {Point[][]} */const trial=[];
  /** @returns {Point[][]|null} */const visit=(/** @type {number} */i)=>{
   if(++attempts>512)return null;charge(1);
   if(i===chains.length){
    try{assertNativeRouteTopology({vertices:nodes.map(n=>({id:n.id,point:joints.get(number(n.id))})),
     edges:chains.map((c,j)=>({from:c.from,to:c.to,points:trial[j]})),work});}
    catch(error){if(error instanceof TypeError&&error.message==='Native route topology is invalid')return null;throw error;}
    if(join(trial).some(p=>!geometry.nativeElbowConnector(p)))return null;
    // Unused arms must be representable too, not just selected relations.
    const selected=new Set(logical.flatMap(p=>p.chains.map(r=>r.index)));
    if(trial.some((p,j)=>!selected.has(j)&&!geometry.nativeElbowConnector(cleanRoute(p))))return null;
    return trial.map(p=>p.map(q=>({...q})));
   }
   for(const p of options[i]??[]){trial[i]=p;const found=visit(i+1);if(found)return found;if(attempts>512)return null;}return null;
  };
  const routes=visit(0);if(!routes){if(attempts>512)return null;continue;}
  const paths=join(routes).map((points,i)=>{const connector=geometry.nativeElbowConnector(points),path=logical[i];
   if(!connector||!path)throw new TypeError('Whole route network state is invalid');const actual=geometry.nativeElbowVertices(connector);
   const a=points[0],b=points.at(-1),s=actual[0],e=actual.at(-1);if(!a||!b||!s||!e||Math.hypot(a.x-s.x,a.y-s.y)>1e-6||Math.hypot(b.x-e.x,b.y-e.y)>1e-6)
    throw new TypeError('Whole route network endpoints are invalid');
   return {relationId:path.relationId,chains:path.chains,points:actual,connector};});
  return {paths,chains:chains.map((c,i)=>({...c,points:routes[i]})),nodes:nodes.map(n=>({...n,point:joints.get(number(n.id))})),
   cycleRank:network.cycleRank,physicalEdgeCount:network.physicalEdgeCount,attempts,idealTopologyVerified:true,
   approximation:'network-constrained-standard-office',sourceFootprintVerified:false,fullActualTopologyVerified:false,nodeFollowingVerified:false};
 }
 return null;
}
module.exports={fitWholeRouteNativeNetwork};
