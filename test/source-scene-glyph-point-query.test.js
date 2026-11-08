'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneGlyphOcclusion:create,sceneGlyphOcclusionEvidence:evidence,sceneSourceTextPointsOwned:query,sceneIconTextFootprint:whole,
 stageSceneGlyphOwnership:stage,commitSceneGlyphOwnership:commit}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
function fixture(){
 const image={width:120,height:90,rgba:Buffer.alloc(120*90*4,255)},budget={used:0},box={x:40,y:30,w:30,h:25};
 for(let y=35;y<50;y++)for(let x=50;x<54;x++)image.rgba.set([0,0,0,255],(y*120+x)*4);
 const texts=[{text:'I',box,font:{color:'#000000'}}],token=create(image,texts,{widthPt:120,heightPt:90},budget);
 return {image,budget,box,texts,token};
}
test('complete source context proves ring whitespace without claiming other glyph cells',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba);
 assert.equal(query(f.token,f.image,f.budget,f.box,[{x:42,y:32}]),false);assert.equal(evidence(f.token).glyphOwnedPixels,0);
 const scan=f.budget.used;assert.ok(scan>0);
 assert.equal(query(f.token,f.image,f.budget,f.box,[{x:50,y:35},{x:50,y:35}]),true);assert.equal(evidence(f.token).glyphOwnedPixels,1);
 assert.equal(query(f.token,f.image,f.budget,f.box,[{x:51,y:35}]),true);assert.equal(evidence(f.token).glyphOwnedPixels,2);
 assert.ok(whole(f.token,f.image,f.budget,f.box));assert.equal(evidence(f.token).glyphOwnedPixels,60);
 assert.equal(f.budget.used,scan);assert.deepEqual(f.image.rgba,before);
});
test('provisional source point ownership is released and a later choice can submit it',()=>{
 const f=fixture(),point=[{x:50,y:35}];
 const discarded=stage(f.token,()=>query(f.token,f.image,f.budget,f.box,point));assert.equal(discarded.value,true);assert.equal(evidence(f.token).glyphOwnedPixels,0);
 const scan=f.budget.used,next=stage(f.token,()=>query(f.token,f.image,f.budget,f.box,point));assert.equal(next.value,true);
 assert.equal(commit(f.token,next.receipt),true);assert.equal(evidence(f.token).glyphOwnedPixels,1);assert.equal(f.budget.used,scan);
});
test('empty, unknown, ambiguous, blank and exhausted observations grant no guessed ownership',()=>{
 const f=fixture(),point=[{x:42,y:32}];
 assert.equal(query(f.token,f.image,f.budget,f.box,[]),false);assert.equal(f.budget.used,0);
 for(const token of [undefined,{},structuredClone(f.token),new Proxy(f.token,{})])assert.equal(query(token,f.image,f.budget,f.box,point),null);
 assert.equal(query(f.token,{...f.image,rgba:Buffer.from(f.image.rgba)},f.budget,f.box,point),null);
 assert.equal(query(f.token,f.image,{used:0},f.box,point),null);
 const duplicate=create(f.image,[...f.texts,...f.texts],{widthPt:120,heightPt:90},f.budget);assert.equal(query(duplicate,f.image,f.budget,f.box,point),null);
 const blank=fixture();blank.image.rgba.fill(255);assert.equal(query(blank.token,blank.image,blank.budget,blank.box,point),null);
 const exhausted=fixture();exhausted.budget.used=4000000;assert.equal(query(exhausted.token,exhausted.image,exhausted.budget,exhausted.box,point),null);
 assert.equal(exhausted.budget.used,4000000);assert.equal(evidence(exhausted.token).glyphOwnedPixels,0);
});
test('invalid and hostile point queries reject without executing user code or disclosing it',()=>{
 const f=fixture();let calls=0;const getter={get x(){calls++;throw Error('private-source');},y:35};
 for(const points of [null,new Proxy([],{}),new Array(1),[getter],[{x:50.5,y:35}],[{x:-1,y:35}],[{x:120,y:35}],Array(262145).fill({x:50,y:35})])
  assert.throws(()=>query(f.token,f.image,f.budget,f.box,points),e=>e instanceof TypeError&&!e.message.includes('private-source'));
 assert.equal(calls,0);assert.equal(f.budget.used,0);
});

test('source pixels outside the measured glyph context remain protected at crop fringes',()=>{
 const f=fixture();
 assert.equal(query(f.token,f.image,f.budget,f.box,[{x:30,y:35}]),true);
 assert.equal(evidence(f.token).glyphOwnedPixels,0);
 const predicate=whole(f.token,f.image,f.budget,f.box);assert.ok(predicate);
 for(const point of [{x:39,y:35},{x:70,y:35},{x:50,y:29},{x:50,y:56}])
  assert.equal(query(f.token,f.image,f.budget,f.box,[point]),predicate(point.x,point.y));
});

test('nearly exhausted shared ownership admits exact ring points without borrowing a full text population',()=>{
 const {sceneFillGlyphBridge:bridge}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
 const image={width:950,height:500,rgba:Buffer.alloc(950*500*4)},fill=[0,130,70],budget={used:0};
 for(let i=0;i<950*500;i++)image.rgba.set([...fill,255],i*4);
 for(const [left,stripes]of [[30,8],[300,25]])for(let stripe=0;stripe<stripes;stripe++)
  for(let y=30;y<390;y++)for(let x=left+stripe*23;x<left+stripe*23+10;x++)image.rgba.set([255,255,255,255],(y*950+x)*4);
 const boxes=[{x:20,y:10,w:240,h:400},{x:290,y:10,w:590,h:400}],texts=boxes.map(box=>({text:'I',box,font:{color:'#FFFFFF'}}));
 const token=create(image,texts,{widthPt:950,heightPt:500},budget);
 bridge(token,image,budget,boxes[0],fill);bridge(token,image,budget,{x:300,y:30,w:401,h:360},fill);
 bridge(token,image,budget,{x:714,y:30,w:10,h:360},fill);assert.equal(evidence(token).glyphOwnedPixels,97200);
 const scan=budget.used;assert.equal(whole(token,image,budget,boxes[1]),null);
 assert.equal(query(token,image,budget,boxes[1],[{x:752,y:100}]),false);assert.equal(evidence(token).glyphOwnedPixels,97200);
 assert.equal(query(token,image,budget,boxes[1],[{x:760,y:100}]),true);assert.equal(evidence(token).glyphOwnedPixels,97201);
 const tooMany=[];for(let y=30;y<390;y++)for(let x=737;x<747;x++)tooMany.push({x,y});
 assert.equal(query(token,image,budget,boxes[1],tooMany),null);assert.equal(evidence(token).glyphOwnedPixels,97201);
 assert.equal(budget.used,scan);assert.ok(budget.used<=4000000);
});
