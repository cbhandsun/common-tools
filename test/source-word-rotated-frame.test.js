"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {boundedOcrSourceDeck}=require('../packages/slideclone-core/ocr-source-deck');
const {projectOcrTextBox}=require('../packages/slideclone-core/ocr-text-quadrilateral');
const {applySourceWordLayouts,registerSourceWordLayout}=require('../packages/slideclone-core/source-word-layout-registry');
const {prepareRotatedSourceWordFrame}=require('../packages/slideclone-core/source-word-rotated-frame');
function fixture(degrees=12){
 const width=140,height=90,rgba=new Uint8Array(width*height*4).fill(255),r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=70,cy=45;
 const polygon=[[-35,-10],[35,-10],[35,10],[-35,10]].map(([x,y])=>[cx+c*x-s*y,cy+s*x+c*y]);
 const x=Math.min(...polygon.map(p=>p[0])),y=Math.min(...polygon.map(p=>p[1])),w=Math.max(...polygon.map(p=>p[0]))-x,h=Math.max(...polygon.map(p=>p[1]))-y;
 for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){const dx=xx+.5-cx,dy=yy+.5-cy,u=c*dx+s*dy,v=-s*dx+c*dy;
  if(Math.abs(v)<5&&(u>-29&&u<-6||u>6&&u<29))rgba.set([17,17,17,255],(yy*width+xx)*4);
 }
 const line={text:'AAAABBBB',confidence:.99,box:{x,y,w,h},polygon,
  wordPositionHints:[{text:'AAAA',box:{x,y,w:w/2,h}},{text:'BBBB',box:{x:x+w/2,y,w:w/2,h}}]};
 return {image:{width,height,rgba},line};
}
function deck(f){return boundedOcrSourceDeck({metadata:{dimensions:{widthPx:f.image.width,heightPx:f.image.height}},sourceImage:'assets/source.png',sourceRaster:f.image,ocr:{lines:[f.line]}});}
test('actual OCR factory applies source-measured rotated words without flattening or tracing text',()=>{
 for(const angle of [-12,12]){const f=fixture(angle),before=f.image.rgba.slice(),d=deck(f),originals=d.pages[0].textBoxes;
  const page={...d.pages[0],textBoxes:originals.map(t=>projectOcrTextBox(t))},result=applySourceWordLayouts(page,originals);
  assert.equal(result.layouts,1);assert.equal(result.runs,2);const text=result.page.textBoxes[0];
  assert.equal(text.text,'AAAABBBB');assert.equal(text.rotation,page.textBoxes[0].rotation);assert.equal(text.positionedRuns.map(r=>r.text).join(''),'AAAABBBB');
  assert.equal(text.wrap,false);assert.deepEqual(f.image.rgba,before);assert.equal(applySourceWordLayouts(page,structuredClone(originals)).layouts,0);
  const changed=structuredClone(page);changed.textBoxes[0].rotation+=1;assert.equal(applySourceWordLayouts(changed,originals).layouts,0);
 }
});
function request(f=fixture()){return {image:f.image,line:f.line,nativeBox:{...f.line.box},neighbors:[f.line.box],maximum:4000000};}
test('rotation sampling and final color remeasurement share the same bounded allowance and immutable observation',()=>{
 const f=fixture(),frame=prepareRotatedSourceWordFrame(request(f));assert.ok(frame);
 const text={id:'one',text:f.line.text,box:{...f.line.box},font:{color:'#111111'},source:{pageImage:'assets/source.png',evidenceBox:{...f.line.box},ocrPolygonPt:f.line.polygon}};
 const budget={remaining:4000000};registerSourceWordLayout(text,f.line,f.image,budget,[f.line.box],true);
 assert.ok(4000000-budget.remaining>frame.scannedPixels);
 const projected=projectOcrTextBox(text),page={textBoxes:[projected]},first=applySourceWordLayouts(page,[text]);assert.equal(first.layouts,1);
 const before=budget.remaining;f.image.rgba.fill(255);projected.font.color='#121212';
 const recolored=applySourceWordLayouts(page,[text]);assert.equal(recolored.layouts,1);assert.ok(budget.remaining<before);
 assert.deepEqual(recolored.page.textBoxes[0].positionedRuns,first.page.textBoxes[0].positionedRuns);
 budget.remaining=0;assert.equal(applySourceWordLayouts(page,[text]).layouts,0);assert.equal(budget.remaining,0);
 const denied={remaining:frame.scannedPixels-1};registerSourceWordLayout(text,f.line,f.image,denied,[f.line.box],true);assert.equal(denied.remaining,frame.scannedPixels-1);
});
test('empty, transparent and neighboring connected strokes cannot become positioned source text',()=>{
 for(const mode of ['empty','transparent','crossing']){const f=fixture();
  if(mode==='empty')f.image.rgba.fill(255);
  if(mode==='transparent')for(let i=3;i<f.image.rgba.length;i+=4)f.image.rgba[i]=0;
  if(mode==='crossing')for(let y=0;y<f.image.height;y++)for(let x=65;x<74;x++)f.image.rgba.set([17,17,17,255],(y*f.image.width+x)*4);
  const d=deck(f),page={...d.pages[0],textBoxes:d.pages[0].textBoxes.map(projectOcrTextBox)};
  assert.equal(applySourceWordLayouts(page,d.pages[0].textBoxes).layouts,0,mode);
 }
});
test('unsafe or oversized rotation inputs are rejected without invoking accessors or accepting external masks',()=>{
 let calls=0;const hostile={get width(){calls++;throw Error('private-content');}},f=fixture(),r=request(f);
 for(const input of [null,{},new Proxy(r,{}),{...r,image:hostile},{...r,image:new Proxy(f.image,{})},
  {...r,image:{...f.image,rgba:new Uint8Array(new SharedArrayBuffer(f.image.rgba.length))}},
  {...r,image:{...f.image,width:Infinity}},{...r,maximum:4000001},{...r,maximum:-1},{...r,maximum:.5},
  {...r,line:{...f.line,text:'private\ncontent'}},{...r,line:{...f.line,polygon:[[0,0],[1,0],[1,1],[0,1]]}},
  {...r,neighbors:new Array(1)},{...r,neighbors:[{get x(){calls++;return 0;}}]},
  {...r,nativeBox:{...f.line.box,w:Infinity}}])
  assert.throws(()=>prepareRotatedSourceWordFrame(input),error=>error instanceof TypeError&&!error.message.includes('private-content'));
 assert.equal(calls,0);assert.equal(prepareRotatedSourceWordFrame({...r,maximum:0}),null);
 const frame=prepareRotatedSourceWordFrame(r),withMask=prepareRotatedSourceWordFrame({...r,jointMask:new Uint8Array(1)});
 assert.deepEqual(withMask,frame);assert.equal(frame.scannedPixels,frame.image.width*frame.image.height);
 const large={image:{width:1000,height:1000,rgba:new Uint8Array(4000000)},line:{text:'A',box:{x:10,y:10,w:980,h:980},polygon:[[10,10],[990,100],[900,990],[10,900]]},nativeBox:{x:10,y:10,w:980,h:980},maximum:4000000};
 assert.equal(prepareRotatedSourceWordFrame(large),null);
 const angle=12*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),polygon=[[-300,-300],[300,-300],[300,300],[-300,300]].map(([x,y])=>[512+c*x-s*y,512+s*x+c*y]);
 const x=Math.min(...polygon.map(p=>p[0])),y=Math.min(...polygon.map(p=>p[1])),bounds={x,y,w:1024-2*x,h:1024-2*y};
 assert.equal(prepareRotatedSourceWordFrame({image:{width:1024,height:1024,rgba:new Uint8Array(1024*1024*4)},line:{text:'A',box:bounds,polygon},nativeBox:bounds,maximum:4000000}),null);
 const edge=fixture();edge.line.polygon=edge.line.polygon.map(([x,y])=>[x-30,y]);edge.line.box.x-=30;
 edge.line.wordPositionHints=edge.line.wordPositionHints.map(h=>({...h,box:{...h.box,x:h.box.x-30}}));
 assert.equal(prepareRotatedSourceWordFrame(request(edge)),null);
 const {classifyTestFile}=require('../scripts/test-suites');assert.equal(classifyTestFile(__filename),'unit');
});
