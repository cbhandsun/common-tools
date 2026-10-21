// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{checks:number,exhausted:boolean}} State */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{type:string,points:Point[]}} Segment */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {Point} a @param {Point} b @param {number} t @returns {Point} */
function mix(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
/** @template T @param {T[]} values @param {number} index @returns {T} */
function at(values,index){const value=values[index];if(value===undefined)throw new TypeError('Certified contour partition is invalid');return value;}
/** @param {Point[]} c @param {number} t @returns {[Point[],Point[]]} */
function split(c,t){
 const a=mix(at(c,0),at(c,1),t),b=mix(at(c,1),at(c,2),t),d=mix(at(c,2),at(c,3),t),e=mix(a,b,t),f=mix(b,d,t),g=mix(e,f,t);
 return [[at(c,0),a,e,g],[g,f,d,at(c,3)]];
}
/** @param {State} state */
function spend(state){if(++state.checks>4000000){state.exhausted=true;return false;}return true;}
/** Fit directly to the original cell contour, never an already approximated
 * polygon. For each source edge, restrict the cubic to its parameter interval
 * and subtract the exact linear source edge in Bernstein form. The norm of
 * every difference control is bounded by the original tolerance. Convexity
 * proves that bound everywhere, giving a continuous correspondence in both
 * directions, rather than relying on sampled curve points.
 * Controls stay inside the original source frame. All fitting and proof work
 * shares the caller's existing 4M counter; no partial proof is returned.
 * @param {unknown} input @param {unknown} error @param {unknown} control
 * @param {unknown} frame @param {unknown} [limit] @returns {Segment[]|null} */
function fitCertifiedContourLoop(input,error,control,frame,limit=120){
 if(!Array.isArray(input)||types.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype
  ||input.length>262144||Reflect.ownKeys(input).length!==input.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p))
  ||typeof error!=='number'||!Number.isFinite(error)||error<0||error>2
  ||!record(control)||typeof control.checks!=='number'||!Number.isSafeInteger(control.checks)||control.checks<0||control.checks>4000001
  ||typeof control.exhausted!=='boolean'||!record(frame)
  ||Object.getOwnPropertyDescriptor(control,'checks')?.writable!==true||Object.getOwnPropertyDescriptor(control,'exhausted')?.writable!==true
  ||control.checks>4000000&&!control.exhausted
  ||![frame.x,frame.y,frame.w,frame.h].every(v=>typeof v==='number'&&Number.isSafeInteger(v))
  ||Number(frame.x)<0||Number(frame.y)<0||Number(frame.w)<1||Number(frame.h)<1
  ||Number(frame.x)+Number(frame.w)>16384||Number(frame.y)+Number(frame.h)>16384||Number(frame.w)*Number(frame.h)>1000000
  ||typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<4||limit>120)throw new TypeError('Certified contour controls are invalid');
 const state=/** @type {State} */(control),box=/** @type {Box} */(frame);
 /** @type {Point[]} */const raw=[];
 for(const p of input){
  if(!record(p)||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)
   ||p.x<box.x||p.y<box.y||p.x>box.x+box.w||p.y>box.y+box.h)throw new TypeError('Certified contour source is invalid');
  raw.push({x:p.x,y:p.y});
 }
 if(state.exhausted||error===0||raw.length<3)return null;
 /** @type {Point[]} */const loop=[];
 for(let i=0;i<raw.length;i++){
  if(!spend(state))return null;
  const p=at(raw,i),a=at(raw,(i+raw.length-1)%raw.length),b=at(raw,(i+1)%raw.length);
  if((p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x))loop.push(p);
 }
 if(loop.length<3)return null;
 let far=1;
 const first=at(loop,0);
 for(let i=2;i<loop.length;i++){
  if(!spend(state))return null;
  const p=at(loop,i),q=at(loop,far);
  if(Math.hypot(p.x-first.x,p.y-first.y)>Math.hypot(q.x-first.x,q.y-first.y))far=i;
 }
 const pending=[[...loop.slice(far),first],loop.slice(0,far+1)];
 /** @type {Segment[]} */const out=[];
 while(pending.length){
  const arc=pending.pop();if(!arc)throw new TypeError('Certified contour partition is invalid');
  if(arc.length===2){out.push({type:'lnTo',points:[at(arc,1)]});}
  else{
   const fitted=fitArc(arc,error,state,box);if(!fitted)return null;
   if(fitted.curve)out.push({type:'cubicBezTo',points:fitted.curve.slice(1)});
   else pending.push(arc.slice(fitted.at),arc.slice(0,fitted.at+1));
  }
  if(out.length+pending.length+2>limit)return null;
 }
 return [{type:'moveTo',points:[first]},...out,{type:'close',points:[]}];
}
/** @param {Point[]} arc @param {number} tolerance @param {State} state @param {Box} box
 * @returns {{curve:Point[]|null,at:number}|null} */
