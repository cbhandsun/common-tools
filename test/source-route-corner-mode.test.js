'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseConnectorCornerMode,roundedSourceRoute}=require('../packages/slideclone-core/routing/source-route-corner-mode');
const {decodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
const {orthogonalSourceRoute}=require('../packages/slideclone-core/routing/source-route-native-elbow');
const {nativeSourceRouteGradient}=require('../packages/slideclone-core/routing/source-route-native-gradient');
function roundedL(radius){const points=[{x:10,y:10},{x:10,y:60-radius}];for(let i=1;i<24;i++){const t=Math.PI/2*i/24;points.push({x:10+radius-radius*Math.cos(t),y:60-radius+radius*Math.sin(t)});}return [...points,{x:10+radius,y:60},{x:120,y:60}];}
test('auto writes measured rounded corners as one open cubic with exact endpoints',()=>{
 const measured=roundedL(14),route=orthogonalSourceRoute(measured,{widthPx:3});
 const output=roundedSourceRoute({measured,route,sx:2,sy:3,mode:'auto'});assert.ok(output);
 assert.ok(Math.abs(output.radii[0]-14)<.1);
 const segments=decodeNativeFreeformPath(output.style.freeformPath);assert.ok(segments.some(s=>s.type==='cubicBezTo'));
 assert.equal(output.style.closed,false);assert.ok(!segments.some(s=>s.type==='close'));
 assert.deepEqual(segments[0].points,[{x:0,y:0}]);assert.deepEqual(segments.at(-1).points,[{x:1,y:1}]);
 assert.deepEqual(output.box,{x:20,y:30,w:220,h:150});
});
test('auto preserves sharp or sub-threshold corners and reroutable always retains elbows',()=>{
 for(const r of [0,2,3.5]){const measured=roundedL(r),route=orthogonalSourceRoute(measured,{widthPx:3});assert.equal(roundedSourceRoute({measured,route,sx:1,sy:1,mode:'auto'}),null);}
 const measured=roundedL(14),route=orthogonalSourceRoute(measured,{widthPx:3});assert.equal(roundedSourceRoute({measured,route,sx:1,sy:1,mode:'reroutable-elbow'}),null);
 const straight=[{x:1,y:1},{x:1,y:80}];assert.equal(roundedSourceRoute({measured:straight,route:straight,sx:1,sy:1,mode:'rounded-freeform'}),null);
});
test('explicit rounded mode rounds sharp orthogonal paths with bounded radii',()=>{
 const route=[{x:0,y:0},{x:0,y:8},{x:6,y:8}];const output=roundedSourceRoute({measured:route,route,sx:1,sy:1,mode:'rounded-freeform'});assert.ok(output);assert.ok(output.style.freeformPath.length<32768);
});
test('invalid, empty, hostile and extreme corner controls reject without getters',()=>{
 assert.equal(parseConnectorCornerMode(undefined),'reroutable-elbow');for(const mode of [null,'',1,'rounded',{},'AUTO'])assert.throws(()=>parseConnectorCornerMode(mode),TypeError);
 const good={measured:roundedL(14),route:[{x:10,y:10},{x:10,y:60},{x:120,y:60}],sx:1,sy:1};
 for(const value of [{...good,sx:NaN},{...good,sy:0},{...good,route:[]},{...good,measured:new Array(2)},{...good,route:Array(4097).fill({x:0,y:0})},null])assert.throws(()=>roundedSourceRoute(value),TypeError);
 let calls=0;assert.throws(()=>roundedSourceRoute(Object.defineProperty({},'route',{get(){calls++;throw Error('private');}})),TypeError);assert.equal(calls,0);
 for(const key of ['route','measured']){
  for(const value of [new Proxy([],{get(){calls++;throw Error('private');}}),Object.defineProperty([{},{}],'0',{get(){calls++;throw Error('private');}}),new Array(2)])
   assert.throws(()=>roundedSourceRoute({...good,[key]:value}),TypeError);
 }
 assert.equal(calls,0);
 assert.equal(roundedSourceRoute({...good,route:[{x:0,y:0},{x:5,y:7},{x:10,y:10}]}),null);
});

test('omitted corner mode preserves connector following even for an observed rounded corner',()=>{
 const measured=roundedL(14),route=orthogonalSourceRoute(measured,{widthPx:3});
 assert.equal(roundedSourceRoute({measured,route,sx:1,sy:1}),null);
 assert.equal(roundedSourceRoute({measured,route,sx:1,sy:1,mode:undefined}),null);
 for(const mode of ['auto','rounded-freeform']){
  assert.equal(parseConnectorCornerMode(mode),mode);
  assert.ok(roundedSourceRoute({measured,route,sx:1,sy:1,mode}));
 }
});
test('native spatial gradient keeps a shared vertical axis in both path directions',()=>{
 const points=[{x:20,y:0},{x:20,y:50},{x:100,y:50},{x:100,y:100}];
 const paint={positions:[0,.5,.5,1],stops:[{position:0,color:'#20C090'},{position:1,color:'#2080E0'}]};
 const a=nativeSourceRouteGradient(points,paint),b=nativeSourceRouteGradient([...points].reverse(),{...paint,positions:[...paint.positions].reverse()});
 assert.equal(a.angleDeg,90);assert.deepEqual(a,b);assert.deepEqual(a.stops,paint.stops);
 assert.equal(nativeSourceRouteGradient(points,undefined),undefined);
 assert.equal(nativeSourceRouteGradient(points,{...paint,positions:[0,1]}),undefined);
});
