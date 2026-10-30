'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {readPng}=require('../packages/slideclone-core/png');
const {measureSourceLocalGlyph:measure,matchSourceLocalGlyph:match}=require('../packages/slideclone-core/scene-plan/source-local-glyph');
const {acceptMissingSceneText}=require('../packages/slideclone-core/scene-plan/source-scene-missing-text');
function fixture(){
 const image={width:40,height:32,rgba:Buffer.alloc(40*32*4)},bg=[215,63,14,255],ink=[244,226,192,255];
 for(let n=0;n<40*32;n++)image.rgba.set(bg,n*4);
 const paint=(x,y,c=ink)=>image.rgba.set(c,(y*40+x)*4);
 for(let y=12;y<=20;y++)for(let x=13;x<=14;x++)paint(x,y);
 for(let y=19;y<=20;y++)for(let x=13;x<=23;x++)paint(x,y);
 const seed={x:13.1,y:12.1,w:10.8,h:8.8},box={x:11,y:10,w:15,h:13},outer={x:8,y:7,w:22,h:20};
 return {image,seed,box,outer,paint};
}
test('local surface measurement recovers a complete tinted connected glyph without model ink colors',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),budget={used:0},result=measure({image:f.image,box:f.box,seed:f.seed,budget});
 assert.deepEqual(result.box,{x:13,y:12,w:11,h:9});assert.equal(result.count,36);
 assert.equal(budget.used,f.box.w*f.box.h*4);assert.deepEqual(f.image.rgba,before);
 assert.deepEqual(match(f.image,f.outer,f.seed,{...f.seed,x:12.95,w:11.05},{used:0}),result.box);
});
test('paired missing-text acceptance measures full tinted source strokes instead of a guessed white core',()=>{
 const f=fixture(),proposal={index:1,text:null,confidence:0,box:f.outer},a={index:1,text:'L',confidence:.98,box:f.seed,color:'#FFFFFF'};
 const result=acceptMissingSceneText([proposal],[[a],[{...a,box:{...f.seed,x:12.95,w:11.05}}]],f.image,{used:0});
 assert.deepEqual(result.rejected,[]);assert.deepEqual(result.lines,[{text:'L',confidence:.98,box:{x:13,y:12,w:11,h:9}}]);
 assert.equal(acceptMissingSceneText([proposal],[[a],[{...a,text:'T'}]],f.image,{used:0}).lines.length,0);
 assert.equal(acceptMissingSceneText([proposal],[[a],[{...a,confidence:.89}]],f.image,{used:0}).lines.length,0);
 assert.equal(acceptMissingSceneText([proposal],[[a],[a]],f.image,{used:0},[{text:'existing',box:f.seed}]).rejected[0].reason,'existing-ocr-overlap');
});
test('empty, clipped, transparent, detached and enclosed-counter surfaces do not prove a complete stroke',()=>{
 const run=f=>measure({image:f.image,box:f.box,seed:f.seed,budget:{used:0}});
 const blank=fixture();for(let n=0;n<40*32;n++)blank.image.rgba.set([215,63,14,255],n*4);assert.equal(run(blank),null);
 const clipped=fixture();for(let y=10;y<13;y++)clipped.paint(13,y);assert.equal(run(clipped),null);
 const transparent=fixture();transparent.image.rgba[(10*40+11)*4+3]=254;assert.equal(run(transparent),null);
 const detached=fixture();detached.paint(22,12);assert.equal(run(detached),null);
 const ring=fixture();for(let x=13;x<=23;x++){ring.paint(x,12);ring.paint(x,20);}for(let y=12;y<=20;y++){ring.paint(13,y);ring.paint(23,y);}assert.equal(run(ring),null);
});
test('local background must be observed and coherent; a broad model cannot claim an inner fragment',()=>{
 const f=fixture();assert.equal(measure({image:f.image,box:f.outer,seed:f.outer,budget:{used:0}}),null);
 for(let y=10;y<23;y++)for(let x=11;x<26;x++)if((x+y)%3===0)f.paint(x,y,[100,140,120,255]);
 assert.equal(measure({image:f.image,box:f.box,seed:f.seed,budget:{used:0}}),null);
 const g=fixture();assert.equal(match(g.image,{x:14,y:7,w:17,h:20},g.seed,g.seed,{used:0}),null);
 assert.equal(match(g.image,g.outer,g.seed,{...g.seed,x:20},{used:0}),null);
});
test('dark strokes on a light surface use the same measured geometry',()=>{
 const f=fixture();for(let n=0;n<40*32;n++){const i=n*4,ink=f.image.rgba[i]===244;f.image.rgba.set(ink?[30,45,60,255]:[235,231,227,255],i);}
 assert.deepEqual(match(f.image,f.outer,f.seed,f.seed,{used:0}),{x:13,y:12,w:11,h:9});
});
test('paired scans reserve their complete budget before reading and never raise the four million cap',()=>{
 const f=fixture(),budget={used:4000000};assert.equal(match(f.image,f.outer,f.seed,f.seed,budget),null);assert.equal(budget.used,4000000);
 assert.throws(()=>measure({image:f.image,box:f.box,seed:f.seed,budget}),/budget exceeded/);assert.equal(budget.used,4000000);
 assert.equal(measure({image:f.image,box:{x:12,y:11,w:2,h:3},seed:{x:12,y:11,w:2,h:3},budget:{used:0}}),null);
});
test('hostile, invalid and extreme controls reject without invoking getters or exposing input content',()=>{
 const f=fixture(),valid={image:f.image,box:f.box,seed:f.seed,budget:{used:0}};let called=0;
 const getter={};Object.defineProperty(getter,'width',{get(){called++;throw Error('private-token');}});
 for(const input of [null,{},new Proxy(valid,{}),{...valid,image:getter},{...valid,seed:{...f.seed,w:NaN}},
  {...valid,budget:{used:-1}},{...valid,budget:Object.freeze({used:0})},{...valid,image:{...f.image,rgba:new Proxy(f.image.rgba,{})}},
  {...valid,image:{...f.image,rgba:new Uint8Array(1)}},{...valid,box:{x:0,y:0,w:1e9,h:1e9}},
  {...valid,image:{...f.image,width:1e9}},{...valid,extra:'private-token'}])
  assert.throws(()=>measure(input),e=>e instanceof TypeError&&!e.message.includes('private-token'));
 assert.throws(()=>match(f.image,new Proxy(f.outer,{}),f.seed,f.seed,{used:0}),/controls/);assert.equal(called,0);
});
test('compressed source fixture recovers the same complete 66-pixel stroke from independent fractional observations',()=>{
 const image=readPng(path.join(__dirname,'fixtures/source-tinted-glyph/checkmark-source.png')),
  outer={x:3.042,y:1.568,w:23.892,h:26.064},a={x:8.04,y:9.105,w:13.952,h:11.985},b={x:7.872,y:9.035,w:14.208,h:10.778};
 const budget={used:0};assert.deepEqual(match(image,outer,a,b,budget),{x:8,y:9,w:15,h:12});assert.equal(budget.used,2424);
 const first=measure({image,box:{x:6,y:7,w:18,h:17},seed:a,budget:{used:0}}),second=measure({image,box:{x:5,y:7,w:20,h:15},seed:b,budget:{used:0}});
 assert.equal(first.count,66);assert.deepEqual(first.cells,second.cells);
 const proposal={index:1,text:null,confidence:0,box:outer},view={index:1,text:'✓',confidence:.98,color:'#FFFFFF'};
 const result=acceptMissingSceneText([proposal],[[{...view,box:a}],[{...view,box:b}]],image,{used:0});
 assert.deepEqual(result.lines.map(l=>l.box),[{x:8,y:9,w:15,h:12}]);assert.deepEqual(result.rejected,[]);
});
test('source glyph recognition cannot silently duplicate a glyph already retained in its pictorial owner',()=>{
 const {compileSceneIcon}=require('../packages/slideclone-core/scene-plan/source-scene-native-icon');
 const image=readPng(path.join(__dirname,'fixtures/source-tinted-glyph/checkmark-source.png'));
 const result=compileSceneIcon({image,box:{x:3.042,y:1.568,w:23.892,h:26.064},id:'badge',regionId:'region',root:__dirname,
  slideSize:{widthPt:30,heightPt:30},textBoxes:[{text:'✓',box:{x:8,y:9,w:15,h:12}}],budget:{used:0}},
  {preflight:true,nativePictorial:true,parentObjectId:'',preferSourceCrop:true});
 assert.equal(result.icon,null);assert.deepEqual(result.shapes,[]);assert.equal(result.detailCode,'icon-source-text');
});
test('new source glyph regressions are discovered by the unified unit and all CI entrypoints',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-local-glyph.test.js'));
});
