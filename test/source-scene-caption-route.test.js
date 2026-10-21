'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {measureSourceSceneCaptionRoute:measure}=require('../packages/slideclone-core/source-scene-caption-route');
const {compileSourceSceneCaptionRoute:compile}=require('../packages/slideclone-core/source-scene-caption-route-compiler');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence}=require('../packages/slideclone-core/source-scene-glyph-occlusion');
function fixture({terminalShade=false}={}){
 const image={width:240,height:180,rgba:Buffer.alloc(240*180*4,255)},budget={used:0};
 const put=(x,y,color=[30,60,90])=>image.rgba.set([...color,255],(y*240+x)*4);
 const from={id:'a',box:{x:20,y:20,w:50,h:40}},to={id:'b',box:{x:170,y:20,w:50,h:40}};
 for(const n of [from,to])for(let y=n.box.y;y<n.box.y+n.box.h;y++)for(let x=n.box.x;x<n.box.x+n.box.w;x++)put(x,y,[210,230,245]);
 for(const center of [45,195])for(let y=60;y<=130;y++)for(let x=center-1;x<=center+1;x++)put(x,y);
 for(let x=45;x<=100;x++)for(let y=129;y<=131;y++)put(x,y);
 for(let x=140;x<=195;x++)for(let y=129;y<=131;y++)put(x,y);
 for(let y=60;y<=65;y++)for(let x=195-(y-60);x<=195+(y-60);x++)put(x,y);
 for(let y=123;y<=137;y++)for(let x=111;x<=128;x++)if(x<=113||x>=126||y>=129&&y<=131)put(x,y);
 if(terminalShade){
  for(let y=60;y<=71;y++)for(let x=44;x<=46;x++)put(x,y,[30,60,65]);
  for(let y=60;y<=61;y++)for(let x=195-(y-60);x<=195+(y-60);x++)put(x,y,[30,60,50]);
 }
 const text={text:'H',box:{x:108,y:120,w:24,h:20},font:{color:'#1E3C5A'}},textMasks=[text.box];
 const glyphOcclusion=createSceneGlyphOcclusion(image,[text],{widthPt:240,heightPt:180},budget);
 const cache=createSceneMeasurementCache(image,textMasks,budget,glyphOcclusion);
 assert.ok(cache.fill(from.box));assert.ok(cache.fill(to.box));from.portFrame=cache.portFrame(from.box);to.portFrame=cache.portFrame(to.box);
 return {image,from,to,budget,textMasks,glyphOcclusion,direction:'forward',shaftBox:{x:38,y:59,w:165,h:79},put};
}
test('a source-owned caption preserves two complete native fragments and their empty gap',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),result=measure(f);assert.ok(result.fit,result.reason);
 assert.equal(result.fit.fragments.length,2);assert.ok(f.budget.used<=4000000);assert.deepEqual(f.image.rgba,before);
 const relation={id:'caption-loop',regionId:'root',fromId:'a',toId:'b',direction:'forward'};
 const request={fit:result.fit,relation,fromId:'a',toId:'b',width:240,height:180,slideSize:{widthPt:240,heightPt:180}},parts=compile(request);
 assert.ok(parts.length<=32);assert.equal(parts.length,result.fit.parts);
 const lines=parts.filter(p=>p.type==='line');assert.ok(lines.some(p=>p.style.startAnchor.elementId==='a'));assert.ok(lines.some(p=>p.style.startAnchor.elementId==='b'));
 assert.equal(lines.filter(p=>p.style.startArrow).length,1);
 assert.ok(lines.every(p=>!(Math.min(p.box.x,p.box.x+p.box.w)<108&&Math.max(p.box.x,p.box.x+p.box.w)>132)));
 assert.ok(parts.every(p=>p.source.sourcePhysicalAttachment===false&&p.source.sceneRelationId==='caption-loop'));
 assert.throws(()=>compile({...request,fit:structuredClone(result.fit)}),/proof/);
 assert.throws(()=>compile({...request,relation:{...relation,direction:'backward'}}),/proof/);
});
test('text rectangles, copied glyph/node tokens and another source grant no fragmented relation',()=>{
 for(const mode of ['glyph','glyph-copy','node','source','no-text']){
  const f=fixture();if(mode==='glyph')f.glyphOcclusion={};if(mode==='glyph-copy')f.glyphOcclusion=structuredClone(f.glyphOcclusion);
  if(mode==='node')f.from.portFrame={};if(mode==='source')f.image.rgba=Buffer.from(f.image.rgba);if(mode==='no-text')f.textMasks=[];
  assert.equal(measure(f).fit,null,mode);
 }
});
test('wrong direction, a hidden branch, missing ink and unrelated nodes retain failure and rollback glyph ownership',()=>{
 for(const mode of ['direction','branch','missing','other-node']){
  const f=fixture();if(mode==='direction')f.direction='backward';
  if(mode==='branch')for(let y=130;y<=145;y++)f.put(80,y);
  if(mode==='missing')for(let y=90;y<=94;y++)for(let x=44;x<=46;x++)f.put(x,y,[255,255,255]);
  if(mode==='other-node')f.otherNodes=[{x:110,y:126,w:20,h:10}];
  const before=sceneGlyphOcclusionEvidence(f.glyphOcclusion).glyphOwnedPixels;
  assert.equal(measure(f).fit,null,mode);assert.equal(sceneGlyphOcclusionEvidence(f.glyphOcclusion).glyphOwnedPixels,before,mode);
 }
});
test('malformed, empty, extreme, hostile and exhausted inputs cannot read or grant source authority',()=>{
 const f=fixture();let calls=0;const bad={};Object.defineProperty(bad,'from',{get(){calls++;throw Error('private');}});
 const direction={toString(){calls++;throw Error('private');}};
 for(const input of [null,{},bad,new Proxy(f,{}),{...f,direction},{...f,textMasks:new Array(1)},
  {...f,budget:{used:NaN}},{...f,shaftBox:{x:0,y:0,w:1e30,h:10}}])assert.throws(()=>measure(input),TypeError);
 assert.equal(calls,0);f.budget.used=4000000;assert.equal(measure(f).fit,null);assert.equal(f.budget.used,4000000);
 assert.equal(require('../scripts/test-suites').includesSuite(__filename,'unit'),true);
});

