'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneObligationCoverage:coverage}=require('../packages/slideclone-core/scene-plan/source-scene-obligation-coverage');
const {completeRegionPrograms}=require('../packages/slideclone-core/scene-plan/source-scene-region-completion');
const hash='a'.repeat(64);
function plan(){return {version:1,sourceHash:hash,widthPx:100,heightPx:100,
 regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
  {id:'card',parentId:'root',kind:'card',box:{x:10,y:10,w:80,h:80}}],
 objects:[{id:'left',regionId:'root',kind:'container',box:{x:1,y:1,w:5,h:5}},
  {id:'right',regionId:'root',kind:'container',box:{x:20,y:1,w:5,h:5}}],
 relations:[{id:'edge',regionId:'root',fromId:'left',toId:'right',direction:'forward'}],
 regionPrograms:[{regionId:'card',objects:[],relations:[],labels:[]}],
 observedInventory:[{regionId:'root',containers:2,icons:0,relations:2},{regionId:'card',containers:0,icons:0,relations:0}]};}
const actual=()=>({objects:new Set(),relations:new Set(),completed:new Set()});
test('coverage includes owners without programs and distinguishes census, admission and actual members',()=>{
 const p=plan(),before=structuredClone(p),a=actual();a.relations.add('edge');a.completed.add('card');
 const out=coverage(p,a);
 assert.deepEqual(out.regions,{declared:2,programmed:1,pending:0,completed:1,missingPrograms:['root']});
 assert.deepEqual(out.relations,{observed:2,admitted:1,materialized:1,unprogrammed:1});
 assert.equal(out.rows[0].program,'missing');assert.equal(out.rows[0].complete,false);
 assert.deepEqual(p,before);assert.deepEqual([...a.completed],['card']);
});
test('legacy, empty and unknown observations never acquire a completion claim',()=>{
 const legacy=plan();delete legacy.regionPrograms;assert.equal(coverage(legacy,actual()),null);
 const empty={...plan(),regions:[],objects:[],relations:[],regionPrograms:[],observedInventory:[]};
 assert.deepEqual(coverage(empty,actual()).regions,{declared:0,programmed:0,pending:0,completed:0,missingPrograms:[]});
 const p=plan();p.observedInventory[0].relations=null;assert.equal(coverage(p,actual()).relations.observed,null);
 delete p.observedInventory;assert.equal(coverage(p,actual()).relations.observed,null);
});
test('completion counts only unique current-output receipts and never staged preflight members',()=>{
 const p=plan();p.regionPrograms=[{regionId:'root',objects:['left','right'],relations:['edge'],labels:[]}];
 p.observedInventory[0].relations=1;
 const input={page:{shapes:[{id:'l'},{id:'r'},{id:'e'}],images:[],textBoxes:[]},plan:p,slideSize:{widthPt:100,heightPt:100},
  preflight:false,objects:new Map([['left',['l']],['right',['r']]]),relations:new Map([['edge',['e']]]),
  interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:1,rejected:[]}};
 assert.equal(completeRegionPrograms(input).evidence.coverage.regions.completed,1);
 const preflight=completeRegionPrograms({...input,preflight:true});
 assert.equal(preflight.evidence.staged,1);assert.equal(preflight.evidence.coverage.regions.completed,0);
 for(const shapes of [[{id:'l'},{id:'r'}],[{id:'l'},{id:'r'},{id:'e'},{id:'e'}]]){
  const out=completeRegionPrograms({...input,page:{...input.page,shapes}});
  assert.equal(out.evidence.coverage.relations.materialized,0);assert.equal(out.evidence.coverage.regions.completed,0);
 }
 const endpoint={...p,textEndpoints:[{id:'text-endpoint'}]};
 assert.doesNotThrow(()=>coverage(endpoint,{...actual(),objects:new Set(['root','text-endpoint'])}));
});
test('missing owner programs remain explicit final completion failures, including an empty proposal',()=>{
 const p=plan(),input={page:{shapes:[],images:[],textBoxes:[]},plan:p,slideSize:{widthPt:100,heightPt:100},preflight:false,
  objects:new Map(),relations:new Map(),interiorParents:new Set(),recoveries:[],unresolved:[],labelEvidence:{prepared:0,rejected:[]}};
 const out=completeRegionPrograms(input);assert(out.evidence.rejected.some(r=>r.regionId==='root'&&r.reason==='region-program-missing'));
 const empty=completeRegionPrograms({...input,plan:{...p,regionPrograms:[]}});
 assert.equal(empty.evidence.rejected.filter(r=>r.reason==='region-program-missing').length,2);
 const legacy={...p};delete legacy.regionPrograms;
 assert.equal(completeRegionPrograms({...input,plan:legacy}).evidence.rejected.length,0);
});
test('full-page census does not shrink to surviving programs or to the admitted relation list',()=>{
 const p=plan();p.regions=Array.from({length:15},(_,i)=>({id:'r'+i,parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}));
 p.objects=[];p.regionPrograms=p.regions.filter((_,i)=>![0,4].includes(i)).map(r=>({regionId:r.id,objects:[],relations:[],labels:[]}));
 p.relations=Array.from({length:10},(_,i)=>({id:'e'+i,regionId:'r0',fromId:'a',toId:'b',direction:'forward'}));
 p.observedInventory=p.regions.map((r,i)=>({regionId:r.id,containers:0,icons:0,relations:i===0?11:0}));
 const out=coverage(p,{...actual(),relations:new Set(['e0']),completed:new Set(p.regionPrograms.slice(0,10).map(p=>p.regionId))});
 assert.deepEqual(out.regions,{declared:15,programmed:13,pending:0,completed:10,missingPrograms:['r0','r4']});
 assert.deepEqual(out.relations,{observed:11,admitted:10,materialized:1,unprogrammed:10});
});
test('invalid, foreign, ambiguous and excessive controls fail without changing either input',()=>{
 const mutations=[p=>p.sourceHash='bad',p=>p.regions.push(p.regions[0]),p=>p.objects.push(p.objects[0]),
  p=>p.relations[0].id=p.objects[0].id,p=>p.objects[0].regionId='foreign',p=>p.regionPrograms.push(p.regionPrograms[0]),
  p=>p.observedInventory.pop(),p=>p.observedInventory[0].relations=-1,p=>p.observedInventory[0].relations=10001,
  p=>p.regions=Array(25).fill(p.regions[0]),p=>p.objects=Array(97).fill(p.objects[0]),p=>p.relations=Array(49).fill(p.relations[0]),
  p=>p.textEndpoints=new Array(1),p=>p.textEndpoints=Array(513).fill({id:'text'})];
 for(const mutate of mutations){const p=plan();mutate(p);assert.throws(()=>coverage(p,actual()),TypeError);}
 for(const a of [{...actual(),objects:new Set(['unknown'])},{...actual(),relations:new Set(['unknown'])},
  {...actual(),completed:new Set(['root'])},{...actual(),completed:new Set(['unknown'])},
  {...actual(),relations:new Set(Array.from({length:49},(_,i)=>'e'+i))}])assert.throws(()=>coverage(plan(),a),TypeError);
});
test('proxies, accessors, collection overrides and forged sets cannot execute or expose content',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-value');};
 const objectProxy=new Proxy(plan(),{get:trap,getPrototypeOf:trap,ownKeys:trap});
 const setProxy=new Proxy(new Set(),{get:trap,getPrototypeOf:trap,ownKeys:trap});
 const overridden=new Set();Object.defineProperty(overridden,Symbol.iterator,{get:trap});
 const size=new Set();Object.defineProperty(size,'size',{get:trap});
 const endpoints=plan();endpoints.textEndpoints=[Object.defineProperty({},'id',{get:trap})];
 for(const [p,a]of [[objectProxy,actual()],[endpoints,actual()],
  ...[setProxy,overridden,size,Object.create(Set.prototype),[],null,new class extends Set {}()].map(objects=>[plan(),{...actual(),objects}]),
  [plan(),Object.defineProperty({},'objects',{get:trap})]])
  assert.throws(()=>coverage(p,a),e=>e instanceof TypeError&&!e.message.includes('private-value'));
 assert.equal(calls,0);
});
test('coverage regressions are discovered by unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),path=require('node:path');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(f=>path.normalize(f.file)===path.normalize('test/source-scene-obligation-coverage.test.js')));
});
