'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {sourceSharedOutputFixture}=require('./helpers/source-shared-output.cjs');
const {measuredSharedSceneRoutePaintGroups:ordinary,measuredSharedSceneRouteResidualPaintGroups:read}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {sharedSourcePaintCells}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {sourceSharedResidualUnionMasks:masks}=require(path.resolve(__dirname,'../packages/slideclone-core/scene-plan/source-shared-residual-union'));
const {sharedResidualBackdropPlans}=require('../packages/slideclone-core/scene-plan/source-shared-residual-union');
const {createFullSlideResidualBuilder,eraseObjectMask}=require('../packages/slideclone-core/archetypes/full-slide-native-residual');
const {eraseMasks}=require('../packages/slideclone-core/scene-plan/residual-primitive-erasure');
const {residualTextPlans}=require('../packages/slideclone-core/typography/residual-text-erasure');
const {writePng}=require('../packages/slideclone-core/png');
const {withApprovedBackdropBudget,approvedBackdropBudget}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const reload=f=>({...f.image,rgba:Buffer.from(f.image.rgba)}),size={x:0,y:0,w:300,h:230};
function removeFixtureDirectory(root){
 assert.equal(typeof root,'string');assert.ok(path.isAbsolute(root));
 assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
 assert.ok(path.basename(root).startsWith('shared-residual-union-'));
 fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
function setup(t){
 const f=sourceSharedOutputFixture(),image=reload(f),root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-residual-union-'));
 t.after(()=>removeFixtureDirectory(root));const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 return {...f,image,root,sourceFile,outputFile:path.join(root,'output.png')};
}

test('fixture cleanup retries a transient directory race and propagates persistent failure',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shared-residual-union-')),original=fs.rmdirSync;
 let calls=0,persistent=false;
 const race=Object.assign(new Error('fixture directory busy'),{code:'ENOTEMPTY'});
 const mock=t.mock.method(fs,'rmdirSync',function(directory,...args){
  if(directory===root&&(++calls<=2||persistent))throw race;
  return original.call(fs,directory,...args);
 });
 try{
  fs.writeFileSync(path.join(root,'sample.txt'),'fixture');removeFixtureDirectory(root);
  assert.ok(calls>2);assert.equal(fs.existsSync(root),false);
  fs.mkdirSync(root);calls=0;persistent=true;
  assert.throws(()=>removeFixtureDirectory(root),error=>error===race);
  // Node can call rmdir twice per attempt when an empty-directory race occurs.
  assert.ok(calls>1);assert.equal(fs.existsSync(root),true);
 }finally{mock.mock.restore();removeFixtureDirectory(root);}
});

test('fixture cleanup rejects paths outside its generated temporary directory',()=>{
 for(const root of [null,'',os.tmpdir(),path.join(os.tmpdir(),'unrelated'),path.join(os.tmpdir(),'shared-residual-union-x','nested')])
  assert.throws(()=>removeFixtureDirectory(root));
});

test('fresh exact decode is accepted only by residual reader with detached complete private cells and members',()=>{
 const f=sourceSharedOutputFixture(),image=reload(f),work={checks:0};
 assert.deepEqual(ordinary(image,f.shapes,{checks:0}),[]);
 const proofs=read(image,f.shapes,work);assert.equal(proofs.length,1);
 assert.deepEqual(proofs[0].cells,sharedSourcePaintCells(f.fit,f.image,{checks:0}));assert.deepEqual(proofs[0].members,f.built.parts);
 assert.ok(work.checks>0&&work.checks<4000000);proofs[0].cells.clear();proofs[0].members.length=0;
 assert.ok(read(image,f.shapes,{checks:0})[0].cells.size>100);
 assert.deepEqual(Object.keys(ordinary(f.image,f.shapes,{checks:0})[0]).sort(),['cells','heads','item']);
});

