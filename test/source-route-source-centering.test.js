'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {centerSourceRoute:measure}=require('../packages/slideclone-core/routing/source-route-source-centering');
function fixture(){
 const width=26,height=18,mask=new Uint8Array(width*height);
 for(let x=2;x<=23;x++)for(let y=6;y<=10;y++)mask[y*width+x]=1;
 return {width,height,mask,path:Array.from({length:22},(_,i)=>({x:2+i,y:7}))};
}
test('source centering preserves contacts and uses a continuous simple chain of original ink only',()=>{
 const f=fixture(),before=f.mask.slice(),pathBefore=structuredClone(f.path),work={checks:0};
 const result=measure(f.path,f.mask,f.width,f.height,'undirected',work);assert.ok(result);
 assert.deepEqual(result[0],f.path[0]);assert.deepEqual(result.at(-1),f.path.at(-1));
 assert.ok(result.slice(1,-1).every(p=>p.y===8));
 assert.ok(result.every((p,i)=>f.mask[p.y*f.width+p.x]&&(!i||Math.max(Math.abs(p.x-result[i-1].x),Math.abs(p.y-result[i-1].y))<=1)));
 assert.equal(new Set(result.map(p=>p.y*f.width+p.x)).size,result.length);
 assert.deepEqual(f.mask,before);assert.deepEqual(f.path,pathBefore);assert.ok(work.checks<4000000);
 const heads=measure(f.path,f.mask,f.width,f.height,'both',{checks:0});assert.deepEqual(heads,f.path);
});
test('centering cannot close source gaps, invent a loop, expand path capacity or reset the work ledger',()=>{
 const f=fixture();
 for(let y=0;y<f.height;y++)f.mask[y*f.width+12]=0;
 assert.equal(measure(f.path,f.mask,f.width,f.height,'undirected',{checks:0}),null);
 assert.equal(measure([],f.mask,f.width,f.height,'undirected',{checks:0}),null);
 assert.equal(measure(Array(513).fill({x:2,y:7}),f.mask,f.width,f.height,'undirected',{checks:0}),null);
 const fresh=fixture(),loop=[...fresh.path,...fresh.path.slice().reverse()];
 assert.equal(measure(loop,fresh.mask,fresh.width,fresh.height,'undirected',{checks:0}),null);
 const exhausted={checks:4000000};assert.equal(measure(fresh.path,fresh.mask,fresh.width,fresh.height,'undirected',exhausted),null);assert.equal(exhausted.checks,4000001);
 const runtime=require('../scripts/verify-runtime-package'),{includesSuite}=require('../scripts/test-suites');
 assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-source-centering.js'));
 for(const suite of ['unit','all'])assert.equal(includesSuite(__filename,suite),true);
});
