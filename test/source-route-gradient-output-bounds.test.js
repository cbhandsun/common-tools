'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {nativeSourceRouteGradient:native}=require('../packages/slideclone-core/routing/source-route-native-gradient');
const {sourceRoutePaintColor}=require('../packages/slideclone-core/routing/source-route-paint-fit');
const {nativeElbowVertices}=require('../packages/slideclone-core/routing/source-route-native-elbow');
const hex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
function expected(spatial,at){return 'stops'in spatial?hex(sourceRoutePaintColor(spatial.stops,Math.max(0,Math.min(1,(at-spatial.origin)/spatial.span))))
 :hex(spatial.color.map((v,c)=>v+spatial.step[c]*(at-spatial.origin)));}
function assertBounds(gradient,spatial,points){
 const coordinates=points.map(p=>p[spatial.axis]);
 assert.equal(gradient.stops[0].color,expected(spatial,Math.min(...coordinates)));
 assert.equal(gradient.stops.at(-1).color,expected(spatial,Math.max(...coordinates)));
}

test('native spatial paint uses the emitted geometry bounds while preserving every measured observation',()=>{
 for(const axis of ['x','y'])for(const reverse of [false,true])for(const knots of [false,true]){
  const points=[{x:0,y:0},{x:10,y:10},{x:20,y:20}],positions=[0,.5,1];if(reverse){points.reverse();positions.reverse();}
  const spatial=knots?{axis,origin:0,span:20,support:1,stops:[{position:0,color:'#102030'},{position:.5,color:'#304050'},{position:1,color:'#506070'}]}
   :{axis,origin:0,color:[16,32,48],step:[2,2,2],support:1};
  const paint={positions,stops:[{position:0,color:'#102030'},{position:1,color:'#506070'}],spatial},drawing=[{x:2,y:3},{x:18,y:17}],before=structuredClone({points,paint,drawing});
  const gradient=native(points,paint,drawing);assert.ok(gradient);assertBounds(gradient,spatial,drawing);
  assert.equal(gradient.angleDeg,axis==='y'?90:0);assert.deepEqual({points,paint,drawing},before);
 }
});

test('a spatial axis flattened by snapping becomes a constant native gradient at the drawn coordinate',()=>{
 const spatial={axis:'y',origin:0,color:[20,30,40],step:[0,3,0],support:1};
 const g=native([{x:0,y:0},{x:10,y:10}],{positions:[0,1],stops:[{position:0,color:'#141E28'},{position:1,color:'#143C28'}],spatial},[{x:0,y:4},{x:10,y:4}]);
 assert.ok(g);assert.deepEqual(g.stops,[{position:0,color:'#142A28'},{position:1,color:'#142A28'}]);
});

test('non-spatial regression still reads original colors and only remaps the final drawing interval',()=>{
 const points=Array.from({length:10},(_,i)=>({x:0,y:i})),paint={positions:points.map((_,i)=>i/9),stops:[{position:0,color:'#102030'},{position:1,color:'#6A7A8A'}]};
 const g=native(points,paint,[{x:0,y:1},{x:0,y:8}]);assert.ok(g);
 assert.deepEqual(g.stops,[{position:0,color:'#1A2A3A'},{position:1,color:'#607080'}]);
 assert.equal(native(points,{...paint,positions:[]},[{x:0,y:1},{x:0,y:8}]),undefined);
});

test('actual single-relation compilation rebases spatial endpoint colors after snapping in every corner mode',()=>{
 const {sourceRoundedRouteFixture:fixture}=require('./helpers/source-rounded-route.cjs');
 const {measureSourceSceneRoute:measure}=require('../packages/slideclone-core/scene-plan/source-scene-route');
 const {compileSourceSceneRoute:compile}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
 for(const reverse of [false,true])for(const knots of [false,true]){
  const f=fixture({gradient:knots?'spatial-knots':true,reverse}),measured=measure(f);assert.ok(measured.fit,measured.reason);
  for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
   const parts=compile({fit:measured.fit,relation:{id:'r',regionId:'root',fromId:f.from.id,toId:f.to.id,direction:'forward'},fromId:f.from.id,toId:f.to.id,
    widthPx:240,heightPx:180,slideSize:{widthPt:480,heightPt:90},connectorCornerMode:mode});
   assert.equal(parts.length,1);const shape=parts[0],b=shape.box;
   const drawing=shape.type==='freeform'?[{x:b.x/2,y:b.y/.5},{x:(b.x+b.w)/2,y:(b.y+b.h)/.5}]:nativeElbowVertices(shape.style).map(p=>({x:p.x/2,y:p.y/.5}));
   assertBounds(shape.style.strokeGradient,measured.fit.paint.spatial,drawing);
   assert.equal(shape.style.startAnchor.elementId,f.from.id);assert.equal(shape.style.endAnchor.elementId,f.to.id);
  }
 }
});

