'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isolateClosedSourceCage:isolate}=require('../packages/slideclone-core/scene-plan/source-closed-cage');
function fixture(dividers=[35,55]){
 const cells=new Set();for(let y=15;y<=75;y++)for(let x=15;x<=95;x++)
  if(x<=17||x>=93||y<=17||y>=73||dividers.some(line=>y>=line&&y<=line+2))cells.add(y*120+x);
 // A connector branch is measured but is not the multi-face perimeter.
 for(let y=0;y<15;y++)for(let x=54;x<=56;x++)cells.add(y*120+x);
 return {bounds:{x:0,y:0,w:120,h:90},hint:{x:15,y:15,w:81,h:61},points:[...cells].map(n=>({x:n%120,y:Math.floor(n/120)}))};
}
test('complete multi-face cage preserves all dividers and excludes a remote attached branch',()=>{
 const input=fixture(),before=structuredClone(input),result=isolate(input);assert(result);assert.equal(result.holes.length,3);
 assert(result.points.some(p=>p.y===36&&p.x===55));assert(result.points.some(p=>p.y===56&&p.x===55));
 assert(!result.points.some(p=>p.y<12));assert(result.points.every(p=>input.points.some(s=>s.x===p.x&&s.y===p.y)));
 assert.deepEqual(input,before);assert.notEqual(result.points[0],input.points[0]);
});
test('single ring, empty input and open exterior cannot claim a multi-face unit',()=>{
 assert.equal(isolate(fixture([])),null);assert.equal(isolate({...fixture(),points:[]}),null);
 const input=fixture();input.points=input.points.filter(p=>p.x<93||p.y<15||p.y>75);assert.equal(isolate(input),null);
});
test('source face count reports a missing divider instead of inventing the requested topology',()=>{
 const original=isolate(fixture()),missing=isolate(fixture([35]));assert(original&&missing);
 assert.equal(original.holes.length,3);assert.equal(missing.holes.length,2);
 const solid=fixture();solid.points=[];for(let y=15;y<=75;y++)for(let x=15;x<=95;x++)solid.points.push({x,y});
 assert.equal(isolate(solid),null);
});
test('disconnected rings cannot receive one shared cage silhouette',()=>{
 const a=fixture([]),points=a.points.filter(p=>p.y>=15);
 const shifted=points.map(p=>({x:p.x+90,y:p.y}));
 assert.equal(isolate({bounds:{x:0,y:0,w:220,h:90},hint:{x:15,y:15,w:171,h:61},points:[...points,...shifted]}),null);
});
test('invalid, hostile, duplicated and extreme source cells fail without executing getters',()=>{
 let calls=0;const input=fixture(),getter={get points(){calls++;throw Error('private-user-content');}};
 for(const value of [null,{},getter,new Proxy(input,{}),{...input,points:new Array(3)},
  {...input,points:[...input.points,input.points[0]]},{...input,points:[{x:-1,y:0}]},
  {...input,bounds:{x:0,y:0,w:Infinity,h:10}},{...input,bounds:{x:0,y:0,w:120.5,h:90}},
  {...input,bounds:{...input.bounds,extra:true}},
  {...input,points:[{x:1,y:1,extra:true}]},{...input,points:[{get x(){calls++;return 1;},y:1}]}])
  assert.throws(()=>isolate(value),error=>error instanceof TypeError&&!error.message.includes('private-user-content'));
 assert.equal(calls,0);assert.equal(isolate({...input,bounds:{x:0,y:0,w:1024,h:1024}}),null);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-closed-cage.test.js','unit'),true);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-closed-cage.test.js','all'),true);
});
