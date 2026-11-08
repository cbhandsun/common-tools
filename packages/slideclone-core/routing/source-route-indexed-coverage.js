// @ts-check
'use strict';
/** Exact nearest-path coverage with the original shaft and 12px arrow radii.
 * Spatial buckets remove distant path candidates without changing distances,
 * first-index tie breaking, component membership or the shared work ceiling.
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {{x:number,y:number}[]} path @param {number} shaft
 * @param {boolean} startArrow @param {boolean} endArrow @param {{checks:number}} work */
function sourceRouteIndexedCoverage(mask,width,height,path,shaft,startArrow,endArrow,work){
 const first=path[0];if(!first)return false;
 const columns=Math.ceil(width/12);
 /** @type {Map<number,number[]>} */const buckets=new Map();
 for(const [index,p]of path.entries()){
  if(++work.checks>4000000)return false;
  const key=Math.floor(p.y/12)*columns+Math.floor(p.x/12),list=buckets.get(key)??[];list.push(index);buckets.set(key,list);
 }
 const visited=new Uint8Array(mask.length),queue=new Uint32Array(mask.length);
 let head=0,tail=1;queue[0]=first.y*width+first.x;visited[queue[0]]=1;
 while(head<tail){
  const cell=queue[head++]??0,x=cell%width,y=Math.floor(cell/width);let nearest=-1,distance=Infinity;
  const bx=Math.floor(x/12),by=Math.floor(y/12);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(++work.checks>4000000)return false;const cx=bx+dx,cy=by+dy;
   if(cx<0||cy<0||cx>=columns||cy>=Math.ceil(height/12))continue;
   for(const index of buckets.get(cy*columns+cx)??[]){
    if(++work.checks>4000000)return false;const p=path[index];if(!p)return false;
    const d=(x-p.x)**2+(y-p.y)**2;
    if(d<distance||d===distance&&index<nearest){distance=d;nearest=index;}
   }
  }
  const headInk=startArrow&&nearest>=0&&nearest<12||endArrow&&nearest>=path.length-12;
  if(distance>(headInk?12:shaft/2+.75)**2)return false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
   if(++work.checks>4000000)return false;const xx=x+dx,yy=y+dy;
   if(xx<0||yy<0||xx>=width||yy>=height)continue;const next=yy*width+xx;
   if(mask[next]&&!visited[next]){visited[next]=1;queue[tail++]=next;}
  }
 }
 return true;
}
module.exports={sourceRouteIndexedCoverage};
