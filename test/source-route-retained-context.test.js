'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sourceFilledFringeFixture}=require('./helpers/source-filled-fringe.cjs');
const {measureSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {captureSourceCropRegistrations:capture,registerSourceCrop:register,readRegisteredSourceCropSnapshot:snapshot}=require('../packages/slideclone-core/scene-plan/source-crop-registration');
const {observeRegisteredRouteContext:observe}=require('../packages/slideclone-core/scene-plan/source-route-retained-context');
const {cropPng,writePng,readPng,withPngReadCache}=require('../packages/slideclone-core/png');
const {pxToPtBox}=require('../packages/slideclone-core/scene-plan/raster-native-detection');
function fixture(t,{cropBox,changeCrop}={}){
 const f=sourceFilledFringeFixture(),m=measureSourceSceneRoute(f);assert.ok(m.fit,m.reason);assert.ok(m.fit.filledBody);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'retained-route-context-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'assets'));
 const px=cropBox??{x:0,y:0,w:f.image.width,h:f.image.height},slide={widthPt:f.image.width,heightPt:f.image.height};
 const box=pxToPtBox(px,f.image,slide,0),raster=cropPng(f.image,px),file=path.join(root,'assets/context.png');
 if(changeCrop)changeCrop(raster);writePng(file,raster);
 const registration=capture(f.image,root,slide,()=>register(f.image,px,file,raster,box));assert.equal(registration.result,true);
 const item={id:'retained-context',type:'fidelity-crop',assetPath:'assets/context.png',box,source:{nativeRebuild:true}};
 return {...f,fit:m.fit,root,px,file,raster,item,request:{fit:m.fit,image:f.image,registration:registration.token,root,item,work:{checks:0},points:[{x:5,y:5}]}};
}

test('actual retained source context excludes complete shaft, head, fringe and attachment paint before any opacity rule',t=>{
 const f=fixture(t),pixels=Buffer.from(f.image.rgba),points=[{x:5,y:5},{x:50,y:49},{x:50,y:70},{x:100,y:114},{x:177,y:114},{x:47,y:50}];
 const result=observe({...f.request,points});assert.ok(result);assert.equal(result.sourceDomainOnly,true);
 assert.deepEqual(result.observations.map(p=>p.state),['retained-source-context','retained-source-context',...Array(4).fill('unknown-relationship-or-contact')]);
 assert.deepEqual(result.observations[0].rgba,[255,255,255,255]);assert.deepEqual(result.observations[1].rgba,[210,230,245,255]);
 assert.ok(result.observations.slice(2).every(p=>p.rgba===null));assert.ok(result.checks>0&&result.checks<=4000000);
 assert.deepEqual(f.image.rgba,pixels);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.observations));
 assert.throws(()=>{result.observations[0].rgba[0]=0;},TypeError);
 assert.equal(observe(f.request).observations[0].rgba[0],255);
});

test('source-domain queries preserve duplicates and empty input and do not infer a missing crop contribution',t=>{
 const f=fixture(t,{cropBox:{x:10,y:10,w:120,h:100}});
 const points=[{x:5,y:5},{x:15,y:15},{x:15,y:15},{x:177,y:114}];
 const result=observe({...f.request,points});assert.ok(result);
 assert.deepEqual(result.observations.map(p=>p.state),['unknown-outside-crop','retained-source-context','retained-source-context','unknown-relationship-or-contact']);
 assert.deepEqual(observe({...f.request,points:[]}).observations,[]);
});

test('partial alpha, transparent holes and changed non-source paint remain unknown',t=>{
 for(const [mode,state] of [['transparent','unknown-alpha'],['partial','unknown-alpha'],['foreign','unknown-source-mismatch']]){
  const f=fixture(t,{changeCrop:r=>{const at=(5*r.width+5)*4;if(mode==='foreign')r.rgba[at]=200;else r.rgba[at+3]=mode==='partial'?128:0;}});
  assert.equal(observe(f.request).observations[0].state,state);
 }
});