test('shared tree edges keep their local source paint coordinates after global port projection and snapping',()=>{
 const {sourceSharedTreeFixture:fixture}=require('./helpers/source-shared-tree.cjs');
 const {measureSharedSourceRoute:measure}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute:compile}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=fixture();for(let y=50;y<170;y++)for(let x=40;x<=260;x++){const at=(y*f.image.width+x)*4;if(f.image.rgba[at]===30&&f.image.rgba[at+1]===60)f.put(x,y,[30,Math.round(220-y*.9),180]);}
 const m=measure(f);assert.ok(m.fit,m.reason);
 const relations=['left','right'].map(name=>({id:'relation-'+name,regionId:'root',fromId:'region-source',toId:'object-'+name,direction:'forward'}));
 for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const result=compile({fit:m.fit,image:f.image,relations,id:'tree',sourceHash:'a'.repeat(64),slideSize:{widthPt:600,heightPt:115},connectorCornerMode:mode});
  const shapes=result.parts.filter(s=>!s.source.routeControl);assert.equal(shapes.length,3);assert.equal(result.graph.paths.length,2);
  for(const [index,shape]of shapes.entries()){
   const spatial=m.fit.edges[index].paint.spatial;assert.ok(spatial);const b=shape.box;
   const global=shape.type==='freeform'?[{x:b.x/2,y:b.y/.5},{x:(b.x+b.w)/2,y:(b.y+b.h)/.5}]:nativeElbowVertices(shape.style).map(p=>({x:p.x/2,y:p.y/.5}));
   assertBounds(shape.style.strokeGradient,spatial,global.map(p=>({x:p.x-m.fit.window.x,y:p.y-m.fit.window.y})));
  }
 }
});

test('native chains rebase spatial paint from local source observations to actual translated connector frames',()=>{
 const {fitNativeSourceRouteChain:fit}=require('../packages/slideclone-core/routing/source-route-native-chain');
 const samples=[{x:0,y:0},{x:40,y:0},{x:40,y:30},{x:80,y:30},{x:80,y:60},{x:120,y:60},{x:120,y:90},{x:160,y:90}];
 const points=samples.map(p=>({x:p.x+100,y:p.y+200}));points[0].y+=.75;points.at(-1).y+=.5;
 const spatial={axis:'y',origin:0,color:[20,30,40],step:[0,2,0],support:1},sourceOrigin={x:100,y:200};
 const paint={color:'#141E28',startColor:'#141E28',endColor:'#14D228',support:1,stops:[{position:0,color:'#141E28'},{position:1,color:'#14D228'}],positions:samples.map((_,i)=>i/7),spatial};
 const input={points,samples,indices:samples.map((_,i)=>i),paint,sourceOrigin,widthPx:3,sx:2,sy:.5,work:{checks:0}},before=structuredClone(input);
 const result=fit(input);assert.ok(result.pieces.length>1);
 for(const p of result.pieces){const drawn=nativeElbowVertices(p.connector).map(v=>({x:v.x/2-100,y:v.y/.5-200}));assertBounds(p.gradient,spatial,drawn);}
 const {work,...rest}=input;delete before.work;assert.deepEqual(rest,before);assert.ok(work.checks<=4000000);
});

test('drawing bounds and chain source origins reject empty, extreme and hostile inputs without invoking callbacks',()=>{
 const points=[{x:0,y:0},{x:10,y:10}],paint={positions:[0,1],stops:[{position:0,color:'#102030'},{position:1,color:'#506070'}]};
 let calls=0;const hostile=new Proxy({},{get(){calls++;throw Error('private');},ownKeys(){calls++;throw Error('private');}}),getter=Object.defineProperty({},'x',{get(){calls++;throw Error('private');}});
 for(const drawing of [null,{},[],[points[0]],Array(121).fill(points[0]),hostile,[hostile,points[1]],[getter,points[1]],
  [{x:NaN,y:0},points[1]],[{x:Infinity,y:0},points[1]],[{x:1e300,y:0},points[1]],[{x:'0',y:0},points[1]],Array(2)])assert.throws(()=>native(points,paint,drawing),TypeError);
 const {fitNativeSourceRouteChain:fit}=require('../packages/slideclone-core/routing/source-route-native-chain');
 const basic={points,samples:points,indices:[0,1],paint:{color:'#102030',startColor:'#102030',endColor:'#102030',support:1},widthPx:3,sx:1,sy:1};
 for(const sourceOrigin of [null,{},[],hostile,getter,{x:0,y:Infinity},{x:1e300,y:0},{x:'0',y:0}])assert.throws(()=>fit({...basic,sourceOrigin,work:{checks:0}}),TypeError);
 assert.equal(calls,0);
 const before=structuredClone({points,paint});assert.ok(native(points,paint));assert.deepEqual({points,paint},before);
});

test('output-bounds regressions enter the unified unit CI suite',()=>{
 const discovered=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(discovered.some(row=>row.file.replaceAll('\\','/')==='test/source-route-gradient-output-bounds.test.js'));
});
