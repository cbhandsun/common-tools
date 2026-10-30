'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSceneContainer}=require('../packages/slideclone-core/scene-plan/source-scene-container');
function fixture(axis='y'){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},box={x:50,y:50,w:140,h:70};
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
  const t=axis==='y'?(y-box.y)/(box.h-1):(x-box.x)/(box.w-1);
  image.rgba.set([210+Math.round(t*10),230+Math.round(t*10),245+Math.round(t*5),255],(y*image.width+x)*4);
 }
 return {image,box};
}
test('admitted connected source containers retain measured gradients without changing geometry or pixel charges',()=>{
 for(const axis of ['x','y']){
  const {image,box}=fixture(axis),before=Buffer.from(image.rgba),budget={used:0};
  const fit=measureSceneContainer(image,box,[],budget);assert.ok(fit);assert.deepEqual(fit.box,box);
  assert.ok(fit.gradient,'a successful fill component must retain its source gradient');
  assert.equal(fit.gradient.angleDeg,axis==='x'?0:90);
  for(const [index,expected]of [[0,[210,230,245]],[1,[220,240,250]]]){
   const color=fit.gradient.stops[index].color;for(let c=0;c<3;c++)assert.ok(Math.abs(parseInt(color.slice(1+c*2,3+c*2),16)-expected[c])<=1);
  }
  assert.equal(budget.used,(box.w+28)*(box.h+28));assert.deepEqual(image.rgba,before);
 }
});
test('constant fills keep their old representation and glyph holes cannot become gradient samples',()=>{
 const {image,box}=fixture();
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([210,230,245,255],(y*image.width+x)*4);
 assert.equal(measureSceneContainer(image,box,[],{used:0})?.gradient,undefined);
 const f=fixture(),mask={x:75,y:70,w:90,h:15};
 for(let y=mask.y;y<mask.y+mask.h;y++)for(let x=mask.x;x<mask.x+mask.w;x++)f.image.rgba.set([20,40,90,255],(y*f.image.width+x)*4);
 const fit=measureSceneContainer(f.image,f.box,[mask],{used:0});assert.ok(fit?.gradient);
 assert.deepEqual(fit.box,f.box);assert.equal(fit.gradient.angleDeg,90);
 assert.ok(parseInt(fit.gradient.stops[0].color.slice(1,3),16)>200);
});

test('two flat tones and spatially uniform texture cannot manufacture a continuous gradient',()=>{
 for(const axis of ['x','y'])for(const pattern of ['step','reverse-step','checker','constant']){
  const {image,box}=fixture(axis),beforeBudget={used:0};
  for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
   const t=axis==='x'?(x-box.x)/box.w:(y-box.y)/box.h;
   const delta=pattern==='step'?(t<.5?0:5):pattern==='reverse-step'?(t<.5?5:0):pattern==='checker'?((x+y)%2)*4:0;
   image.rgba.set([210+delta,230,245,255],(y*image.width+x)*4);
  }
  const before=Buffer.from(image.rgba),fit=measureSceneContainer(image,box,[],beforeBudget);
  assert.ok(fit,axis+'/'+pattern);assert.equal(fit.gradient,undefined,axis+'/'+pattern);
  assert.deepEqual(fit.box,box);assert.deepEqual(image.rgba,before);
  assert.equal(beforeBudget.used,(box.w+28)*(box.h+28));
 }
});

