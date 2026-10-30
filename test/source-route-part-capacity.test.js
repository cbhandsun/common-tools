'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {simplifySourceRoute}=require('../packages/slideclone-core/routing/source-route-centerline');
const {sourceRouteFootprintPolyline}=require('../packages/slideclone-core/routing/source-route-footprint-polyline');
const {fixture,compiler}=require('./helpers/source-route-part-capacity.cjs');
test('seventeen retained vertices fit the existing 32-part route unit as sixteen connectors and fifteen joints',()=>{
 const f=fixture(17),before=structuredClone(f);
 const simple=simplifySourceRoute(f.points,{checks:0});assert.ok(simple);assert.deepEqual(simple,f.points);
 const fit=sourceRouteFootprintPolyline(f);assert.ok(fit);assert.deepEqual(fit,f.points);
 assert.equal((fit.length-1)+(fit.length-2),31);assert.ok(f.work.checks<=4000000);
 assert.deepEqual(f.points,before.points);assert.deepEqual(f.cells,before.cells);
 assert.deepEqual(simplifySourceRoute([...f.points].reverse(),{checks:0}),[...f.points].reverse());
});
test('eighteen irreducible vertices require thirty-three parts and remain rejected within the same work ledger',()=>{
 const f=fixture(18);assert.equal(simplifySourceRoute(f.points,{checks:0}),null);
 assert.equal(sourceRouteFootprintPolyline(f),null);assert.ok(f.work.checks<=4000000);
 for(const checks of [4000000,3999998])assert.equal(sourceRouteFootprintPolyline({...fixture(17),work:{checks}}),null);
 const outlier=fixture(17);outlier.cells.push(19*outlier.width+4);assert.equal(sourceRouteFootprintPolyline(outlier),null);
});
test('route capacity regression remains in the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(f=>f.file.replaceAll('\\','/').endsWith('/source-route-part-capacity.test.js')));
});
test('the real route compiler emits thirty-one parts with every internal and external attachment for the boundary route',()=>{
 const {request,compile,nodes}=compiler(),before=structuredClone(request);
 for(const connectorCornerMode of ['auto','rounded-freeform','reroutable-elbow']){
  const parts=compile({...request,connectorCornerMode}),lines=parts.filter(p=>p.type==='line'),joints=parts.filter(p=>p.source.routeControl);
  assert.equal(parts.length,31);assert.equal(lines.length,16);assert.equal(joints.length,15);
  assert.ok(parts.every(p=>p.source.sourceRouteParts===31));
  const ids=new Set([...nodes,...parts].map(p=>p.id));
  for(const line of lines)for(const key of ['startAnchor','endAnchor'])assert.ok(ids.has(line.style[key].elementId));
  assert.equal(lines[0].style.startAnchor.elementId,'a');assert.equal(lines.at(-1).style.endAnchor.elementId,'b');
  assert.equal(lines.at(-1).style.endArrow,'triangle');
  for(let i=0;i<lines.length-1;i++)assert.equal(lines[i].style.endAnchor.elementId,lines[i+1].style.startAnchor.elementId);
 }
 assert.deepEqual(request,before);assert.throws(()=>compile({...request,fit:structuredClone(request.fit)}),/proof/u);
 const overflow=compiler(18);assert.throws(()=>overflow.compile(overflow.request),/unit budget/u);
});
