// @ts-check
"use strict";
/** @typedef {{x:number,y:number}} Point */
/** Split a cubic at its actual vertical extrema, then find each scan-row
 * intersection on a monotone interval. No polygon approximation, expanded
 * perimeter, bounding-box ownership or additional source scan is introduced.
 * @param {[Point,Point,Point,Point]} points @param {number} row */
function cubicRowCrossings(points,row){
 const [p0,p1,p2,p3]=points;
 /** @param {'x'|'y'} axis */
 const coefficients=axis=>({a:-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis],b:3*p0[axis]-6*p1[axis]+3*p2[axis],c:-3*p0[axis]+3*p1[axis],d:p0[axis]});
 const x=coefficients('x'),y=coefficients('y');
 /** @param {ReturnType<typeof coefficients>} c @param {number} t */
 const evaluate=(c,t)=>((c.a*t+c.b)*t+c.c)*t+c.d;
 const a=3*y.a,b=2*y.b,c=y.c,cuts=[0,1];
 if(a===0){if(b!==0)cuts.push(-c/b);}
 else{const discriminant=b*b-4*a*c;if(discriminant>=0){const sqrt=Math.sqrt(discriminant);cuts.push((-b-sqrt)/(2*a),(-b+sqrt)/(2*a));}}
 const breaks=[...new Set(cuts.filter(t=>Number.isFinite(t)&&t>=0&&t<=1))].sort((a,b)=>a-b);
 /** @type {{x:number,delta:number}[]} */const crossings=[];
 for(let i=1;i<breaks.length;i++){
  const first=breaks[i-1],last=breaks[i];if(first===undefined||last===undefined)continue;
  const lowY=evaluate(y,first),highY=evaluate(y,last),increasing=highY>lowY;
  if(!(lowY<=row&&highY>row||highY<=row&&lowY>row))continue;
  let lo=first,hi=last,t=first;
  if(row===lowY)t=first;
  else if(row===highY)t=last;
  else{
   for(let step=0;step<52;step++){t=(lo+hi)/2;const value=evaluate(y,t);if(value===row)break;if((value<row)===increasing)lo=t;else hi=t;}
  }
  crossings.push({x:evaluate(x,t),delta:increasing?1:-1});
 }
 return crossings;
}
module.exports={cubicRowCrossings};
