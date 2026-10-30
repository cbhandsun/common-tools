'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteCoversComponent:measure}=require('../packages/slideclone-core/routing/source-route-centerline');
// Independent original dense nearest-point certificate, including tie order.
function dense(mask,width,height,path,shaft,startArrow,endArrow,work){
 if(!path[0])return false;
 const seen=new Set(),queue=[path[0].y*width+path[0].x];seen.add(queue[0]);
 for(let head=0;head<queue.length;head++){
  const i=queue[head],x=i%width,y=Math.floor(i/width);let nearest=-1,distance=Infinity;
  for(let k=0;k<path.length;k++){
   if(++work.checks>4000000)return false;
   const p=path[k],d=(x-p.x)**2+(y-p.y)**2;if(d<distance){distance=d;nearest=k;}
  }
  const terminal=startArrow&&nearest<12||endArrow&&nearest>=path.length-12;
  if(distance>(terminal?12:shaft/2+.75)**2)return false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
   const n=(y+dy)*width+x+dx;if(mask[n]&&!seen.has(n)){seen.add(n);queue.push(n);}
  }
 }
 return true;
}
test('indexed coverage retains the exact dense source certificate for branches, loops, terminal ties and borders',()=>{
 let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let example=0;example<160;example++){
  const width=96,height=80,mask=new Uint8Array(width*height),path=[];
  let x=20,y=20;
  for(let k=0;k<70;k++){
   x=Math.max(0,Math.min(width-1,x+(random()<.8?1:-1)));
   y=Math.max(0,Math.min(height-1,y+Math.floor(random()*3)-1));path.push({x,y});
   for(let dy=-example%7;dy<=example%7;dy++)for(let dx=-2;dx<=2;dx++)
    if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)mask[(y+dy)*width+x+dx]=1;
  }
  const before=mask.slice(),args=[mask,width,height,path,1+example%5,!!(example%2),!!(example%3)];
  assert.equal(measure(...args,{checks:0}),dense(...args,{checks:0}),`example ${example}`);
  assert.deepEqual(mask,before);
 }
 assert.equal(measure(new Uint8Array(1),1,1,[],3,false,false,{checks:0}),false);
});
test('long source paths reduce actual coverage work without expanding or resetting the geometry budget',()=>{
 const width=420,height=80,path=Array.from({length:380},(_,i)=>({x:20+i,y:40})),mask=new Uint8Array(width*height);
 for(const p of path)for(let dy=-1;dy<=1;dy++)mask[(p.y+dy)*width+p.x]=1;
 const oldWork={checks:0},work={checks:0},args=[mask,width,height,path,3,false,false];
 assert.equal(measure(...args,work),true);assert.equal(dense(...args,oldWork),true);
 assert.ok(work.checks<oldWork.checks/3);
 const exhausted={checks:4000000};assert.equal(measure(...args,exhausted),false);assert.equal(exhausted.checks,4000001);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});
