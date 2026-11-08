// @ts-check
'use strict';
const {sourceVisibleGapBackdrops}=require('./source-visible-gap-profile');
const {sourceRoutePaintColor}=require('./source-route-paint-fit');
/** @typedef {{along:number[],columns:number[][][],backdrops:number[][],strongest:number[],ordinary:boolean}} Group */
/** @typedef {{along:number[],columns:Map<number,number[]>}} Head */
/** Complete component paint proof for an independently measured detached
 * head. Propose at most 17 ACTUAL ordinary core colors. Each used
 * color needs two independent ordinary witnesses in its own constant section.
 * First try one color, then two colors with one transition confined to an
 * observed blank interval. At most four source-space stops; no per-dash color
 * fitting or head-nominated ink. Every ORIGINAL component retains .9 pixel
 * and .9 represented-row support at 18-channel mixture error. Blank intervals
 * are never sampled as ink and acquire no paint or physical-attachment rights.
 * @param {{components:{cells:number[]}[],head:Head,width:number,horizontal:boolean,rgba:Uint8Array,background:number[],work:{checks:number}}} input
 * @returns {{color:string,spatial?:import('./source-route-spatial-paint').SpatialPaint}|null} */
function sourceDashSpatialPaint({components,head,width,horizontal,rgba,background,work}){
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000||components.length<2||components.length>23
  ||!Number.isSafeInteger(width)||width<1||rgba.length%(width*4)!==0||background.length!==3
  ||background.some(v=>!Number.isFinite(v)||v<0||v>255)||!head.along.length||head.along.length>513)return null;
 const size=components.reduce((n,c)=>n+c.cells.length,0)+[...head.columns.values()].reduce((n,c)=>n+c.length,0);
 work.checks+=size*128;if(work.checks>4000000)return null;
 /** @type {Group[]} */const groups=[];
 const sources=[...components.map(c=>({cells:c.cells,ordinary:true})),{cells:head.along.flatMap(a=>(head.columns.get(a)??[])
  .map(c=>horizontal?c*width+a:a*width+c)),ordinary:false}];
 for(const source of sources){
  /** @type {Map<number,number[]>} */const by=new Map();const seen=new Set();
  for(const n of source.cells){if(!Number.isSafeInteger(n)||n<0||n>=rgba.length/4||seen.has(n)||(rgba[n*4+3]??0)<240)return null;seen.add(n);
   const a=horizontal?n%width:Math.floor(n/width),list=by.get(a)??[];list.push(n);by.set(a,list);}
  const along=[...by.keys()].sort((a,b)=>a-b);if(!along.length||along.length>513)return null;
  const columns=along.map(a=>(by.get(a)??[]).sort((a,b)=>a-b).map(n=>[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0]));
  const core=columns.flatMap(c=>c.slice(Math.floor((c.length-1)/2),Math.ceil((c.length+1)/2)));
  const contrast=(/** @type {number[]} */p)=>p.reduce((n,v,k)=>n+(v-(background[k]??0))**2,0);
  const strongest=core.reduce((best,p)=>contrast(p)>contrast(best)?p:best,core[0]??[]);
  if(strongest.length!==3)return null;
  const backdrops=sourceVisibleGapBackdrops({along,width,horizontal,rgba,background,work});if(!backdrops)return null;
  groups.push({along,columns,backdrops,strongest,ordinary:source.ordinary});
 }
 groups.sort((a,b)=>(a.along[0]??0)-(b.along[0]??0));
 if(groups.some((g,i)=>i>0&&(g.along[0]??0)<=(groups[i-1]?.along.at(-1)??Infinity)))return null;
 const ordinary=groups.filter(g=>g.ordinary),candidates=ordinary.map(g=>g.strongest);
 const median=[0,1,2].map(k=>ordinary.map(g=>g.strongest[k]??0).sort((a,b)=>a-b)[Math.floor(ordinary.length/2)]??0);
 const palette=[...new Map([...candidates.slice(0,16),median].map(p=>[p.join(','),p])).values()];
 /** @param {Group} group @param {(a:number)=>number[]} at */
 function check(group,at){
  work.checks+=(group.columns.reduce((n,c)=>n+c.length,0)+group.along.length)*64;if(work.checks>4000000)return null;
  let total=0,matching=0,represented=0,error=0;
  for(const [i,column] of group.columns.entries()){
   const paint=at(group.along[i]??NaN),bg=group.backdrops[i]??background;
   const delta=bg.map((v,k)=>v-(paint[k]??0)),norm=delta.reduce((n,v)=>n+v*v,0);if(!norm)return null;
   let present=false;
   for(const p of column){const alpha=Math.max(0,Math.min(1,p.reduce((n,v,k)=>n+(v-(paint[k]??0))*(delta[k]??0),0)/norm));
    const residual=Math.max(...p.map((v,k)=>Math.abs(v-((paint[k]??0)+alpha*(delta[k]??0)))));total++;error+=residual;
    if(residual<=18){matching++;present=true;}}
   if(present)represented++;
  }
  return total&&matching/total>=.9&&represented/group.columns.length>=.9?{error,support:matching/total}:null;
 }
 const witnesses=(/** @type {number[]} */paint,/** @type {Group[]} */section)=>section.filter(g=>g.ordinary&&g.strongest.every((v,k)=>Math.abs(v-(paint[k]??0))<=18)).length>=2;
 const hex=(/** @type {number[]} */p)=>'#'+p.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
 const matrix=palette.map(p=>groups.map(g=>check(g,()=>p)));if(work.checks>4000000)return null;
 const origin=groups[0]?.along[0]??NaN,span=(groups.at(-1)?.along.at(-1)??NaN)-origin;if(!Number.isFinite(span)||span<1||span>512)return null;
 /** @type {{stops:import('./source-route-paint-fit').Stop[],error:number,support:number,key:string}[]} */const proposals=[];
 for(const [i,p] of palette.entries()){
  if(Math.max(...p.map((v,k)=>Math.abs(v-(background[k]??0))))<42)continue;
  const row=matrix[i]??[];
  if(row.every(Boolean)&&witnesses(p,groups))proposals.push({stops:[{position:0,color:hex(p)},{position:1,color:hex(p)}],error:row.reduce((n,r)=>n+(r?.error??0),0),support:Math.min(...row.map(r=>r?.support??0)),key:hex(p)});
 }
 // One constant color always takes precedence over a spatial hypothesis.
 if(!proposals.length)for(const [i,left] of palette.entries())for(const [j,right] of palette.entries()){
  if(i===j||[left,right].some(p=>Math.max(...p.map((v,k)=>Math.abs(v-(background[k]??0))))<42))continue;
  for(let split=2;split<=groups.length-2;split++){
   work.checks+=groups.length*32;if(work.checks>4000000)return null;
   const before=groups.slice(0,split),after=groups.slice(split),prefix=matrix[i]?.slice(0,split)??[],suffix=matrix[j]?.slice(split)??[];
   if(prefix.length!==split||suffix.length!==after.length||!prefix.every(Boolean)||!suffix.every(Boolean)
    ||!witnesses(left,before)||!witnesses(right,after))continue;
   const lo=before.at(-1)?.along.at(-1)??NaN,hi=after[0]?.along[0]??NaN;if(hi-lo<2)continue;
   const stops=[{position:0,color:hex(left)},{position:(lo-origin)/span,color:hex(left)},
    {position:(hi-origin)/span,color:hex(right)},{position:1,color:hex(right)}];
   proposals.push({stops,error:[...prefix,...suffix].reduce((n,r)=>n+(r?.error??0),0),support:Math.min(...[...prefix,...suffix].map(r=>r?.support??0)),key:JSON.stringify(stops)});
  }
 }
 work.checks+=proposals.length*64;if(work.checks>4000000)return null;
 proposals.sort((a,b)=>b.support-a.support||a.error-b.error||(a.key<b.key?-1:a.key>b.key?1:0));
 const selected=proposals[0];if(!selected)return null;
 // Recheck the actual interpolation, including every small head and dash.
 const final=groups.map(g=>check(g,a=>sourceRoutePaintColor(selected.stops,(a-origin)/span)));
 if(work.checks>4000000||final.some(v=>!v))return null;
 const color=selected.stops[0]?.color;if(!color)return null;
 return {color,...(selected.stops.length>2?{spatial:{axis:horizontal?'x':'y',origin,span,stops:selected.stops,support:Math.min(...final.map(v=>v?.support??0))}}:{})};
}
module.exports={sourceDashSpatialPaint};
