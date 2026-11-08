'use strict';
const { required } = require("./approved-frame-bounds");
const {types}=require('node:util');
const { readApprovedFrameBytes: bytes } = require('./approved-frame-bytes');
const {buildApprovedFrameMask,signedDistance,digest}=require('./approved-frame-mask.js');
const APPROVAL='user-20261023-approx-frame';
/** @param {unknown} v @returns {Record<string,unknown>} */
function rec(v){if(!v||typeof v!=='object'||types.isProxy(v))throw new TypeError('invalid-record');const p=Object.getPrototypeOf(v);if(p!==Object.prototype&&p!==null)throw new TypeError('invalid-record');if(Reflect.ownKeys(v).some(k=>typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value'in d)))throw new TypeError('invalid-record');return /** @type {Record<string,unknown>} */(v);}
/** @param {unknown} v @param {number} limit @returns {unknown[]} */
function arr(v,limit){if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)throw new TypeError('invalid-array');if(v.length>limit||Reflect.ownKeys(v).length!==v.length+1||Object.keys(v).length!==v.length||Object.keys(v).some((key,i)=>key!==String(i))||Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>!('value'in d)))throw new TypeError('invalid-array');return v;}
/** @param {unknown} v @param {number} lo @param {number} hi */
function num(v,lo,hi){if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi)throw new TypeError('invalid-number');return v;}
/** @param {unknown} v */
function hash(v){if(typeof v!=='string'||! /^[a-f0-9]{64}$/.test(v))throw new TypeError('invalid-hash');return v;}
/** @param {unknown} v */
function image(v){const r=rec(v),width=num(r.width,1,32768),height=num(r.height,1,32768);if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width*height>40_000_000)throw new RangeError('image-boundary');return{width,height,rgba:bytes(r.rgba,width*height*4)};}
/** @param {{x:number,y:number,w:number,h:number,radius:number}} f @param {number} x @param {number} y */
function normal(f,x,y){const dx=x-f.x-f.w/2,dy=y-f.y-f.h/2,qx=Math.abs(dx)-(f.w/2-f.radius),qy=Math.abs(dy)-(f.h/2-f.radius);if(qx>0&&qy>0){const length=Math.hypot(qx,qy);return{x:Math.sign(dx)*qx/length,y:Math.sign(dy)*qy/length};}return qx>qy?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};}
/** @param {{x:number,y:number}} p @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function dist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** @param {unknown} input */
function buildBackgroundPlan(input){
 const data=rec(input),base=buildApprovedFrameMask(input),source=image(data.source);
 if(base.maskSha256!==hash(data.originalMaskSha256))throw new TypeError('original-mask-binding');
 const evidenceHash=hash(data.supplementEvidenceSha256);
 const frames=arr(data.frames,3).map(value=>{const r=rec(value),g=rec(r.geometry),b=rec(g.boxPx);return{id:String(r.id),x:num(b.x,0,32768),y:num(b.y,0,32768),w:num(b.w,1,32768),h:num(b.h,1,32768),radius:num(g.radiusPx,1,24),halfBand:num(g.strokeWidthPx,.25,6)/2+2};});
 const protections=arr(data.protections,512).map(value=>{const r=rec(value),points=arr(r.points,2048).map(value=>{const p=rec(value);return{x:num(p.x,-32768,65536),y:num(p.y,-32768,65536)};});const radius=num(r.widthPx,0,64)/2+num(r.marginPx,0,2);return{id:String(r.id),kind:r.kind,points,radius,box:{x:Math.min(...points.map(p=>p.x))-radius,y:Math.min(...points.map(p=>p.y))-radius,r:Math.max(...points.map(p=>p.x))+radius,b:Math.max(...points.map(p=>p.y))+radius}};});
 let work=base.work;const charge=()=>{if(++work>4_000_000)throw new RangeError('work-boundary');};
 /** @param {number} x @param {number} y */
 function protectedAt(x,y){for(const p of protections){if(x<p.box.x||x>p.box.r||y<p.box.y||y>p.box.b)continue;let inside=false;for(let j=0;j<p.points.length-(p.kind==='polygon'?0:1);j++){charge();const a=required(p.points, j),b=required(p.points, (j+1)%p.points.length);if(dist({x,y},a,b)<=p.radius){inside=true;break;}if(p.kind==='polygon'&&((a.y>y)!==(b.y>y))&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(inside)return true;}return false;}
 const unionMask=Uint8Array.from(base.mask),supplement=[],seen=new Set(),supplementReport={requested:0,alreadyInOriginal:0,protectedExcluded:0,addedOutsideOriginal:0,coordinateSha256:'',evidenceSha256:evidenceHash};
 for(const value of arr(data.supplement,169)){
  const p=rec(value),x=num(p.x,0,source.width-1),y=num(p.y,0,source.height-1);if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))throw new TypeError('invalid-rail-coordinate');
  const f=frames.find(f=>f.id===p.frameId);if(!f)throw new TypeError('rail-frame-binding');
  const n=y*source.width+x;if(seen.has(n))throw new TypeError('duplicate-rail-cell');seen.add(n);
  const rgba=arr(p.sourceRGBA,4);if(rgba.length!==4||rgba.some((v,c)=>num(v,0,255)!==required(source.rgba, n*4+c)))throw new TypeError('rail-source-binding');
  if(Math.abs(signedDistance(f,x,y))>f.halfBand+1+1e-8)throw new RangeError('rail-outside-local-band');
  supplementReport.requested++;supplement.push({frameId:f.id,x,y,sourceRGBA:rgba});
  if(protectedAt(x,y)){supplementReport.protectedExcluded++;continue;}
  if(required(unionMask, n))supplementReport.alreadyInOriginal++;else{unionMask[n]=1;supplementReport.addedOutsideOriginal++;}
 }
 supplement.sort((a,b)=>a.y-b.y||a.x-b.x);supplementReport.coordinateSha256=digest(Buffer.from(JSON.stringify(supplement)));
 const repairMask=new Uint8Array(unionMask.length),replacementRGBA=Buffer.alloc(source.width*source.height*4),failures=Object.create(null),failureExamples=[],reports=frames.map(f=>({frameId:f.id,requested:0,reconstructed:0,noWitness:0}));
 for(let index=0;index<unionMask.length;index++)if(required(unionMask, index)){
  const x=index%source.width,y=Math.floor(index/source.width),f=frames.reduce((best,current)=>Math.abs(signedDistance(current,x,y))<Math.abs(signedDistance(best,x,y))?current:best,required(frames, 0)),report=reports.find(row=>row.frameId===f.id);if(!report)throw new TypeError('missing-frame-report');report.requested++;
  let failure='';if(required(source.rgba, index*4+3)!==255)failure='source-not-opaque';if(protectedAt(x,y))failure='protected-target';
  const sd=signedDistance(f,x,y),n=normal(f,x,y),cx=x-n.x*sd,cy=y-n.y*sd;
  /** @type {{rgb:number[],position:number}[]} */ const sides=[];
  if(!failure)for(const direction of[-1,1]){
   /** @type {{rgb:number[],position:number}[]} */ const witnesses=[];
   for(const extra of[3,4]){
    const wx=Math.round(cx+n.x*(f.halfBand+extra)*direction),wy=Math.round(cy+n.y*(f.halfBand+extra)*direction);
    if(wx<0||wy<0||wx>=source.width||wy>=source.height){failure='background-outside-source';break;}
    const at=(wy*source.width+wx)*4,rgb=[required(source.rgba, at),required(source.rgba, at+1),required(source.rgba, at+2)];
    if(required(source.rgba, at+3)!==255||Math.min(...rgb)<220||Math.max(...rgb)-Math.min(...rgb)>40||required(unionMask, wy*source.width+wx)||protectedAt(wx,wy)){failure='background-not-visible-pale';break;}
    witnesses.push({rgb,position:(wx-cx)*n.x+(wy-cy)*n.y});
   }
   if(failure)break;
   if(Math.max(...[0,1,2].map(c=>Math.abs(required(required(witnesses, 0).rgb, c)-required(required(witnesses, 1).rgb, c))))>6){failure='background-inconsistent-side';break;}
   sides.push({rgb:[0,1,2].map(c=>(required(required(witnesses, 0).rgb, c)+required(required(witnesses, 1).rgb, c))/2),position:(required(witnesses, 0).position+required(witnesses, 1).position)/2});
  }
  if(!failure&&Math.max(...[0,1,2].map(c=>Math.abs(required(required(sides, 0).rgb, c)-required(required(sides, 1).rgb, c))))>40)failure='background-transition-too-large';
  if(failure){report.noWitness++;failures[failure]=(failures[failure]||0)+1;if(failureExamples.length<256)failureExamples.push({x,y,frameId:f.id,reason:failure,fromSupplement:!base.mask[index]});continue;}
  const t=Math.max(0,Math.min(1,(sd-required(sides, 0).position)/(required(sides, 1).position-required(sides, 0).position)));
  for(let c=0;c<3;c++)replacementRGBA[index*4+c]=Math.round(required(required(sides, 0).rgb, c)*(1-t)+required(required(sides, 1).rgb, c)*t);replacementRGBA[index*4+3]=255;repairMask[index]=1;report.reconstructed++;
 }
 return{version:2,approvalId:APPROVAL,repairPolicy:'approved-local-normal-background-interpolation-v2',approximateBackground:true,sourceReconstruction:true,inferredFill:true,strictAccepted:false,noGhostVerified:false,
  width:source.width,height:source.height,sourceSha256:base.sourceSha256,sourceRgbaSha256:base.sourceRgbaSha256,fitSha256:base.fitSha256,originalMaskSha256:base.maskSha256,unionMask,unionMaskSha256:digest(unionMask),repairMask,repairMaskSha256:digest(repairMask),replacementRGBA,replacementRgbaSha256:digest(replacementRGBA),supplementReport,reports,failures,failureExamples,work,
  policy:{normalOffsets:'centerline +/-(stroke/2+2+3), +/-(stroke/2+2+4)',sameSideMaxDelta:6,minBackgroundChannel:220,maxBackgroundChroma:40,maxTransitionDelta:40,supplementBandSlackPx:1,maxWitnessExamples:256},limitations:['approximate-background-reconstruction','missing-witness-keeps-original','unselected-opaque-frame-paint-may-remain','Office-appearance-and-noGhost-not-verified']};
}
/** @param {unknown} input */
function applyBackgroundPlan(input){
 const data=rec(input),asset=image(data.asset),source=image(data.source),plan=rec(data.plan),r=rec(data.registration);
 if(plan.approvalId!==APPROVAL||plan.version!==2||plan.width!==source.width||plan.height!==source.height||digest(source.rgba)!==hash(plan.sourceRgbaSha256))throw new TypeError('plan-source-binding');
 const mask=bytes(plan.repairMask,source.width*source.height),union=bytes(plan.unionMask,source.width*source.height),replacement=bytes(plan.replacementRGBA,source.width*source.height*4);
 if(digest(mask)!==hash(plan.repairMaskSha256)||digest(union)!==hash(plan.unionMaskSha256)||digest(replacement)!==hash(plan.replacementRgbaSha256))throw new TypeError('plan-bytes-binding');
 for(let i=0;i<source.width*source.height;i++)if((required(mask, i)!==0&&required(mask, i)!==1)||(required(union, i)!==0&&required(union, i)!==1)||(required(mask, i)&&!required(union, i)))throw new TypeError('invalid-plan-mask');
 const x=num(r.x,-.02,source.width),y=num(r.y,-.02,source.height),w=num(r.w,1,32768),h=num(r.h,1,32768),ox=Math.round(x),oy=Math.round(y);
 if(Math.max(Math.abs(x-ox),Math.abs(y-oy),Math.abs(w-asset.width),Math.abs(h-asset.height))>.02||ox<0||oy<0||ox+asset.width>source.width||oy+asset.height>source.height)throw new RangeError('registration-mismatch');
 const rgba=Buffer.alloc(asset.width*asset.height*4);for(let i=0;i<rgba.length;i++)rgba[i]=required(asset.rgba, i);
 let newlyReconstructed=0,alreadyTransparent=0,sourceConflictCount=0,noWitnessOpaque=0;const sourceConflictExamples=[];
 for(let yy=0;yy<asset.height;yy++)for(let xx=0;xx<asset.width;xx++){
  const n=(oy+yy)*source.width+ox+xx,at=(yy*asset.width+xx)*4;if(!required(union, n))continue;
  if(required(rgba, at+3)===0){alreadyTransparent++;continue;}
  if([0,1,2,3].some(c=>required(rgba, at+c)!==required(source.rgba, n*4+c))){sourceConflictCount++;if(sourceConflictExamples.length<256)sourceConflictExamples.push(n);continue;}
  if(!required(mask, n)){noWitnessOpaque++;continue;}
  if(required(replacement, n*4+3)!==255)throw new TypeError('replacement-not-opaque');
  for(let c=0;c<4;c++)rgba[at+c]=required(replacement, n*4+c);newlyReconstructed++;
 }
 return{width:asset.width,height:asset.height,rgba,newlyReconstructed,newlyErased:newlyReconstructed,alreadyTransparent,sourceConflictCount,sourceConflictExamples,noWitnessOpaque,
  outsideEffectiveUnionChanges:0,alreadyTransparentRgbaChanges:0,sourceRgbaConflictChanges:0,approximateBackground:true,inputRgbaSha256:digest(asset.rgba),outputRgbaSha256:digest(rgba)};
}
module.exports={buildBackgroundPlan,applyBackgroundPlan};