test('residual transfer rejects changed RGB, alpha, original source, buffer identity and dimensions',()=>{
 for(const mode of ['rgb','alpha','original','both','buffer','dimensions']){
  const f=sourceSharedOutputFixture(),image=reload(f);
  if(mode==='rgb')image.rgba[0]^=1;if(mode==='alpha')image.rgba[3]^=1;
  if(mode==='original')f.image.rgba[0]^=1;
  if(mode==='both'){image.rgba[0]^=1;f.image.rgba[0]^=1;}
  if(mode==='buffer')f.image.rgba=Buffer.from(f.image.rgba);
  if(mode==='dimensions'){image.width=230;image.height=300;}
  assert.deepEqual(read(image,f.shapes,{checks:0}),[],mode);
 }
 for(const rgba of [null,new Uint8Array(3),new DataView(new ArrayBuffer(16))]){
  const f=sourceSharedOutputFixture();assert.throws(()=>read({...f.image,rgba},f.shapes,{checks:0}),/raster|pixels/);
 }
});

test('residual transfer requires complete unchanged real outputs and the existing unique endpoint geometry',()=>{
 for(const mode of ['copy','missing','duplicate','paint','metadata','endpoint','endpoint-id']){
  const f=sourceSharedOutputFixture(),image=reload(f),part=f.built.parts[0];
  if(mode==='copy')f.shapes=f.shapes.map(row=>row===part?structuredClone(row):row);
  if(mode==='missing')f.shapes=f.shapes.filter(row=>row!==part);
  if(mode==='duplicate')f.shapes.push(part);
  if(mode==='paint')part.style.stroke='#ABCDEF';if(mode==='metadata')part.source.detector='forged';
  if(mode==='endpoint')f.bodies[0].box.x++;if(mode==='endpoint-id')f.shapes.push(structuredClone(f.bodies[0]));
  assert.deepEqual(read(image,f.shapes,{checks:0}),[],mode);
 }
});

test('proxies, getters, sparse arrays and exhausted work do not execute input code or return a proof prefix',()=>{
 const f=sourceSharedOutputFixture(),image=reload(f);let calls=0;const bad=()=>{calls++;throw Error('private-content');};
 const proxy=new Proxy([],{get:bad,ownKeys:bad,getPrototypeOf:bad}),sparse=Array(1);
 sparse.every=()=>{calls++;return true;};
 for(const shapes of [proxy,sparse])assert.throws(()=>read(image,shapes,{checks:0}),/shared paint/);
 for(const work of [{checks:4000000},{checks:3999999}])assert.deepEqual(read(image,f.shapes,work),[]);
 Object.defineProperty(f.built.parts[0].style,'stroke',{get:bad});assert.deepEqual(read(image,f.shapes,{checks:0}),[]);
 const raster={width:300,height:230};Object.defineProperty(raster,'rgba',{get:bad});
 assert.throws(()=>read(raster,f.shapes,{checks:0}),/raster|shared paint/);assert.equal(calls,0);
});

test('residual-only roster supports legacy 30000 objects while ordinary reader keeps its original limit',()=>{
 const image={width:1,height:1,rgba:Buffer.from([255,255,255,255])},row={id:'ordinary',type:'rect',box:{x:0,y:0,w:1,h:1}};
 for(const count of [10001,30000])assert.deepEqual(read(image,Array(count).fill(row),{checks:0}),[]);
 assert.throws(()=>ordinary(image,Array(10001).fill(row),{checks:0}),/shared paint/);
 assert.throws(()=>read(image,Array(30001).fill(row),{checks:0}),/shared paint/);
});

test('union runs equal the complete private component and require its full actual erasure roster',()=>{
 const f=sourceSharedOutputFixture(),image=reload(f),expected=sharedSourcePaintCells(f.fit,f.image,{checks:0}),actual=new Set();
 const measured=masks(image,f.shapes,f.built.parts,size);
 for(const mask of measured){
  if(mask.sourceRouteInk){assert.ok(sharedResidualBackdropPlans(image,[mask]).length>0);continue;}
  assert.equal(mask.h,1);for(let x=mask.x;x<mask.x+mask.w;x++){const n=mask.y*image.width+x;assert.ok(!actual.has(n));actual.add(n);}
 }
 assert.deepEqual(actual,expected);
 for(const objects of [[],f.built.parts.slice(1),structuredClone(f.built.parts)])assert.deepEqual(masks(image,f.shapes,objects,size),[]);
 assert.deepEqual(masks(image,undefined,undefined,undefined),[]);assert.deepEqual(masks(image,[],[],size),[]);
 for(const invalid of [null,{...size,w:Infinity},{...size,w:299}])assert.throws(()=>masks(image,f.shapes,f.built.parts,invalid),/union/);
 const many=Array(30000).fill(Object.fromEntries(Array.from({length:64},(_,i)=>['field'+i,0])));
 assert.throws(()=>masks(image,f.shapes,many,size),/union/);
});

