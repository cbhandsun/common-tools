// @ts-check
'use strict';
/** Represent one measured route as ONE native Office elbow connector.
 *
 * Source routes are traced as dense polylines; rounded or antialiased corners
 * become several short diagonal parts. When the route is orthogonal up to
 * those corners, Office's own bentConnector presets express it as a single
 * connector that keeps its endpoint attachments and re-routes when either
 * node moves. This module is pure geometry: it never grants source proof.
 * Callers keep their segmented output whenever `null` is returned.
 */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{axis:'h'|'v',coord:number,len:number,lo:number,hi:number}} Run */

const AXIS_SLOPE=Math.tan(22*Math.PI/180);

/** @param {Point} a @param {Point} b @param {Point} p */
function segmentDistance(a,b,p){
 const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
 const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
 return Math.hypot(a.x+t*dx-p.x,a.y+t*dy-p.y);
}
/** @param {Point[]} line @param {Point} p */
function polylineDistance(line,p){let best=Infinity;for(let i=1;i<line.length;i++)best=Math.min(best,segmentDistance(/** @type {Point} */(line[i-1]),/** @type {Point} */(line[i]),p));return best;}
/** Dense samples (≤1 unit apart) along a polyline, bounded.
 * @param {Point[]} line */
function samples(line){
 /** @type {Point[]} */const out=[];
 for(let i=1;i<line.length;i++){
  const a=/** @type {Point} */(line[i-1]),b=/** @type {Point} */(line[i]),n=Math.min(4096,Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y))));
  for(let k=i===1?0:1;k<=n;k++)out.push({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n});
 }
 return out;
}
/** @param {unknown} p @returns {p is Point} */
const finitePoint=p=>!!p&&typeof p==='object'&&Number.isFinite(/** @type {Point} */(p).x)&&Number.isFinite(/** @type {Point} */(p).y);

/** @typedef {{axis:'h'|'v',coord:number,len:number}} Leg */
/** @param {number} widthPx */
function tolerances(widthPx){
 const width=Number.isFinite(widthPx)&&widthPx>0?widthPx:2;
 return {width,mergeTol:Math.max(2,width*.75),snapTol:Math.max(3,width*1.25),minRun:Math.max(2.5,width),fit:Math.max(3,width*1.25)};
}
/** @param {Run[]} runs @param {Run} run @param {number} mergeTol */
function mergeRun(runs,run,mergeTol){
 const last=runs[runs.length-1];
 if(last&&last.axis===run.axis&&Math.abs(last.coord-run.coord)<=mergeTol){
  last.coord=(last.coord*last.len+run.coord*run.len)/(last.len+run.len);last.len+=run.len;last.lo=Math.min(last.lo,run.lo);last.hi=Math.max(last.hi,run.hi);
 }else runs.push({...run});
}
/** Axis legs of a measured polyline, ignoring rounded/antialiased corner parts
 * and its two attachment points. Parallel offset legs are joined by a jog.
 * @param {Point[]} points @param {number} widthPx @returns {Leg[]|null} */
function sourceRouteLegs(points,widthPx){
 if(!Array.isArray(points)||points.length<2||points.length>4096||!points.every(finitePoint))return null;
 const {mergeTol,minRun}=tolerances(widthPx);
 /** @type {Run[]} */const raw=[];
 for(let i=1;i<points.length;i++){
  const a=/** @type {Point} */(points[i-1]),b=/** @type {Point} */(points[i]),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<1e-9)continue;
  /** @type {'h'|'v'|null} */const axis=Math.abs(dy)<=AXIS_SLOPE*Math.abs(dx)?'h':Math.abs(dx)<=AXIS_SLOPE*Math.abs(dy)?'v':null;
  if(!axis)continue;
  mergeRun(raw,{axis,coord:axis==='h'?(a.y+b.y)/2:(a.x+b.x)/2,len,lo:axis==='h'?Math.min(a.x,b.x):Math.min(a.y,b.y),hi:axis==='h'?Math.max(a.x,b.x):Math.max(a.y,b.y)},mergeTol);
 }
 /** @type {Run[]} */const runs=[];
 for(const run of raw)if(run.len>=minRun)mergeRun(runs,run,mergeTol);
 /** @type {Leg[]} */const legs=[];
 for(const [i,run]of runs.entries()){
  const prev=runs[i-1];
  if(prev&&prev.axis===run.axis){
   const at=prev.hi<=run.lo?(prev.hi+run.lo)/2:run.hi<=prev.lo?(run.hi+prev.lo)/2:NaN;
   if(!Number.isFinite(at))return null;// overlapping parallel runs are not one route
    legs.push({axis:run.axis==='h'?'v':'h',coord:at,len:Math.abs(run.coord-prev.coord)});
   }
   legs.push({axis:run.axis,coord:run.coord,len:run.len});
 }
 return legs;
}
/** Vertices of an orthogonal route through fixed ends.
 * @param {Leg[]} input @param {Point} start @param {Point} end @param {number} widthPx @param {number} maxLegs @returns {Point[]|null} */
