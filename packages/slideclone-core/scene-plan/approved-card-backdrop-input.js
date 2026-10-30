// @ts-check
'use strict';
const {record,list,fingerprint}=require('./approved-frame-application-input');
const POLICY='approved-n10-fixed-page-backdrop-v1';
const MEMBERS=Object.freeze(['scene-container-region-n10','scene-container-object-n128','scene-outline-region-n10','scene-outline-region-n10-paint-0',
 'scene-icon-object-n129','scene-icon-object-n130','scene-icon-object-n131','p0-ocr-044','p0-ocr-047','p0-ocr-050','p0-ocr-053','p0-ocr-057','p0-ocr-060','p0-ocr-067']);
const GEOMETRY=Object.freeze({x:376,y:1043,w:337,h:325}),IMPACT=Object.freeze({x:376,y:1042,w:337,h:326});
/** @param {unknown} value @param {Record<string,number>} expected */
function exactBox(value,expected){const box=record(value);if(Object.keys(box).length!==4||Object.entries(expected).some(([k,v])=>box[k]!==v))throw new TypeError('approved-card-backdrop-scope-invalid');return {...expected};}
/** Explicit trusted HOST option. Serialized job metadata never installs it.
 * Fixed IDs/scope correspond only to the approval reviewed in this workflow.
 * No source measurement, source footprint or erasure permission is issued.
 * @param {unknown} value @param {{width:number,height:number,sha256:string}} source */
function parseApprovedCardBackdrop(value,source){
 const review=record(value),s=record(review.source);
 if(Object.keys(review).some(k=>!['approvalId','source','regionId','geometryBoundsPx','impactBoundsPx','color','members'].includes(k))
  ||review.approvalId!=='user-20261023-n10-card-backdrop-only'||review.regionId!=='region-n10'
  ||typeof review.color!=='string'||review.color.toUpperCase()!=='#FBFAF8'||Object.keys(s).length!==3
  ||s.width!==1086||s.height!==1448||s.width!==source.width||s.height!==source.height||s.sha256!==source.sha256)
  throw new TypeError('approved-card-backdrop-host-binding-invalid');
 const geometry=exactBox(review.geometryBoundsPx,GEOMETRY),impact=exactBox(review.impactBoundsPx,IMPACT),members=list(review.members,14).map(value=>{
  const row=record(value);if(Object.keys(row).length!==2||typeof row.id!=='string'||!MEMBERS.includes(row.id)||typeof row.fingerprint!=='string'||!/^[a-f0-9]{64}$/u.test(row.fingerprint))
   throw new TypeError('approved-card-backdrop-member-invalid');return {id:row.id,fingerprint:row.fingerprint};
 });
 if(members.length!==14||new Set(members.map(m=>m.id)).size!==14)throw new TypeError('approved-card-backdrop-members-incomplete');
 const parsed={policy:POLICY,approvalId:review.approvalId,regionId:'region-n10',source:{...source},geometryBoundsPx:geometry,impactBoundsPx:impact,color:'#FBFAF8',members};
 for(const member of members)Object.freeze(member);Object.freeze(members);Object.freeze(parsed.source);Object.freeze(geometry);Object.freeze(impact);
 return Object.freeze({...parsed,reviewFingerprint:fingerprint(parsed)});
}
module.exports={parseApprovedCardBackdrop,POLICY,MEMBERS,GEOMETRY,IMPACT};
