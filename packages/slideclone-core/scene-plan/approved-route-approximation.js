// @ts-check
'use strict';
const {record,list,fingerprint}=require('./approved-frame-application-input');
const {approvedRouteApproximationOption}=require('./approved-route-approximation-input');
const {summarizeSceneRouteRepresentations}=require('./source-scene-route-representation');
const {sourceRoutePolyline}=require('../routing/source-route-polyline');
const {nativeElbowConnector}=require('../routing/source-route-native-elbow');
const {parseConnectorCornerMode}=require('../routing/source-route-corner-mode');
const {prepareApprovedRouteMaterialization}=require('./approved-route-materialization');
const {sourceMeasuredOutlineAncestor}=require('./source-measured-outline-compatibility');
const {fitWholeRouteNativeConnector}=require('../routing/whole-route-native-connector');
/** Replace only approved final IR members, after all source erasure. No asset
 * is opened or modified. Exact source/member/endpoint snapshots fence the
 * host approval; neither source flags nor requested modes create authority.
 * @param {NonNullable<ReturnType<typeof approvedRouteApproximationOption>>} policy
 * @param {{deck:Record<string,unknown>,shapes:unknown[],images:unknown[],texts:unknown[],connectorCornerMode?:unknown}} input */
function prepareApprovedRouteApproximation(policy,input){
 record(input);
 const {deck,shapes,images,texts}=input,connectorCornerMode=parseConnectorCornerMode(input.connectorCornerMode);
 const slide=record(deck.slideSize);
 if(![slide.widthPt,slide.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))
  throw new TypeError('approved-route-slide-invalid');
 const sx=Number(slide.widthPt)/policy.source.width,sy=Number(slide.heightPt)/policy.source.height;
 const all=[...shapes,...images,...texts].map(record),ids=new Set(policy.members.map(m=>m.id));
 const retired=shapes.map(record).filter(s=>ids.has(/** @type {string} */(s.id)));
 /** @type {NonNullable<ReturnType<typeof sourceMeasuredOutlineAncestor>>[]} */const sourceAppearanceRevisions=[];
 for(const member of [...policy.members,...policy.endpoints]){
  const found=all.filter(s=>s.id===member.id);
  if(found.length!==1)throw new TypeError('approved-route-member-binding');
  if(fingerprint(found[0])!==member.fingerprint){
   const revision=policy.endpoints.includes(member)?sourceMeasuredOutlineAncestor(found[0],member.fingerprint,policy.source.sha256,all):null;
   if(!revision)throw new TypeError('approved-route-member-binding');sourceAppearanceRevisions.push(revision);
  }
 }
 if(retired.length!==policy.members.length||retired.some(s=>record(s.source).sceneRelationId!==policy.relationId)
  ||shapes.map(record).some(s=>s.source!==undefined&&record(s.source).sceneRelationId===policy.relationId&&!ids.has(/** @type {string} */(s.id))))
  throw new TypeError('approved-route-members-incomplete');
 const groups=new Set(retired.map(s=>record(s.source).nativeComponentGroupId).filter(id=>typeof id==='string'));
 if(all.some(s=>{if(ids.has(/** @type {string} */(s.id))||s.source===undefined)return false;
  const group=record(s.source).nativeComponentGroupId;return typeof group==='string'&&groups.has(group);}))
  throw new TypeError('approved-route-shared-group');
 const links=retired.filter(s=>s.type==='line'),fixed=retired.filter(s=>s.type==='freeform');
 if(links.length!==2||fixed.length+links.length!==retired.length||!fixed.length)throw new TypeError('approved-route-fixed-members-invalid');
 const start=links.map(s=>record(record(s.style).startAnchor)).filter(a=>a.elementId===policy.endpoints[0]?.id);
 const end=links.map(s=>record(record(s.style).endAnchor)).filter(a=>a.elementId===policy.endpoints[1]?.id);
 if(start.length!==1||end.length!==1)throw new TypeError('approved-route-external-attachments-invalid');
 const a=/** @type {Record<string,unknown>} */(start[0]),b=/** @type {Record<string,unknown>} */(end[0]);
 /** @param {Record<string,unknown>} anchor @param {{x:number,y:number}} point */
 const validateSite=(anchor,point)=>{
  const target=all.find(s=>s.id===anchor.elementId),box=record(target?.box);
  if(typeof anchor.side!=='string'||!['left','right','top','bottom'].includes(anchor.side)
   ||typeof anchor.position!=='number'||!Number.isFinite(anchor.position)||anchor.position<0||anchor.position>1
   ||[anchor.dxPt,anchor.dyPt].some(n=>n!==undefined&&(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000))
   ||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))||Number(box.w)<=0||Number(box.h)<=0)
   throw new TypeError('approved-route-site-invalid');
  const horizontal=anchor.side==='top'||anchor.side==='bottom';
  const x=Number(box.x)+(horizontal?Number(box.w)*anchor.position:anchor.side==='right'?Number(box.w):0)+Number(anchor.dxPt??0);
  const y=Number(box.y)+(horizontal?(anchor.side==='bottom'?Number(box.h):0):Number(box.h)*anchor.position)+Number(anchor.dyPt??0);
  if(Math.hypot(x-point.x*sx,y-point.y*sy)>1e-6)throw new TypeError('approved-route-point-attachment-mismatch');
 };
 validateSite(a,/** @type {{x:number,y:number}} */(policy.points[0]));validateSite(b,/** @type {{x:number,y:number}} */(policy.points.at(-1)));
 for(const item of all)if(!ids.has(/** @type {string} */(item.id))&&item.style!==undefined){
  const style=record(item.style);for(const key of ['startAnchor','endAnchor'])if(style[key]!==undefined
   &&ids.has(/** @type {string} */(record(style[key]).elementId)))throw new TypeError('approved-route-outside-reference');
 }
 const prefix=`approved-route-${policy.relationId}`,points=policy.points.map(p=>({x:p.x*sx,y:p.y*sy}));
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'approved-native-route-approximation',
  sceneRegionId:record(retired[0]?.source).sceneRegionId,sceneRelationId:policy.relationId,sceneInventoryId:policy.relationId,
  sourceNodeIds:policy.endpoints.map(e=>e.id),sourceRouteParts:1,
  approximationApprovalId:policy.approvalId,strictSourceEquivalent:false,sourceErasure:false};
 const connector=nativeElbowConnector(points);
 const measuredPath=connector?null:sourceRoutePolyline({points:policy.points,sx,sy}),outputWork={checks:0};
 // Prepare both representations privately. Existing pixel reviews consume the
 // original exact path; the transaction selects the native alternative only
 // after every application succeeds and before the final seal.
 const approximation=!connector&&measuredPath&&connectorCornerMode==='reroutable-elbow'?fitWholeRouteNativeConnector({
  part:{id:prefix,type:'freeform',box:measuredPath.box,style:{...measuredPath.style,fill:'none',strokeWidthPt:policy.widthPx*(sx+sy)/2}},work:outputWork}):null;
 const path=connector?null:measuredPath;
 if(!connector&&!path)throw new TypeError('approved-route-whole-path-invalid');
 const first=/** @type {{x:number,y:number}} */(points[0]),last=/** @type {{x:number,y:number}} */(points.at(-1));
 const parts=[{id:prefix,type:connector?'line':'freeform',
  box:path?.box??{x:first.x,y:first.y,w:last.x-first.x,h:last.y-first.y},
  style:{fill:'none',stroke:policy.color,strokeWidthPt:policy.widthPx*(sx+sy)/2,lineCap:'round',
   ...(connector??path?.style),startAnchor:{...a},endAnchor:{...b},
   ...(['backward','both'].includes(policy.direction)?{startArrow:'triangle',startArrowWidth:'medium',startArrowLength:'medium'}:{}),
   ...(['forward','both'].includes(policy.direction)?{endArrow:'triangle',endArrowWidth:'medium',endArrowLength:'medium'}:{})},
  source:{...source,nativeComponentRole:'relationship',role:'relationship',nativeConnectorRoute:!!connector}}];
 if(parts.some(p=>all.some(old=>old.id===p.id)))throw new TypeError('approved-route-output-conflict');
 let applied=false;
 const report={policy:'approved-measured-native-stroke-v1',approvalId:policy.approvalId,relationId:policy.relationId,sourceAppearanceRevisions,
  sourceSha256:policy.source.sha256,reviewFingerprint:policy.reviewFingerprint,retiredMemberIds:policy.members.map(m=>m.id),memberIds:parts.map(p=>p.id),
  nativeConnectors:connector?1:0,nativePaths:connector?0:1,internalJoints:0,wholeNativeObject:true,direction:policy.direction,externalAttachmentsPreserved:true,measuredVerticesPreserved:true,
  outputGeometryApproximation:/** @type {string|null} */(null),outputGeometryChecks:outputWork.checks,
  strictBaselineUnchanged:true,strictSourceEquivalent:false,sourceFootprint:false,sourceErasure:false,originalAssetsPreserved:true,
  nodeFollowingVerification:'not-assessed',wholeProductAcceptance:false,appliedAfterSourceErasure:true,appliedBeforeFinalSeal:true,
  finalOutputRepresentation:/** @type {ReturnType<typeof summarizeSceneRouteRepresentations>|null} */(null)};
 const nativePart=approximation?(()=>{
  const original=parts[0];if(!original)throw new TypeError('approved-route-whole-path-invalid');
  /** @type {Record<string,unknown>} */const style={...original.style,...approximation.connector};
  for(const key of ['freeformPath','freeformSegments','closed'])delete style[key];
  return {...original,type:'line',box:approximation.box,style,source:{...original.source,nativeConnectorRoute:true,
   nativeRoutePoints:approximation.points,outputGeometryApproximation:approximation.approximation,sourceFootprintVerified:false}};
 })():null;
 const selectReport=()=>{
  report.nativeConnectors=1;report.nativePaths=0;report.measuredVerticesPreserved=false;
  report.outputGeometryApproximation=approximation?.approximation??null;
  report.finalOutputRepresentation=summarizeSceneRouteRepresentations({page:record(list(deck.pages,1)[0]),connectorCornerMode,
   relations:[{relationId:policy.relationId,memberIds:parts.map(p=>p.id)}]});
 };
 const materialization=prepareApprovedRouteMaterialization(deck,policy,retired,record(parts[0]),nativePart?{output:nativePart,onSelected:selectReport}:undefined);
 /** @param {unknown[]} candidates */const apply=candidates=>{
  const rows=list(candidates,10000),matched=rows.filter(row=>ids.has(/** @type {string} */(record(row).id)));
  for(const revision of sourceAppearanceRevisions){
   const endpoints=rows.map(record).filter(row=>row.id===revision.id);
   if(endpoints.length!==1||!sourceMeasuredOutlineAncestor(endpoints[0],revision.originalFingerprint,policy.source.sha256,[...rows,...images,...texts]))
    throw new TypeError('approved-route-final-endpoint-changed');
  }
  if(matched.length!==retired.length||matched.some((row,i)=>row!==retired[i]))throw new TypeError('approved-route-final-members-changed');
  const at=rows.findIndex(row=>ids.has(/** @type {string} */(record(row).id))),kept=rows.filter(row=>!ids.has(/** @type {string} */(record(row).id)));
  kept.splice(at,0,...parts);
  // The trusted job mode describes the requested behaviour only. Geometry,
  // approval scope and strict source evidence are independent of this label.
  const representation=summarizeSceneRouteRepresentations({page:{shapes:kept,images,textBoxes:texts},connectorCornerMode,
   relations:[{relationId:policy.relationId,memberIds:parts.map(p=>p.id)}]});
  const row=representation.relations[0];
  if(!row?.wholeNativeObject||row.objectStructure!==(connector?'single-native-connector':'single-native-path')
   ||kept.filter(s=>record(s).id===a.elementId).length!==1||kept.filter(s=>record(s).id===b.elementId).length!==1)
   throw new TypeError('approved-route-final-representation-invalid');
  report.finalOutputRepresentation=representation;applied=true;return kept;
 };
 return {apply,report,publishMaterialization(/** @type {unknown} */ context){
  if(!applied)throw new TypeError('approved-route-materialization-unverified');
  return materialization?.publish(context);
 }};
}
module.exports={approvedRouteApproximationOption,prepareApprovedRouteApproximation};