function fitArc(arc,tolerance,state,box){
 const a=at(arc,0),b=at(arc,arc.length-1),u=[0];
 for(let i=1;i<arc.length;i++){
  if(!spend(state))return null;const p=at(arc,i),q=at(arc,i-1);u.push(at(u,i-1)+Math.hypot(p.x-q.x,p.y-q.y));
 }
 const total=at(u,u.length-1);if(!total)return null;
 for(let i=1;i<u.length;i++)u[i]=at(u,i)/total;
 let aa=0,ab=0,bb=0,ax=0,ay=0,bx=0,by=0;
 for(let i=1;i<arc.length-1;i++){
  if(!spend(state))return null;
  const t=at(u,i),point=at(arc,i),s=1-t,p=3*s*s*t,q=3*s*t*t,x=point.x-s*s*s*a.x-t*t*t*b.x,y=point.y-s*s*s*a.y-t*t*t*b.y;
  aa+=p*p;ab+=p*q;bb+=q*q;ax+=p*x;ay+=p*y;bx+=q*x;by+=q*y;
 }
 const det=aa*bb-ab*ab;
 /** @param {Point} p */const clamp=p=>({x:Math.max(box.x,Math.min(box.x+box.w,p.x)),y:Math.max(box.y,Math.min(box.y+box.h,p.y))});
 const c=det>1e-12?[a,clamp({x:(ax*bb-bx*ab)/det,y:(ay*bb-by*ab)/det}),clamp({x:(bx*aa-ax*ab)/det,y:(by*aa-ay*ab)/det}),b]
  :[a,mix(a,b,1/3),mix(a,b,2/3),b];
 let worst=0,splitAt=1;
 for(let i=0;i<arc.length-1;i++){
  if(!spend(state))return null;
  const left=at(u,i),right=at(u,i+1),tail=left?split(c,left)[1]:c,part=right===1?tail:split(tail,(right-left)/(1-left))[0];
  for(let k=0;k<4;k++){
   if(!spend(state))return null;
   const p=mix(at(arc,i),at(arc,i+1),k/3),q=at(part,k),d=Math.hypot(p.x-q.x,p.y-q.y);
   if(d>worst){worst=d;splitAt=Math.max(1,Math.min(arc.length-2,i+(k>=2?1:0)));}
  }
 }
 return {curve:worst<=tolerance?c:null,at:splitAt};
}
/** Fit a complete OPEN source path with the same continuous Bernstein
 * correspondence proof as closed contours. The source path is a proposal:
 * this grants no port, paint, junction, replacement or pixel authority.
 * @param {unknown} input @param {unknown} error @param {unknown} control
 * @param {unknown} frame @param {unknown} [limit] @returns {Segment[]|null} */
function fitCertifiedOpenPath(input,error,control,frame,limit=120){
 if(!Array.isArray(input)||types.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype
  ||input.length>512||Reflect.ownKeys(input).length!==input.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p))
  ||typeof error!=='number'||!Number.isFinite(error)||error<0||error>.75
  ||!record(control)||typeof control.checks!=='number'||!Number.isSafeInteger(control.checks)||control.checks<0||control.checks>4000001
  ||typeof control.exhausted!=='boolean'||control.checks>4000000&&!control.exhausted
  ||Object.getOwnPropertyDescriptor(control,'checks')?.writable!==true||Object.getOwnPropertyDescriptor(control,'exhausted')?.writable!==true
  ||!record(frame)||![frame.x,frame.y,frame.w,frame.h].every(v=>typeof v==='number'&&Number.isFinite(v))
  ||Number(frame.x)<0||Number(frame.y)<0||Number(frame.w)<=0||Number(frame.h)<=0
  ||Number(frame.x)+Number(frame.w)>16384||Number(frame.y)+Number(frame.h)>16384||Number(frame.w)*Number(frame.h)>262144
  ||typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<2||limit>120)throw new TypeError('Certified open path controls are invalid');
 const state=/** @type {State} */(control),box=/** @type {Box} */(frame);
 if(state.exhausted)return null;
 /** @type {Point[]} */const raw=[];
 for(const p of input){
  if(!spend(state))return null;
  if(!record(p)||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)
   ||p.x<box.x||p.y<box.y||p.x>box.x+box.w||p.y>box.y+box.h)throw new TypeError('Certified open source path is invalid');
  const previous=raw.at(-1);if(previous&&p.x===previous.x&&p.y===previous.y)return null;
  raw.push({x:p.x,y:p.y});
 }
 if(state.exhausted||error===0||raw.length<2)return null;
 const first=at(raw,0),last=at(raw,raw.length-1);if(first.x===last.x&&first.y===last.y)return null;
 const pending=[raw];
 /** @type {Segment[]} */const out=[{type:'moveTo',points:[first]}];
 while(pending.length){
  const arc=pending.pop();if(!arc)throw new TypeError('Certified open partition is invalid');
  if(arc.length===2)out.push({type:'lnTo',points:[at(arc,1)]});
  else{
   const fitted=fitArc(arc,error,state,box);if(!fitted)return null;
   if(fitted.curve)out.push({type:'cubicBezTo',points:fitted.curve.slice(1)});
   else pending.push(arc.slice(fitted.at),arc.slice(0,fitted.at+1));
  }
  if(out.length+pending.length>limit)return null;
 }
 return out;
}
module.exports={fitCertifiedContourLoop,fitCertifiedOpenPath};
