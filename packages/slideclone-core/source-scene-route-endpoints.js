// @ts-check
'use strict';
const crypto=require('node:crypto');
const {record,list}=require('./source-scene-group-containment');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {hasMeasuredScenePortFrame}=require('./source-scene-port-evidence');
const {bindSceneTextEndpoints,hasSceneTextEndpoint,survivingSceneTextEndpoint,sceneTextEndpointNativeIds}=require('./source-scene-text-endpoints');
/** A reference catalog, never another object census or source capability.
 * @typedef {{id:string,kind:'region'|'text',regionId:string,members:{id:string,type:'shape'|'text',snapshot:string}[]}} RouteEndpoint */
/** @param {unknown} value @returns {value is string} */
const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** Store only a digest, including for real text; never serialize its content.
 * @param {unknown} item */
function snapshot(item){const value=sceneGroupSnapshot(item);return value===null?null:crypto.createHash('sha256').update(value).digest('hex');}
/** @param {unknown} value @param {{id:string,members?:{type:string,id:string}[]}[]} units @param {string[]} [regions]
 * @returns {RouteEndpoint[]} */
function readSceneRouteEndpoints(value,units,regions){
 if(!list(value)||value.length>96||!list(units)||units.length>176||units.some(u=>!record(u)||!id(u.id)
   ||u.members!==undefined&&(!list(u.members)||u.members.length>10000||u.members.some(m=>!record(m)||typeof m.id!=='string'||typeof m.type!=='string')))
  ||regions!==undefined&&(!list(regions)||regions.length>24||!regions.every(id)))throw new TypeError('Scene route endpoint catalog is invalid');
 const seen=new Set(),physical=new Set(units.flatMap(u=>u.members??[]).map(m=>m.id));let count=0;
 for(const row of value){
  if(!record(row)||Reflect.ownKeys(row).length!==4||!id(row.id)||seen.has(row.id)||units.some(u=>u.id===row.id)
   ||!id(row.regionId)||regions!==undefined&&!regions.includes(row.regionId)||(row.kind!=='region'&&row.kind!=='text')
   ||row.kind==='region'&&row.id!==row.regionId
   ||row.kind==='text'&&!row.id.startsWith('text-')||!list(row.members)||row.members.length<1||row.members.length>(row.kind==='text'?8:32))
   throw new TypeError('Scene route endpoint binding is invalid');
  seen.add(row.id);
  for(const member of row.members){
   if(!record(member)||Reflect.ownKeys(member).length!==3||typeof member.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(member.id)
    ||member.type!==(row.kind==='text'?'text':'shape')||typeof member.snapshot!=='string'||!/^[a-f0-9]{64}$/u.test(member.snapshot)
    ||physical.has(member.id)||++count>10000)throw new TypeError('Scene route endpoint member is invalid');
   physical.add(member.id);
  }
 }
 return /** @type {RouteEndpoint[]} */(value);
}
/** Final-output identity checks grant no permission to draw or erase pixels.
 * @param {RouteEndpoint} endpoint @param {unknown[]} shapes @param {unknown[]} texts */
function sceneRouteEndpointSurvives(endpoint,shapes,texts){
 return endpoint.members.every(member=>{
  const rows=(member.type==='text'?texts:shapes).filter(row=>record(row)&&row.id===member.id),row=rows[0];
  return rows.length===1&&record(row)&&record(row.source)&&row.source.sceneRegionId===endpoint.regionId
   &&snapshot(row)===member.snapshot;
 });
}
/** Prepare real source endpoints once, using the compiler's measured maps.
 * The closures retain private source tokens; the serialized catalog cannot
 * recreate them. A region is not copied into the direct object census.
 * @param {{image:import('./png').PngImage,plan:import('./source-scene-plan').ScenePlan,
 * nodes:Map<string,{id:string,box:import('./source-scene-plan').Box,portFrame:object|null}>,objects:Map<string,string[]>,
 * textBoxes:Parameters<typeof bindSceneTextEndpoints>[2],slideSize:{widthPt:number,heightPt:number}}} input */
function prepareSceneRouteEndpoints({image,plan,nodes,objects,textBoxes,slideSize}){
 const referenced=new Set(plan.relations.flatMap(r=>[r.fromId,r.toId]));
 const text=bindSceneTextEndpoints(image,(plan.textEndpoints??[]).filter(t=>referenced.has(t.id)),textBoxes,slideSize);
 /** @param {Parameters<typeof bindSceneTextEndpoints>[2]} texts */
 const textMembers=texts=>new Map([...text.nodes].filter(([,node])=>survivingSceneTextEndpoint(node.portFrame,texts))
  .map(([key,node])=>/** @type {[string,string[]]} */([key,sceneTextEndpointNativeIds(node.portFrame)])));
 /** @param {{id?:string,source?:Record<string,unknown>}[]} shapes @param {Parameters<typeof bindSceneTextEndpoints>[2]} texts
  * @returns {RouteEndpoint[]} */
 const capture=(shapes,texts)=>{
  /** @type {RouteEndpoint[]} */const result=[];
  for(const region of plan.regions){
   const node=nodes.get(region.id),members=objects.get(region.id);
   if(!referenced.has(region.id)||!node||!members?.length||!hasMeasuredScenePortFrame(image,node.portFrame,node.box))continue;
   const rows=members.map(key=>shapes.filter(s=>s.id===key));
   if(rows.some(found=>found.length!==1||found[0]?.source?.sceneRegionId!==region.id||snapshot(found[0])===null))continue;
   result.push({id:region.id,kind:'region',regionId:region.id,members:members.map((key,i)=>({id:key,type:'shape',snapshot:snapshot(rows[i]?.[0])??''}))});
  }
  for(const endpoint of plan.textEndpoints??[]){
   const node=text.nodes.get(endpoint.id);
   if(!node||!hasSceneTextEndpoint(image,node.portFrame,node.box)||!survivingSceneTextEndpoint(node.portFrame,texts))continue;
   const ids=sceneTextEndpointNativeIds(node.portFrame),rows=ids.map(key=>texts.find(t=>t.id===key));
   if(rows.some(row=>row?.source?.sceneRegionId!==endpoint.regionId||snapshot(row)===null))continue;
   result.push({id:endpoint.id,kind:'text',regionId:endpoint.regionId,members:ids.map((key,i)=>({id:key,type:'text',snapshot:snapshot(rows[i])??''}))});
  }
  return result;
 };
 return {textNodes:text.nodes,rejected:text.rejected,textMembers,capture};
}
module.exports={prepareSceneRouteEndpoints,readSceneRouteEndpoints,sceneRouteEndpointSurvives};
