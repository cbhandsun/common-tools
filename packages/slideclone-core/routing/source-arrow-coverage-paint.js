// @ts-check
'use strict';
/** Use the independently complete arrow's solid body as its paint witness.
 * Preserve the first median result when it passes. If JPEG edge coverage
 * rejects it, test at most sixteen distinct observed body colors against
 * the SAME body and whole-component gates. No candidate gains pixel ownership.
 * Every trial shares the caller's original geometry work allowance.
 * @param {{columns:number[][][],background:number[],firstBody:number,lastBody:number,work:{checks:number},backdrops?:number[][],colorMode?:'chromatic'|'contrast'}} input
 * @returns {number[]|null} */
function sourceArrowCoveragePaint({columns,background,firstBody,lastBody,work,backdrops,colorMode='chromatic'}){
 if(!['chromatic','contrast'].includes(colorMode))throw new TypeError('Arrow paint color mode is invalid');
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)throw new TypeError('Arrow paint work ledger is invalid');
 if(background.length!==3||!background.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=255)
  ||firstBody<0||lastBody<firstBody||lastBody>=columns.length)return null;
 if(backdrops&&(backdrops.length!==columns.length||backdrops.some(p=>p.length!==3
  ||p.some((v,k)=>!Number.isSafeInteger(v)||v<0||v>255||Math.abs(v-(background[k]??0))>18))))return null;
 const core=columns.slice(firstBody,lastBody+1).flatMap(values=>
  values.slice(Math.floor((values.length-1)/2),Math.ceil((values.length+1)/2)));
 if(!core.length)return null;
 const median=[0,1,2].map(k=>core.map(p=>p[k]??0).sort((a,b)=>a-b)[Math.floor(core.length/2)]??0);
 const candidates=[median],identities=new Set([median.join(',')]);
 for(const color of core){if(candidates.length>=17)break;const id=color.join(',');if(!identities.has(id)){identities.add(id);candidates.push(color);}}
 for(const local of backdrops?[false,true]:[false])for(const paint of candidates){
  // Preflight each complete trial. Exhaustion cannot publish an earlier
  // partial tally or silently reset the page's geometry ledger.
  const cost=(core.length+columns.reduce((sum,c)=>sum+c.length,0))*32;
  if(work.checks+cost>4000000)return null;work.checks+=cost;
  if((colorMode==='chromatic'?Math.max(...paint)-Math.min(...paint):Math.max(...paint.map((v,k)=>Math.abs(v-(background[k]??0)))))<42
   ||core.filter(p=>p.every((v,k)=>Math.abs(v-(paint[k]??0))<=18)).length/core.length<.9)continue;
  let supported=0,total=0,represented=0;
  for(const [index,column] of columns.entries()){let present=false;
   const backdrop=local?backdrops?.[index]??background:background;
   const delta=backdrop.map((v,k)=>v-(paint[k]??0)),norm=delta.reduce((sum,v)=>sum+v*v,0);
   if(!norm)continue;
   for(const p of column){total++;
    const coverage=Math.max(0,Math.min(1,p.reduce((sum,v,k)=>sum+(v-(paint[k]??0))*(delta[k]??0),0)/norm));
    if(p.every((v,k)=>Math.abs(v-((paint[k]??0)+coverage*(delta[k]??0)))<=18)){supported++;present=true;}
   }
   if(present)represented++;
  }
  if(total&&supported/total>=.9&&represented/columns.length>=.9)return [...paint];
 }
 return null;
}
module.exports={sourceArrowCoveragePaint};
