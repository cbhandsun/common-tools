// @ts-check
'use strict';
/** @typedef {{x:number,y:number}} Point */
/** Estimate a native stroke's width from source pixel coverage, rather than
 * counting an antialiased fringe as fully opaque ink. This grants no cells:
 * the caller still verifies the complete original contrast component against
 * the original .75px radius allowance, direction, paint and private ports.
 * Cache entries are local to one immutable source window, measured backdrop
 * and shared ledger. The optional field is created by the source measurer,
 * never read from a provider proposal, and grants no pixel ownership.
 * @param {{path:Point[],rgba:Uint8Array,width:number,height:number,background:number[],backgroundAt?:(index:number)=>number[],work:{checks:number},cache:Map<string,number>}} input
 * @returns {number|null} */
function sourceRouteCoverageWidth({path,rgba,width,height,background,backgroundAt,work,cache}){
 if(backgroundAt!==undefined&&typeof backgroundAt!=='function')return null;
 const widths=[];
 for(let i=Math.floor(path.length*.3);i<Math.ceil(path.length*.7);i++){
  const p=path[i],q=path[i+2]??path[i-2];if(!p||!q)return null;
  const key=`${p.x}:${p.y}:${q.x}:${q.y}`,cached=cache.get(key);
  if(cached!==undefined){if(++work.checks>4000000)return null;widths.push(cached);continue;}
  const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(!length)return null;
  const center=p.y*width+p.x,backdrop=backgroundAt?backgroundAt(center):background;
  const local=[0,1,2].map(c=>rgba[center*4+c]??0),delta=local.map((v,c)=>v-(backdrop[c]??0));
  const norm=delta.reduce((sum,v)=>sum+v*v,0);
  if(Math.max(...delta.map(Math.abs))<42||!norm)return null;
  if((rgba[(p.y*width+p.x)*4+3]??0)<240)return null;
  let coverage=1;
  for(const sign of [-1,1]){
   let blank=0;
   for(let distance=1;distance<=12;distance++){
    work.checks+=32;if(work.checks>4000000)return null;const d=distance*sign;
    const x=Math.round(p.x-dy/length*d),y=Math.round(p.y+dx/length*d);
    if(x<0||x>=width||y<0||y>=height)return null;
    const index=y*width+x,at=index*4;if((rgba[at+3]??0)<240)return null;
    const expected=backgroundAt?backgroundAt(index):background;
    const projection=[0,1,2].reduce((sum,c)=>sum+((rgba[at+c]??0)-(expected[c]??0))*(delta[c]??0),0)/norm;
    coverage+=Math.max(0,Math.min(1,projection));
    // Width ends only after TWO independently observed background cells on
    // EACH side. The original 12px maximum remains; no out-of-window pixel
    // is treated as blank. Whole-component/branch and flank audits remain
    // mandatory, so this calibration never grants new source ownership.
    blank=expected.every((v,c)=>Math.abs(v-(rgba[at+c]??0))<=18)?blank+1:0;
    if(blank===2)break;
   }
   if(blank!==2)return null;
  }
  if(!Number.isFinite(coverage))return null;
  cache.set(key,coverage);widths.push(coverage);
 }
 work.checks+=widths.length*2;if(work.checks>4000000)return null;
 widths.sort((a,b)=>a-b);const result=widths[Math.floor(widths.length/2)];
 return result!==undefined&&result>=1&&result<=5?result:null;
}
module.exports={sourceRouteCoverageWidth};
