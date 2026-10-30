// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {parseSourceRouteCatalog,parseSourceRouteChoice}=require('./source-shared-route-choice');
/** @param {unknown} value */
function parseSourceRouteCatalogs(value){
 if(value===undefined)return [];
 if(!list(value)||value.length>24)throw new TypeError('Scene previous source catalogs are invalid');
 const catalogs=value.map(parseSourceRouteCatalog);
 if(new Set(catalogs.map(c=>c.networkHash)).size!==catalogs.length)throw new TypeError('Scene previous source catalogs are duplicated');
 return catalogs;
}
/** Carry the exact preflight descriptions into final projection. They are
 * public nominations; the final compiler must still measure every source edge.
 * @param {unknown} evidence */
function sourceRouteCatalogsFromEvidence(evidence){
 return parseSourceRouteCatalogs(record(evidence)&&record(evidence.sharedRoutes)?evidence.sharedRoutes.pathChoices:undefined);
}
/** Output contour calibration can move a contact's projected port without
 * changing its source cut or any physical edge. Reproject only with BOTH full
 * fingerprint-validated catalogs and exact source identity/topology/geometry.
 * This cannot nominate a new path or grant paint authority. Missing prior
 * evidence and changed source geometry remain ordinary stale-choice failures.
 * @param {import('./source-shared-route-choice').Choice} choice
 * @param {import('./source-shared-route-choice').Catalog[]} previous
 * @param {import('./source-shared-route-choice').Catalog} current @param {{checks:number}} work */
function reprojectSourceRouteChoice(choice,previous,current,work){
 const original=parseSourceRouteChoice(choice);
 if(original.networkHash===current.networkHash)return original;
 const before=previous.find(c=>c.networkHash===original.networkHash);if(!before)return original;
 work.checks+=before.contacts.length+current.contacts.length+before.edges.reduce((n,e)=>n+e.points.length,0)
  +current.edges.reduce((n,e)=>n+e.points.length,0)+before.relationIds.length+current.relationIds.length;
 if(work.checks>4000000)throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
 const physical=(/** @type {typeof current} */catalog)=>JSON.stringify({sourceHash:catalog.sourceHash,widthPx:catalog.widthPx,heightPx:catalog.heightPx,
  window:{x:catalog.window.x,y:catalog.window.y,w:catalog.window.w,h:catalog.window.h},relationIds:[...catalog.relationIds].sort(),
  contacts:catalog.contacts.map(({id,endpointId,arrow})=>({id,endpointId,arrow})).sort((a,b)=>a.id.localeCompare(b.id)),
  edges:catalog.edges.map(({id,from,to,points})=>({id,from,to,points:points.map(({x,y})=>({x,y}))})).sort((a,b)=>a.id.localeCompare(b.id))});
 if(original.sourceHash!==current.sourceHash||before.sourceHash!==current.sourceHash||physical(before)!==physical(current))return original;
 return {...original,networkHash:current.networkHash};
}
module.exports={parseSourceRouteCatalogs,sourceRouteCatalogsFromEvidence,reprojectSourceRouteChoice};