function routeThrough(input,start,end,widthPx,maxLegs){
 const {snapTol}=tolerances(widthPx),legs=input.map(l=>({...l}));
 if(!legs.length){
  if(Math.abs(start.y-end.y)<=snapTol||Math.abs(start.x-end.x)<=snapTol)return [{...start},{...end}];
  return null;
 }
 /** @param {'start'|'end'} which */
 const attach=which=>{
  const p=which==='start'?start:end,leg=/** @type {Leg} */(which==='start'?legs[0]:legs[legs.length-1]);
  const perp=leg.axis==='h'?p.y:p.x;
  if(Math.abs(perp-leg.coord)<=snapTol){leg.coord=perp;return;}
  const extra={axis:/** @type {'h'|'v'} */(leg.axis==='h'?'v':'h'),coord:leg.axis==='h'?p.x:p.y,len:Math.abs(perp-leg.coord)};
  if(which==='start')legs.unshift(extra);else legs.push(extra);
 };
 if(legs.length===1){
  // One straight leg: both ends must sit on it within the snap tolerance.
  const leg=/** @type {Leg} */(legs[0]),a=leg.axis==='h'?start.y:start.x,b=leg.axis==='h'?end.y:end.x;
  if(Math.abs(a-leg.coord)<=snapTol&&Math.abs(b-leg.coord)<=snapTol)return [{...start},{...end}];
 }
 attach('start');attach('end');
 if(legs.length>maxLegs)return null;
 /** @type {Point[]} */const out=[{...start}];
 for(let i=1;i<legs.length;i++){
  const a=/** @type {Leg} */(legs[i-1]),b=/** @type {Leg} */(legs[i]);
  if(a.axis===b.axis)return null;
  out.push(a.axis==='v'?{x:a.coord,y:b.coord}:{x:b.coord,y:a.coord});
 }
 out.push({...end});
 // A junction stub can collapse onto its moved junction: drop zero legs, then
 // the corners they leave between collinear legs.
 /** @type {Point[]} */const clean=[];
 for(const p of out){const last=clean[clean.length-1];if(!last||Math.hypot(p.x-last.x,p.y-last.y)>=.5)clean.push(p);else if(p===out[out.length-1])clean[clean.length-1]=p;}
 for(let i=1;i<clean.length-1;){
  const a=/** @type {Point} */(clean[i-1]),b=/** @type {Point} */(clean[i]),c=/** @type {Point} */(clean[i+1]);
  if(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<1e-6)clean.splice(i,1);else i++;
 }
 if(clean.length<2||clean.length-1>maxLegs)return null;
 for(let i=1;i<clean.length-1;i++){const a=/** @type {Point} */(clean[i-1]),b=/** @type {Point} */(clean[i]),c=/** @type {Point} */(clean[i+1]);
  if(!(Math.abs(a.x-b.x)<1e-6&&Math.abs(b.y-c.y)<1e-6||Math.abs(a.y-b.y)<1e-6&&Math.abs(b.x-c.x)<1e-6))return null;}
 return clean;
}
/** Two-way fidelity between the measured polyline and the orthogonal route.
 * Away from corners the legs must lie on the measured stroke. A rounded corner
 * of radius r lies at most r(1-1/sqrt2)~0.29r off its legs; r is bounded by the shorter
 * adjacent leg. A regularized junction may absorb only its own displacement.
 * @param {Point[]} points @param {Point[]} out @param {number} widthPx
 * @param {{at:Point,radius:number}[]} junctions */
function faithful(points,out,widthPx,junctions){
 const {fit}=tolerances(widthPx);
 const corners=out.slice(1,-1).map((c,i)=>{
  const a=/** @type {Point} */(out[i]),b=/** @type {Point} */(out[i+2]);
  const radius=Math.min(32,Math.hypot(c.x-a.x,c.y-a.y),Math.hypot(c.x-b.x,c.y-b.y));
  return {c,reach:radius*1.05+fit,allow:Math.max(fit,radius*.32)};
 });
 /** @param {Point} p @param {number} d */
 const explained=(p,d)=>d<=fit||corners.some(k=>Math.hypot(k.c.x-p.x,k.c.y-p.y)<=k.reach&&d<=k.allow)
  ||junctions.some(j=>Math.hypot(j.at.x-p.x,j.at.y-p.y)<=j.radius+fit);
 for(const p of samples(points)){const d=polylineDistance(out,p);if(!explained(p,d)){return false;}}
 for(const p of samples(out)){const d=polylineDistance(points,p);if(!explained(p,d)){return false;}}
 return true;
}
/** Snap ONE measured polyline to the fewest alternating H/V legs. The first and
 * last vertices stay where the caller attached them.
 * @param {Point[]} points route vertices in source pixels
 * @param {{widthPx:number,maxLegs?:number}} options
 * @returns {Point[]|null} orthogonal vertices, or null when not representable */
