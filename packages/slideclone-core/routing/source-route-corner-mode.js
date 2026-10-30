// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {encodeNativeFreeformPath}=require('../scene-plan/native-freeform-path');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {'auto'|'rounded-freeform'|'reroutable-elbow'} ConnectorCornerMode */
/** @param {unknown} value @returns {ConnectorCornerMode} */
function parseConnectorCornerMode(value){
 // Every unconfigured entrypoint must preserve Office endpoint following.
 // Rounded freeforms remain an explicit visual strategy, not the default.
 if(value===undefined)return 'reroutable-elbow';
 if(value!=='auto'&&value!=='rounded-freeform'&&value!=='reroutable-elbow')throw new TypeError('Connector corner mode is invalid');
 return value;
}
/** @param {Point} p @param {Point} a @param {Point} b */
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
 const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** Measured centerline departure from a sharp corner estimates its fillet.
 * A sharp source vertex has zero departure. No raster dilation can create a
 * missing branch or grant a source proof through this geometry-only writer.
 * @param {Point[]} measured @param {Point[]} route */
function sourceCornerRadii(measured,route){
 return route.slice(1,-1).map((corner,i)=>{
  let nearest=Infinity;
  for(let k=1;k<measured.length;k++)nearest=Math.min(nearest,distance(corner,/** @type {Point} */(measured[k-1]),/** @type {Point} */(measured[k])));
  const a=/** @type {Point} */(route[i]),b=/** @type {Point} */(route[i+2]);
  return Math.min(nearest/(Math.SQRT2-1),Math.hypot(corner.x-a.x,corner.y-a.y)/2,Math.hypot(corner.x-b.x,corner.y-b.y)/2,32);
 });
}
/** One unrotated open native path; endpoints and arrow tangents are exact.
 * Coordinates are generated in source pixels before anisotropic slide scaling.
 * @param {{measured:Point[],route:Point[],sx:number,sy:number,mode?:unknown}} input */
function roundedSourceRoute(input){
 if(!record(input))throw new TypeError('Rounded route controls are invalid');
 const {measured,route,sx,sy}=input,mode=parseConnectorCornerMode(input.mode);
 if(![sx,sy].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||![measured,route].every(ps=>list(ps)&&ps.length>=2&&ps.length<=4096&&ps.every(p=>record(p)&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)))||route.length>6)throw new TypeError('Rounded route geometry is invalid');
 if(mode==='reroutable-elbow'||route.length<3)return null;
 for(let i=1;i<route.length;i++){const a=/** @type {Point} */(route[i-1]),b=/** @type {Point} */(route[i]);
  if(Math.hypot(b.x-a.x,b.y-a.y)<1e-6||Math.abs(a.x-b.x)>1e-6&&Math.abs(a.y-b.y)>1e-6)return null;}
 const observed=sourceCornerRadii(measured,route),radii=observed.map((r,i)=>{
  if(r>=4)return r;
  if(mode==='auto')return 0;
  const p=/** @type {Point} */(route[i+1]),a=/** @type {Point} */(route[i]),b=/** @type {Point} */(route[i+2]);
  return Math.min(14,Math.hypot(p.x-a.x,p.y-a.y)/2,Math.hypot(p.x-b.x,p.y-b.y)/2);
 });
 if(!radii.some(r=>r>0))return null;
 const xs=route.map(p=>p.x*sx),ys=route.map(p=>p.y*sy),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(w<=0||h<=0)return null;
 /** @param {Point} p */const normalized=p=>({x:Math.max(0,Math.min(1,(p.x*sx-x)/w)),y:Math.max(0,Math.min(1,(p.y*sy-y)/h))});
 /** @type {{type:string,points:Point[]}[]} */const segments=[{type:'moveTo',points:[normalized(/** @type {Point} */(route[0]))]}];
 const kappa=4*(Math.SQRT2-1)/3;
 for(let i=1;i<route.length-1;i++){
  const a=/** @type {Point} */(route[i-1]),p=/** @type {Point} */(route[i]),b=/** @type {Point} */(route[i+1]),r=radii[i-1]??0;
  const before=Math.hypot(p.x-a.x,p.y-a.y),after=Math.hypot(b.x-p.x,b.y-p.y),u={x:(p.x-a.x)/before,y:(p.y-a.y)/before},v={x:(b.x-p.x)/after,y:(b.y-p.y)/after};
  const entry={x:p.x-u.x*r,y:p.y-u.y*r},exit={x:p.x+v.x*r,y:p.y+v.y*r};
  segments.push({type:'lnTo',points:[normalized(entry)]});
  if(r)segments.push({type:'cubicBezTo',points:[normalized({x:entry.x+u.x*kappa*r,y:entry.y+u.y*kappa*r}),normalized({x:exit.x-v.x*kappa*r,y:exit.y-v.y*kappa*r}),normalized(exit)]});
 }
 segments.push({type:'lnTo',points:[normalized(/** @type {Point} */(route.at(-1)))]});
 return {box:{x,y,w,h},style:{closed:false,freeformPath:encodeNativeFreeformPath(segments)},radii:observed};
}
module.exports={parseConnectorCornerMode,roundedSourceRoute,sourceCornerRadii};
