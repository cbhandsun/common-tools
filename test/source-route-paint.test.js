'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceRoutePaint:measure,sourceRouteSegmentGradient:gradient}=require('../packages/slideclone-core/source-route-paint');
function fixture(color){
 const width=220,path=Array.from({length:180},(_,i)=>({x:10+i,y:20})),rgba=new Uint8Array(width*40*4);
 for(const [i,p]of path.entries())rgba.set([...color(i/179,i),255],(p.y*width+p.x)*4);
 return {path,rgba,width};
}

test('short nonuniform paint transitions use adaptive stops while checking unsmoothed source cells',()=>{
 const f=fixture((t,i)=>{
  const transition=Math.max(0,Math.min(1,(t-.88)/.025));
  return [Math.round(190+60*transition)+(i%7===0?6:0),Math.round(80-30*transition),Math.round(40-15*transition)];
 });
 const before=f.rgba.slice(),work={checks:0},fit=measure(f.path,f.rgba,f.width,work);
 assert.ok(fit?.stops);assert.ok(fit.stops.length<=6);assert.ok(fit.support>=.9);
 assert.ok(fit.stops.some(s=>s.position>.8&&s.position<1));assert.deepEqual(f.rgba,before);assert.ok(work.checks<=4000000);
 // Smoothing is never the acceptance evidence: rapidly alternating source
 // cells remain unsupported even if their local median is almost constant.
 const alternating=fixture((_,i)=>i%2?[240,20,20]:[20,20,240]);
 assert.equal(measure(alternating.path,alternating.rgba,alternating.width,{checks:0}),null);
 assert.equal(measure(f.path,f.rgba,f.width,{checks:3999000}),null);
});
test('source-certified route paint uses bounded native gradient stops at the original error and support gates',()=>{
 const f=fixture(t=>[Math.round(20+130*t),60,Math.round(210-80*t)]),before=f.rgba.slice(),work={checks:0};
 const fit=measure(f.path,f.rgba,f.width,work);assert.ok(fit?.stops);assert.ok(fit.stops.length<=6);assert.ok(fit.support>=.9);
 assert.deepEqual(f.rgba,before);assert.ok(work.checks<=4000000);
 const part=gradient(fit.stops,.2,.8,45);assert.equal(part.angleDeg,45);assert.equal(part.stops[0].position,0);assert.equal(part.stops.at(-1).position,1);
 assert.ok(part.stops.length<=6);assert.ok(part.stops.every(s=>/^#[A-F0-9]{6}$/.test(s.color)));
 const solid=fixture(()=>[20,60,150]),constant=measure(solid.path,solid.rgba,solid.width,{checks:0});assert.ok(constant);assert.equal(constant.stops,undefined);
 const fringe=fixture((_,i)=>i<9?[240,220,200]:[20,60,150]);
 assert.equal(measure(fringe.path,fringe.rgba,fringe.width,{checks:0})?.support,.95);
 assert.equal(measure(fringe.path,fringe.rgba,fringe.width,{checks:0})?.startColor,'#F0DCC8');
 assert.equal(measure(fringe.path,fringe.rgba,fringe.width,{checks:0})?.endColor,'#143C96');
});
test('rapid unsupported paint changes, missing route samples and work exhaustion do not gain a native fit',()=>{
 const f=fixture((_,i)=>i%2?[220,20,40]:[10,190,210]);assert.equal(measure(f.path,f.rgba,f.width,{checks:0}),null);
 assert.equal(measure([],f.rgba,f.width,{checks:0}),null);assert.equal(measure(f.path.slice(0,7),f.rgba,f.width,{checks:0}),null);
 assert.equal(measure(Array(513).fill(f.path[0]),f.rgba,f.width,{checks:0}),null);
 assert.equal(measure(f.path,f.rgba,f.width,{checks:4000000}),null);
 for(const [start,end,angle]of [[0,0,0],[-1,.5,0],[.5,1.1,0],[.5,.2,0],[0,1,NaN]])
  assert.throws(()=>gradient([{position:0,color:'#000000'},{position:1,color:'#FFFFFF'}],start,end,angle),TypeError);
 const runtime=require('../scripts/verify-runtime-package'),suites=require('../scripts/test-suites');
 assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/source-route-paint.js'));
 for(const suite of ['unit','all'])assert.equal(suites.includesSuite(__filename,suite),true);
});

test('reused gradient proposals independently verify every candidate source sample and retain the shared work cap',()=>{
 const f=fixture(t=>[Math.round(20+130*t),60,Math.round(210-80*t)]),firstWork={checks:0};
 const first=measure(f.path,f.rgba,f.width,firstWork);assert.ok(first?.stops);
 const work={checks:0},next=measure(f.path,f.rgba,f.width,work,first.stops);
 assert.ok(next);assert.equal(next.support,first.support);assert.ok(work.checks<firstWork.checks);
 const broken=fixture((_,i)=>i%2?[220,20,40]:[10,190,210]);
 assert.equal(measure(broken.path,broken.rgba,broken.width,{checks:0},first.stops),null);
 const exhausted={checks:4000000-f.path.length*32};
 assert.equal(measure(f.path,f.rgba,f.width,exhausted,first.stops),null);
 assert.ok(exhausted.checks>4000000);
});
