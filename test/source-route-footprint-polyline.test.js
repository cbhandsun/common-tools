'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteFootprintPolyline:fit}=require('../packages/slideclone-core/routing/source-route-footprint-polyline');
const {simplifySourceRoute}=require('../packages/slideclone-core/routing/source-route-centerline');
function fixture(){
 const width=30,height=30,points=[{x:10,y:10},{x:11,y:10},{x:12,y:11},{x:13,y:11},{x:14,y:12}];
 return {width,height,points,cells:[...points.map(p=>p.y*width+p.x),9*width+11],shaft:1,work:{checks:0}};
}
function nearest(p,points){let best=Infinity;for(let i=1;i<points.length;i++){
 const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
 best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}return best;}
test('a complete shaft footprint constrains shortcuts without inflating width, moving endpoints or inventing vertices',()=>{
 const f=fixture(),before=structuredClone(f),simple=simplifySourceRoute(f.points,{checks:0});assert.equal(simple.length,2);
 assert.ok(nearest({x:11,y:9},simple)>1.25);
 const result=fit(f);assert.ok(result);assert.equal(result.length,3);assert.deepEqual(result[0],f.points[0]);assert.deepEqual(result.at(-1),f.points.at(-1));
 assert.ok(result.every(p=>f.points.some(q=>p.x===q.x&&p.y===q.y)));
 assert.ok(f.points.every(p=>nearest(p,result)<=.75));
 assert.ok(f.cells.every(n=>nearest({x:n%f.width,y:Math.floor(n/f.width)},result)<=f.shaft/2+.75));
 assert.deepEqual(f.points,before.points);assert.deepEqual(f.cells,before.cells);assert.equal(f.shaft,before.shaft);assert.ok(f.work.checks<=4000000);
});
test('already complete simple shafts retain their exact original simplification',()=>{
 const f=fixture();f.cells=f.points.map(p=>p.y*f.width+p.x);const before=structuredClone(f.points);
 assert.deepEqual(fit(f),simplifySourceRoute(before,{checks:0}));
 const flat={...fixture(),points:[{x:10,y:10},{x:11,y:10},{x:12,y:10}],cells:[310,311,312]};
 assert.deepEqual(fit(flat),[{x:10,y:10},{x:12,y:10}]);
});
test('an original-path outlier, loop or vertex-capacity overflow cannot gain a stroke certificate',()=>{
 const f=fixture();f.cells.push(7*f.width+11);assert.equal(fit(f),null);
 const loop=fixture();loop.points.push({...loop.points[0]});assert.equal(fit(loop),null);
 const points=Array.from({length:40},(_,i)=>({x:2+i,y:i%2?6:2})),cells=points.map(p=>p.y*60+p.x);
 assert.equal(fit({points,cells,width:60,height:12,shaft:1,work:{checks:0}}),null);
 assert.equal(fit({...fixture(),work:{checks:4000000}}),null);
 assert.equal(fit({...fixture(),work:{checks:3999998}}),null);
 const exhausted={...fixture(),work:{checks:3999950}};assert.equal(fit(exhausted),null);assert.equal(exhausted.work.checks,4000001);
 const bounded={...fixture(),work:{checks:3999900}};assert.equal(fit(bounded).length,3);assert.ok(bounded.work.checks<=4000000);
});
test('boundary validation rejects empty, malformed, extreme and hostile controls without running accessors',()=>{
 let calls=0;const getter=()=>{calls++;throw Error('private');};
 for(const value of [null,{}, {...fixture(),points:[]},{...fixture(),cells:[]},{...fixture(),shaft:NaN},{...fixture(),shaft:0},{...fixture(),shaft:6},
  {...fixture(),width:16385},{...fixture(),width:1024,height:1024},{...fixture(),points:Array(513).fill({x:1,y:1})},
  {...fixture(),cells:Array(32769).fill(1)},{...fixture(),cells:[-1]},{...fixture(),cells:[900]},{...fixture(),cells:[1,1]},
  {...fixture(),points:[{x:1.5,y:1},{x:2,y:2}]},{...fixture(),work:{checks:-1}},{...fixture(),work:Object.freeze({checks:0})},
  new Proxy({},{get:getter}),{...fixture(),points:new Proxy([],{get:getter})},
  {...fixture(),points:[Object.defineProperty({y:1},'x',{get:getter}),{x:2,y:2}]},
  {...fixture(),work:Object.defineProperty({},'checks',{get:getter})}])assert.throws(()=>fit(value),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(calls,0);
 const file='packages/slideclone-core/routing/source-route-footprint-polyline.js';
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 for(const suite of ['unit','all'])assert.equal(require('../scripts/test-suites').includesSuite(__filename,suite),true);
});
