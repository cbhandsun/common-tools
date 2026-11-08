'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {sourceCoreHalo}=require('../packages/slideclone-core/routing/source-route-core-halo');
const {createCorePendingIndex}=require('../packages/slideclone-core/routing/source-route-core-pending');
function referenceHalo(component,w,h){
 const halo=new Uint8Array(w*h);
 for(let n=0;n<component.length;n++)if(component[n]){
  const x=n%w,y=Math.floor(n/w);
  for(let yy=Math.max(0,y-6);yy<=Math.min(h-1,y+6);yy++)for(let xx=Math.max(0,x-6);xx<=Math.min(w-1,x+6);xx++)halo[yy*w+xx]=1;
 }
 return halo;
}
test('merged core halo exactly preserves every source cell of the independent square dilation',()=>{
 for(const [w,h]of [[1,1],[1,20],[20,1],[13,17],[80,80]])for(const mode of ['empty','dense','edges','diagonal','sparse']){
  const component=new Uint8Array(w*h);
  for(let n=0;n<component.length;n++){
   const x=n%w,y=Math.floor(n/w);
   component[n]=Number(mode==='dense'||mode==='edges'&&(x===0||y===0||x===w-1||y===h-1)
    ||mode==='diagonal'&&x===y||mode==='sparse'&&(n*73+19)%41===0);
  }
  const before=component.slice(),work={checks:0};
  assert.deepEqual(sourceCoreHalo(component,w,h,work),referenceHalo(component,w,h),[w,h,mode].join(','));
  assert.deepEqual(component,before);assert.ok(work.checks<=4000000);
 }
});
test('merged halo fits a bounded remaining budget by avoiding repeated writes of identical source cells',()=>{
 const component=new Uint8Array(80*80).fill(1),work={checks:3960000};
 assert.deepEqual(sourceCoreHalo(component,80,80,work),new Uint8Array(component.length).fill(1));
 assert.ok(work.checks<=4000000);
});
test('halo exhaustion never returns a partial mask or mutates the measured core',()=>{
 const component=new Uint8Array(30*30).fill(1),before=component.slice(),measured={checks:0};
 assert.ok(sourceCoreHalo(component,30,30,measured));
 const work={checks:4000000-measured.checks+1};
 assert.equal(sourceCoreHalo(component,30,30,work),null);assert.ok(work.checks>4000000);assert.deepEqual(component,before);
 for(const checks of [-1,NaN,Infinity,4000001])assert.equal(sourceCoreHalo(component,30,30,{checks}),null);
 for(const [w,h]of [[0,30],[30,0],[-1,30],[30,29],[NaN,30],[Number.MAX_SAFE_INTEGER,30]])
  assert.throws(()=>sourceCoreHalo(component,w,h,{checks:0}),/dimensions/);
});
test('pending index preserves exact row order and clips queries without aliasing neighboring rows',()=>{
 const width=80,pending=new Set([159,0,85,79,80,165,87,164,86]),before=[...pending],work={checks:0};
 const index=createCorePendingIndex(pending,width,work);assert.ok(index);
 for(const bounds of [[0,0,79,2],[-20,-1,100,3],[5,1,7,2],[80,0,100,3],[8,2,5,1]]){
  const [left,top,right,bottom]=bounds,expected=[...pending].filter(n=>n%width>=left&&n%width<=right&&Math.floor(n/width)>=top&&Math.floor(n/width)<=bottom).sort((a,b)=>a-b);
  assert.deepEqual([...index.within(...bounds)],expected);
 }
 assert.deepEqual([...pending],before);assert.ok(work.checks<=4000000);
});
test('rectangle orientation follows pending source cores and rotates symmetrically',()=>{
 for(const mode of ['horizontal','vertical','tie','empty']){
  const cells=new Set();for(let t=-12;t<=12;t++)if(mode!=='empty'){
   if(mode!=='vertical')cells.add(40*80+40+t);if(mode!=='horizontal')cells.add((40+t)*80+40);
  }
  const work={checks:0},index=createCorePendingIndex(cells,80,work);assert.ok(index);
  assert.deepEqual(index.rectanglesAt(40,40),mode==='horizontal'?[[24,12]]:mode==='vertical'?[[12,24]]:mode==='tie'?[[24,12],[12,24]]:[]);
  assert.ok(work.checks<=4000000);
 }
});
test('pending index shares the hard budget for construction, selection and enumeration',()=>{
 const cells=new Set(Array.from({length:100},(_,i)=>i));
 assert.equal(createCorePendingIndex(cells,80,{checks:3999999}),null);
 for(const checks of [-1,NaN,Infinity,4000001])assert.equal(createCorePendingIndex(cells,80,{checks}),null);
 for(const width of [0,-1,NaN,Infinity])assert.throws(()=>createCorePendingIndex(cells,width,{checks:0}),/width/);
 for(const cell of [-1,NaN,Infinity,1.5])assert.throws(()=>createCorePendingIndex(new Set([cell]),80,{checks:0}),/cell/);
 for(const query of ['selection','enumeration']){
  const work={checks:0},index=createCorePendingIndex(cells,80,work);assert.ok(index);work.checks=4000000;
  if(query==='selection')assert.deepEqual(index.rectanglesAt(40,40),[]);else assert.deepEqual([...index.within(0,0,79,2)],[]);
  assert.ok(work.checks>4000000);
 }
});
test('core support regressions are discovered by the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-route-core-support.test.js'));
 const runtime=require('node:fs').readFileSync(path.join(__dirname,'../scripts/verify-runtime-package.js'),'utf8');
 for(const name of ['source-route-core-halo','source-route-core-pending'])assert.ok(runtime.includes('packages/slideclone-core/routing/'+name+'.js'));
});
