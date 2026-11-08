'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSpatialPaint:measure}=require('../packages/slideclone-core/routing/source-route-spatial-paint');
const {fitSourceRoutePaint:fit,sourceRoutePaintColor:colorAt}=require('../packages/slideclone-core/routing/source-route-paint-fit');
const {nativeSourceRouteGradient:native}=require('../packages/slideclone-core/routing/source-route-native-gradient');
function fixture({transpose=false,reverse=false}={}){
 const path=[];
 for(let y=10;y<80;y++)path.push({x:10,y});
 for(let x=10;x<180;x++)path.push({x,y:80});
 for(let y=80;y<=150;y++)path.push({x:180,y});
 const colors=path.map(p=>[30,Math.round(40+180*Math.min(1,Math.abs(p.y-80)/50)),180]);
 if(transpose)for(const p of path)[p.x,p.y]=[p.y,p.x];
 if(reverse){path.reverse();colors.reverse();}
 return {path,colors};
}
test('source knots independently reproduce every repeated source coordinate in both axes and directions',()=>{
 for(const transpose of [false,true])for(const reverse of [false,true]){
  const f=fixture({transpose,reverse}),before=structuredClone(f),work={checks:0},spatial=measure(f.path,f.colors,work);
  assert.ok(spatial&&'stops' in spatial);assert.equal(spatial.axis,transpose?'x':'y');
  assert.ok(spatial.stops.length>2&&spatial.stops.length<=6);assert.ok(spatial.support>=.9);
  const matches=f.path.filter((p,i)=>colorAt(spatial.stops,(p[spatial.axis]-spatial.origin)/spatial.span)
   .every((value,c)=>Math.abs(value-f.colors[i][c])<=18));
  assert.equal(matches.length/f.path.length,spatial.support);
  // Endpoint contour projection may extend fractionally beyond sampled cells.
  // Native output keeps the source stop limit and strictly ordered positions.
  const points=[{x:9.5,y:9.5},{x:180.5,y:150.5}];
  const gradient=native(points,{stops:[{position:0,color:'#000000'},{position:1,color:'#FFFFFF'}],positions:[0,1],spatial});
  assert.ok(gradient);assert.equal(gradient.angleDeg,transpose?0:90);assert.ok(gradient.stops.length<=6);
  assert.equal(gradient.stops[0].position,0);assert.equal(gradient.stops.at(-1).position,1);
  assert.ok(gradient.stops.every((s,i)=>i===0||s.position>gradient.stops[i-1].position));
  assert.deepEqual(f,before);assert.ok(work.checks<=4000000);
 }
});
test('repeated coordinates with contradictory colors cannot be averaged into a spatial proof',()=>{
 const path=Array.from({length:160},(_,i)=>({x:i%40,y:Math.floor(i/40)}));
 const colors=path.map((_,i)=>i%2?[240,20,30]:[20,190,230]);
 assert.equal(measure(path,colors,{checks:0}),undefined);
 // Every original observation still counts when coordinates repeat.
 const positions=path.map(()=>.5);
 assert.equal(fit(colors,positions,{checks:0}),null);
 const f=fixture();
 for(let i=0;i<f.colors.length;i+=2)f.colors[i]=[240,20,30];
 assert.equal(measure(f.path,f.colors,{checks:0}),undefined);
});
test('empty, invalid, extreme and exhausted paint observations fail without increasing the work cap',()=>{
 const f=fixture();
 for(const checks of [-1,NaN,Infinity,4000001]){
  assert.equal(measure(f.path,f.colors,{checks}),undefined);
  assert.equal(fit(f.colors,f.path.map((_,i)=>i/(f.path.length-1)),{checks}),null);
 }
 for(const count of [0,7,513]){
  const path=Array.from({length:count},(_,i)=>({x:i,y:i})),colors=path.map(()=>[30,60,90]);
  assert.equal(measure(path,colors,{checks:0}),undefined);
  assert.equal(fit(colors,path.map((_,i)=>i/Math.max(1,count-1)),{checks:0}),null);
 }
 assert.equal(measure(f.path,f.colors.slice(1),{checks:0}),undefined);
 for(const invalid of [NaN,Infinity,-1,256]){
  const colors=structuredClone(f.colors);colors[0][0]=invalid;
  assert.equal(measure(f.path,colors,{checks:0}),undefined);
  assert.equal(fit(colors,f.path.map((_,i)=>i/(f.path.length-1)),{checks:0}),null);
 }
 const invalid=structuredClone(f.path);invalid[0].x=NaN;assert.equal(measure(invalid,f.colors,{checks:0}),undefined);
 assert.equal(fit(f.colors,[],{checks:0}),null);
 assert.equal(fit(f.colors,f.path.map(()=>NaN),{checks:0}),null);
 const work={checks:3999999};assert.equal(measure(f.path,f.colors,work),undefined);assert.ok(work.checks>4000000);
 const repeated=f.path.map(()=>({x:0,y:0}));assert.equal(measure(repeated,f.colors,{checks:0}),undefined);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
 const runtime=require('../scripts/verify-runtime-package');assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-paint-fit.js'));
});
