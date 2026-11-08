// @ts-check
'use strict';
const {parseNativeRouteChainInput}=require('./source-route-native-chain-input');
const {createNativeRouteGeometry}=require('./source-route-native-elbow');
const {nativeSourceRouteGradient}=require('./source-route-native-gradient');
const {sourceRouteSegmentGradient}=require('./source-route-paint');
const {chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {import('./source-route-native-chain-input').Point} Point */
/** @typedef {{low:number,high:number,route:Point[],connector:NonNullable<ReturnType<ReturnType<typeof createNativeRouteGeometry>['nativeElbowConnector']>>,gradient?:NonNullable<ReturnType<typeof nativeSourceRouteGradient>>}} ChainPiece */
/** Bounded farthest-first fitting at EXISTING measured vertices. This is a
 * representation solver, not a source/erasure authority or a global optimum.
 * A caller must check the complete network topology and retain original path
 * identities before binding. A budget failure never returns a partial chain.
 * @param {unknown} input @returns {{pieces:ChainPiece[]}} */
function fitNativeSourceRouteChain(input){
 const {points,indices,samples,paint,sourceOrigin,widthPx,sx,sy,work,sourceInk}=parseNativeRouteChainInput(input);
 const {orthogonalSourceRoute,nativeElbowConnector,nativeElbowVertices}=createNativeRouteGeometry(work);
 /** @param {number} count */
 const reserve=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @type {ChainPiece[]} */const pieces=[];let low=0;
 while(low<points.length-1){let found=false;
  for(let high=points.length-1;high>low;high--){
   reserve((high-low+1)*3+8);
   const source=points.slice(low,high+1),sampleLow=/** @type {number} */(indices[low]),sampleHigh=/** @type {number} */(indices[high]);
   const route=high===low+1?source:orthogonalSourceRoute(source,{widthPx});if(!route)continue;
   const connector=nativeElbowConnector(route.map(p=>({x:p.x*sx,y:p.y*sy})));if(!connector)continue;
   reserve(route.length*3+12);
   // Check/bind the preset's actual rounded adjustments, not ideal vertices.
   const drawn=nativeElbowVertices(connector).map(p=>({x:p.x/sx,y:p.y/sy}));
   const actual=drawn.filter((p,i)=>i===0||Math.hypot(p.x-(drawn[i-1]?.x??NaN),p.y-(drawn[i-1]?.y??NaN))>1e-9);
   // A width-dependent orthogonal fit can shift real arms by several pixels.
   // When the compiler supplies privately observed shaft pixels, inspect the
   // actual preset legs BEFORE accepting a merged candidate. Whole-network
   // source coverage still runs before both output registries.
   reserve(high===low+1?0:sourceInk.length);
   const ink=high===low+1?[]:sourceInk.filter(p=>p.index>=sampleLow&&p.index<=sampleHigh);reserve(ink.length*Math.max(0,actual.length-1));
   let retainsInk=true;
   for(const p of ink){
    const x=p.x+sourceOrigin.x,y=p.y+sourceOrigin.y;let closest=Infinity;
    for(let j=1;j<actual.length;j++){
     const a=/** @type {Point} */(actual[j-1]),b=/** @type {Point} */(actual[j]),dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,
      t=d?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/d)):0;
     closest=Math.min(closest,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
    }
    if(closest>widthPx/2+.75){retainsInk=false;break;}
   }
   if(!retainsInk)continue;
   /** @type {ChainPiece['gradient']} */let gradient;
   if(paint.stops&&paint.positions){
    const count=sampleHigh-sampleLow+1;
    // Both axes, every color channel and each of the <=6 original stops.
    // Spatial evaluation uses at most six stops and two endpoint colors.
    reserve(high===low+1?128:paint.spatial?count*3+128:count*64+128);
    if(high===low+1&&!paint.spatial){
     const a=/** @type {Point} */(source[0]),b=/** @type {Point} */(source.at(-1));
     gradient=sourceRouteSegmentGradient(paint.stops,paint.positions[sampleLow]??NaN,paint.positions[sampleHigh]??NaN,Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);
    }else{
     gradient=nativeSourceRouteGradient(samples.slice(sampleLow,sampleHigh+1),{stops:paint.stops,positions:paint.positions.slice(sampleLow,sampleHigh+1),...(paint.spatial?{spatial:paint.spatial}:{})},
      actual.map(p=>({x:p.x-sourceOrigin.x,y:p.y-sourceOrigin.y})));
     if(!gradient)continue;
    }
   }
   pieces.push({low,high,route:actual,connector,...(gradient?{gradient}:{})});low=high;found=true;break;
  }
  if(!found)throw new TypeError('Native route chain is not representable');
 }
 return {pieces};
}
module.exports={fitNativeSourceRouteChain};