test('different measured outputs with identical geometry cannot substitute for a missing real member',()=>{
 const a=sourceSharedOutputFixture(),b=sourceSharedOutputFixture();
 // Each fixture compiler captures real objects separately; avoid duplicate public IDs.
 // A second copy is deliberately not a private replacement for a missing first member.
 const objects=[...a.built.parts.slice(1),...b.built.parts];
 assert.deepEqual(masks(reload(a),a.shapes,objects,size),[]);
 assert.ok(masks(reload(a),a.shapes,[...a.built.parts,...b.built.parts],size).length>0);
});

test('near-limit real output rosters charge actual sorting work and preserve the complete private union',()=>{
 const f=sourceSharedOutputFixture(),image=reload(f),before=Buffer.from(image.rgba);
 const expected=masks(image,f.shapes,f.built.parts,size);
 // A dense admitted roster leaves room for the actual sort, but not the old
 // blanket 32-per-cell reservation. Extra objects grant no source pixels.
 const filler=Object.fromEntries(Array.from({length:51},(_,i)=>['field'+i,0]));
 const objects=[...f.built.parts,...Array(20000).fill(filler)];
 withApprovedBackdropBudget(()=>{
  assert.deepEqual(masks(image,f.shapes,objects,size),expected);
  const budget=approvedBackdropBudget();assert.equal(budget.maximum,4000000);
  assert.ok(budget.sourceChecks>3900000&&budget.sourceChecks<=budget.maximum);
 });
 // Genuine exhaustion still throws without publishing a partial mask set.
 withApprovedBackdropBudget(()=>{
  assert.throws(()=>masks(image,f.shapes,[...f.built.parts,...Array(20500).fill(filler)],size),/proof budget/);
  assert.ok(approvedBackdropBudget().sourceChecks>4000000);
 });
 assert.deepEqual(image.rgba,before);
});

test('full builder output is exact private ink plus independent overlapping fill and text masks',async t=>{
 const f=setup(t),source=Buffer.from(f.image.rgba),cells=read(f.image,f.shapes,{checks:0})[0].cells;
 const objects=[...f.built.parts,
  {id:'background',type:'rect',box:{x:45,y:105,w:210,h:20},style:{fill:'#1E3C5A'},source:{residualBackgroundFill:true}},
  {id:'text',type:'text',text:'x',box:{x:45,y:45,w:210,h:125},font:{color:'#1E3C5A'},source:{}}];
 const plans=residualTextPlans(f.image,objects.flatMap(item=>eraseObjectMask(item,f.image,size)));
 let ownedInsideS=0;
 for(const plan of plans)for(let i=0;i<plan.owned.length;i++)if(plan.owned[i]){
  const x=plan.bounds.x+i%plan.bounds.w,y=plan.bounds.y+Math.floor(i/plan.bounds.w);
  if(cells.has(y*f.image.width+x))ownedInsideS++;
 }
 assert.ok(ownedInsideS>0,'The test must actually execute text restoration on privately measured shared cells');
 const outputs=[],backgrounds=new Map(),textOwned=new Set();let actualMasks;
 for(const [i,sourceShapes] of [undefined,f.shapes].entries()){
  const build=createFullSlideResidualBuilder({readPng:()=>f.image,writePng:(file,raster)=>{outputs[i]=raster;writePng(file,raster);},
   eraseMasks:(image,rows,options)=>{
    if(i===1){
     actualMasks=rows;
     for(const row of sharedResidualBackdropPlans(image,rows))backgrounds.set(row.cell,row.color);
     for(const plan of residualTextPlans(image,rows))for(let j=0;j<plan.owned.length;j++)if(plan.owned[j])
      textOwned.add((plan.bounds.y+Math.floor(j/plan.bounds.w))*image.width+plan.bounds.x+j%plan.bounds.w);
    }
    return eraseMasks(image,rows,options);
   }});
  await build({...f,objects:i===0?objects.filter(item=>!f.built.parts.includes(item)):objects,sourceShapes,slideSize:size,outputFile:path.join(f.root,`out-${i}.png`)});
 }
 let added=0;
 for(let n=0;n<f.image.width*f.image.height;n++){
  const offset=n*4,a=outputs[0].rgba,b=outputs[1].rgba;
  const background=backgrounds.get(n);
  const expected=background&&!textOwned.has(n)?Buffer.from([...background,source[offset+3]])
   :cells.has(n)?Buffer.from([255,255,255,0]):a.subarray(offset,offset+4);
  assert.deepEqual(b.subarray(offset,offset+4),expected);
  if(a[offset+3]!==0&&b[offset+3]===0)added++;
 }
 assert.ok(added>0);assert.deepEqual(f.image.rgba,source);
 const overlap=[...backgrounds.keys()].find(n=>textOwned.has(n));assert.notEqual(overlap,undefined,'route background and text evidence must really overlap');
 const bad={...outputs[1],rgba:Buffer.from(outputs[1].rgba)};
 bad.rgba.set([...backgrounds.get(overlap),source[overlap*4+3]],overlap*4);
 const {auditResidualPixelOwnership}=require('../packages/slideclone-core/scene-plan/residual-pixel-ownership');
 assert.equal(auditResidualPixelOwnership({source:f.image,residual:bad,masks:actualMasks}).passed,false,'route paint must not hide invalid text restoration');
});

