// @ts-check
'use strict';
const {sceneRouteWithinAnchor}=require('./source-scene-relation-identity');
const {sourceRouteMatchesProgram}=require('./source-scene-path-program');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{id:string,reversed:boolean}} EdgeRef */
/** Select a unique path between concrete source contacts, rather than the
 * first vertex of an entity. Anchors/programs only restrict already measured
 * paths; they never create a contact, head, edge or pixel receipt.
 * @param {{relation:import('./source-scene-plan').Relation,
 * graph:import('./source-scene-shared-route-inventory').SharedGraph,
 * vertices:{id:string,endpointId:string|null,arrow:boolean,point:Point}[],
 * segments:Map<string,{path:Point[],low:number,high:number}>,
 * window:import('./source-scene-plan').Box,work:{checks:number},
 * routes?:Map<string,Point[]>}} input */
function bindSharedSourcePath({relation,graph,vertices,segments,window,work,routes}){
 /** @type {{refs:EdgeRef[],points:Point[],samples:Point[]}|null} */let binding=null;
 /** @param {string} reason @returns {{binding:null,reason:string}} */const reject=reason=>({binding:null,reason});
 const froms=vertices.filter(v=>v.endpointId===relation.fromId&&v.arrow===['backward','both'].includes(relation.direction));
 const tos=vertices.filter(v=>v.endpointId===relation.toId&&v.arrow===['forward','both'].includes(relation.direction));
 if(!froms.length||!tos.length)return reject('shared-relation-direction');
 let failure='shared-relation-anchor';
 for(const from of froms){
  const queue=[from.id],before=new Map([[from.id,{id:'',edge:'',reversed:false}]]);
  for(const at of queue)for(const edge of graph.edges){
   if(++work.checks>4000000)return reject('shared-geometry-budget');
   const next=edge.from===at?edge.to:edge.to===at?edge.from:undefined;
   if(next===undefined||before.has(next))continue;
   before.set(next,{id:at,edge:edge.id,reversed:edge.to===at});queue.push(next);
  }
  for(const to of tos){
   if(to.id===from.id)continue;
   /** @type {EdgeRef[]} */const refs=[];
   let at=to.id,invalid=false,sourceLength=1;
   while(at!==from.id){
    if(++work.checks>4000000)return reject('shared-geometry-budget');
    const step=before.get(at),segment=step?segments.get(step.edge):undefined;
    if(!step?.id||!segment){invalid=true;break;}
    if(refs.length>=15){invalid=true;failure='shared-path-budget';break;}
    refs.push({id:step.edge,reversed:step.reversed});sourceLength+=segment.high-segment.low;at=step.id;
   }
   if(invalid)continue;
   if(sourceLength>512){failure='shared-source-path-budget';continue;}
   refs.reverse();
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
   if(!sceneRouteWithinAnchor(relation,points))continue;
   /** @type {Point[]} */const samples=[];
   for(const [i,ref]of refs.entries()){
    const segment=segments.get(ref.id);if(!segment)throw new TypeError('Scene shared source binding sequence is invalid');
    const cells=segment.path.slice(segment.low,segment.high+1);if(ref.reversed)cells.reverse();
    for(const p of i?cells.slice(1):cells)samples.push({x:p.x+window.x,y:p.y+window.y});
   }
   work.checks+=samples.length;if(work.checks>4000000)return reject('shared-geometry-budget');
   if(relation.visiblePath&&!sourceRouteMatchesProgram(samples,relation.visiblePath,work)){failure='shared-path-program';continue;}
   if(work.checks>4000000)return reject('shared-geometry-budget');
   if(binding)return reject('shared-relation-ambiguous');
   binding={refs,points,samples};
  }
 }
 return {binding,reason:binding?'shared-path-confirmed':failure};
}
module.exports={bindSharedSourcePath};
