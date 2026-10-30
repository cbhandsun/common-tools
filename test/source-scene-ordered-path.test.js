'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteMatchesProgram:match}=require('../packages/slideclone-core/scene-plan/source-scene-path-program');
const {orderedScenePathsMatch:ordered}=require('../packages/slideclone-core/scene-plan/source-scene-path-distance');
const points=rows=>rows.map(([x,y])=>({x,y}));
const program=vertices=>({kind:'polyline',dash:'solid',vertices});
const matches=(source,proposal)=>match(source,program(proposal),{checks:0});

test('source identity accepts continuous collinear subdivisions rather than requiring an observation at a sampled cell',()=>{
 const sparse=points([[0,0],[10,0],[10,10]]),subdivided=points([[0,0],[5,0],[10,0],[10,5],[10,10]]);
 const snapshot=structuredClone([sparse,subdivided]);
 assert.equal(matches(sparse,subdivided),true);assert.equal(matches(subdivided,sparse),true);
 assert.deepEqual([sparse,subdivided],snapshot);
 for(const delta of [0,1,1.5]){
  const shifted=points([[0,delta],[5,delta],[10,delta]]);
  assert.equal(matches(points([[0,0],[10,0]]),shifted),true);
 }
 assert.equal(matches(points([[0,0],[10,0]]),points([[0,1.500001],[10,1.500001]])),false);
});

test('source identity rejects reversal and different loop order even when all old point-to-path distances are zero',()=>{
 const line=points([[0,0],[5,0],[10,0]]);
 assert.equal(matches(line,[...line].reverse()),false);
 const first=points([[0,0],[10,0],[0,0],[0,10],[0,0]]);
 const other=points([[0,0],[0,10],[0,0],[10,0],[0,0]]);
 assert.equal(matches(first,other),false);assert.equal(matches(other,first),false);
 const retraced=points([[0,0],[10,0],[0,0],[10,0]]);
 assert.equal(matches(line,retraced),false);assert.equal(matches(retraced,line),false);
 assert.equal(matches(first,first),true);
});

test('source identity checks every segment interior and both endpoint contacts at the original tolerance',()=>{
 const corners=points([[0,0],[10,0],[10,10]]),shortcut=points([[0,0],[10,10]]);
 assert.equal(matches(corners,shortcut),false);assert.equal(matches(shortcut,corners),false);
 assert.equal(matches(points([[2,0],[10,0]]),points([[0,0],[10,0]])),false);
 assert.equal(matches(points([[0,0],[8,0]]),points([[0,0],[10,0]])),false);
 // A short source curve cannot impersonate a full loop with the same ends.
 assert.equal(matches(points([[0,0],[1,0],[0,0]]),points([[0,0],[10,0],[0,0]])),false);
 // Degenerate measured segments may wait without changing the ordered trace.
 assert.equal(matches(points([[0,0],[0,0],[10,0]]),points([[0,0],[10,0]])),true);
 assert.equal(matches(points([[0,0],[0,0]]),points([[0,1.5],[0,1.5]])),true);
 assert.equal(matches(points([[0,0],[0,0]]),points([[0,1.500001],[0,1.500001]])),false);
});

test('distant coordinates and exact disk tangencies do not enlarge the 1.5px bound',()=>{
 const source=points([[0,16000],[16384,16000]]);
 for(const delta of [0,1.5,1.500001]){
  const proposal=points([[0,16000+delta],[10000,16000+delta],[16384,16000+delta]]);
  assert.equal(matches(source,proposal),delta<=1.5);
 }
 const diagonal=points([[0,0],[16000,12000]]);
 const along=points([[0,0],[8000,6000],[16000,12000]]);
 assert.equal(matches(diagonal,along),true);
 assert.equal(matches(points([[100,100],[110,100]]),points([[100,101.5],[105,101.5],[110,101.5]])),true);
});

test('bounded source matching shares the original ledger and cannot accept a truncated computation',()=>{
 const source=Array.from({length:512},(_,x)=>({x,y:0}));
 const proposal=Array.from({length:16},(_,i)=>({x:i*511/15,y:0}));
 const work={checks:0};assert.equal(match(source,program(proposal),work),true);
 assert.equal(work.checks,1+2*511*15);
 const exact={checks:4000000-work.checks};assert.equal(match(source,program(proposal),exact),true);assert.equal(exact.checks,4000000);
 const exhausted={checks:4000001-work.checks};assert.equal(match(source,program(proposal),exhausted),false);assert.equal(exhausted.checks,4000001);
 const noWork={checks:4000000};assert.equal(match(source,program(proposal),noWork),false);assert.equal(noWork.checks,4000001);
 assert.equal(match(source,program(proposal),noWork),false);assert.equal(noWork.checks,4000001);
 assert.throws(()=>matches([...source,{x:512,y:0}],proposal),TypeError);
 assert.throws(()=>matches(source,[...proposal,{x:512,y:0}]),TypeError);
});

test('the source path producer respects its existing 512-cell contract before ordered matching',()=>{
 const {sourceRoutePath}=require('../packages/slideclone-core/routing/source-route-centerline');
 const width=520,height=3,mask=new Uint8Array(width*height);
 for(let x=1;x<=513;x++)mask[width+x]=1;
 const before=mask.slice(),work={checks:0};
 const full=sourceRoutePath(mask,width,height,width+1,width+512,work);
 assert.equal(full.length,512);assert.deepEqual(full[0],{x:1,y:1});assert.deepEqual(full.at(-1),{x:512,y:1});
 assert.equal(matches(full,[full[0],full.at(-1)]),true);
 assert.equal(sourceRoutePath(mask,width,height,width+1,width+513,work),null);
 assert.equal(sourceRoutePath(mask,width,height,width+1,width+2,{checks:4000000}),null);
 assert.deepEqual(mask,before);assert.ok(work.checks<4000000);
});

test('invalid source, proposal and ledger data cannot execute accessors or Proxy traps',()=>{
 const valid=points([[0,0],[10,0]]);let calls=0;
 const trap=()=>{calls++;throw Error('private-user-content');};
 for(const invalid of [undefined,null,[],new Array(2),[valid[0]],
  [{x:NaN,y:0},valid[1]],[{x:0,y:Infinity},valid[1]],[{x:-1,y:0},valid[1]],
  [{x:16385,y:0},valid[1]],[{...valid[0],content:'private-user-content'},valid[1]],
  new Proxy(valid,{get:trap,ownKeys:trap}),[{get x(){return trap();},y:0},valid[1]]]){
  assert.throws(()=>ordered(invalid,valid,{checks:0}),e=>e instanceof TypeError&&!e.message.includes('private'));
  assert.throws(()=>ordered(valid,invalid,{checks:0}),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 for(const invalid of [undefined,null,{}, {checks:NaN},{checks:-1},{checks:0.1},{checks:4000002},
  new Proxy({checks:0},{get:trap,ownKeys:trap}),{get checks(){return trap();}}])
  assert.throws(()=>ordered(valid,valid,invalid),e=>e instanceof TypeError&&!e.message.includes('private'));
 for(const invalid of [null,{},new Proxy(program(valid),{get:trap}),{get vertices(){return trap();}}])
  assert.throws(()=>match(valid,invalid,{checks:0}),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(calls,0);
});

test('ordered source regressions are in both unified CI discovery suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-scene-ordered-path.test.js'));
});