test('disconnected source marks do not become free terminals of the caption relation',()=>{
 const f=fixture();for(let y=90;y<97;y++)f.put(115,y);
 assert.ok(measure(f).fit);
});

test('independent terminal paint survives local shading while full-fragment paint keeps .9 support',()=>{
 const f=fixture({terminalShade:true}),result=measure(f);assert.ok(result.fit,result.reason);
 assert.notEqual(result.fit.fragments[0].terminalColor,result.fit.fragments[0].color);
 assert.ok(Object.isFrozen(result.fit));assert.ok(Object.isFrozen(result.fit.fragments[0].points[0]));
 assert.throws(()=>{result.fit.fragments[0].points[0].x=0;},TypeError);
});

test('flat observed caps extend through source ink without relaxing coverage or path limits',()=>{
 const {sourceCaptionRouteStroke:stroke}=require('../packages/slideclone-core/source-caption-route-stroke');
 const width=130,height=30,mask=new Uint8Array(width*height),rgba=Buffer.alloc(width*height*4,255);
 for(let y=10;y<=13;y++)for(let x=10;x<=102;x++){mask[y*width+x]=1;rgba.set([30,60,90,255],(y*width+x)*4);}
 const request=()=>({path:Array.from({length:91},(_,x)=>({x:x+10,y:11})),mask,rgba,width,height,arrow:false,work:{checks:0}});
 const result=stroke(request());assert.ok(result);assert.deepEqual(result.points.at(-1),{x:102,y:11});
 for(let y=11;y<=23;y++)mask[y*width+60]=1;assert.equal(stroke(request()),null);
 const exhausted=request();exhausted.work.checks=4000000;assert.equal(stroke(exhausted),null);
});
