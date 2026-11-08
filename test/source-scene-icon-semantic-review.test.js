"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createTemporaryTestDirectory:createTemp,removeTemporaryTestDirectory:removeTemp}=require('./helpers/temporary-directory.cjs');
const {writePng,readPng}=require('../packages/slideclone-core/png');
const {captureSceneIconSemanticReview:capture,confirmSceneIconSemanticReview:confirm,bindSceneIconSemanticReview:bind,sceneIconSemanticPointsSeparate:separate,sceneIconSemanticObjectMatches:matches}=require('../packages/slideclone-core/scene-plan/source-scene-icon-semantic-review');
const {measureSceneNativeIconDetailed:measure}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
const {compileSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
const selected={choice:'independent-leading-icon',textStartsWith:'5',expectedComponents:3};
function fixture(t,edit){
 const root=createTemp('icon-human-review-');
 t.after(()=>removeTemp(root));
 const image={width:180,height:100,rgba:Buffer.alloc(180*100*4,255)};
 const put=(x,y,value=0)=>image.rgba.set([value,value,value,255],(y*180+x)*4);
 for(const [x,top]of [[22,44],[30,37],[38,30]])for(let y=top;y<55;y++)for(let dx=0;dx<4;dx++)put(x+dx,y);
 for(const x of [63,79,95])for(let y=31;y<55;y++)for(let dx=0;dx<4;dx++)put(x+dx,y);
 // An alpha32 fringe is part of the complete source unit, not disposable noise.
 for(let y=44;y<55;y++)put(21,y,241);
 const sourceFile=path.join(root,'source.png'),slideSize={widthPt:180,heightPt:100};
 const text={id:'footer',text:'5 III',box:{x:18,y:27,w:86,h:32},source:{editable:true,ocrLabelRef:'label-footer',ocrProvider:'frozen',confidence:.99,
  evidenceBox:{x:18,y:27,w:86,h:32},ocrPolygonPt:[[18,27],[104,27],[104,59],[18,59]]},font:{color:'#000000'}};
 const plan={version:1,widthPx:180,heightPx:100,sourceHash:'',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:180,h:100}}],
  objects:[{id:'bars',regionId:'root',kind:'icon',box:{x:20,y:28,w:24,h:29}}],relations:[]};
 const f={root,image,sourceFile,slideSize,textBoxes:[text],plan,budget:{used:0},objectId:'bars',textId:'footer',
  observationWindow:{x:8,y:16,w:116,h:54},textStartBox:{x:62,y:30,w:6,h:26}};
 if(edit)edit(f,put);
 writePng(sourceFile,image);plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 f.sourceHash=plan.sourceHash;
 return f;
}
const authorize=f=>confirm(capture(f),selected);
const request=(f,semanticReview)=>({image:f.image,budget:f.budget,textBoxes:f.textBoxes,root:f.root,slideSize:f.slideSize,
 box:f.plan.objects[0].box,id:'bars',regionId:'root',...(semanticReview?{semanticReview}:{})});
const query=(f,receipt,points=[{x:22,y:45}])=>separate(receipt,f.image,f.budget,f.textBoxes[0].box,points,'bars','root',f.plan.objects[0].box);

