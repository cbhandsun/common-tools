'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeRouteGeometry,orthogonalSourceRoute}=require('../packages/slideclone-core/routing/source-route-native-elbow');
test('geometry ledgers are call-local, retain the original solver result, and cannot grant an exhausted prefix',()=>{
 const route=[{x:0,y:0},{x:50,y:0},{x:50,y:40}],a={checks:0},b={checks:0};
 const first=createNativeRouteGeometry(a),second=createNativeRouteGeometry(b);
 assert.deepEqual(first.orthogonalSourceRoute(route,{widthPx:3}),orthogonalSourceRoute(route,{widthPx:3}));
 const used=a.checks;assert.ok(used>0);assert.equal(b.checks,0);
 assert.deepEqual(second.orthogonalSourceRoute(route,{widthPx:3}),orthogonalSourceRoute(route,{widthPx:3}));assert.equal(b.checks,used);assert.equal(a.checks,used);
 a.checks=4000000;assert.throws(()=>first.nativeElbowConnector(route),/shared-geometry-budget/u);assert.equal(a.checks,4000001);
 assert.ok(second.nativeElbowConnector(route));assert.ok(b.checks>used);
});
test('a caller cannot replace a ledger with accessors between factory calls',()=>{
 let calls=0;const work={checks:0},solver=createNativeRouteGeometry(work),route=[{x:0,y:0},{x:20,y:10}];
 Object.defineProperty(work,'checks',{get(){calls++;throw Error('private');}});
 assert.throws(()=>solver.nativeElbowConnector(route),e=>e instanceof TypeError&&!e.message.includes('private'));assert.equal(calls,0);
});
