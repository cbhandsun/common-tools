'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitWholeRouteNativeConnector:fit}=require('../packages/slideclone-core/routing/whole-route-native-connector');
const {wholeRouteDrawing}=require('../packages/slideclone-core/routing/source-whole-route-geometry');
const {nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
function drawing(reverse=false){
 const curves=[[{x:20,y:10},{x:20,y:70}],[{x:20,y:70},{x:20,y:81},{x:29,y:90},{x:40,y:90}],
  [{x:40,y:90},{x:150,y:90}]];
 const oriented=reverse?curves.slice().reverse().map(c=>c.slice().reverse()):curves;
 const d=wholeRouteDrawing(oriented);
 return {id:'relation',...d,style:{...d.style,fill:'none',stroke:'#123456',strokeWidthPt:3},source:{nativeRoutePoints:[{x:999,y:999},{x:1000,y:1000}]}};
}
test('a complete rounded path fits one real Office connector without changing its source drawing or endpoints',()=>{
 for(const reverse of [false,true]){
  const part=drawing(reverse),before=structuredClone(part),work={checks:0};assert.equal(part.type,'freeform');
  const out=fit({part,work});assert.ok(out);assert.deepEqual(out.points,nativeElbowVertices(out.connector));
  assert.deepEqual(out.points[0],reverse?{x:150,y:90}:{x:20,y:10});
  assert.deepEqual(out.points.at(-1),reverse?{x:20,y:10}:{x:150,y:90});
  assert.deepEqual(part,before);assert.ok(work.checks>0&&work.checks<=4000000);
  assert.equal(out.sourceFootprintVerified,false);assert.equal(out.sharedTopologyVerified,false);assert.equal(out.nodeFollowingVerified,false);
  assert.equal(out.connector.freeformPath,undefined);assert.match(out.connector.connectorType,/^elbow-[3-5]$/u);
 }
});
test('actual geometry is used even when nativeRoutePoints is absent or hostile',()=>{
 const part=drawing(),expected=fit({part,work:{checks:0}});delete part.source;
 assert.deepEqual(fit({part,work:{checks:0}}),expected);
 part.source={get nativeRoutePoints(){throw Error('private-content');}};
 assert.deepEqual(fit({part,work:{checks:0}}),expected);
});
test('empty, illegal and extreme drawings cannot generate a partial native relation',()=>{
 for(const input of [undefined,null,{},[],{part:drawing(),work:{checks:-1}},{part:drawing(),work:{checks:4000001}}])assert.throws(()=>fit(input),TypeError);
 for(const edit of [p=>p.style.strokeWidthPt=0,p=>p.style.strokeWidthPt=NaN,p=>p.style.strokeWidthPt=101,
  p=>p.box.x=Infinity,p=>p.style.closed=true,p=>p.style.freeformPath='x'.repeat(262145)]){
  const part=drawing();edit(part);assert.throws(()=>fit({part,work:{checks:0}}),TypeError);
 }
 const curves=Array.from({length:7},(_,i)=>[{x:i*20,y:i%2?30:0},{x:(i+1)*20,y:i%2?0:30}]);
 const d=wholeRouteDrawing(curves),part={...d,style:{...d.style,fill:'none',strokeWidthPt:2}};
 assert.equal(fit({part,work:{checks:0}}),null);
 const long={type:'line',box:{x:0,y:0,w:3000,h:0},style:{fill:'none',strokeWidthPt:2}};
 assert.equal(fit({part:long,work:{checks:0}}),null);
});
test('hostile controls never execute getters, proxies or coercion hooks',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const value of [proxy,{get part(){return trap();},work:{checks:0}},
  {part:proxy,work:{checks:0}},{part:drawing(),work:proxy}])assert.throws(()=>fit(value),TypeError);
 for(const style of [proxy,{get strokeWidthPt(){return trap();}},{strokeWidthPt:{valueOf:trap}}]){
  const part=drawing();part.style=style;assert.throws(()=>fit({part,work:{checks:0}}),TypeError);
 }
 assert.equal(calls,0);
});
test('exhausted caller work fails without resetting its ledger or changing the drawing',()=>{
 const part=drawing(),before=structuredClone(part),work={checks:4000000};
 assert.throws(()=>fit({part,work}),/shared-geometry-budget/u);assert.equal(work.checks,4000001);assert.deepEqual(part,before);
});
test('the connector fitter is typed, packaged and included by unified CI',()=>{
 const file='packages/slideclone-core/routing/whole-route-native-connector.js';
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/whole-route-native-connector.test.js'));
});