test('semantic icon fixture cleanup retries transient directory removal and verifies absence',t=>{
 let cleanup;const f=fixture({after:fn=>{cleanup=fn;}}),rmdir=fs.rmdirSync;let attempts=0;
 try{
  t.mock.method(fs,'rmdirSync',(target,...args)=>{
   if(target===f.root&&++attempts<=2)throw Object.assign(new Error('transient directory scan'),{code:'ENOTEMPTY'});
   return rmdir(target,...args);
  });
  assert.equal(typeof cleanup,'function');assert.doesNotThrow(()=>cleanup());
  assert.ok(attempts>=3);assert.equal(fs.existsSync(f.root),false);
 }finally{t.mock.restoreAll();cleanup();}
});
test('human identity is source-bound and preserves the complete icon, alpha fringe, original OCR and native gates',t=>{
 const f=fixture(t),before=structuredClone(f.textBoxes),pixels=Buffer.from(f.image.rgba),plain=measure(request(f));
 assert.equal(plain.reason,'icon-source-text');
 const review=authorize(f),receipt=bind(review,f);assert.ok(receipt);assert.equal(JSON.stringify(review),'{}');
 assert.equal(query(f,receipt),true);assert.equal(query(f,receipt,[{x:21,y:45}]),true);
 assert.equal(query(f,receipt,[{x:63,y:40}]),false);assert.equal(query(f,receipt,[{x:79,y:40}]),false);
 const measured=measure(request(f,receipt));assert.equal(measured.reason,'icon-source-isolated');
 const compiled=compileSceneIcon(request(f,receipt),{preflight:false,nativePictorial:true,parentObjectId:''});
 assert.equal(compiled.failure,null);assert.ok(compiled.shapes.length>0&&compiled.shapes.length<=32);
 const paint=require('../packages/slideclone-core/scene-plan/source-icon-paint-error').sourceIconPaintError(measured.measurement.image,measured.measurement.icon.box,compiled.shapes);
 assert.ok(paint);assert.equal(paint.missing,0);
 assert.ok(compiled.shapes.every(s=>s.source.editable===true&&s.type!=='image'));
 assert.ok(f.budget.used<=4000000);assert.deepEqual(f.textBoxes,before);assert.deepEqual(f.image.rgba,pixels);
});
test('plain flags, reconstructed controls, copied confirmations and cloned receipts have no authority',t=>{
 const f=fixture(t),control=capture(f);let touched=0;const hostile=new Proxy({}, {get(){touched++;throw Error('private');}});
 for(const value of [null,{},structuredClone(control),{accepted:true,provenance:'direct-user-reply'},hostile])assert.throws(()=>confirm(value,selected),TypeError);
 const review=confirm(control,selected);assert.throws(()=>confirm(control,selected),TypeError);
 for(const value of [null,{},structuredClone(review),{accepted:true},hostile])assert.throws(()=>bind(value,f),TypeError);
 const receipt=bind(review,f);for(const value of [null,{},structuredClone(receipt),hostile])assert.equal(query(f,value),false);
 assert.equal(touched,0);assert.equal(bind(undefined,f),null);
});
test('empty, illegal, excessive and hostile controls are rejected without executing accessors',t=>{
 const f=fixture(t);let touched=0;const getter={get x(){touched++;throw Error('private');},y:20,w:108,h:46};
 for(const change of [{textBoxes:[]},{textBoxes:new Array(1)},{plan:null},{slideSize:{widthPt:0,heightPt:100}},
  {observationWindow:getter},{observationWindow:new Proxy(f.observationWindow,{})},{observationWindow:{x:0,y:0,w:10000,h:10000}},
  {observationWindow:{x:20,y:28,w:24,h:29}},{textStartBox:{x:63,y:31,w:0,h:1}},{textId:'missing'},{objectId:'other'}])assert.throws(()=>capture({...f,...change}),TypeError);
 const hostile={...f};Object.defineProperty(hostile,'plan',{get(){touched++;throw Error('private');}});assert.throws(()=>capture(hostile),TypeError);
 const nested=structuredClone(f.plan);Object.defineProperty(nested.objects[0],'box',{enumerable:true,get(){touched++;throw Error('private');}});
 assert.throws(()=>capture({...f,plan:nested}),TypeError);
 const hidden=structuredClone(f.plan),hiddenObject={toJSON(){touched++;throw Error('private');}};
 Object.defineProperty(hidden.objects,'0',{value:hiddenObject,enumerable:false});assert.throws(()=>capture({...f,plan:hidden}),TypeError);
 for(const selection of [null,{},[],{...selected,accepted:true},{...selected,textStartsWith:''},{...selected,textStartsWith:'III'},
  {...selected,expectedComponents:0},{...selected,expectedComponents:33},{...selected,expectedComponents:NaN}])assert.throws(()=>confirm(capture(f),selection),TypeError);
 const receipt=bind(authorize(f),f),hostileSeed=new Proxy(f.plan.objects[0].box,{get(){touched++;throw Error('private');}});
 for(const seed of [null,[],getter,hostileSeed,{...f.plan.objects[0].box,w:NaN}])assert.equal(matches(receipt,'bars','root',seed),false);
 assert.equal(matches(receipt,'bars','root',f.plan.objects[0].box),true);
 assert.equal(touched,0);
});
test('source, plan, object owner, transcript, polygon, evidence frame and label revision changes invalidate confirmation',t=>{
 for(const mutate of [f=>f.image.rgba[0]^=1,f=>f.plan.objects[0].regionId='other',f=>f.plan.objects[0].box.w++,f=>f.plan.regions[0].box.w--,
  f=>f.textBoxes[0].text='III 5',f=>f.textBoxes[0].source.ocrPolygonPt[0][0]++,f=>f.textBoxes[0].source.evidenceBox.x++,
  f=>f.textBoxes[0].source.ocrLabelRef='other',f=>f.textBoxes[0].source.confidence=.5,f=>f.sourceHash='f'.repeat(64)]){
  const f=fixture(t),review=authorize(f);mutate(f);assert.throws(()=>bind(review,f),TypeError);
 }
 const f=fixture(t),review=authorize(f);fs.appendFileSync(f.sourceFile,Buffer.from('changed'));assert.throws(()=>bind(review,f),TypeError);
});
test('bound proofs refuse in-place source or OCR mutations, alias replacements, changed ids and budget rollback',t=>{
 for(const mutate of [f=>f.image.rgba[0]^=1,f=>f.image.rgba=Buffer.from(f.image.rgba),f=>f.textBoxes[0].text='III',
  f=>f.plan.objects[0].box.x++,f=>f.budget.used=0,f=>fs.appendFileSync(f.sourceFile,Buffer.from('changed'))]){
  const f=fixture(t),receipt=bind(authorize(f),f);mutate(f);assert.equal(query(f,receipt),false);
 }
 const f=fixture(t),review=authorize(f),receipt=bind(review,f);
 assert.equal(separate(receipt,f.image,{used:f.budget.used},f.textBoxes[0].box,[{x:22,y:45}],'bars','root',f.plan.objects[0].box),false);
 assert.throws(()=>bind(review,{...f,budget:{used:0}}),TypeError);
 assert.equal(separate(receipt,{...f.image,rgba:Buffer.from(f.image.rgba)},f.budget,f.textBoxes[0].box,[{x:22,y:45}],'bars','root',f.plan.objects[0].box),false);
 assert.equal(separate(receipt,f.image,f.budget,f.textBoxes[0].box,[{x:22,y:45}],'different','root',f.plan.objects[0].box),false);
 assert.equal(separate(receipt,f.image,f.budget,f.textBoxes[0].box,[{x:22,y:45}],'bars','root',{...f.plan.objects[0].box,w:10}),false);
 for(const p of [[],[{x:-1,y:45}],[{x:NaN,y:45}],new Array(1),new Proxy([],{}),Array(262145).fill({x:22,y:45})])assert.equal(query(f,receipt,p),false);
 f.budget.used+=10;assert.equal(query(f,receipt),true);f.budget.used--;assert.equal(query(f,receipt),false);
});
test('expiration rejects both unanswered controls and confirmed or bound reviews',t=>{
 const f=fixture(t),control=capture(f),review=authorize(f),receipt=bind(review,f),now=Date.now();
 t.mock.method(Date,'now',()=>now+31*60*1000);
 assert.throws(()=>confirm(control,selected),TypeError);assert.throws(()=>bind(review,f),TypeError);assert.equal(query(f,receipt),false);
});
test('caption III remains text; a leading component cannot absorb, replace or truncate the confirmed first body glyph',t=>{
 const f=fixture(t),receipt=bind(authorize(f),f);
 for(const x of [63,79,95])assert.equal(query(f,receipt,[{x,y:40}]),false);
 for(const edit of [f=>f.plan.objects[0].box.w=48,f=>f.textStartBox.w=2,
  (f,put)=>{for(let x=42;x<63;x++)put(x,44);},
  (f,put)=>{for(let y=16;y<55;y++)put(22,y);},
  (f,put)=>{for(let x=42;x<63;x++)for(let y=20;y<66;y++)if(x%2===0)put(x,y,225);},
  f=>{f.image.rgba.fill(255);}]){
  const g=fixture(t,edit);assert.equal(bind(authorize(g),g),null);
 }
 const g=fixture(t);g.textBoxes[0].text='III';assert.throws(()=>confirm(capture(g),selected),TypeError);
});
test('scan exhaustion and invalid raster metadata keep the original shared budget and source gates',t=>{
 const f=fixture(t),review=authorize(f);f.budget.used=4000000;
 assert.throws(()=>bind(review,f),RangeError);assert.equal(f.budget.used,4000000);
 const g=fixture(t),other=authorize(g);g.image.rgba=new Proxy(g.image.rgba,{});assert.throws(()=>bind(other,g),TypeError);
 let touched=0;const h=fixture(t),accepted=authorize(h);
 Object.defineProperty(h.image.rgba,'buffer',{get(){touched++;throw Error('private');}});
 const receipt=bind(accepted,h);assert.equal(query(h,receipt),true);assert.equal(touched,0);
 for(const sourceFile of [path.join(f.root,'missing-private-source.png'),f.root])assert.throws(()=>capture({...f,sourceFile}),e=>e instanceof TypeError&&!e.message.includes(f.root)&&!e.message.includes('missing-private'));
 const huge=path.join(f.root,'large.png');const fd=fs.openSync(huge,'w');fs.ftruncateSync(fd,12*1024*1024+1);fs.closeSync(fd);
 assert.throws(()=>capture({...f,sourceFile:huge}),TypeError);
});
test('the normal compiler input consumes the opaque review and emits native bars without changing OCR or unrelated icons',t=>{
 const f=fixture(t),before=structuredClone(f.textBoxes),review=authorize(f);
 const result=compileSourceScene({...f,page:{shapes:[],images:[],textBoxes:f.textBoxes},sourceIconReview:review,pictorialMode:'source-crop'});
 assert.equal(result.evidence.icons,1);assert.equal(result.page.images.length,0);assert.ok(result.page.shapes.length>0&&result.page.shapes.length<=32);
 assert.ok(result.page.shapes.every(s=>s.source.editable===true));assert.equal(result.page.textBoxes[0].text,before[0].text);
 assert.deepEqual(result.page.textBoxes[0].source.evidenceBox,before[0].source.evidenceBox);
 assert.equal(f.textBoxes[0].source.ocrLabelRef,before[0].source.ocrLabelRef);
});
test('identity receipts cannot authorize legacy or pictorial raster crops through any lower-level public API',t=>{
 const f=fixture(t),receipt=bind(authorize(f),f),input=request(f,receipt);
 // The actual admitted crop policy on a larger slide could pass its size
 // bounds. Text protection must reject before that representation choice.
 const {measureSceneIconDetailed,measureScenePictorialCropDetailed,materializeSceneIconDetailed,materializeScenePictorialCropDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
 for(const api of [measureSceneIconDetailed,measureScenePictorialCropDetailed,materializeSceneIconDetailed,materializeScenePictorialCropDetailed]){
  const result=api(input);assert.equal(result.measurement,null);assert.equal(result.reason,'icon-source-text');
 }
 const compiled=compileSceneIcon(input,{preflight:false,nativePictorial:true,preferSourceCrop:true,parentObjectId:''});
 assert.equal(compiled.failure,null);assert.ok(compiled.shapes.length>0);assert.equal(fs.existsSync(path.join(f.root,'assets')),false);
});
test('the real frozen footer retains all four original alpha32 fringe cells and emits three native paths',t=>{
 const f=fixture(t);f.image=readPng(path.join(__dirname,'fixtures/source-scene-icon-footer/source.png'));
 f.slideSize={widthPt:370,heightPt:58};f.plan.widthPx=370;f.plan.heightPx=58;f.plan.regions[0].box={x:0,y:0,w:370,h:58};
 f.plan.objects[0].box={x:14.24,y:13.632,w:27.15,h:27.512};
 const text=f.textBoxes[0];text.text='5个Release|393条顶层变更';text.box={x:12,y:13,w:343,h:30};
 text.source.evidenceBox={...text.box};text.source.ocrPolygonPt=[[12,13],[355,15],[355,43],[12,41]];
 f.observationWindow={x:0,y:0,w:370,h:58};f.textStartBox={x:58,y:21,w:12,h:19};
 writePng(f.sourceFile,f.image);f.sourceHash=f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(f.sourceFile)).digest('hex');
 const before=structuredClone(text.source),receipt=bind(authorize(f),f);assert.ok(receipt);
 for(const [x,y]of [[40,17],[40,20],[24,21],[30,38]])assert.equal(query(f,receipt,[{x,y}]),true);
 assert.equal(query(f,receipt,[{x:59,y:22}]),false);
 const result=compileSceneIcon(request(f,receipt),{preflight:false,nativePictorial:true,parentObjectId:''});
 assert.equal(result.failure,null);assert.equal(result.shapes.length,3);assert.ok(result.shapes.every(s=>s.source.editable===true));
 assert.deepEqual(text.source,before);assert.ok(f.budget.used<=4000000);
});
