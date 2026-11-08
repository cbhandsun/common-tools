// @ts-check
'use strict';
const {types}=require('node:util');
const {record}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,sharedOutputRecord,sharedOutputList,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{a:Point,b:Point,from:string|null,to:string|null,edge:number,index:number}} Segment */
const EPS=1e-6;
/** @param {Point} a @param {Point} b */
const same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<=EPS;
/** A centreline topology guard only. It grants neither source ink ownership,
 * stroke coverage nor erasure. All contacts must be declared graph endpoints;
 * even incident segments may not overlap. Check the actual preset vertices.
 * @param {unknown} input @returns {true} */
function assertNativeRouteTopology(input){
 if(!record(input)||!sharedOutputWork(input.work))throw new TypeError('Native route topology controls are invalid');
 const work=input.work;
 /** @returns {never} */const fail=()=>{throw new TypeError(work.checks>4000000?'Scene shared path binding failed: shared-geometry-budget':'Native route topology is invalid');};
 /** @param {number} count */const reserve=count=>{if(!chargeSharedOutput(work,count))fail();};
 /** @param {unknown} row @returns {Record<string,unknown>} */const obj=row=>{if(!sharedOutputRecord(row,work))return fail();return row;};
 /** @param {unknown} row @param {number} min @param {number} max @returns {unknown[]} */
 const array=(row,min,max)=>{if(!Array.isArray(row)||types.isProxy(row)||row.length<min||row.length>max||!sharedOutputList(row,work))return fail();return row;};
 /** @param {unknown} row @returns {Point} */const point=row=>{
  const p=obj(row);if(typeof p.x!=='number'||typeof p.y!=='number'||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))return fail();return {x:p.x,y:p.y};
 };
 /** @param {unknown} value @returns {value is string} */const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(value);
 /** @type {Map<string,Point>} */const vertices=new Map();
 for(const value of array(input.vertices,2,128)){
  const row=obj(value);if(!id(row.id)||vertices.has(row.id))return fail();vertices.set(row.id,point(row.point));
 }
 /** @type {Segment[]} */const segments=[];
 const edges=array(input.edges,1,128);
 for(const [edge,value]of edges.entries()){
  const row=obj(value);if(!id(row.from)||!id(row.to)||row.from===row.to)return fail();
  const from=vertices.get(row.from),to=vertices.get(row.to),points=array(row.points,2,6).map(point);
  if(!from||!to||!same(from,/** @type {Point} */(points[0]))||!same(to,/** @type {Point} */(points.at(-1))))return fail();
  reserve(points.length*3);
  for(let i=1;i<points.length;i++){
   const a=/** @type {Point} */(points[i-1]),b=/** @type {Point} */(points[i]);if(same(a,b))return fail();
   segments.push({a,b,from:i===1?row.from:null,to:i===points.length-1?row.to:null,edge,index:i-1});
  }
 }
 /** @param {Point} a @param {Point} b @param {Point} c */
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 /** @param {Point} p @param {Point} a @param {Point} b */
 const on=(p,a,b)=>Math.abs(cross(a,b,p))<=EPS*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))
  &&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;
 for(const [i,s]of segments.entries()){
  // A route must not pass through an unrelated graph/control vertex.
  for(const [key,p]of vertices){reserve(1);if(key!==s.from&&key!==s.to&&on(p,s.a,s.b))return fail();}
  for(let j=0;j<i;j++){
   reserve(1);const t=/** @type {Segment} */(segments[j]);
   if(Math.max(s.a.x,s.b.x)<Math.min(t.a.x,t.b.x)-EPS||Math.min(s.a.x,s.b.x)>Math.max(t.a.x,t.b.x)+EPS
    ||Math.max(s.a.y,s.b.y)<Math.min(t.a.y,t.b.y)-EPS||Math.min(s.a.y,s.b.y)>Math.max(t.a.y,t.b.y)+EPS)continue;
   const contacts=[s.a,s.b,t.a,t.b].filter(p=>on(p,s.a,s.b)&&on(p,t.a,t.b));
   const distinct=contacts.filter((p,k)=>contacts.findIndex(q=>same(p,q))===k);
   if(distinct.length>1)return fail(); // collinear overlap, including incident arms
   if(distinct.length===1){
    const p=/** @type {Point} */(distinct[0]);
    if(s.edge===t.edge&&Math.abs(s.index-t.index)===1&&same(t.b,s.a)&&same(p,s.a))continue;
    const sid=same(p,s.a)?s.from:same(p,s.b)?s.to:null,tid=same(p,t.a)?t.from:same(p,t.b)?t.to:null;
    if(sid&&sid===tid)continue;return fail();
   }
   const x=cross(s.a,s.b,t.a),y=cross(s.a,s.b,t.b),u=cross(t.a,t.b,s.a),v=cross(t.a,t.b,s.b);
   if((x>0&&y<0||x<0&&y>0)&&(u>0&&v<0||u<0&&v>0))return fail();
  }
 }
 return true;
}
module.exports={assertNativeRouteTopology};
