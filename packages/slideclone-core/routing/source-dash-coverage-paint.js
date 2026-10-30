// @ts-check
'use strict';
const {sourceVisibleGapBackdrops}=require('./source-visible-gap-profile');
/** Additional uniform-paint proof for complete dashes with a covered head.
 * Proposals come only from observed ordinary shaft cores, at most median +
 * sixteen colors. Two independent complete dashes must witness that color.
 * Every complete component retains .9 pixel and column support; its body
 * independently retains .9 pixel support at 18-channel mixture error. No tally can
 * conceal an unsupported small component or invent a transition in a gap.
 * @param {{components:{cells:number[]}[],head:NonNullable<ReturnType<typeof import('./source-visible-gap-profile').sourceVisibleGapGeometry>>,
 * width:number,horizontal:boolean,rgba:Uint8Array,background:number[],work:{checks:number}}} input
 * @returns {number[]|null} */
function sourceDashCoveragePaint({components,head,width,horizontal,rgba,background,work}){
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)throw new TypeError('Dash paint work ledger is invalid');
 if(components.length<2||components.length>23||!head.complete)return null;
 /** @type {{columns:number[][][],core:number[][],backdrops:number[][],bodyStart:number,bodyEnd:number}[]} */const groups=[];
 for(const component of components){
  /** @type {Map<number,number[]>} */const by=new Map();
  work.checks+=component.cells.length*16;if(work.checks>4000000)return null;
  for(const n of component.cells){const a=horizontal?n%width:Math.floor(n/width),v=by.get(a)??[];v.push(n);by.set(a,v);}
  const along=[...by.keys()].sort((a,b)=>a-b);
  const columns=along.map(a=>(by.get(a)??[]).sort((a,b)=>a-b).map(n=>[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0]));
  const core=columns.map(c=>c[Math.floor(c.length/2)]??[]);
  const backdrops=sourceVisibleGapBackdrops({along,width,horizontal,rgba,background,work});if(!backdrops)return null;
  groups.push({columns,core,backdrops,bodyStart:0,bodyEnd:columns.length-1});
 }
 const shafts=[...groups];
 if(head){
  const {along,columns:by,complete}=head;if(!complete)return null;
  const columns=along.map(a=>(by.get(a)??[]).map(c=>{const n=horizontal?c*width+a:a*width+c;return [rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0];}));
  const backdrops=sourceVisibleGapBackdrops({along,width,horizontal,rgba,background,work});if(!backdrops)return null;
  groups.push({columns,core:head.colors,backdrops,bodyStart:complete.firstBody,bodyEnd:complete.lastBody});
 }
 const core=shafts.flatMap(g=>g.core);if(!core.length)return null;
 work.checks+=core.length*64;if(work.checks>4000000)return null;
 const median=[0,1,2].map(k=>core.map(p=>p[k]??0).sort((a,b)=>a-b)[Math.floor(core.length/2)]??0);
 const candidates=[median],seen=new Set([median.join(',')]);
 for(const p of core){if(candidates.length>=17)break;const key=p.join(',');if(!seen.has(key)){seen.add(key);candidates.push(p);}}
 for(const local of [false,true])for(const paint of candidates){
  const cost=groups.reduce((sum,g)=>sum+g.columns.reduce((n,c)=>n+c.length,0)+g.core.length,0)*32;
  if(work.checks+cost>4000000)return null;work.checks+=cost;
  if(Math.max(...paint.map((v,k)=>Math.abs(v-(background[k]??0))))<42
   ||shafts.filter(g=>g.core.some(p=>p.every((v,k)=>Math.abs(v-(paint[k]??0))<=18))).length<2)continue;
  let valid=true;
  for(const group of groups){
   let total=0,supported=0,represented=0,bodyTotal=0,bodySupported=0;
   for(const [index,column] of group.columns.entries()){
    const backdrop=local?group.backdrops[index]??background:background;
    const delta=backdrop.map((v,k)=>v-(paint[k]??0)),norm=delta.reduce((sum,v)=>sum+v*v,0);
    /** @param {number[]} p */const matches=p=>{
     if(!norm)return false;
     const alpha=Math.max(0,Math.min(1,p.reduce((sum,v,k)=>sum+(v-(paint[k]??0))*(delta[k]??0),0)/norm));
     return p.every((v,k)=>Math.abs(v-((paint[k]??0)+alpha*(delta[k]??0)))<=18);
    };
    const count=column.filter(matches).length;total+=column.length;supported+=count;if(count)represented++;
    if(index>=group.bodyStart&&index<=group.bodyEnd){bodyTotal+=column.length;bodySupported+=count;}
   }
   if(!total||!bodyTotal||supported/total<.9||represented/group.columns.length<.9
    ||bodySupported/bodyTotal<.9){valid=false;break;}
  }
  if(valid)return [...paint];
 }
 return null;
}
module.exports={sourceDashCoveragePaint};
