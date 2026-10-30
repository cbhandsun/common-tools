"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence,sceneIconTextFootprint}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
const {measureSceneParametricSurface,measureSceneIconBackdrop,matteSceneParametricBackdrop}=require('../packages/slideclone-core/scene-plan/source-scene-parametric-surface');
const {cropPng}=require('../packages/slideclone-core/png');
const {sceneIconBackdropHint}=require('../packages/slideclone-core/scene-plan/source-scene-icon-context');
function glyphFixture(size=80){
 const image={width:size,height:size,rgba:Buffer.alloc(size*size*4,255)},budget={used:0};
 for(let y=23;y<35;y++)for(let x=23;x<26;x++)image.rgba.set([0,0,0,255],(y*size+x)*4);
 for(let y=39;y<62;y++)for(let x=22;x<28;x++)image.rgba.set([0,0,0,255],(y*size+x)*4);
 const text={text:'I',box:{x:20,y:20,w:12,h:20},font:{color:'#000000'}};
 return {image,budget,text,token:createSceneGlyphOcclusion(image,[text],{widthPt:size,heightPt:size},budget)};
}
test('complete source glyph footprint separates a pictorial component from OCR padding',()=>{
 const f=glyphFixture(),before=Buffer.from(f.image.rgba),proof=sceneIconTextFootprint(f.token,f.image,f.budget,f.text.box);
 assert.ok(proof);assert.equal(proof(24,27),true);assert.equal(proof(24,39),false);
 const counters=sceneGlyphOcclusionEvidence(f.token),scan=f.budget.used;
 assert.ok(counters.glyphOwnedPixels>0&&counters.glyphOwnedPixels<=100000);
 assert.ok(sceneIconTextFootprint(f.token,f.image,f.budget,f.text.box));
 assert.deepEqual(sceneGlyphOcclusionEvidence(f.token),counters);assert.equal(f.budget.used,scan);assert.deepEqual(f.image.rgba,before);
 assert.equal(proof(-1,27),true);assert.equal(proof(NaN,27),true);
});
test('copied glyph tokens, changed frames and foreign sources or budgets grant no footprint',()=>{
 const f=glyphFixture();let accessed=0;const hostile=new Proxy({}, {get(){accessed++;throw Error('private');}});
 for(const token of [null,{},structuredClone(f.token),hostile])assert.equal(sceneIconTextFootprint(token,f.image,f.budget,f.text.box),null);
 assert.equal(sceneIconTextFootprint(f.token,{...f.image,rgba:Buffer.from(f.image.rgba)},f.budget,f.text.box),null);
 assert.equal(sceneIconTextFootprint(f.token,f.image,{used:0},f.text.box),null);
 assert.equal(sceneIconTextFootprint(f.token,f.image,f.budget,{...f.text.box,y:21}),null);assert.equal(accessed,0);
});
test('empty, wrong-ink and exhausted source queries remain closed',()=>{
 const f=glyphFixture();f.budget.used=4000000;assert.equal(sceneIconTextFootprint(f.token,f.image,f.budget,f.text.box),null);
 assert.equal(f.budget.used,4000000);assert.equal(sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0);
 const blank=glyphFixture();blank.image.rgba.fill(255);assert.equal(sceneIconTextFootprint(blank.token,blank.image,blank.budget,blank.text.box),null);
 const wrong=glyphFixture();wrong.text.font.color='#FFFFFF';const token=createSceneGlyphOcclusion(wrong.image,[wrong.text],{widthPt:80,heightPt:80},wrong.budget);
 assert.equal(sceneIconTextFootprint(token,wrong.image,wrong.budget,wrong.text.box),null);
});
test('glyph controls reject illegal frames without invoking getters or proxies',()=>{
 const f=glyphFixture();let accessed=0;const getter={get x(){accessed++;throw Error('private');},y:20,w:12,h:20};
 for(const box of [getter,new Proxy(f.text.box,{}),{...f.text.box,w:Infinity},{...f.text.box,w:0}])assert.throws(()=>sceneIconTextFootprint(f.token,f.image,f.budget,box),TypeError);
 assert.equal(accessed,0);
});
function backdropFixture(){
 const image={width:160,height:120,rgba:Buffer.alloc(160*120*4)},budget={used:0};
 for(let y=0;y<120;y++)for(let x=0;x<160;x++)image.rgba.set([253,232,242,255],(y*160+x)*4);
 for(let x=20;x<120;x++)for(let y=20+Math.floor(x/7)%2;y<90+Math.floor(x/7)%2;y++)image.rgba.set([246-Math.round((y-20)/10),246,252,255],(y*160+x)*4);
 // Black pictorial ink crossing the measured body edge must stay byte-exact.
 for(let y=17;y<50;y++)for(let x=47;x<50;x++)image.rgba.set([10,20,30,255],(y*160+x)*4);
 const masks=[];for(const y of [27,81]){
  for(let cy=y;cy<y+7;cy++)for(let x=30;x<110;x++)if((x-30)%10<5&&!(x>=47&&x<50))image.rgba.set([30,40,60,255],(cy*160+x)*4);
  masks.push({x:30,y,w:80,h:7});
 }
 const hint={x:20,y:20,w:100,h:70},fit=measureSceneParametricSurface(image,hint,masks,budget),window={x:35,y:10,w:35,h:55};
 assert.ok(fit);return {image,budget,fit,window,crop:cropPng(image,window)};
}
test('only a private complete body separates source paint while retaining black pictorial strokes',()=>{
 const f=backdropFixture(),before=Buffer.from(f.crop.rgba),scan=f.budget.used;
 const result=matteSceneParametricBackdrop(f.fit,f.image,f.budget,f.window,f.crop);
 assert.ok(result.rgba.some((v,i)=>i%4===3&&v<before[i]));
 for(let y=17;y<50;y++)for(let x=47;x<50;x++){
  const at=((y-f.window.y)*f.window.w+x-f.window.x)*4;
  assert.deepEqual(result.rgba.subarray(at,at+4),before.subarray(at,at+4));
 }
 assert.deepEqual(f.crop.rgba,before);assert.equal(f.budget.used,scan);
});
test('serialized bodies and cross-source or cross-budget copies do not remove paint',()=>{
 const f=backdropFixture();let accessed=0;const hostile=new Proxy({}, {get(){accessed++;throw Error('private');}});
 for(const fit of [null,{},structuredClone(f.fit),hostile])assert.equal(matteSceneParametricBackdrop(fit,f.image,f.budget,f.window,f.crop),f.crop);
 assert.equal(matteSceneParametricBackdrop(f.fit,{...f.image,rgba:Buffer.from(f.image.rgba)},f.budget,f.window,f.crop),f.crop);
 assert.equal(matteSceneParametricBackdrop(f.fit,f.image,{used:0},f.window,f.crop),f.crop);assert.equal(accessed,0);
});
test('backdrop crop mappings reject unsafe, excessive and displaced windows',()=>{
 const f=backdropFixture();let accessed=0;const getter={get x(){accessed++;throw Error('private');},y:10,w:35,h:55};
 for(const window of [getter,new Proxy(f.window,{}),{...f.window,w:Infinity},{...f.window,w:0},{...f.window,x:140}])assert.throws(()=>matteSceneParametricBackdrop(f.fit,f.image,f.budget,window,f.crop),TypeError);
 assert.throws(()=>matteSceneParametricBackdrop(f.fit,f.image,f.budget,f.window,{...f.crop,rgba:Buffer.alloc(1)}),TypeError);assert.equal(accessed,0);
});
test('oversized cards defer to bounded spatial caption context without granting source authority',()=>{
 const seed={x:30,y:400,w:30,h:40},scope={x:10,y:10,w:590,h:590},text={x:70,y:405,w:450,h:25};
 assert.deepEqual(sceneIconBackdropHint(seed,scope,[text],[scope]),{x:30,y:400,w:490,h:40});
 assert.equal(sceneIconBackdropHint(seed,scope,[],[scope]),null);
 const parent={x:20,y:390,w:520,h:65};assert.deepEqual(sceneIconBackdropHint(seed,scope,[text],[scope,parent]),parent);
 let accessed=0;const hostile=new Proxy([], {get(){accessed++;throw Error('private');}});
 for(const texts of [new Array(1),hostile,[{...text,w:Infinity}]])assert.throws(()=>sceneIconBackdropHint(seed,scope,texts,[]),TypeError);
 assert.throws(()=>sceneIconBackdropHint({...seed,x:0},scope,[],[]),TypeError);assert.equal(accessed,0);
});
test('real glyph evidence survives both component isolation and final crop admission and emits native paths',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {measureSceneIconDetailed}=require('../packages/slideclone-core/scene-plan/source-scene-icon');
 const {compileSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
 const f=glyphFixture(160),root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-icon-controls-'));
 for(let y=39;y<62;y++)for(let x=22;x<40;x++)f.image.rgba.set([0,0,0,255],(y*160+x)*4);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const request={image:f.image,box:{x:21,y:38,w:20,h:24},id:'pictorial',regionId:'root',root,
  slideSize:{widthPt:160,heightPt:160},textBoxes:[f.text],budget:f.budget};
 assert.equal(measureSceneIconDetailed(request).reason,'icon-source-text');
 const recovered=compileSceneIcon(request,{preflight:false,nativePictorial:false,parentObjectId:'',recoverSource:()=>({glyphOcclusion:f.token})});
 assert.ok(recovered.icon,JSON.stringify(recovered));assert.ok(recovered.shapes.length);assert.ok(recovered.shapes.every(s=>s.source.editable===true));
 assert.ok(recovered.shapes.every(s=>s.type!=='image'));assert.equal(recovered.failure,null);
 assert.ok(recovered.shapes.every(s=>s.source.nativeComponentGroupId==='scene-icon-pictorial'));
 const realText=measureSceneIconDetailed({...request,box:{x:21,y:22,w:8,h:14},glyphOcclusion:f.token});
 assert.equal(realText.measurement,null);assert.equal(realText.reason,'icon-source-text');
 assert.ok(f.budget.used<=4000000);assert.ok(sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels<=100000);
});
test('established four-edge bodies remain available for icon separation without changing container recovery',()=>{
 const image={width:160,height:120,rgba:Buffer.alloc(160*120*4,255)},budget={used:0},hint={x:20,y:20,w:100,h:70};
 for(let y=20;y<90;y++)for(let x=20;x<120;x++)image.rgba.set([251,247,200,255],(y*160+x)*4);
 for(let y=45;y<65;y++)for(let x=48;x<53;x++)image.rgba.set([0,0,0,255],(y*160+x)*4);
 assert.ok(require('../packages/slideclone-core/typography/source-text-band-evidence').fitSourceTextBand({image,box:hint,slideSize:{widthPt:160,heightPt:120}}));
 assert.equal(measureSceneParametricSurface(image,hint,[],budget),null);
 const proof=measureSceneIconBackdrop(image,hint,[],budget);assert.ok(proof);
 const window={x:40,y:35,w:25,h:40},crop=cropPng(image,window),matte=matteSceneParametricBackdrop(proof,image,budget,window,crop);
 assert.equal(matte.rgba[3],0);
 const at=((50-window.y)*window.w+50-window.x)*4;assert.deepEqual(matte.rgba.subarray(at,at+4),crop.rgba.subarray(at,at+4));
 assert.equal(matteSceneParametricBackdrop(structuredClone(proof),image,budget,window,crop),crop);
 assert.equal(measureSceneIconBackdrop(image,hint,[hint],{used:0}),null);
 assert.equal(measureSceneIconBackdrop(image,hint,[],{used:4000000}),null);
 assert.equal(measureSceneIconBackdrop({...image,rgba:Buffer.alloc(image.rgba.length,255)},hint,[],{used:0}),null);
 assert.ok(budget.used<=4000000);
});
