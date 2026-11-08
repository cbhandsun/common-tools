'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteSegmentGradient:gradient,measureSourceRoutePaint:measure,sourceRoutePaintColor:color}=require('../packages/slideclone-core/routing/source-route-paint');
const {sourceRouteCorePath:core}=require('../packages/slideclone-core/routing/source-route-core-samples');

test('repeated source core cells compile a constant native paint interval without inventing route-length colors',()=>{
 const width=32,height=24,rgba=new Uint8Array(width*height*4).fill(255);
 const path=Array.from({length:20},(_,i)=>({x:4+i,y:10}));
 for(const [i,p]of path.entries())for(let y=9;y<=11;y++)rgba.set([20+i*6,50+i*4,140+i*2,255],(y*width+p.x)*4);
 const work={checks:0},before=rgba.slice();
 const samples=core({path,rgba,width,height,backgroundAt:()=>[255,255,255],work});assert.ok(samples);
 assert.deepEqual(samples[0],samples[1]);
 const paint=measure(samples,rgba,width,work);assert.ok(paint?.stops);assert.equal(paint.positions[0],paint.positions[1]);
 const start=paint.positions[0],hex='#'+color(paint.stops,start).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
 assert.deepEqual(gradient(paint.stops,start,start,90),{type:'linear',angleDeg:90,stops:[{position:0,color:hex},{position:1,color:hex}]});
 assert.deepEqual(rgba,before);assert.ok(work.checks<=4000000);
});

test('zero-length paint ranges retain the fitted color at both limits and at an interior knot',()=>{
 const stops=[{position:0,color:'#102030'},{position:.5,color:'#204060'},{position:1,color:'#306090'}];
 for(const [at,expected]of [[0,'#102030'],[.25,'#183048'],[.5,'#204060'],[1,'#306090']]){
  const before=structuredClone(stops),result=gradient(stops,at,at,-90);
  assert.deepEqual(result.stops,[{position:0,color:expected},{position:1,color:expected}]);assert.deepEqual(stops,before);
 }
});

test('a measured cyclic network retains repeated core positions and native branch paint endpoints',()=>{
 const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=sourceSharedNetworkFixture();
 for(let y=40;y<180;y++)for(let x=20;x<280;x++){
  const at=(y*f.image.width+x)*4;
  if(f.image.rgba[at]===30&&f.image.rgba[at+1]===60&&f.image.rgba[at+2]===90)f.put(x,y,[y%3===1?22:30,Math.round(255-y*1.2),90]);
 }
 const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);assert.ok(measured.fit.cycleCount);
 const fit=measured.fit,compiled=compileSharedSourceRoute({fit,image:f.image,relations:networkRelations,id:'plateau-network',sourceHash:'a'.repeat(64),
  slideSize:{widthPt:300,heightPt:230},connectorCornerMode:'reroutable-elbow'});
 const lines=compiled.parts.filter(p=>p.type==='line');let ordinal=0,checked=0,adjacent=0,spatialCount=0;
 for(const edge of fit.edges)if(edge.paint.positions)for(let i=1;i<edge.paint.positions.length;i++)
  if(edge.paint.positions[i]===edge.paint.positions[i-1])checked++;
 const global=(cell,p)=>{const terminal=fit.cuts.indexOf(cell);return terminal>=0?fit.sites[terminal].point:{x:p.x+fit.window.x,y:p.y+fit.window.y};};
 for(const edge of fit.edges){let first=0;
 while(first<edge.points.length-1){
  const line=lines[ordinal++];assert.ok(line?.source.nativeConnectorRoute);
  const route=line.source.nativeRoutePoints,last=route.at(-1);
  const i=edge.points.findIndex((p,index)=>{const q=index===edge.points.length-1?global(edge.to,p):{x:p.x+fit.window.x,y:p.y+fit.window.y};return index>first&&Math.hypot(q.x-last.x,q.y-last.y)<1e-6;});assert.ok(i>first);
  const start=first===0?global(edge.from,edge.points[first]):{x:edge.points[first].x+fit.window.x,y:edge.points[first].y+fit.window.y};
  assert.ok(Math.hypot(start.x-route[0].x,start.y-route[0].y)<1e-6);
  const a=edge.points[first],b=edge.points[i];
  const low=edge.path.findIndex(p=>p.x===a.x&&p.y===a.y),high=edge.path.findIndex(p=>p.x===b.x&&p.y===b.y);
  const previous=first;first=i;if(!edge.paint.positions||!edge.paint.stops)continue;
  const expected=at=>'#'+color(edge.paint.stops,at).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();
  const stops=line.style.strokeGradient.stops;
  assert.equal(stops[0].position,0);assert.equal(stops.at(-1).position,1);
  assert.ok(stops.every((s,k)=>/^#[0-9A-F]{6}$/u.test(s.color)&&Number.isFinite(s.position)&&s.position>=0&&s.position<=1&&(!k||s.position>stops[k-1].position)));
  if(i===previous+1)adjacent++;
  if(edge.paint.spatial){
   // Spatial colors belong to actual source coordinates after port projection,
   // including adjacent spans. Repeated path indices are not a color frame.
   const spatial=edge.paint.spatial,coordinates=route.map(p=>p[spatial.axis]-fit.window[spatial.axis]);
   const sourceColor=at=>{
    const rgb='stops'in spatial?color(spatial.stops,Math.max(0,Math.min(1,(at-spatial.origin)/spatial.span)))
     :spatial.color.map((v,c)=>v+spatial.step[c]*(at-spatial.origin));
    return '#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
   };
   assert.deepEqual(stops[0],{position:0,color:sourceColor(Math.min(...coordinates))});
   assert.deepEqual(stops.at(-1),{position:1,color:sourceColor(Math.max(...coordinates))});spatialCount++;
  }else if(i===previous+1){
   assert.deepEqual(stops[0],{position:0,color:expected(edge.paint.positions[low])});
   assert.deepEqual(stops.at(-1),{position:1,color:expected(edge.paint.positions[high])});
  }
 }
 }
 assert.equal(ordinal,lines.length);assert.ok(adjacent>0);assert.ok(spatialCount>0);assert.ok(checked>0,'the measured network must exercise repeated core positions');
 assert.equal(compiled.graph.paths.length,networkRelations.length);
});

test('paint intervals reject empty, coercible, nonfinite, reversed and out-of-range controls before invoking user code',()=>{
 const stops=[{position:0,color:'#000000'},{position:1,color:'#FFFFFF'}];let calls=0;
 const hostile={valueOf(){calls++;throw Error('private');},toString(){calls++;throw Error('private');}};
 for(const [start,end,angle]of [[undefined,0,0],[null,.5,0],['0',.5,0],[false,.5,0],[hostile,.5,0],
  [0,hostile,0],[0,.5,hostile],[NaN,.5,0],[-Infinity,.5,0],[0,Infinity,0],[-1e300,0,0],[0,1e300,0],
  [.5,.2,0],[-.001,0,0],[1,1.001,0],[0,1,NaN]])assert.throws(()=>gradient(stops,start,end,angle),TypeError);
 assert.equal(calls,0);
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit');
 assert.ok(files.some(row=>row.file.replaceAll('\\','/')==='test/source-route-paint-plateau.test.js'));
});
