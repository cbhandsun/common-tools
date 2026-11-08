'use strict';
// Independent dense normal-equation reference for small test inputs only.
function denseSmooth(points,targets){
 const n=points.length,w=Array(n).fill(.02),t=points.map(p=>({...p}));
 for(const row of targets){w[row.index]=1;t[row.index].x+=row.dx;t[row.index].y+=row.dy;}
 const h=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
 const d=Array.from({length:n-2},(_,i)=>{const l=2/(h[i]*(h[i]+h[i+1])),r=2/(h[i+1]*(h[i]+h[i+1]));return Array.from({length:n},(_,j)=>j===i?l:j===i+1?-l-r:j===i+2?r:0);});
 const a=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>(i===j?w[i]:0)+16*d.reduce((s,r)=>s+r[i]*r[j],0)));
 const matrix=a.slice(1,-1).map((r,i)=>r.slice(1,-1).map((v,j)=>v+(i===j?1:0)));
 function solve(rhs){
  const m=matrix.map((r,i)=>[...r,rhs[i]]),size=m.length;
  for(let i=0;i<size;i++){
   let pivot=i;for(let j=i+1;j<size;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
   [m[i],m[pivot]]=[m[pivot],m[i]];const scale=m[i][i];for(let j=i;j<=size;j++)m[i][j]/=scale;
   for(let k=0;k<size;k++)if(k!==i){const factor=m[k][i];for(let j=i;j<=size;j++)m[k][j]-=factor*m[i][j];}
  }
  return m.map(r=>r[size]);
 }
 const z=points.map(p=>({...p})),u=points.map(()=>({x:0,y:0}));
 for(let iteration=0;iteration<8;iteration++){
  const q=points.map(p=>({...p}));
  for(const axis of ['x','y']){
   const rhs=points.slice(1,-1).map((_,i)=>{const at=i+1;return w[at]*t[at][axis]-a[at][0]*points[0][axis]-a[at][n-1]*points[n-1][axis]+z[at][axis]-u[at][axis];});
   const answer=solve(rhs);for(let i=1;i<n-1;i++)q[i][axis]=answer[i-1];
  }
  for(let i=1;i<n-1;i++){
   const dx=q[i].x+u[i].x-points[i].x,dy=q[i].y+u[i].y-points[i].y,factor=Math.min(1,.5/Math.max(Math.hypot(dx,dy),1e-30));
   z[i]={x:points[i].x+dx*factor,y:points[i].y+dy*factor};u[i].x+=q[i].x-z[i].x;u[i].y+=q[i].y-z[i].y;
  }
 }
 return z;
}
module.exports={denseSmooth};