test('absent source roster and absent private groups preserve existing full residual behavior',async t=>{
 const f=setup(t),outputs=[];
 for(const [i,sourceShapes] of [undefined,[]].entries()){
  const build=createFullSlideResidualBuilder({readPng:()=>f.image,writePng:(file,raster)=>{outputs[i]=raster;writePng(file,raster);},eraseMasks});
  await build({...f,sourceShapes,objects:[],slideSize:size,outputFile:path.join(f.root,`empty-${i}.png`)});
 }
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[0].rgba,f.image.rgba);
});

test('combined mask cap rejects before erasure or publication without changing source or existing destination',async t=>{
 const f=setup(t),original=Buffer.from(f.image.rgba),old=Buffer.from('existing-output');fs.writeFileSync(f.outputFile,old);
 let calls=0;const objects=[...f.built.parts];
 while(objects.length<30000)objects.push({type:'rect',box:{x:0,y:0,w:1,h:1}});
 const build=createFullSlideResidualBuilder({readPng:()=>f.image,writePng:()=>{calls++;},eraseMasks:()=>{calls++;}});
 await assert.rejects(build({...f,sourceShapes:f.shapes,objects,slideSize:size}),/mask count/);
 assert.equal(calls,0);assert.deepEqual(fs.readFileSync(f.outputFile),old);assert.deepEqual(f.image.rgba,original);
});

test('read, write and cancellation failures propagate with source and existing destination intact',async t=>{
 for(const mode of ['read','write','cancel']){
  const f=setup(t),source=fs.readFileSync(f.sourceFile),old=Buffer.from('existing-output');fs.writeFileSync(f.outputFile,old);
  const build=createFullSlideResidualBuilder({readPng:()=>{if(mode==='read')throw Error('read failed');return f.image;},
   writePng:()=>{throw Error('write failed');},eraseMasks});
  await assert.rejects(build({...f,sourceShapes:f.shapes,objects:f.built.parts,slideSize:size,isCancellationRequested:()=>mode==='cancel'}),/read failed|write failed|cancelled/);
  assert.deepEqual(fs.readFileSync(f.sourceFile),source);assert.deepEqual(fs.readFileSync(f.outputFile),old);
  assert.deepEqual(fs.readdirSync(f.root).sort(),['output.png','source.png']);
 }
});

test('shared residual regression is discovered by the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),repo=path.resolve(__dirname,'..');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(repo,suite).some(row=>row.file.replaceAll('\\','/')==='test/source-shared-residual-union.test.js'));
});
