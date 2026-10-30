'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectSourceSharedShaftNetwork:inspect}=require('../packages/slideclone-core/routing/source-shared-shaft-tree');
const {measureSharedRouteEdges}=require('../packages/slideclone-core/routing/source-shared-route-edges');

function fixture(turns=20,crossing=false){
 const junction=crossing?20:36;
 const width=Math.max(240,junction+28+turns*8),height=100,mask=new Uint8Array(width*height),rgba=Buffer.alloc(width*height*4,255);
 const vertices=[{x:junction,y:50},...Array.from({length:turns+1},(_,i)=>({x:junction+8+i*8,y:i%2?58:50}))];
 const cell=p=>p.y*width+p.x;
 const paths=[[{x:20,y:50},{x:20,y:10}],[{x:20,y:50},{x:5,y:50}],
  [{x:20,y:50},...(crossing?[]:[{x:junction,y:50}]),{x:junction,y:90}],vertices];
 for(const points of paths)for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
  for(let j=0;j<=steps;j++){
   const x=Math.round(a.x+(b.x-a.x)*j/steps),y=Math.round(a.y+(b.y-a.y)*j/steps),n=y*width+x;
   mask[n]=1;rgba.set([30,60,90,255],n*4);
  }
 }
 return {width,height,mask,rgba,terminals:paths.map(p=>cell(p.at(-1))),work:{checks:0}};
}

test('a complete shared graph uses its existing aggregate capacity instead of the single-relation edge cap',()=>{
 const f=fixture(),before=f.mask.slice(),result=inspect(f);assert.ok(result.tree,result.reason);
 const tree=result.tree,maxParts=Math.max(32,(f.terminals.length-1)*20);
 assert.ok(tree.joints.filter(n=>!f.terminals.includes(n)).every(n=>tree.edges.filter(e=>e.from===n||e.to===n).length===3));
 assert.equal(tree.edges.length,tree.joints.length-1);assert.equal(tree.cycleCount,undefined);
 for(const terminal of f.terminals)assert.equal(tree.edges.filter(e=>e.from===terminal||e.to===terminal).length,1);
 assert.ok(tree.edges.some(e=>e.points.length>17));assert.ok(tree.partCount>32&&tree.partCount<=maxParts);
 const represented=new Set(tree.edges.flatMap(e=>e.cells));
 for(let n=0;n<tree.skeleton.length;n++)if(tree.skeleton[n])assert.ok(represented.has(n));
 const measured=measureSharedRouteEdges({tree,partition:{cuts:f.terminals,heads:[],remaining:f.mask},
  terminals:f.terminals.map(index=>({index,arrow:false})),raster:f,background:[255,255,255],backgroundAt:()=>[255,255,255],work:f.work});
 assert.ok(measured.edges,measured.reason);assert.equal(measured.edges.length,tree.edges.length);
 assert.ok(measured.shaftCells.length);assert.deepEqual(f.mask,before);assert.ok(f.work.checks<=4000000);
});

test('aggregate capacity does not admit an ambiguous four-arm crossing or modify source evidence',()=>{
 const f=fixture(20,true),before=Buffer.from(f.rgba),mask=f.mask.slice(),result=inspect(f);assert.ok(result.tree,result.reason);
 assert.ok(result.tree.joints.some(n=>result.tree.edges.filter(e=>e.from===n||e.to===n).length===4));
 const measured=measureSharedRouteEdges({tree:result.tree,partition:{cuts:f.terminals,heads:[],remaining:f.mask},
  terminals:f.terminals.map(index=>({index,arrow:false})),raster:f,background:[255,255,255],backgroundAt:()=>[255,255,255],work:f.work});
 assert.equal(measured.edges,null);assert.equal(measured.reason,'shared-crossing-ambiguous');
 assert.deepEqual(f.mask,mask);assert.deepEqual(f.rgba,before);assert.ok(f.work.checks<=4000000);
});

test('a shared edge does not expand aggregate parts or the source work allowance',()=>{
 const f=fixture(29);assert.equal(inspect(f).tree,null);
 const capped=fixture();capped.work.checks=3999990;assert.equal(inspect(capped).tree,null);assert.ok(capped.work.checks<=4000001);
 const reversed=fixture();reversed.terminals.reverse();const result=inspect(reversed);assert.ok(result.tree,result.reason);
 assert.equal(result.tree.edges.length,result.tree.joints.length-1);assert.ok(result.tree.partCount<=60);
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(row=>row.file.replaceAll('\\','/')==='test/source-shared-edge-capacity.test.js'));
});

test('a privately measured long shared edge compiles through the source catalog with complete paths and unique anchors',()=>{
 const f=require('./helpers/source-shared-edge-capacity.cjs').sharedEdgeCapacityFixture(),before=Buffer.from(f.input.image.rgba);
 const {measured,output}=f.compile();
 assert.ok(measured.edges.some(e=>e.points.length>18));assert.equal(output.graph.paths.length,3);
 assert.ok(output.parts.length<=60);assert.equal(new Set(output.parts.map(p=>p.id)).size,output.parts.length);
 const ids=new Set([...f.input.nodes.map(n=>n.id),...output.parts.map(p=>p.id)]);
 for(const part of output.parts.filter(p=>p.type==='line'))for(const field of ['startAnchor','endAnchor'])assert.ok(ids.has(part.style[field].elementId));
 const edges=new Map(output.graph.edges.map(e=>[e.id,e]));
 for(const relation of output.graph.paths){let previous;
  for(const step of relation.edges){const edge=edges.get(step.id);assert.ok(edge);
   const from=step.reversed?edge.to:edge.from,to=step.reversed?edge.from:edge.to;
   if(previous!==undefined)assert.equal(from,previous);previous=to;
  }
 }
 assert.ok(output.catalog.edges.some(e=>e.points.length>18));assert.ok(measured.workChecks<=4000000);
 assert.deepEqual(f.input.image.rgba,before);
});
