'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {detectSceneVisualCandidates:detect,parseSceneCandidateCatalog:parse}=require('../packages/slideclone-core/scene-plan/source-scene-visual-candidates');
const {readSceneCandidateClassifications:read,sceneCandidateClassificationPrompt:prompt}=require('../packages/slideclone-core/scene-plan/source-scene-candidate-classification');
function raster(width=80,height=60){return {width,height,rgba:Buffer.alloc(width*height*4,255)};}
function fill(image,x,y,w,h){for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)image.rgba.set([20,30,40,255],(row*image.width+col)*4);}
function fixture(){const image=raster();fill(image,10,10,8,8);fill(image,21,10,4,4);fill(image,55,35,10,10);return {sourceHash:'a'.repeat(64),image};}
function response(catalog){return {classifications:catalog.candidates.map(c=>({id:c.id,kind:'icon',confidence:.97,complete:true}))};}
test('fixed source candidates merge nearby ink deterministically and retain separated units without mutation',()=>{
 const input=fixture(),before=Buffer.from(input.image.rgba),a=detect(input),b=detect(input);
 assert.deepEqual(a,b);assert.equal(a.candidates.length,2);assert.deepEqual(a.candidates[0].box,{x:10,y:10,w:15,h:8});
 assert.deepEqual(input.image.rgba,before);assert.equal(a.evidence.sourceAuthorized,false);
 const changed=detect({...input,sourceHash:'b'.repeat(64)});assert.notEqual(a.candidates[0].id,changed.candidates[0].id);
});
test('enclosing borders do not absorb unrelated ink in their empty bounding box',()=>{
 const image=raster(100,100);fill(image,5,5,90,2);fill(image,5,93,90,2);fill(image,5,5,2,90);fill(image,93,5,2,90);fill(image,40,40,8,8);
 const result=detect({sourceHash:'a'.repeat(64),image});assert.equal(result.candidates.length,2);
 assert.ok(result.candidates.some(c=>c.box.x===40&&c.box.w===8));
});
test('empty and transparent images produce no candidate and frame-touching proposals are explicit',()=>{
 const input={sourceHash:'a'.repeat(64),image:raster()};assert.deepEqual(detect(input).candidates,[]);
 fill(input.image,0,0,8,8);assert.equal(detect(input).candidates[0].touchesFrame,true);
 input.image.rgba.fill(0);assert.deepEqual(detect(input).candidates,[]);
});
test('raster, capacity and hostile input boundaries reject without invoking or logging contents',()=>{
 let invoked=0;const getter=()=>{invoked++;throw Error('private-token');};
 for(const value of [null,{},new Proxy(fixture(),{get:getter,getPrototypeOf:getter}),{get image(){return getter();}},
  {...fixture(),sourceHash:'private-token'},{...fixture(),image:{width:4000001,height:1,rgba:Buffer.alloc(0)}},
  {...fixture(),image:{width:80,height:60,rgba:Buffer.alloc(3)}}]){
  assert.throws(()=>detect(value),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 }
 assert.equal(invoked,0);
 const image=raster(200,200);for(let y=0;y<200;y+=10)for(let x=0;x<200;x+=10)fill(image,x,y,4,4);
 assert.throws(()=>detect({sourceHash:'a'.repeat(64),image}),/catalog budget/);
 const crowded=raster(500,500);for(let y=0;y<500;y+=10)for(let x=0;x<500;x+=10)fill(crowded,x,y,4,4);
 assert.throws(()=>detect({sourceHash:'a'.repeat(64),image:crowded}),/component budget/);
 const rgba=Buffer.alloc(80*60*4,255);Object.defineProperty(rgba,'length',{get:getter});
 assert.deepEqual(detect({sourceHash:'a'.repeat(64),image:{width:80,height:60,rgba}}).candidates,[]);assert.equal(invoked,0);
});

test('oversized groups remain explicit omissions and never become a source background',()=>{
 const image=raster(600,600);fill(image,0,0,600,600);const c=detect({sourceHash:'a'.repeat(64),image});
 assert.equal(c.evidence.oversizedGroups,1);assert.deepEqual(c.candidates,[]);assert.equal(c.evidence.sourceAuthorized,false);
});
test('classification binds exact IDs without coordinates, owner or authority fields',()=>{
 const catalog=detect(fixture()),rows=response(catalog);rows.classifications.reverse();
 assert.deepEqual(read(rows,catalog).map(r=>r.id),catalog.candidates.map(c=>c.id));
 const bindings=catalog.candidates.map((c,index)=>({index,id:c.id}));assert.match(prompt(catalog,bindings),/Do not invent or change coordinates/);
 // json_object transports reject inputs that never name JSON (seen as opaque proxy 502).
 assert.match(prompt(catalog,bindings),/JSON object/);
 assert.throws(()=>prompt(catalog,[...bindings].reverse()),/binding/);
 const output=read(response(catalog),catalog);output[0].kind='text';assert.equal(catalog.candidates.length,2);
});
test('unknown, empty, missing, duplicate, extreme and malicious classifications fail closed',()=>{
 const catalog=detect(fixture());
 for(const mutate of [r=>r.classifications.pop(),r=>r.classifications.push(r.classifications[0]),
  r=>r.classifications[1].id=r.classifications[0].id,r=>r.classifications[0].id='candidate-'+'f'.repeat(24),
  r=>r.classifications[0].confidence=Infinity,r=>r.classifications[0].kind='delete',
  r=>r.classifications[0].box={x:0,y:0,w:80,h:60},r=>r.classifications[0].kind='unknown']){
  const value=response(catalog);mutate(value);assert.throws(()=>read(value,catalog),TypeError);
 }
 const unknown=response(catalog);unknown.classifications.forEach(r=>{r.kind='unknown';r.confidence=0;r.complete=false;});
 assert.equal(read(unknown,catalog)[0].complete,false);
 const empty=detect({sourceHash:'a'.repeat(64),image:raster()});assert.deepEqual(read({classifications:[]},empty),[]);
 let calls=0;const evil=response(catalog);Object.defineProperty(evil.classifications[0],'kind',{get(){calls++;throw Error('private');}});
 assert.throws(()=>read(evil,catalog),TypeError);assert.equal(calls,0);
 const invalid=structuredClone(catalog);invalid.candidates[0].box.w=Infinity;assert.throws(()=>parse(invalid),TypeError);
});
test('candidate regressions are discovered by the unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(f=>f.file.endsWith('source-scene-visual-candidates.test.js')));
});

