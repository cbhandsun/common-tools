// @ts-check
'use strict';
/** A crossing component can join MULTIPLE dashes from the same axis through
 * its companion. Background cells within the independently proved stroke
 * therefore split it into flat rectangles. Never fill that real dash gap.
 * Every returned rectangle is checked against all absent original cells;
 * the caller must prove the union covers every original junction cell.
 * @param {{cells:number[],width:number,horizontal:boolean,slope:number,intercept:number,widthPx:number,work:{checks:number}}} input */
function sourceCrossingDashPartition({cells,width,horizontal,slope,intercept,widthPx,work}){
 const scale=Math.hypot(1,slope),owned=new Set(cells),points=cells.map(n=>({a:horizontal?n%width:Math.floor(n/width),c:horizontal?Math.floor(n/width):n%width}));
 const minA=Math.min(...points.map(p=>p.a))-2,maxA=Math.max(...points.map(p=>p.a))+2;
 const minC=Math.min(...points.map(p=>p.c))-2,maxC=Math.max(...points.map(p=>p.c))+2;
 const projected=points.map(p=>(p.a+slope*(p.c-intercept))/scale),lo=Math.min(...projected),hi=Math.max(...projected);
 /** @type {number[]} */const blanks=[];
 for(let a=minA;a<=maxA;a++)for(let c=minC;c<=maxC;c++){
  if(++work.checks>4000000)return null;
  if(owned.has(horizontal?c*width+a:a*width+c))continue;
  const t=(a+slope*(c-intercept))/scale,v=(c-slope*a-intercept)/scale;
  if(Math.abs(v)<widthPx/2-.75)blanks.push(t);
 }
 blanks.push(lo-2,hi+2);blanks.sort((a,b)=>a-b);
 const intervals=[];
 for(let i=1;i<blanks.length;i++){
  const left=blanks[i-1],right=blanks[i];if(left===undefined||right===undefined||right-left<9.5)continue;
  // A blank center can meet the flat cap within the ORIGINAL .75px
  // quantization bound. It cannot sit deeper inside a native rectangle.
  const start=Math.max(lo,left-.75),end=Math.min(hi,right+.75);if(end-start<8)continue;
  intervals.push({start,end});
 }
 for(let i=1;i<intervals.length;i++){
  const before=intervals[i-1],after=intervals[i];if(!before||!after)return null;
  const trim=Math.max(0,1-(after.start-before.end))/2;before.end-=trim;after.start+=trim;
 }
 const runs=[];
 for(const {start,end} of intervals){
  const selected=cells.filter(n=>{
   if(++work.checks>4000000)return false;
   const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   const t=(a+slope*(c-intercept))/scale,v=(c-slope*a-intercept)/scale;
   return Math.hypot(Math.max(start-t,0,t-end),Math.max(0,Math.abs(v)-widthPx/2))<=.75;
  });
  if(work.checks>4000000)return null;
  if(selected.length>=16)runs.push({lo:start,hi:end,cells:selected});
 }
 return runs.length>0&&runs.length<=16?runs:null;
}
module.exports={sourceCrossingDashPartition};
