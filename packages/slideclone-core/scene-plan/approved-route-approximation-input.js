// @ts-check
'use strict';
const {record,list,identifier,hash,snapshot,fingerprint}=require('./approved-frame-application-input');
/** An installed host service carries approval of this exact source, member
 * snapshot and measured stroke. A serialized job option installs no service.
 * @param {unknown} options @param {{width:number,height:number,sha256:string}} source */
function approvedRouteApproximationOption(options,source){
 if(options===undefined)return null;const opts=record(options);
 if(Object.keys(opts).some(k=>!['cardBackdrop','nativeRoute'].includes(k)))throw new TypeError('approved-route-option-invalid');
 if(opts.nativeRoute===undefined)return null;
 const input=record(opts.nativeRoute),s=record(input.source);
 if(Object.keys(input).some(k=>!['approvalId','source','relationId','members','endpoints','points','color','widthPx','direction'].includes(k))
  ||Object.keys(s).length!==3||s.width!==source.width||s.height!==source.height||s.sha256!==source.sha256)
  throw new TypeError('approved-route-host-binding-invalid');
 const approvalId=identifier(input.approvalId),relationId=identifier(input.relationId);
 if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(relationId)||typeof input.direction!=='string'||!['forward','backward','both','none'].includes(input.direction)
  ||typeof input.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(input.color)
  ||typeof input.widthPx!=='number'||!Number.isFinite(input.widthPx)||input.widthPx<=0||input.widthPx>100)
  throw new TypeError('approved-route-stroke-invalid');
 const points=list(input.points,16).map(value=>{
  const p=record(value);if(Object.keys(p).length!==2||![p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n))
   ||Number(p.x)<0||Number(p.y)<0||Number(p.x)>=source.width||Number(p.y)>=source.height)throw new TypeError('approved-route-point-invalid');
  return {x:Number(p.x),y:Number(p.y)};
 });
 if(points.length<2||points.some((p,i)=>i>0&&Math.hypot(p.x-Number(points[i-1]?.x),p.y-Number(points[i-1]?.y))<1e-6))
  throw new TypeError('approved-route-points-invalid');
 /** @param {unknown} value @param {number} limit */
 const members=(value,limit)=>list(value,limit).map(value=>{const row=record(value);
  if(Object.keys(row).length!==2)throw new TypeError('approved-route-member-invalid');
  return {id:identifier(row.id),fingerprint:hash(row.fingerprint)};
 });
 const retired=members(input.members,32),endpoints=members(input.endpoints,2);
 if(retired.length<3||endpoints.length!==2||new Set([...retired,...endpoints].map(m=>m.id)).size!==retired.length+2)
  throw new TypeError('approved-route-members-invalid');
 const parsed={approvalId,relationId,direction:input.direction,source:{...source},points,color:input.color.toUpperCase(),widthPx:input.widthPx,members:retired,endpoints};
 // Snapshotting also bounds strings and excludes later caller mutation.
 const reviewFingerprint=fingerprint(parsed);snapshot(parsed);
 return {...parsed,reviewFingerprint};
}
module.exports={approvedRouteApproximationOption};