test('coverage uses source-bound one-to-one matches and reports only annotated-subset recall',()=>{
 const {measureSceneCandidateCoverage:measure}=require('../packages/slideclone-core/scene-plan/source-scene-candidate-coverage');
 const catalog=detect(fixture()),annotations={sourceHash:catalog.sourceHash,widthPx:80,heightPx:60,units:catalog.candidates.map((c,i)=>({id:'truth'+i,box:c.box}))};
 const r=measure(catalog,annotations);assert.equal(r.recall,1);assert.equal(r.qualityAcceptance,false);assert.equal(r.iouThreshold,.5);
 const duplicate={...annotations,units:[annotations.units[0],{...annotations.units[0],id:'other'}]};assert.equal(measure(catalog,duplicate).matched,1);
 assert.equal(measure(catalog,{...annotations,units:[]}).recall,null);
 for(const bad of [{...annotations,sourceHash:'b'.repeat(64)},{...annotations,units:[annotations.units[0],annotations.units[0]]},
  {...annotations,units:[{id:'bad',box:{x:0,y:0,w:Infinity,h:3}}]}])assert.throws(()=>measure(catalog,bad),TypeError);
});

test('maximum proposal matching does not depend on annotation order or greedily consume another unit sole candidate',()=>{
 const {measureSceneCandidateCoverage:measure}=require('../packages/slideclone-core/scene-plan/source-scene-candidate-coverage');
 const catalog=detect(fixture());catalog.candidates[0].box={x:0,y:0,w:20,h:20};catalog.candidates[0].inkPixels=20;
 catalog.candidates[1].box={x:8,y:0,w:20,h:20};catalog.candidates[1].inkPixels=20;
 const a={sourceHash:catalog.sourceHash,widthPx:80,heightPx:60,units:[{id:'flexible',box:{x:4,y:0,w:20,h:20}},{id:'single',box:{x:0,y:0,w:20,h:20}}]};
 assert.equal(measure(catalog,a).matched,2);assert.equal(measure(catalog,{...a,units:[...a.units].reverse()}).matched,2);
});
