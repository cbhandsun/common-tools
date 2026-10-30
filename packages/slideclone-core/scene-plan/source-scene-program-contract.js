// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const FAMILIES=Object.freeze(['Microsoft YaHei','DengXian','SimHei','SimSun','KaiTi','STKaiti','STXingkai','STXinwei','FZShuTi','Arial','Arial Black','Segoe UI','Calibri']);
const ROLES=Object.freeze(['title','heading','sectionHeading','body','caption','label','list','footnote']);
/** @typedef {{objects:string[],relations:string[],labels:number[],allowNewMembers:boolean}} ProgramBinding */
/** @typedef {{refs:number[],family?:string,weight?:'regular'|'bold',sizePt?:number,role?:string}} ProgramStyle */
/** @typedef {{objects:(string|number)[],relations:(string|number)[],labels:ProgramStyle[]}} ProgramObservation */
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function bounded(value,maximum){if(!list(value)||value.length>maximum)throw new TypeError('Scene program collection is invalid');return value;}
/** @param {unknown} value @returns {value is string} */
function identity(value){return typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);}
/** @param {unknown} value @param {number[]} regions @returns {Record<string,ProgramBinding>} */
function parseSceneProgramBindings(value,regions){
 if(!record(value)||Object.keys(value).length>regions.length||Object.keys(value).some(k=>!regions.some(n=>String(n)===k)))throw new TypeError('Scene program bindings are invalid');
 const objectIds=new Set(),relationIds=new Set(),labelIds=new Set();
 /** @type {Record<string,ProgramBinding>} */const result={};
 for(const [key,row]of Object.entries(value)){
  if(!record(row)||Object.keys(row).length!==4||!['objects','relations','labels','allowNewMembers'].every(k=>Object.hasOwn(row,k))||typeof row.allowNewMembers!=='boolean')throw new TypeError('Scene program binding is invalid');
  /** @param {unknown} refs @param {Set<unknown>} seen @param {number} max @returns {string[]} */
  const ids=(refs,seen,max)=>bounded(refs,max).map(ref=>{if(!identity(ref)||seen.has(ref))throw new TypeError('Scene program member binding is invalid');seen.add(ref);return ref;});
  const objects=ids(row.objects,objectIds,64),relations=ids(row.relations,relationIds,48);
  const labels=bounded(row.labels,512).map(ref=>{if(typeof ref!=='number'||!Number.isSafeInteger(ref)||ref<0||ref>=512||labelIds.has(ref))throw new TypeError('Scene program label binding is invalid');labelIds.add(ref);return ref;});
  result[key]={objects,relations,labels,allowNewMembers:row.allowNewMembers};
 }
 if(objectIds.size>64||relationIds.size>48||labelIds.size>512)throw new TypeError('Scene program bindings exceed capacity');
 return result;
}
/** @param {Record<string,unknown>} properties */
function objectSchema(properties){return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
/** @param {ProgramBinding} binding @param {number} objects @param {number} relations */
function sceneProgramSchema(binding,objects,relations){
 /** @param {string[]} ids @param {number} maximum */
 const refs=(ids,maximum)=>({type:'array',maxItems:ids.length+maximum,items:ids.length?(maximum?{anyOf:[{type:'string',enum:ids},{type:'integer',minimum:0,maximum:maximum-1}]}:{type:'string',enum:ids}):{type:'integer',minimum:0,maximum:Math.max(0,maximum-1)}});
 return {anyOf:[{type:'null'},objectSchema({objects:refs(binding.objects,binding.allowNewMembers?objects:0),relations:refs(binding.relations,binding.allowNewMembers?relations:0),
  labels:{type:'array',maxItems:32,items:objectSchema({refs:{type:'array',maxItems:binding.labels.length,items:binding.labels.length?{type:'integer',enum:binding.labels}:{type:'integer',minimum:0,maximum:511}},
   family:{type:['string','null'],enum:[...FAMILIES,null]},weight:{type:['string','null'],enum:['regular','bold',null]},sizePt:{type:['number','null'],minimum:1,maximum:4000},role:{type:['string','null'],enum:[...ROLES,null]}})}})]};
}
/** @param {unknown} value @param {ProgramBinding} binding @param {number} units @param {number} links @returns {ProgramObservation|null} */
function readSceneProgram(value,binding,units,links){
 if(value===null)return null;
 if(!record(value)||Object.keys(value).length!==3||!['objects','relations','labels'].every(k=>Object.hasOwn(value,k)))throw new TypeError('Scene program response is invalid');
 /** @param {unknown} refs @param {string[]} expected @param {number} limit @returns {(string|number)[]} */
 const members=(refs,expected,limit)=>{
  const seen=new Set(),result=bounded(refs,expected.length+limit).map(ref=>{
   if(seen.has(ref)||!(typeof ref==='string'?expected.includes(ref):typeof ref==='number'&&Number.isSafeInteger(ref)&&ref>=0&&ref<limit&&binding.allowNewMembers))throw new TypeError('Scene program response member is invalid');seen.add(ref);return /** @type {string|number} */(ref);
  });
  if(expected.some(id=>!seen.has(id)))throw new TypeError('Scene program response inventory is incomplete');return result;
 };
 const objects=members(value.objects,binding.objects,units),relations=members(value.relations,binding.relations,links),seen=new Set();
 const labels=bounded(value.labels,32).map(style=>{
  if(!record(style)||Object.keys(style).length!==5||!['refs','family','weight','sizePt','role'].every(k=>Object.hasOwn(style,k)))throw new TypeError('Scene program response style is invalid');
  const refs=bounded(style.refs,512).map(ref=>{if(typeof ref!=='number'||!binding.labels.includes(ref)||seen.has(ref))throw new TypeError('Scene program response label is invalid');seen.add(ref);return ref;});
  if(!refs.length||style.family!==null&&(typeof style.family!=='string'||!FAMILIES.includes(style.family))
   ||style.weight!==null&&style.weight!=='regular'&&style.weight!=='bold'||style.sizePt!==null&&(typeof style.sizePt!=='number'||!Number.isFinite(style.sizePt)||style.sizePt<1||style.sizePt>4000)
   ||style.role!==null&&(typeof style.role!=='string'||!ROLES.includes(style.role)))throw new TypeError('Scene program response style is invalid');
  return {refs,...(typeof style.family==='string'?{family:style.family}:{}),...(style.weight==='regular'||style.weight==='bold'?{weight:/** @type {'regular'|'bold'} */(style.weight)}:{}),...(typeof style.sizePt==='number'?{sizePt:style.sizePt}:{}),...(typeof style.role==='string'?{role:style.role}:{})};
 });
 if(binding.labels.some(ref=>!seen.has(ref)))throw new TypeError('Scene program response labels are incomplete');
 return {objects,relations,labels};
}
module.exports={FAMILIES,parseSceneProgramBindings,sceneProgramSchema,readSceneProgram};
