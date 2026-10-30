'use strict';
const assert=require('node:assert/strict');
const {sourceSharedNetworkFixture,networkRelations}=require('./source-shared-network.cjs');
const {measureSharedSourceRoute}=require('../../packages/slideclone-core/routing/source-shared-route-measurement');
const {createSourceRouteCatalog}=require('../../packages/slideclone-core/routing/source-shared-route-choice');
function fixture(){
 const f=sourceSharedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const relations=networkRelations.map(r=>({...r,shaftBox:{x:35,y:45,w:230,h:130}}));
 const sourceHash='a'.repeat(64),context=createSourceRouteCatalog({fit:measured.fit,image:f.image,relations,sourceHash,work:{checks:measured.fit.workChecks}});
 const plan={version:1,sourceHash,widthPx:300,heightPx:230,relationObservationUnit:'logical-relations-v1',
  regions:[{id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:300,h:230}},{id:'region-source',parentId:'root',kind:'card',box:{...f.nodes[0].box}}],
  objects:f.nodes.slice(1).map(n=>({id:n.endpointId,regionId:'root',kind:'container',box:{...n.box}})),relations};
 const evidence={unresolved:relations.map(r=>({id:r.id,reason:'relation-source-evidence',detailCode:'shaft-window-boundary'})),
  sharedRoutes:{rejected:[{ids:relations.map(r=>r.id),reason:'shared-relation-ambiguous'}],pathChoices:[context.catalog]}};
 return {f,fit:measured.fit,context,plan,evidence,choices:[[[150,50],[150,98],[138,110],[50,170]],[[150,50],[150,98],[138,110],[162,110],[250,170]]].map(points=>steps(context.catalog,points))};
}
function steps(catalog,points){
 const contacts=points.map(([x,y])=>catalog.contacts.find(c=>c.point.x===x&&c.point.y===y)?.id);assert.ok(contacts.every(Boolean));
 return contacts.slice(1).map((to,i)=>{const from=contacts[i],edge=catalog.edges.find(e=>e.from===from&&e.to===to||e.from===to&&e.to===from);assert.ok(edge);return {id:edge.id,reversed:edge.to===from};});
}
module.exports={fixture,steps};
