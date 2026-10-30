'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSharedRouteEdges}=require('../packages/slideclone-core/routing/source-shared-route-edges');

function emptyGraph({foreground=false,checks=0}={}){
 const remaining=new Uint8Array(64);if(foreground)remaining[9]=1;
 const rgba=Buffer.alloc(64*4,255),work={checks};
 const result=measureSharedRouteEdges({tree:{edges:[],joints:[]},partition:{cuts:[],heads:[],remaining},terminals:[],
  raster:{width:8,height:8,rgba},background:[255,255,255],backgroundAt:()=>[255,255,255],work});
 return {result,remaining,rgba,work};
}

test('incomplete source coverage never publishes a partial shaft-cell roster',()=>{
 for(const foreground of [false,true]){
  const {result,remaining,rgba}=emptyGraph({foreground});
  assert.deepEqual(result,{edges:null,shaftCells:null,reason:'shared-unrepresented-ink'});
  assert.equal(remaining[9],foreground?1:0);assert.ok(rgba.every(n=>n===255));
 }
});

test('source coverage budget exhaustion retains its actual reason and publishes no prefix',()=>{
 const {result,work}=emptyGraph({foreground:true,checks:3999999});
 assert.deepEqual(result,{edges:null,shaftCells:null,reason:'shared-geometry-budget'});
 assert.equal(work.checks,4000001);
});

test('shared edge failure regressions enter unified CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-shared-route-edges.test.js'));
});
