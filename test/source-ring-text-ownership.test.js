"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRingTextOwned}=require('../packages/slideclone-core/source-ring-text-ownership');
const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
const {measureOutlinedSceneContainerDetailed}=require('../packages/slideclone-core/source-scene-outline');
function fixture(){
 const image={width:160,height:120,rgba:Buffer.alloc(160*120*4,255)},budget={used:0},hint={x:30,y:25,w:90,h:70};
 const put=(x,y)=>image.rgba.set([20,20,20,255],(y*160+x)*4);
 for(let x=30;x<=120;x++)for(let d=0;d<3;d++){put(x,25+d);put(x,93+d);}
 for(let y=25;y<=95;y++)for(let d=0;d<3;d++){put(30+d,y);put(118+d,y);}
 for(let y=42;y<56;y++)for(let x=48;x<51;x++)put(x,y);
 const mask={x:42,y:36,w:77,h:24},text={text:'A',box:mask,font:{color:'#141414'}};
 const token=createSceneGlyphOcclusion(image,[text],{widthPt:160,heightPt:120},budget);
 return {image,budget,hint,mask,token};
}
test('a complete source ring overlapping only OCR whitespace gains no glyph erasure or guessed topology',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba);
 assert.equal(measureOutlinedSceneContainerDetailed(f.image,f.hint,[f.mask],{used:0}).outline,null);
 const result=measureOutlinedSceneContainerDetailed(f.image,f.hint,[f.mask],f.budget,f.token);
 assert.ok(result.outline,JSON.stringify(result.rejections));assert.deepEqual(result.outline.box,{x:30,y:25,w:91,h:71});
 assert.equal(result.outline.fill,'#FFFFFF');assert.equal(result.outline.segments.filter(s=>s.type==='moveTo').length,2);
 assert.deepEqual(f.image.rgba,before);assert.ok(f.budget.used<=4000000);
 assert.equal(sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0,'observed OCR whitespace does not acquire the unrelated glyph population');
});
test('real glyph ink, missing proof and copied or foreign capabilities remain owned',()=>{
 const f=fixture(),request={image:f.image,budget:f.budget,textMasks:[f.mask],points:[{x:49,y:47}],glyphOcclusion:f.token};
 assert.equal(sourceRingTextOwned(request),true);
 assert.equal(sourceRingTextOwned({...request,points:[{x:118,y:45}]}),false);
 for(const token of [undefined,{},structuredClone(f.token),new Proxy({}, {})])assert.equal(sourceRingTextOwned({...request,points:[{x:118,y:45}],glyphOcclusion:token}),true);
 assert.equal(sourceRingTextOwned({...request,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}),true);
 assert.equal(sourceRingTextOwned({...request,budget:{used:0}}),true);
});
test('empty overlap is safe while exhausted and blank glyph observations fail closed',()=>{
 const f=fixture(),request={image:f.image,budget:f.budget,textMasks:[f.mask],points:[],glyphOcclusion:f.token};
 assert.equal(sourceRingTextOwned(request),false);assert.equal(f.budget.used,0);
 assert.equal(sourceRingTextOwned({...request,points:[{x:10,y:10}]}),false);assert.equal(f.budget.used,0);
 f.budget.used=4000000;assert.equal(sourceRingTextOwned({...request,points:[{x:118,y:45}]}),true);assert.equal(f.budget.used,4000000);
 const blank=fixture();blank.image.rgba.fill(255);
 assert.equal(sourceRingTextOwned({...request,image:blank.image,budget:blank.budget,glyphOcclusion:blank.token,points:[{x:118,y:45}]}),true);
});
test('open rings are rejected before any optional glyph acquisition',()=>{
 const f=fixture();for(let x=65;x<80;x++)for(let y=23;y<30;y++)f.image.rgba.set([255,255,255,255],(y*160+x)*4);
 const result=measureOutlinedSceneContainerDetailed(f.image,f.hint,[f.mask],f.budget,f.token);
 assert.equal(result.outline,null);assert.equal(sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0);
});
test('invalid, extreme, sparse and hostile boundary data cannot execute user code',()=>{
 const f=fixture(),request={image:f.image,budget:f.budget,textMasks:[f.mask],points:[{x:118,y:45}],glyphOcclusion:f.token};let calls=0;
 const hostile={get x(){calls++;throw Error('private');}};
 for(const points of [null,new Array(1),new Proxy([],{}),[hostile],[{x:Infinity,y:45}],[{x:160,y:45}],Array(262145).fill({x:118,y:45})])
  assert.throws(()=>sourceRingTextOwned({...request,points}),e=>e instanceof TypeError&&!e.message.includes('private'));
 for(const masks of [null,new Array(1),[hostile],[{...f.mask,w:Infinity}],[{...f.mask,x:159}]])
  assert.throws(()=>sourceRingTextOwned({...request,textMasks:masks}),TypeError);
 for(const budget of [null,{used:-1},{used:NaN},{used:4000001},new Proxy({}, {})])assert.throws(()=>sourceRingTextOwned({...request,budget}),TypeError);
 assert.throws(()=>sourceRingTextOwned(new Proxy(request,{})),TypeError);assert.equal(calls,0);
});