test('cloned or changed route evidence and source cannot create known context',t=>{
 const f=fixture(t);
 for(const controls of [{fit:structuredClone(f.fit)},{registration:structuredClone(f.request.registration)},
  {image:{...f.image,rgba:Buffer.from(f.image.rgba)}},{item:{...f.item,box:{...f.item.box,x:f.item.box.x+.001}}}])assert.equal(observe({...f.request,...controls}),null);
 const before=f.image.rgba[0];f.image.rgba[0]^=1;assert.equal(observe(f.request),null);f.image.rgba[0]=before;
 assert.ok(observe(f.request));
});

test('moved, transformed, cropped, effect-bearing or externally redirected pictures grant no context',t=>{
 const f=fixture(t);
 for(const extra of [{rotation:1},{crop:{left:.1}},{opacity:.5},{effects:[]},{style:{opacity:1}},{style:{rotation:0}},{assetPath:'../outside.png'}])
  assert.equal(observe({...f.request,item:{...f.item,...extra}}),null);
 const alias=path.join(f.root,'assets/alias');fs.symlinkSync(path.join(f.root,'assets'),alias,'junction');
 assert.equal(observe({...f.request,item:{...f.item,assetPath:'assets/alias/context.png'}}),null);
});

test('a current private crop snapshot bypasses mutable renderer caches and is detached from the receipt',t=>{
 const f=fixture(t);
 withPngReadCache(()=>{
  const cached=readPng(f.file);cached.rgba[(5*cached.width+5)*4]=0;
  assert.equal(cached.rgba[(5*cached.width+5)*4],0);
  assert.equal(readPng(f.file).rgba[(5*cached.width+5)*4],255,'renderer cache already returns detached decodes');
  assert.equal(observe(f.request).observations[0].rgba[0],255,'cached caller pixels cannot replace the actual file');
 });
 const view=snapshot(f.request.registration,f.image,f.root,f.file,f.item.box);assert.ok(view);view.pixelBox.x++;view.raster.rgba[0]=0;
 const next=snapshot(f.request.registration,f.image,f.root,f.file,f.item.box);assert.equal(next.pixelBox.x,0);assert.equal(next.raster.rgba[0],255);
 const changed={...f.raster,rgba:Buffer.from(f.raster.rgba)};changed.rgba[0]^=1;writePng(f.file,changed);assert.equal(observe(f.request),null);
 fs.writeFileSync(f.file,Buffer.alloc(0));assert.throws(()=>observe(f.request));
});

test('the original ledger is continued and exhaustion never returns a successful prefix',t=>{
 const f=fixture(t),work={checks:4000000};assert.equal(observe({...f.request,work}),null);assert.equal(work.checks,4000001);
 for(const checks of [-1,1.5,NaN,Infinity,'0',4000001])assert.throws(()=>observe({...f.request,work:{checks}}),TypeError);
 assert.throws(()=>observe({...f.request,work:Object.freeze({checks:0})}),TypeError);
});

test('invalid, extreme and hostile observation controls reject without executing getters',t=>{
 const f=fixture(t);let calls=0;
 const hostile=Object.defineProperty({},'points',{get(){calls++;throw Error('private');}});
 for(const value of [null,{},hostile,new Proxy({},{get(){calls++;throw Error('private');}})])assert.throws(()=>observe(value),TypeError);
 for(const points of [new Array(1),Array(262145).fill({x:0,y:0}),[{x:-1,y:0}],[{x:0,y:Infinity}],[{x:.5,y:0}],
  [{x:f.image.width,y:0}],new Proxy([],{get(){calls++;throw Error('private');}}),[Object.defineProperty({},'x',{get(){calls++;throw Error('private');}})]])
  assert.throws(()=>observe({...f.request,points}),TypeError);
 assert.equal(calls,0);
 const {includesSuite}=require('../scripts/test-suites');for(const suite of ['unit','all'])assert.ok(includesSuite(__filename,suite));
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../tsconfig.boundaries.json'),'utf8'));
 assert.ok(config.include.includes('packages/slideclone-core/scene-plan/source-route-retained-context.js'));
});