test('graded evidence preserves subtle single-channel gradients in both directions with masked glyphs',()=>{
 for(const axis of ['x','y'])for(const reversed of [false,true]){
  const {image,box}=fixture(axis),mask={x:90,y:75,w:32,h:15};
  for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
   const t=axis==='x'?(x-box.x)/(box.w-1):(y-box.y)/(box.h-1);
   image.rgba.set([210+Math.round((reversed?1-t:t)*6),230,245,255],(y*image.width+x)*4);
  }
  for(let y=mask.y;y<mask.y+mask.h;y++)for(let x=mask.x;x<mask.x+mask.w;x++)image.rgba.set([30,60,90,255],(y*image.width+x)*4);
  const fit=measureSceneContainer(image,box,[mask],{used:0});assert.ok(fit?.gradient);
  assert.equal(fit.gradient.angleDeg,axis==='x'?0:90);
  for(const [index,expected]of [[0,reversed?216:210],[1,reversed?210:216]]){
   const color=fit.gradient.stops[index].color;
   assert.ok(Math.abs(parseInt(color.slice(1,3),16)-expected)<=1);assert.equal(color.slice(3),'e6f5');
  }
 }
});
test('the source compiler carries measured container gradients into native shape style at slide scale',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png');
 const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-container-gradient-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const axis of ['x','y','constant']){
  const {image,box}=fixture(axis),folder=path.join(root,axis);fs.mkdirSync(folder);
  if(axis==='constant')for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([210,230,245,255],(y*image.width+x)*4);
  const sourceFile=path.join(folder,'source.png');writePng(sourceFile,image);const original=fs.readFileSync(sourceFile);
  const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[
   {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:image.width,h:image.height}},
   {id:'card',parentId:'root',kind:'card',box}
  ],objects:[],relations:[]},{sourceHash:crypto.createHash('sha256').update(original).digest('hex'),widthPx:image.width,heightPx:image.height});
  const page={shapes:[],images:[],textBoxes:[]},before=structuredClone(page);
  const compiled=compileSourceScene({page,plan,sourceFile,root:folder,slideSize:{widthPt:120,heightPt:90}});
  const card=plan.regions.find(r=>r.kind==='card');assert.ok(card);
  const shape=compiled.page.shapes.find(s=>s.id===`scene-container-${card.id}`);assert.ok(shape);
  assert.deepEqual(shape.box,{x:25,y:25,w:70,h:35});
  if(axis==='constant')assert.equal(shape.style.gradient,undefined);
  else assert.deepEqual(shape.style.gradient,measureSceneContainer(image,box,[],{used:0}).gradient);
  assert.deepEqual(page,before);assert.deepEqual(fs.readFileSync(sourceFile),original);
 }
});
function direct(){
 const {image,box}=fixture(),pixels=[];
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)pixels.push({x,y});
 return {raster:image,window:{x:0,y:0,w:image.width,h:image.height},box,pixels,masks:[],fill:[215,235,248],tolerance:16};
}
test('owned appearance samples preserve translated windows and intrinsic typed-array byte offsets',()=>{
 const {fitAdmittedFillGradient:fit}=require('../packages/slideclone-core/scene-plan/source-fill-gradient');
 const f=direct(),expected=fit(f);assert.ok(expected);
 const backing=Buffer.alloc(f.raster.rgba.length+32);f.raster.rgba.copy(backing,16);f.raster.rgba=backing.subarray(16,16+f.raster.rgba.length);
 assert.deepEqual(fit(f),expected);
 const translated={...f,window:{...f.window,x:700,y:500},box:{...f.box,x:f.box.x+700,y:f.box.y+500},pixels:f.pixels.map(p=>({x:p.x+700,y:p.y+500}))};
 assert.deepEqual(fit(translated),expected);
 assert.equal(fit({...f,pixels:[]}),null);assert.equal(fit({...f,masks:[f.box]}),null);
 const transparent={...f,raster:{...f.raster,rgba:Buffer.alloc(f.raster.rgba.length)}};assert.equal(fit(transparent),null);
 const sparse={...f,pixels:f.pixels.slice(0,3)};assert.equal(fit(sparse),null);
});
test('unsafe, malformed and extreme appearance controls fail with fixed diagnostics and no provider hooks',()=>{
 const {fitAdmittedFillGradient:fit}=require('../packages/slideclone-core/scene-plan/source-fill-gradient');
 const f=direct();let calls=0;const trap=()=>{calls++;throw Error('private-gradient-token');};
 const getter={...f};Object.defineProperty(getter,'raster',{get:trap});
 const masks=[f.box];Object.defineProperty(masks,'0',{get:trap});
 const cases=[null,[],getter,new Proxy(f,{get:trap,ownKeys:trap}),{...f,masks},{...f,masks:Array(10001).fill(f.box)},
  {...f,window:{...f.window,x:-1}},{...f,window:{...f.window,w:1}},{...f,box:{...f.box,w:Infinity}},
  {...f,pixels:[{x:NaN,y:0}]},{...f,pixels:[{x:9999,y:0}]},{...f,pixels:Array(262145).fill({x:0,y:0})},
  {...f,fill:[1,2]},{...f,fill:[1,-1,255]},{...f,tolerance:16.01},{...f,tolerance:NaN},
  {...f,raster:{...f.raster,rgba:f.raster.rgba.subarray(4)}},{...f,masks:[{...f.box,x:1e300}]},
  {...f,raster:{...f.raster,rgba:new Proxy(f.raster.rgba,{get:trap})}}];
 for(const value of cases)assert.throws(()=>fit(value),{name:'TypeError',message:'Source fill gradient input is invalid'});
 assert.equal(calls,0);
});
test('separate source fragments, unavailable paint and exhausted scans do not acquire gradient appearance',()=>{
 const {image,box}=fixture();
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x+65;x<box.x+75;x++)image.rgba.set([255,255,255,255],(y*image.width+x)*4);
 const parts=measureSceneContainer(image,box,[],{used:0});assert.ok(parts?.parts);assert.equal(parts.gradient,undefined);
 const f=fixture(),before=Buffer.from(f.image.rgba);
 assert.throws(()=>measureSceneContainer(f.image,f.box,[],{used:4000000}),/budget/u);assert.deepEqual(f.image.rgba,before);
 const blank={...f.image,rgba:Buffer.alloc(f.image.rgba.length,255)};assert.equal(measureSceneContainer(blank,f.box,[],{used:0}),null);
 const {measureSceneFillWindow}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
 let calls=0;const evil={get x(){calls++;throw Error('private');},y:0,w:5,h:5},budget={used:0};
 assert.throws(()=>measureSceneFillWindow({image:f.image,hint:f.box,fill:[215,235,248],color:'#D7EBF8',budget,marginX:14,marginY:14,textMasks:[evil]}),TypeError);
 assert.equal(calls,0);assert.equal(budget.used,0);
});
test('gradient appearance stays in private measurement snapshots and unified unit/all CI',()=>{
 const {sceneFillPaintMeasurement}=require('../packages/slideclone-core/scene-plan/source-scene-fill-window');
 const f=fixture(),fit=measureSceneContainer(f.image,f.box,[],{used:0});assert.ok(fit?.gradient);
 assert.deepEqual(sceneFillPaintMeasurement(fit,f.image),fit);assert.equal(sceneFillPaintMeasurement(structuredClone(fit),f.image),null);
 fit.gradient.angleDeg=0;assert.equal(sceneFillPaintMeasurement(fit,f.image),null);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-container-gradient.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-fill-gradient.js'));
});
