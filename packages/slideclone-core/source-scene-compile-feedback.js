// @ts-check
"use strict";
const {types}=require('node:util');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** Fixed internal codes only. Provider text and arbitrary exceptions never
 * enter the next prompt, an IR, or a failure log.
 * @param {Plan} plan @param {unknown} evidence @returns {Map<string,string[]>} */
function sourceSceneCompileFeedback(plan,evidence){
 if(!record(evidence)||!Array.isArray(evidence.unresolved)||types.isProxy(evidence.unresolved)
  ||Object.getPrototypeOf(evidence.unresolved)!==Array.prototype||evidence.unresolved.length>256
  ||Reflect.ownKeys(evidence.unresolved).length!==evidence.unresolved.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(evidence.unresolved)).some(p=>!('value' in p)))throw new TypeError('Scene compile feedback is invalid');
 const reasons=new Set(['object-containment','icon-isolation','icon-native-representation','object-type','container-perimeter','compound-background-node','container-fill','relation-source-evidence','native-program-source-evidence']);
 const details=new Set(['relation-scope','relation-anchor','same-physical-node','missing-native-node','node-axis-alignment','source-gap','source-window-ownership','source-window-alpha','visible-path-program',
  'icon-source-window','icon-source-empty','icon-source-text','icon-source-clipped-component','icon-source-fringe-boundary','icon-source-crop-admission',
  'shaft-window-boundary','shaft-support','shaft-discontinuity','shaft-width','arrow-direction','direction-unknown','source-scan-budget',
  'container-source-evidence','outline-no-closed-component','outline-exterior-unstable','outline-window-boundary','outline-geometry','outline-text-ownership','outline-open-topology',
  'outline-ambiguous','outline-no-ink','outline-path-budget','outline-unobserved-core','outline-window-budget',
  'primitive-source-budget','primitive-exterior','primitive-source-geometry','primitive-missing-face','primitive-stroke-paint',
  'primitive-stroke-width','primitive-source-exterior','primitive-face-paint','primitive-source-evidence','cage-topology-mismatch']);
 const objects=new Set([...plan.objects.map(o=>o.id),...(plan.regions??[]).filter(r=>['card','container'].includes(r.kind)).map(r=>r.id)]);
 /** @type {Map<string,string[]>} */const result=new Map();
 for(const row of evidence.unresolved){
  if(!record(row)||typeof row.id!=='string'||typeof row.reason!=='string'
   ||row.detailCode!==undefined&&typeof row.detailCode!=='string')throw new TypeError('Scene compile feedback row is invalid');
  if(!reasons.has(row.reason)||row.detailCode!==undefined&&!details.has(String(row.detailCode)))continue;
  const code=`${row.reason}${row.detailCode?`:${row.detailCode}`:''}`;
  const relation=plan.relations.find(r=>r.id===row.id),ids=relation?[relation.fromId,relation.toId]:[row.id];
  for(const id of ids){if(!objects.has(id))continue;const codes=result.get(id)||[];if(!codes.includes(code))codes.push(code);result.set(id,codes);}
 }
 return result;
}
/** A legal semantic icon ID can still be the wrong physical endpoint. Route
 * these source failures to the existing paired reference review, rather than
 * repeatedly asking the object observer to redraw that same icon. Codes only
 * nominate review; they never authorize a different endpoint or source paint.
 * @param {Plan} plan @param {unknown} evidence @returns {Set<string>} */
function sourceSceneTopologyFailures(plan,evidence){
 if(evidence===undefined)return new Set();
 sourceSceneCompileFeedback(plan,evidence);
 const rows=/** @type {{unresolved:{id:string,reason:string,detailCode?:string}[]}} */(evidence).unresolved;
 const codes=new Set(['missing-native-node','node-axis-alignment','source-window-ownership','source-gap']);
 return new Set(rows.filter(row=>row.reason==='relation-source-evidence'&&codes.has(row.detailCode??'')
  &&plan.relations.some(r=>r.id===row.id)).map(row=>row.id));
}
module.exports={sourceSceneCompileFeedback,sourceSceneTopologyFailures};
