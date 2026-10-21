'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceVisibleGapProgramEvidence:verify}=require('../packages/slideclone-core/source-visible-gap-program');
const {sourceRouteMatchesProgram}=require('../packages/slideclone-core/source-scene-path-program');
function fixture(){return {widthPx:240,heightPx:180,horizontal:true,increasing:true,
 window:{x:71,y:48,w:99,h:25},shaftBox:{x:74,y:53,w:92,h:15},
 program:{kind:'polyline',dash:'solid',vertices:[{x:80,y:61},{x:160,y:59}]},
 observed:{lo:3,hi:94,minAcross:6,maxAcross:18,maxCenterlineErrorPx:0}};}
test('coarse straight proposals refine from complete source while preserving the 1.5px emitted-geometry bound',()=>{
 const input=fixture(),before=structuredClone(input);
 assert.equal(sourceRouteMatchesProgram([{x:74,y:60},{x:165,y:60}],input.program,{checks:0}),false);
 const proof=verify(input);assert.ok(proof);assert.equal(proof.maxCenterlineErrorPx,0);
 assert.deepEqual(JSON.parse(proof.proposal),before.program);assert.deepEqual(input,before);
 input.observed.maxCenterlineErrorPx=1.5;assert.ok(verify(input));
 input.observed.maxCenterlineErrorPx=1.500001;assert.equal(verify(input),null);
 const vertical=fixture();vertical.horizontal=false;vertical.window={x:48,y:71,w:25,h:99};
 vertical.shaftBox={x:53,y:74,w:15,h:92};vertical.program.vertices=[{x:61,y:80},{x:59,y:160}];assert.ok(verify(vertical));
});
test('curves, turns, reverse traversal, wrong orientation and source outside the original window fail',()=>{
 for(const mutate of [p=>p.program.vertices.splice(1,0,{x:110,y:64}),p=>p.program.vertices.reverse(),
  p=>p.program.vertices=[{x:90,y:54},{x:90,y:66}],p=>p.observed.minAcross=0,
  p=>p.observed.maxAcross=24,p=>p.observed.lo=0,p=>p.observed.hi=98]){
  const input=fixture();mutate(input);assert.equal(verify(input),null);
 }
 assert.equal(verify({...fixture(),program:undefined}),null);
});
test('empty, invalid, extreme and hostile source program evidence rejects without executing content',()=>{
 let reads=0;const trap=()=>{reads++;throw Error('private-token');},input=fixture();
 for(const bad of [null,{},new Proxy(input,{get:trap,ownKeys:trap}),{...input,observed:{get lo(){return trap();}}},
  {...input,window:{x:0,y:0,w:513,h:513}}, {...input,widthPx:16385},{...input,observed:{...input.observed,lo:Infinity}},
  {...input,observed:{...input.observed,lo:-1}},{...input,observed:{...input.observed,maxCenterlineErrorPx:NaN}},
  {...input,program:{...input.program,vertices:new Array(2)}},
  {...input,program:{...input.program,vertices:new Proxy([],{get:trap,ownKeys:trap})}},
  {...input,program:{...input.program,vertices:[{get x(){return trap();},y:60},{x:160,y:60}]}},
  {...input,observed:{...input.observed,hi:999}},{...input,shaftBox:{x:200,y:60,w:100,h:20}}])
  assert.throws(()=>verify(bad),error=>error instanceof TypeError&&!error.message.includes('private-token'));
 assert.equal(reads,0);
});
test('source program evidence regressions are discovered in unified unit and all suites',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(file=>path.normalize(file.file)===path.normalize('test/source-visible-gap-program.test.js')));
});
