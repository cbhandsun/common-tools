'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitNativeSourceRouteChain:fit}=require('../packages/slideclone-core/routing/source-route-native-chain');
const {nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
function fixture(){
 const points=[{x:0,y:0},{x:40,y:0},{x:40,y:30},{x:80,y:30},{x:80,y:60},{x:120,y:60},{x:120,y:90},{x:160,y:90}];
 return {points,indices:points.map((_,i)=>i),samples:points.map(p=>({...p})),paint:{color:'#123456',startColor:'#123456',endColor:'#123456',support:1},widthPx:3,sx:.7,sy:1.2,work:{checks:0}};
}
test('a route beyond one Office preset is a bounded chain through existing vertices with unchanged endpoints',()=>{
 const input=fixture(),before=structuredClone(input),result=fit(input);assert.ok(result);assert.ok(result.pieces.length>1);
 assert.equal(result.pieces[0].low,0);assert.equal(result.pieces.at(-1).high,input.points.length-1);
 for(const [i,piece]of result.pieces.entries()){
  if(i)assert.equal(result.pieces[i-1].high,piece.low);
  const drawn=nativeElbowVertices(piece.connector),first=input.points[piece.low],last=input.points[piece.high];
  for(const [actual,p]of [[drawn[0],first],[drawn.at(-1),last]])assert.ok(Math.hypot(actual.x-p.x*input.sx,actual.y-p.y*input.sy)<.001);
 }
 assert.ok(input.work.checks>0&&input.work.checks<=4000000);delete before.work;
 const {work,...unchanged}=input;assert.deepEqual(unchanged,before);
});
test('a diagonal source segment remains a native straight connector and repeated paint positions stay constant',()=>{
 const input=fixture();input.points=[{x:4,y:9},{x:17,y:20}];input.samples=input.points;input.indices=[0,1];
 input.paint={...input.paint,stops:[{position:0,color:'#102030'},{position:1,color:'#204060'}],positions:[.5,.5]};
 const result=fit(input);assert.equal(result.pieces.length,1);assert.equal(result.pieces[0].connector.connectorType,undefined);
 assert.deepEqual(result.pieces[0].gradient.stops,[{position:0,color:'#183048'},{position:1,color:'#183048'}]);
});
test('chain input rejects empty, invalid, extreme and hostile values without executing user code',()=>{
 let calls=0;const hostile=new Proxy({},{get(){calls++;throw Error('private');},ownKeys(){calls++;throw Error('private');}});
 const getter=Object.defineProperty({},'x',{get(){calls++;throw Error('private');}});
 const cases=[null,{},hostile,...[[],[{}],Array(121).fill({x:0,y:0}),[getter,{x:1,y:1}],[hostile,{x:1,y:1}],
  [{x:Infinity,y:0},{x:1,y:1}],[{x:1e300,y:0},{x:1,y:1}]].map(points=>({...fixture(),points})),
  ...[[-1,1],[0,0],[0,'1'],[0,100],[1,2]].map(indices=>({...fixture(),indices})),
  ...[0,NaN,'1',1e300,hostile].map(sx=>({...fixture(),sx})),
  {...fixture(),work:Object.freeze({checks:0})},{...fixture(),work:{checks:-1}},
  {...fixture(),samples:hostile},{...fixture(),paint:{...fixture().paint,positions:[0,1]}},
  {...fixture(),paint:{...fixture().paint,stops:[{position:0,color:'private'},{position:1,color:'#FFFFFF'}],positions:[0,1]}},
  {...fixture(),paint:{...fixture().paint,spatial:hostile}}];
 for(const input of cases)assert.throws(()=>fit(input),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(calls,0);
});
test('exhaustion rejects the entire chain before granting a result, including after an earlier piece was fitted',()=>{
 const baseline=fixture(),result=fit(baseline);assert.ok(result.pieces.length>1);
 for(const checks of [4000000,3999990,4000000-baseline.work.checks+1]){
  const input=fixture();input.work.checks=checks;
  assert.throws(()=>fit(input),/shared-geometry-budget/u);assert.equal(input.work.checks,4000001);
 }
});
test('a degenerate measured edge cannot grant an empty Office route',()=>{
 const input=fixture();input.points=[{x:4,y:9},{x:4,y:9}];input.samples=input.points;input.indices=[0,1];
 assert.throws(()=>fit(input),TypeError);
});
test('chain regressions are discovered by the unified unit CI entry',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(r=>r.file.replaceAll('\\','/')==='test/source-route-native-chain.test.js'));
});

test('merging a real curved source arm cannot reuse a width-dependent four-pixel shifted preset',()=>{
 const captured=require('./fixtures/source-native-chain-arm-drift.json'),input={...structuredClone(captured.request),work:{checks:0}},result=fit(input);
 // Independent scalar check on original non-exempt ink of EACH merged span.
 // All joint/head/halo pixels and adjacent measured legs remain subject to
 // the compiler's complete private shaft-footprint check.
 for(const piece of result.pieces)if(piece.high>piece.low+1){
  const actual=nativeElbowVertices(piece.connector).map(p=>({x:p.x/input.sx-input.sourceOrigin.x,y:p.y/input.sy-input.sourceOrigin.y}));
  for(const p of input.sourceInk){
   if(p.index<input.indices[piece.low]||p.index>input.indices[piece.high])continue;let closest=Infinity;
   for(let j=1;j<actual.length;j++){
    const a=actual[j-1],b=actual[j],v=[b.x-a.x,b.y-a.y],length=v[0]**2+v[1]**2,t=length?Math.max(0,Math.min(1,((p.x-a.x)*v[0]+(p.y-a.y)*v[1])/length)):0;
    closest=Math.min(closest,Math.hypot(p.x-a.x-t*v[0],p.y-a.y-t*v[1]));
   }
   assert.ok(closest<=input.widthPx/2+.75,'Merged preset displaced the original source arm');
  }
 }
 assert.ok(result.pieces.length>1);assert.equal(result.pieces[0].low,0);assert.equal(result.pieces.at(-1).high,input.points.length-1);
});

test('optional fitting observations reject hostile, empty-invalid and excessive data without granting authority',()=>{
 let calls=0;const proxy=new Proxy([],{get(){calls++;throw Error('private');}});
 for(const sourceInk of [proxy,Array(8193).fill({}),[{x:NaN,y:0,index:0}],[{x:0,y:0,index:-1}],[{x:0,y:0,index:.5}],
  [Object.defineProperty({y:0,index:0},'x',{get(){calls++;throw Error('private');}})]])assert.throws(()=>fit({...fixture(),sourceInk}),TypeError);
 assert.equal(calls,0);assert.ok(fit({...fixture(),sourceInk:[]}).pieces.length);
});
