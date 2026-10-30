// @ts-check
'use strict';
const {observeSourceCoreBackdrop}=require('./source-route-core-backdrop');
const {createRouteSectionWitnesses}=require('./source-route-section-witnesses');
const {observeWideFields}=require('./source-route-wide-fringe');
/** Source resampling can overshoot the foreground/background color interval.
 * Certify its spatial edge profile rather than assuming an alpha mixture.
 * Detached observations never grant erasure authority or change topology.
 * @typedef {{rgba:Uint8Array,width:number,height:number}} Raster
 * @typedef {{x:number,y:number,w:number,h:number}} Box
 * @typedef {{cell:number,color:number[]}} Sample
 * @typedef {{background:number[],step:number[],profile:number[],first:number,last:number}} Section
 */
const LIMIT=4000000;
/** @param {{image:Raster,window:Box,component:Uint8Array,blocked:Uint8Array,work:{checks:number}}} input
 * @param {{shaft:Uint8Array,edges:unknown}} [measuredShaft] Live private frame,
 * never source membership inferred from public Deck IR metadata.
 * @returns {Sample[]|null} */
function observeRouteAntialiasBackground({image,window,component,blocked,work},measuredShaft){
 const area=window.w*window.h;
 /** @param {number} cost */const charge=cost=>{work.checks+=cost;return work.checks<=LIMIT;};
 if(!charge(area))return null;
 /** @param {number} x @param {number} y */const index=(x,y)=>x<0||y<0||x>=window.w||y>=window.h?-1:y*window.w+x;
 /** @param {number} n */const offset=n=>((window.y+Math.floor(n/window.w))*image.width+window.x+n%window.w)*4;
 /** @param {number} n */const rgb=n=>[0,1,2].map(c=>image.rgba[offset(n)+c]??0);
 /** @param {number} n */const exterior=n=>n>=0&&!blocked[n]&&!component[n]&&image.rgba[offset(n)+3]===255;
 /** @type {Map<string,Section|null>} */const cache=new Map();
 const witnesses=createRouteSectionWitnesses();
 /** Each transverse section needs four separate exterior flank samples,
  * an opaque measured core, and bounded, decreasing edge contrast on BOTH
  * sides. No blocked text/body, other ink or transparent boundary may enter.
  * @param {number} x @param {number} y @param {number} dx @param {number} dy
  * @returns {Section|null} */
 function measureSection(x,y,dx,dy){
  /** @param {number} t */const at=t=>index(x+dx*t,y+dy*t);
  if(!exterior(at(0)))return null;
  let first=-1;
  while(first>=-3&&at(first)>=0&&!component[at(first)])first--;
  if(first< -3||at(first)<0||!component[at(first)])return null;
  let last=first,count=0;
  for(;last>=first-31;last--){
   if(!charge(1))return null;
   const n=at(last);if(n<0||blocked[n])return null;
   if(!component[n])break;
   if(image.rgba[offset(n)+3]!==255)return null;
   count++;
  }
  if(count<2||count>31)return null;
  if(!charge(1))return null;
  const prior=witnesses.read(at(first),dx,dy,first,last);if(prior)return prior;
  const positions=[last-5,last-4,first+5,first+6],cells=positions.map(at);
  if(!charge(20)||cells.some(n=>!exterior(n)))return null;
  const colors=cells.map(rgb),left=colors[0]??[],right=colors[3]??[];
  if(left.some((v,c)=>Math.abs(v-(right[c]??0))>18))return null;
  /** @param {number} t */const backdrop=t=>left.map((v,c)=>v+((right[c]??0)-v)*(t-(positions[0]??0))/((positions[3]??0)-(positions[0]??0)));
  if(colors.some((color,i)=>color.some((v,c)=>Math.abs(v-(backdrop(positions[i]??0)[c]??0))>3)))return null;
  /** @type {number[]} */const profile=[];
  for(const side of [1,-1]){
   let previous=42;
   const start=side===1?first+1:last,end=side===1?first+6:last-5;
   for(let t=start;side===1?t<=end:t>=end;t+=side){
    if(!charge(8))return null;
    const n=at(t);if(!exterior(n))return null;
    const color=rgb(n),bg=backdrop(t),delta=color.map((v,c)=>v-(bg[c]??0)),contrast=Math.max(...delta.map(Math.abs));
    const distance=Math.abs(t-start)+1;
    if(contrast>=42||contrast>previous+3||distance>3&&contrast>3)return null;
    previous=contrast;if(distance<=3)profile.push(...delta);
   }
  }
  witnesses.remember(at(first),dx,dy,left,right,profile);
  const background=backdrop(0),step=left.map((v,c)=>((right[c]??0)-v)/((positions[3]??0)-(positions[0]??0)));
  return {background,step,profile,first,last};
 }
 /** @param {number} x @param {number} y @param {number} dx @param {number} dy */
 function section(x,y,dx,dy){
  if(!charge(1))return null;
  const key=x+','+y+','+dx+','+dy;
  if(cache.has(key))return cache.get(key)??null;
  const value=measureSection(x,y,dx,dy);cache.set(key,value);return value;
 }
 const candidates=new Set();
 for(let n=0;n<area;n++)if(component[n]){
  if(!charge(12))return null;
  const x=n%window.w,y=Math.floor(n/window.w);
  for(const [dx=0,dy=0]of [[1,0],[-1,0],[0,1],[0,-1]])for(let distance=1;distance<=3;distance++){
   const p=index(x+dx*distance,y+dy*distance);if(!exterior(p))break;candidates.add(p);
  }
 }
 /** Multiple independently witnessed sections may cover the same source cell.
  * Conflicting background observations never grant a replacement there.
  * @type {Map<number,number[]|null>} */const proposed=new Map();
 /** @param {number} cell @param {number[]} background */
 const propose=(cell,background)=>{
  const color=background.map(Math.round),prior=proposed.get(cell);
  if(prior===null)return;
  if(prior&&prior.some((v,c)=>Math.abs(v-(color[c]??0))>3))proposed.set(cell,null);
  else if(!prior)proposed.set(cell,color);
 };
 for(const n of candidates){
  const x=n%window.w,y=Math.floor(n/window.w);
  /** @type {{section:Section,dx:number,dy:number}[]} */const accepted=[];
  for(const [dx=0,dy=0]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const middle=section(x,y,dx,dy);if(work.checks>LIMIT)return null;if(!middle)continue;
   let support=0;
   for(let tangent=-4;tangent<=4;tangent++){
    const other=section(x-dy*tangent,y+dx*tangent,dx,dy);if(!charge(20))return null;
    if(other&&other.first===middle.first&&other.last===middle.last&&other.profile.every((v,c)=>Math.abs(v-(middle.profile[c]??0))<=18))support++;
    else break; // Eight of nine is below 90%; no later sample can rescue it.
   }
   // At least 90% of nine independent sections must agree. An isolated pale
   // mark or a nearby crossing cannot substitute for the repeated edge field.
   if(support/9>=.9)accepted.push({section:middle,dx,dy});
  }
  if(!accepted.length)continue;
  const color=accepted[0]?.section.background??[];
  if(!accepted.every(({section:s})=>s.background.every((v,c)=>Math.abs(v-(color[c]??0))<=3)))continue;
  if(rgb(n).some((v,c)=>Math.abs(v-(color[c]??0))>=1))propose(n,color);
  // The same bilateral source evidence also witnesses the background hidden
  // by this opaque measured core. A transparent hole would expose the page
  // color after moving the native path, even with all fringe removed.
  for(const {section:s,dx,dy}of accepted)for(let t=s.last+1;t<=s.first;t++){
   if(!charge(4))return null;
   const cell=index(x+dx*t,y+dy*t);
   propose(cell,s.background.map((v,c)=>v+(s.step[c]??0)*t));
  }
 }
 const core=observeSourceCoreBackdrop({image,window,component,blocked,work,covered:new Set(proposed.keys())},measuredShaft);
 if(!core)return null;
 const prior=[...proposed].filter((row)=>row[1]!==null).map(([n,color])=>({cell:(window.y+Math.floor(n/window.w))*image.width+window.x+n%window.w,color:/** @type {number[]} */(color)})).concat(core);
 /** @type {Map<number,number[]>} */const covered=new Map();
 for(const row of prior){
  if(!charge(4))return null;
  const n=(Math.floor(row.cell/image.width)-window.y)*window.w+row.cell%image.width-window.x;
  covered.set(n,row.color);
 }
 const wide=observeWideFields({image,window,component,blocked,work,covered,candidates});
 return wide?prior.concat(wide):null;
}
module.exports={observeRouteAntialiasBackground};
