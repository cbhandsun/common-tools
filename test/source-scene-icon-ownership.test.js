"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sceneIconInkTextCollisions:collisions}=require("../packages/slideclone-core/scene-plan/source-scene-icon-ownership");
function fixture(){
 const rgba=Buffer.alloc(10*10*4);for(let y=2;y<8;y++)for(let x=2;x<8;x++)rgba[(y*10+x)*4+3]=255;
 return {sourceWidth:200,sourceHeight:100,originalPixelBox:{x:10,y:10,w:20,h:20},
  refinement:{box:{x:2,y:2,w:10,h:10},image:{width:10,height:10,rgba}},
  slideSize:{widthPt:400,heightPt:200},box:{x:24,y:24,w:20,h:20},textBoxes:[]};
}
test("transparent padding does not acquire text ownership while opaque source cells do",()=>{
 const f=fixture(),padding={text:"Caption",box:{x:24,y:24,w:4,h:20}},ink={text:"Glyph",box:{x:28,y:28,w:2,h:2}};
 f.textBoxes=[padding,ink];assert.deepEqual(collisions(f),[ink]);
 const boundary={text:"Edge",box:{x:40,y:28,w:2,h:2}};f.textBoxes=[boundary];assert.deepEqual(collisions(f),[]);
 f.textBoxes=[{...boundary,box:{...boundary.box,x:39.99}}];assert.equal(collisions(f).length,1);
});
test("source alpha threshold and empty masks preserve original foreground ownership",()=>{
 const f=fixture(),text={text:"A",box:{x:24,y:24,w:2,h:2}};f.textBoxes=[text];
 f.refinement.image.rgba[3]=31;assert.deepEqual(collisions(f),[]);f.refinement.image.rgba[3]=32;assert.deepEqual(collisions(f),[text]);
 f.textBoxes=[{...text,text:" "}];assert.deepEqual(collisions(f),[]);
});
test("foreign source frames, displaced crops, resized pixels and invalid text are rejected",()=>{
 for(const edit of [f=>f.box.x++,f=>f.sourceWidth=201,f=>f.refinement.box.w++,f=>f.originalPixelBox.x=195,
  f=>f.refinement.image.rgba=Buffer.alloc(1),f=>f.textBoxes=[{text:"A",box:{x:-1,y:0,w:1,h:1}}],
  f=>f.sourceWidth=Infinity,f=>f.originalPixelBox.w=10000,f=>f.slideSize.widthPt=NaN,
  f=>f.refinement.image.rgba=new Uint8Array(new SharedArrayBuffer(400))]){
  const f=fixture();edit(f);assert.throws(()=>collisions(f),TypeError);
 }
});
test("hostile controls, sparse lists and proxy pixels do not invoke accessors",()=>{
 let calls=0;const f=fixture(),getter={};Object.defineProperty(getter,"box",{get(){calls++;throw Error("secret");}});
 const masks=[];Object.defineProperty(masks,"0",{get(){calls++;throw Error("secret");}});masks.length=1;
 for(const value of [null,{},getter,new Proxy(f,{}),{...f,textBoxes:masks},{...f,textBoxes:new Array(1)},
  {...f,refinement:{...f.refinement,image:{...f.refinement.image,rgba:new Proxy(f.refinement.image.rgba,{})}}}])assert.throws(()=>collisions(value),TypeError);
 assert.equal(calls,0);
});

test('an isolated graphic in observed caption whitespace does not reserve unrelated caption glyphs',()=>{
 const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const source={width:120,height:90,rgba:Buffer.alloc(120*90*4,255)},budget={used:0},text={text:'I',box:{x:40,y:30,w:30,h:25},font:{color:'#000000'}};
 for(let y=35;y<50;y++)for(let x=50;x<54;x++)source.rgba.set([0,0,0,255],(y*120+x)*4);
 for(let y=32;y<35;y++)for(let x=42;x<45;x++)source.rgba.set([30,130,220,255],(y*120+x)*4);
 const before=Buffer.from(source.rgba),token=createSceneGlyphOcclusion(source,[text],{widthPt:120,heightPt:90},budget),rgba=Buffer.alloc(15*25*4);
 for(let y=32;y<35;y++)for(let x=42;x<45;x++)rgba.set([30,130,220,255],((y-30)*15+x-40)*4);
 const input={sourceWidth:120,sourceHeight:90,originalPixelBox:{x:40,y:30,w:30,h:25},
  refinement:{box:{x:0,y:0,w:15,h:25},image:{width:15,height:25,rgba}},slideSize:{widthPt:120,heightPt:90},box:{x:40,y:30,w:15,h:25},
  textBoxes:[text],glyphOcclusion:token,sourceImage:source,budget};
 assert.deepEqual(collisions(input),[]);assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,0);
 const scan=budget.used;assert.ok(scan>0);
 for(let y=35;y<50;y++)for(let x=50;x<54;x++)rgba.set([0,0,0,255],((y-30)*15+x-40)*4);
 assert.deepEqual(collisions(input),[text]);assert.equal(sceneGlyphOcclusionEvidence(token).glyphOwnedPixels,60);
 assert.equal(budget.used,scan);assert.deepEqual(source.rgba,before);
});