function orthogonalSourceRoute(points,options){
 const legs=sourceRouteLegs(points,options?.widthPx);if(!legs)return null;
 const start=/** @type {Point} */(points[0]),end=/** @type {Point} */(points[points.length-1]);
 const out=routeThrough(legs,start,end,options.widthPx,Math.min(5,Math.max(1,options?.maxLegs??5)));
 return out&&faithful(points,out,options.widthPx,[])?out:null;
}
/** Regularize a measured route TREE. Skeleton junctions sit inside the fillet
 * of a T, a few pixels off both strokes; each free junction moves to the
 * intersection of its incident legs (bounded by the stroke scale) so every
 * edge can leave it on an axis. Terminals never move.
 * @param {{joints:Map<number,Point>,fixed:Set<number>,edges:{from:number,to:number,points:Point[],widthPx:number}[],maxLegs?:number}} tree
 * @returns {{joints:Map<number,Point>,routes:(Point[]|null)[]}} */
function orthogonalSourceTree(tree){
 const legs=tree.edges.map(e=>sourceRouteLegs(e.points,e.widthPx));
 const joints=new Map(tree.joints);
 /** @type {{at:Point,radius:number}[]} */const moved=[];
 for(const [id,point]of tree.joints){
  if(tree.fixed.has(id))continue;
  /** @type {number[]} */const xs=[],ys=[];let width=2;
  for(const [i,edge]of tree.edges.entries()){
   const own=legs[i];if(!own?.length)continue;
   width=Math.max(width,edge.widthPx);
   const ends=[edge.from===id?[own[0],own[1]]:null,edge.to===id?[own[own.length-1],own[own.length-2]]:null];
   for(const pair of ends){
    if(!pair)continue;const [leg,next]=pair;if(!leg)continue;
    (leg.axis==='v'?xs:ys).push(leg.coord);
    // A skeleton junction drops into the fillet with a short stub; the leg
    // behind the stub is the real stroke the junction belongs on.
    if(next&&leg.len<=Math.max(8,edge.widthPx*3)*2)(next.axis==='v'?xs:ys).push(next.coord);
   }
  }
  const {mergeTol}=tolerances(width),reach=Math.max(16,width*5);
  /** @param {number[]} values @param {number} fallback */
  const agree=(values,fallback)=>values.length&&Math.max(...values)-Math.min(...values)<=mergeTol*2?values.reduce((a,b)=>a+b,0)/values.length:fallback;
  const next={x:agree(xs,point.x),y:agree(ys,point.y)},shift=Math.hypot(next.x-point.x,next.y-point.y);
  if(shift<=reach){joints.set(id,next);if(shift>0)moved.push({at:next,radius:shift});}
 }
 const routes=tree.edges.map((edge,i)=>{
  const own=legs[i],start=joints.get(edge.from),end=joints.get(edge.to);
  if(!own||!start||!end)return null;
  const out=routeThrough(own,start,end,edge.widthPx,Math.min(5,Math.max(1,tree.maxLegs??5)));
  return out&&faithful(edge.points,out,edge.widthPx,moved)?out:null;
 });
 return {joints,routes};
}
/** Local vertices of bentConnectorN in its unrotated, unflipped frame.
 * @param {number} legs @param {number} w @param {number} h @param {number[]} adj */
function presetVertices(legs,w,h,adj){
 const a=adj.map(v=>v/100000);
 if(legs===3)return [{x:0,y:0},{x:a[0]*w,y:0},{x:a[0]*w,y:h},{x:w,y:h}];
 if(legs===4)return [{x:0,y:0},{x:a[0]*w,y:0},{x:a[0]*w,y:a[1]*h},{x:w,y:a[1]*h},{x:w,y:h}];
 return [{x:0,y:0},{x:a[0]*w,y:0},{x:a[0]*w,y:a[1]*h},{x:a[2]*w,y:a[1]*h},{x:a[2]*w,y:h},{x:w,y:h}];
}

