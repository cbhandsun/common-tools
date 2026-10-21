"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
const {readPngBuffer,writePng}=require('../packages/slideclone-core/png');

test('focused observations bind each local rectangle to unchanged source pixels and charge every transmitted image',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-focus-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const image={width:140,height:120,rgba:Buffer.alloc(140*120*4,255)};
 for(let y=0;y<120;y++)for(let x=0;x<140;x++)image.rgba.set([x,y,(x*7+y)%255,255],(y*140+x)*4);
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,image);
 const source=fs.readFileSync(sourceFile),boxes=[{x:23.5,y:32.25,w:12,h:16},{x:80,y:75,w:14,h:18}];
 let calls=0,pixels=0,focusedPixels=0;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {reviews:boxes.map((_,index)=>({index,kind:'uncertain'}))};
  assert.equal(request.images.length,3);assert.deepEqual(request.localTargets.reviews,[0,1]);
  assert.match(request.prompt,/LOCAL PIXELS/);assert.match(request.prompt,/never for returned geometry/);
  const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-'))),ratio=calls===2?0:.7;
  const map=JSON.parse(fs.readFileSync(path.join(directory,`sheet-${ratio}-mapping.json`)));
  for(const [i,view] of request.images.entries()){
   const png=readPngBuffer(view.bytes);pixels+=png.width*png.height;
   if(!i)continue;
   focusedPixels+=png.width*png.height;
   const index=i-1,m=map.sourceTargets.find(t=>t.index===index);
   assert.match(view.label,new RegExp(`OCR index ${index};`));
   const candidate=JSON.parse(view.label.split('candidate rectangle ')[1].split(' in LOCAL PIXELS')[0]);
   assert.deepEqual(candidate,m.candidateBox);assert.equal(candidate.x+m.cropBox.x,boxes[index].x);
   assert.equal(candidate.y+m.cropBox.y,boxes[index].y);
   assert.equal(png.width,m.cropBox.w);assert.equal(png.height,m.cropBox.h);
   for(let y=0;y<png.height;y++){
    const start=((y+m.cropBox.y)*image.width+m.cropBox.x)*4;
    assert.deepEqual(png.rgba.subarray(y*png.width*4,(y+1)*png.width*4),image.rgba.subarray(start,start+png.width*4));
   }
  }
  // A disagreement must still preserve OCR, despite the better presentation.
  return {reviews:[{index:0,kind:calls===2?'graphic':'text'},{index:1,kind:'text'}]};
 }} )({root,sourceFile,dimensions:{widthPx:140,heightPx:120},ocr:{lines:boxes.map((box,i)=>({text:String(i+1),confidence:.6,box}))},isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(result.ocr.lines.length,2);assert.deepEqual(result.evidence.rejectedOcr,[]);
 const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-')));
 const cost=JSON.parse(fs.readFileSync(path.join(directory,'allocation.json'))),evidence=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 assert.equal(focusedPixels,cost.focusPixels);assert.equal(pixels,cost.sheetPixels+cost.focusPixels);
 assert.equal(evidence.cropPixels,pixels);assert.ok(pixels+cost.reservedPixels<=4000000);
 assert.deepEqual(fs.readFileSync(sourceFile),source);
});
