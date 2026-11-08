// @ts-check
'use strict';
const {sceneRouteWithinAnchor}=require('../scene-plan/source-scene-relation-identity');
const {sourceRouteMatchesProgram}=require('../scene-plan/source-scene-path-program');
const {parseSourceRouteChoice,sourceRouteChoiceMatches}=require('./source-shared-route-choice');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{id:string,reversed:boolean}} EdgeRef */
/** Select a unique path between concrete source contacts, rather than the
 * first vertex of an entity. Anchors/programs only restrict already measured
 * paths; they never create a contact, head, edge or pixel receipt.
 * @param {{relation:import('../scene-plan/source-scene-plan').Relation,
 * graph:import('../scene-plan/source-scene-shared-route-inventory').SharedGraph,
 * vertices:{id:string,endpointId:string|null,arrow:boolean,point:Point}[],
 * segments:Map<string,{path:Point[],low:number,high:number}>,
 * window:import('../scene-plan/source-scene-plan').Box,work:{checks:number},
 * routes?:Map<string,Point[]>,choiceContext?:ReturnType<typeof import('./source-shared-route-choice').createSourceRouteCatalog>}} input */
function bindSharedSourcePath({relation,graph,vertices,segments,window,work,routes,choiceContext}){
 const choice=relation.sourcePathChoice===undefined?undefined:parseSourceRouteChoice(relation.sourcePathChoice);
 if(choice&&(!choiceContext||relation.visiblePath!==undefined))return {binding:null,reason:'shared-path-program'};
 /** @type {{refs:EdgeRef[],points:Point[],samples:Point[]}|null} */let binding=null;
 /** @param {string} reason @returns {{binding:null,reason:string}} */const reject=reason=>({binding:null,reason});
 const froms=vertices.filter(v=>v.endpointId===relation.fromId&&v.arrow===['backward','both'].includes(relation.direction));
 const tos=vertices.filter(v=>v.endpointId===relation.toId&&v.arrow===['forward','both'].includes(relation.direction));
 if(!froms.length||!tos.length)return reject('shared-relation-direction');
 let failure='shared-relation-anchor';
 for(const from of froms)for(const to of tos){
   if(to.id===from.id)continue;
   // Enumerate every simple physical route. A BFS predecessor table silently
   // chooses one arm of a cycle before the relation's identity is checked.
   // Never accept a winner while an alternative was truncated by a budget.
   const pending=[{at:from.id,refs:/** @type {EdgeRef[]} */([]),seen:new Set([from.id])}];
   while(pending.length){
    const state=pending.pop();if(!state)break;
    if(++work.checks>4000000)return reject('shared-geometry-budget');
    if(state.at!==to.id){
     for(const edge of graph.edges){
      if(++work.checks>4000000)return reject('shared-geometry-budget');
      const next=edge.from===state.at?edge.to:edge.to===state.at?edge.from:undefined;
      if(next===undefined||state.seen.has(next))continue;
      work.checks+=state.seen.size+state.refs.length;if(work.checks>4000000)return reject('shared-geometry-budget');
      pending.push({at:next,refs:[...state.refs,{id:edge.id,reversed:edge.to===state.at}],seen:new Set([...state.seen,next])});
     }
     continue;
    }
   const refs=state.refs;
   // Writer segments are not physical source edges. A long measured edge
   // may need many bound native segments while remaining one catalog step.
   // Keep the existing 15 physical-edge and 512 source-sample limits.
   if(refs.length>128)return reject('shared-path-budget');
   let sourceLength=1,physicalEdges=0;
   /** @type {Point[]|undefined} */let previousPath;
   let previousReversed=false;
   for(const ref of refs){
    if(++work.checks>4000000)return reject('shared-geometry-budget');
    const segment=segments.get(ref.id);if(!segment)throw new TypeError('Scene shared source binding sequence is invalid');
    if(previousPath!==segment.path||previousReversed!==ref.reversed)physicalEdges++;
    previousPath=segment.path;previousReversed=ref.reversed;
    sourceLength+=segment.high-segment.low;
   }
   if(physicalEdges>15)return reject('shared-path-budget');
   if(sourceLength>512)return reject('shared-source-path-budget');
   const points=[from.point];
   for(const ref of refs){
    const edge=graph.edges.find(e=>e.id===ref.id),vertex=vertices.find(v=>v.id===(ref.reversed?edge?.from:edge?.to));
    work.checks+=graph.edges.length+vertices.length;if(work.checks>4000000)return reject('shared-geometry-budget');
     if(!vertex)throw new TypeError('Scene shared source binding vertex is invalid');
     // A native elbow edge turns between its vertices; its interior corners are
     // part of the drawn path that the anchor identity must overlap.
     const interior=routes?.get(ref.id)?.slice(1,-1)??[];for(const p of ref.reversed?[...interior].reverse():interior)points.push(p);
     points.push(vertex.point);
   }
   // A continuously checked curve can require more than one 32-point anchor
   // window. Keep that primitive's bound and test overlapping complete windows
   // rather than rejecting an otherwise source-proven long path by length.
   let outputAnchored=relation.shaftBox===undefined;
   for(let i=0;!outputAnchored&&i<points.length-1;i+=31){
    work.checks+=Math.min(32,points.length-i);if(work.checks>4000000)return reject('shared-geometry-budget');
    outputAnchored=sceneRouteWithinAnchor(relation,points.slice(i,i+32));
   }
   if(!outputAnchored)continue;
   /** @type {Point[]} */const samples=[];
   for(const [i,ref]of refs.entries()){
    const segment=segments.get(ref.id);if(!segment)throw new TypeError('Scene shared source binding sequence is invalid');
    const cells=segment.path.slice(segment.low,segment.high+1);if(ref.reversed)cells.reverse();
    for(const p of i?cells.slice(1):cells)samples.push({x:p.x+window.x,y:p.y+window.y});
   }
   work.checks+=samples.length;if(work.checks>4000000)return reject('shared-geometry-budget');
   // Identity must also overlap ORIGINAL source cells. Native orthogonal
   // regularization may move a corner; that movement cannot pick a cycle arm.
   let sourceAnchored=relation.shaftBox===undefined;
   for(let i=0;!sourceAnchored&&i<samples.length-1;i+=31){
    work.checks+=Math.min(32,samples.length-i);if(work.checks>4000000)return reject('shared-geometry-budget');
    sourceAnchored=sceneRouteWithinAnchor(relation,samples.slice(i,i+32));
   }
   if(!sourceAnchored)continue;
   if(choice&&choiceContext){
    /** @type {EdgeRef[]} */const steps=[];
    for(const ref of refs){
     if(++work.checks>4000000)return reject('shared-geometry-budget');
     const segment=segments.get(ref.id),key=segment&&choiceContext.edgeKeys.get(segment.path);
     if(!key)throw new TypeError('Scene source edge choice binding is invalid');
     const step={id:key.id,reversed:key.reversed!==ref.reversed},prior=steps.at(-1);
     if(!prior||prior.id!==step.id||prior.reversed!==step.reversed)steps.push(step);
    }
    if(!sourceRouteChoiceMatches(choice,choiceContext.catalog,steps)){failure='shared-path-program';continue;}
   }
   if(relation.visiblePath&&!sourceRouteMatchesProgram(samples,relation.visiblePath,work)){failure='shared-path-program';continue;}
   if(work.checks>4000000)return reject('shared-geometry-budget');
   if(binding)return reject('shared-relation-ambiguous');
   binding={refs,points,samples};
   }
 }
 return {binding,reason:binding?'shared-path-confirmed':failure};
}
module.exports={bindSharedSourcePath};