/** Solve the Office connector frame for an orthogonal route (slide points).
 * OOXML applies flips in the local frame, then rotates clockwise about the
 * frame centre. 90/270° frames swap the width and height.
 * @param {Point[]} route orthogonal vertices in slide points (2..6 vertices)
 * @returns {{connectorType?:string,connectorFrame:{x:number,y:number,w:number,h:number,rotationDeg:number,flipH:boolean,flipV:boolean},connectorAdjustments?:number[]}|null} */
function nativeElbowConnector(route){
 if(!Array.isArray(route)||route.length<2||route.length>6||!route.every(finitePoint))return null;
 const S=/** @type {Point} */(route[0]),E=/** @type {Point} */(route[route.length-1]),n=route.length-1;
 const c={x:(S.x+E.x)/2,y:(S.y+E.y)/2};
 if(n===1){
  return {connectorFrame:{x:Math.min(S.x,E.x),y:Math.min(S.y,E.y),w:Math.abs(E.x-S.x),h:Math.abs(E.y-S.y),rotationDeg:0,flipH:S.x>E.x,flipV:S.y>E.y}};
 }
 const presetLegs=n===2?3:n;
 const eps=Math.max(1e-3,1e-6*Math.max(Math.abs(E.x-S.x),Math.abs(E.y-S.y)));
 for(const rot of [0,90,180,270])for(const flipH of [false,true])for(const flipV of [false,true]){
  const swap=rot===90||rot===270,w=swap?Math.abs(E.y-S.y):Math.abs(E.x-S.x),h=swap?Math.abs(E.x-S.x):Math.abs(E.y-S.y);
  if(w<.05||h<.05)continue;
  const off={x:c.x-w/2,y:c.y-h/2},t=-rot*Math.PI/180,cos=Math.round(Math.cos(t)),sin=Math.round(Math.sin(t));
  const local=route.map(p=>{const dx=p.x-c.x,dy=p.y-c.y,q={x:c.x+dx*cos-dy*sin-off.x,y:c.y+dx*sin+dy*cos-off.y};
   return {x:flipH?w-q.x:q.x,y:flipV?h-q.y:q.y};});
  const l0=/** @type {Point} */(local[0]),ln=/** @type {Point} */(local[n]);
  if(Math.abs(l0.x)>eps||Math.abs(l0.y)>eps||Math.abs(ln.x-w)>eps||Math.abs(ln.y-h)>eps)continue;
  /** @type {number[]} */let adj;
  if(n===2)adj=[100000];
  else if(n===3)adj=[/** @type {Point} */(local[1]).x/w*100000];
  else if(n===4)adj=[/** @type {Point} */(local[1]).x/w*100000,/** @type {Point} */(local[2]).y/h*100000];
  else adj=[/** @type {Point} */(local[1]).x/w*100000,/** @type {Point} */(local[2]).y/h*100000,/** @type {Point} */(local[3]).x/w*100000];
  adj=adj.map(v=>Math.round(v));
  if(adj.some(v=>!Number.isFinite(v)||Math.abs(v)>2000000))continue;
  const expected=presetVertices(presetLegs,w,h,adj);
  const compare=n===2?[local[0],local[1],local[2],local[2]]:local;
  if(compare.some((p,i)=>{const q=/** @type {Point} */(expected[i]);return !p||Math.abs(p.x-q.x)>Math.max(.05,w*2e-5)+eps||Math.abs(p.y-q.y)>Math.max(.05,h*2e-5)+eps;}))continue;
  return {connectorType:'elbow-'+presetLegs,connectorAdjustments:adj,connectorFrame:{x:off.x,y:off.y,w,h,rotationDeg:rot,flipH,flipV}};
 }
 return null;
}

/** Render the Office path of a solved connector back to slide points; used by
 * tests and by head-direction checks so they read the emitted geometry.
 * @param {NonNullable<ReturnType<typeof nativeElbowConnector>>} connector */
function nativeElbowVertices(connector){
 const f=connector.connectorFrame,c={x:f.x+f.w/2,y:f.y+f.h/2},t=f.rotationDeg*Math.PI/180,cos=Math.round(Math.cos(t)),sin=Math.round(Math.sin(t));
 const legs=connector.connectorType?Number(connector.connectorType.split('-')[1]):1;
 const local=legs===1?[{x:0,y:0},{x:f.w,y:f.h}]:presetVertices(legs,f.w,f.h,connector.connectorAdjustments??[]);
 return local.map(p=>{const q={x:(f.flipH?f.w-p.x:p.x)+f.x-c.x,y:(f.flipV?f.h-p.y:p.y)+f.y-c.y};return {x:c.x+q.x*cos-q.y*sin,y:c.y+q.x*sin+q.y*cos};});
}

module.exports={orthogonalSourceRoute,orthogonalSourceTree,nativeElbowConnector,nativeElbowVertices};
