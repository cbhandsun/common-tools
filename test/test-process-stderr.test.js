'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {createStderrSummary}=require('../scripts/test-process-stderr');
const {processDiagnostics}=require('../scripts/test-process-diagnostics');
const event=(message,file='safe.test.js')=>({type:'test:stderr',data:{file,message}});
test('stderr summaries recognize split text signatures without returning private contents',()=>{
 const s=createStderrSummary();s.observe(event('private-token FATAL ER'));s.observe(event('ROR: private-user-data\nReached heap limit\nNative stack trace'));
 const out=s.take(event(''));assert.equal(out.stderrEvents,2);
 assert.deepEqual(out.stderrTextSignatures,['fatal-error-text','heap-exhaustion-text','native-stack-text']);
 assert.equal(JSON.stringify(out).includes('private'),false);assert.equal(s.take(event('')),null);
});
test('normal, empty, invalid and oversized stderr stays bounded and is never coerced',()=>{
 const s=createStderrSummary();let calls=0;const trap=()=>{calls++;throw Error('private');};
 for(const v of [null,{},new Proxy({},{get:trap}),{get type(){return trap();}},
  {type:'test:stderr',get data(){return trap();}},event({toString:trap}),event('x','')])s.observe(v);
 assert.equal(s.take(event('')),null);assert.equal(calls,0);
 s.observe(event('private'.repeat(20000)));const large=s.take(event(''));
 assert.equal(large.stderrTruncated,true);assert.ok(large.stderrSampleBytes<=65536);assert.deepEqual(large.stderrTextSignatures,[]);
 s.observe(event(''));assert.equal(s.take(event('')).stderrSampleBytes,0);
});
test('stderr file keys are bounded and summaries cannot be mixed between files',()=>{
 const s=createStderrSummary();s.observe(event('FATAL ERROR:','a.test.js'));s.observe(event('ordinary','b.test.js'));
 assert.deepEqual(s.take(event('','b.test.js')).stderrTextSignatures,[]);
 assert.deepEqual(s.take(event('','a.test.js')).stderrTextSignatures,['fatal-error-text']);
 for(let i=0;i<130;i++)s.observe(event('ordinary','f'+i));
 assert.equal(s.take(event('','f129')),null);
 s.observe(event('ordinary','x'.repeat(32769)));assert.equal(s.take(event('','x'.repeat(32769))),null);
});
test('reporter attaches signatures only to process failures, retaining original outcome metadata',async()=>{
 async function* input(){
  yield event('private-content FATAL ERROR:');
  yield {type:'test:fail',data:{file:'safe.test.js',details:{error:{exitCode:5,signal:null}}}};
  yield event('private-content','passed.test.js');yield {type:'test:pass',data:{file:'passed.test.js'}};
  yield {type:'test:fail',data:{file:'passed.test.js',details:{error:{exitCode:1}}}};
 }
 const rows=[];for await(const row of processDiagnostics(input()))rows.push(row);
 assert.equal(rows.length,3);assert.match(rows[0],/"exitCode":5/u);assert.match(rows[1],/fatal-error-text/u);
 assert.equal(rows.join('').includes('private'),false);assert.match(rows[2],/"exitCode":1/u);
});
test('new stderr diagnostics are included in type boundaries and unified CI',()=>{
 assert.ok(require('../tsconfig.boundaries.json').include.includes('scripts/test-process-stderr.js'));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/test-process-stderr.test.js'));
});
