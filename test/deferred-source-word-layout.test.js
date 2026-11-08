"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writePng}=require('../packages/slideclone-core/png');
const {boundedOcrSourceDeck}=require('../packages/slideclone-core/ocr/ocr-source-deck');
const {createSourceWordLayoutSession,registerSourceWordLayout,applySourceWordLayouts,validateSourceWordLayoutSession}=require('../packages/slideclone-core/typography/source-word-layout-registry');
const {projectOcrTextBox}=require('../packages/slideclone-core/ocr/ocr-text-quadrilateral');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-word-final-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'source.png'),image={width:120,height:50,rgba:Buffer.alloc(120*50*4,255)};
 for(let y=17;y<30;y++)for(let x=14;x<106;x++)if(x<50||x>=65)image.rgba.set([17,17,17,255],(y*120+x)*4);
 writePng(file,image);const session=createSourceWordLayoutSession(file);
 const line={text:'AAAABBBB',box:{x:10,y:10,w:100,h:28},confidence:.99,wordPositionHints:[{text:'AAAA',box:{x:10,y:10,w:50,h:28}},{text:'BBBB',box:{x:60,y:10,w:50,h:28}}]};
 const text={id:'one',text:line.text,box:{...line.box},font:{color:'#111111'},source:{pageImage:'assets/source.png'}};
 return {file,session,line,text};
}
test('final paint is measured once under the same allowance and gives the eager recolor result',t=>{
 const f=fixture(t),eager={remaining:4000000},late={remaining:4000000},plain=structuredClone(f.text),deferred=structuredClone(f.text);
 registerSourceWordLayout(plain,f.line,f.session.image,eager,[f.line.box]);
 registerSourceWordLayout(deferred,f.line,f.session.image,late,[f.line.box],false,f.session.token);
 assert.equal(late.remaining,4000000);assert.ok(eager.remaining<4000000);
 const page={textBoxes:[{...structuredClone(f.text),font:{color:'#151515',weight:'bold'}}]};
 const a=applySourceWordLayouts(page,[plain]),b=applySourceWordLayouts(page,[deferred]);
 assert.equal(b.layouts,1);assert.equal(b.runs,2);assert.deepEqual(b.page,a.page);assert.ok(late.remaining>eager.remaining);
 const before=late.remaining;assert.deepEqual(applySourceWordLayouts(page,[deferred]).page,b.page);assert.equal(late.remaining,before);
 const changed=structuredClone(page);changed.textBoxes[0].font.color='#202020';assert.equal(applySourceWordLayouts(changed,[deferred]).layouts,1);assert.ok(late.remaining<before);
 late.remaining=0;changed.textBoxes[0].font.color='#222222';assert.equal(applySourceWordLayouts(changed,[deferred]).layouts,0);assert.equal(late.remaining,0);
});
test('private encoded source survives external raster and file mutation without accepting copied identity',t=>{
 const f=fixture(t),budget={remaining:4000000};registerSourceWordLayout(f.text,f.line,f.session.image,budget,[f.line.box],false,f.session.token);
 f.session.image.rgba.fill(255);fs.writeFileSync(f.file,'changed');f.line.text='OTHER';
 const page={textBoxes:[structuredClone(f.text)]};const result=applySourceWordLayouts(page,[f.text]);assert.equal(result.layouts,1);
 assert.equal(result.page.textBoxes[0].positionedRuns.map(r=>r.text).join(''),'AAAABBBB');
 assert.equal(applySourceWordLayouts(page,[structuredClone(f.text)]).layouts,0);
 assert.equal(validateSourceWordLayoutSession(f.session.token,f.session.image),undefined);
 for(const token of [{},structuredClone(f.session.token),new Proxy(f.session.token,{})])assert.throws(()=>validateSourceWordLayoutSession(token,f.session.image),TypeError);
 assert.throws(()=>validateSourceWordLayoutSession(f.session.token,{...f.session.image,rgba:f.session.image.rgba.slice()}),TypeError);
});
test('shared neighbor snapshots preserve repeated own-seed identity and original geometry',t=>{
 const f=fixture(t),image=f.session.image;
 for(let y=17;y<30;y++)for(let x=9;x<15;x++)image.rgba.set([17,17,17,255],(y*image.width+x)*4);
 writePng(f.file,image);const session=createSourceWordLayoutSession(f.file),neighbors=[f.line.box,f.line.box];
 const ordinary=structuredClone(f.text),deferred=structuredClone(f.text),budget={remaining:4000000};
 registerSourceWordLayout(ordinary,f.line,session.image,{remaining:4000000},neighbors);
 registerSourceWordLayout(deferred,f.line,session.image,budget,neighbors,false,session.token);
 const page={textBoxes:[structuredClone(f.text)]},expected=applySourceWordLayouts(page,[ordinary]);assert.equal(expected.layouts,1);
 f.line.box.x=40;neighbors[0].w=1;
 const actual=applySourceWordLayouts(page,[deferred]);assert.equal(actual.layouts,1);assert.deepEqual(actual.page,expected.page);
});
test('the actual OCR factory defers only with a private source capability',t=>{
 const f=fixture(t),input={metadata:{dimensions:{widthPx:120,heightPx:50}},ocr:{lines:[f.line]},sourceImage:'assets/source.png',sourceRaster:f.session.image,sourceWordSession:f.session.token};
 const d=boundedOcrSourceDeck(input),page=structuredClone(d.pages[0]);page.textBoxes[0].font.color='#181818';
 assert.equal(applySourceWordLayouts(page,d.pages[0].textBoxes).runs,2);
 for(const session of [null,{},true])assert.throws(()=>boundedOcrSourceDeck({...input,sourceWordSession:session}),TypeError);
 let calls=0;const accessor={...input};Object.defineProperty(accessor,'sourceWordSession',{get(){calls++;throw Error('private');}});
 assert.throws(()=>boundedOcrSourceDeck(accessor),TypeError);assert.equal(calls,0);
 for(const change of [p=>p.textBoxes[0].text='OTHER',p=>p.textBoxes[0].source.pageImage='assets/other.png',p=>p.textBoxes[0].font.color='#FFFFFF']){
  const other=boundedOcrSourceDeck(input),candidate=structuredClone(other.pages[0]);change(candidate);assert.equal(applySourceWordLayouts(candidate,other.pages[0].textBoxes).layouts,0);
 }
});
test('invalid paths, malformed bytes, hostile fonts and empty candidates fail safely',t=>{
 const f=fixture(t);for(const file of [null,{},'relative.png',f.file+'\0'])assert.throws(()=>createSourceWordLayoutSession(file),TypeError);
 const bad=path.join(path.dirname(f.file),'bad.png');fs.writeFileSync(bad,'invalid png');assert.throws(()=>createSourceWordLayoutSession(bad));
 const budget={remaining:4000000};registerSourceWordLayout(f.text,f.line,f.session.image,budget,[f.line.box],false,f.session.token);
 let calls=0;const font={get color(){calls++;throw Error('private');}};
 assert.equal(applySourceWordLayouts({textBoxes:[{...f.text,font}]},[f.text]).layouts,0);assert.equal(calls,0);assert.equal(budget.remaining,4000000);
 assert.equal(applySourceWordLayouts({textBoxes:[]},[f.text]).layouts,0);assert.equal(budget.remaining,4000000);
 const {classifyTestFile}=require('../scripts/test-suites');assert.equal(classifyTestFile(__filename),'unit');
});
test('joint row ownership recovers rotated source text after ordinary final-paint work',t=>{
 const f=fixture(t),image={width:200,height:100,rgba:Buffer.alloc(200*100*4,255)};
 for(let y=25;y<47;y++)for(let x=50;x<150;x++)if(x<95||x>=105)image.rgba.set([17,17,17,255],(y*200+x)*4);
 const angle=-2*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),cx=100,cy=57;
 for(let y=0;y<100;y++)for(let x=0;x<200;x++){const dx=x+.5-cx,dy=y+.5-cy,u=c*dx+s*dy,v=-s*dx+c*dy;
  if(Math.abs(v)<5&&(u>-48&&u<-5||u>5&&u<48))image.rgba.set([17,17,17,255],(y*200+x)*4);
 }
 const polygon=[[-60,-12],[60,-12],[60,12],[-60,12]].map(([x,y])=>[cx+c*x-s*y,cy+s*x+c*y]);
 const x=Math.min(...polygon.map(p=>p[0])),y=Math.min(...polygon.map(p=>p[1])),w=Math.max(...polygon.map(p=>p[0]))-x,h=Math.max(...polygon.map(p=>p[1]))-y;
 const lines=[{text:'UPPER',confidence:.99,box:{x:40,y:20,w:120,h:28}},
  {text:'LOWER',confidence:.99,box:{x,y,w,h},polygon}];
 writePng(f.file,image);const session=createSourceWordLayoutSession(f.file);
 const input={metadata:{dimensions:{widthPx:200,heightPx:100}},ocr:{lines},sourceImage:'assets/source.png',sourceRaster:session.image};
 const eager=boundedOcrSourceDeck(input),late=boundedOcrSourceDeck({...input,sourceWordSession:session.token});
 const eagerPage={...eager.pages[0],textBoxes:eager.pages[0].textBoxes.map(projectOcrTextBox)},latePage={...late.pages[0],textBoxes:late.pages[0].textBoxes.map(projectOcrTextBox)};
 const before=applySourceWordLayouts(eagerPage,eager.pages[0].textBoxes),after=applySourceWordLayouts(latePage,late.pages[0].textBoxes);
 assert.equal(before.page.textBoxes[1].positionedRuns,undefined);assert.ok(after.page.textBoxes[1].positionedRuns);
 assert.equal(after.page.textBoxes[1].positionedRuns.map(r=>r.text).join(''),'LOWER');assert.equal(after.layouts,2);
 assert.equal(after.page.textBoxes[1].rotation,latePage.textBoxes[1].rotation);assert.deepEqual(after.page.textBoxes[0],before.page.textBoxes[0]);
 assert.deepEqual(applySourceWordLayouts(latePage,late.pages[0].textBoxes).page,after.page);
 const {observeJointSourceWordRows}=require('../packages/slideclone-core/typography/source-word-joint-observation');
 const {prepareRotatedSourceWordFrame}=require('../packages/slideclone-core/typography/source-word-rotated-frame');
 const {measureSourceWordLayout,remeasureSourceWordLayout}=require('../packages/slideclone-core/typography/source-word-layout-evidence');
 const budget={remaining:4000000},rows=lines.map(line=>({box:line.box,color:'#111111',confidence:.99}));
 const proof=observeJointSourceWordRows({image:session.image,anchor:lines[1].box,rows,budget});assert.ok(proof);
 const request={image:session.image,line:lines[1],nativeBox:lines[1].box,neighbors:lines.map(r=>r.box),maximum:budget.remaining};
 const frame=prepareRotatedSourceWordFrame({...request,jointEvidence:proof});assert.ok(frame);
 const measurement={image:frame.image,line:frame.line,color:'#111111',neighborBoxes:frame.neighborBoxes,maxScanPixels:budget.remaining-frame.scannedPixels};
 assert.ok(measureSourceWordLayout(measurement).runs);
 const fake=prepareRotatedSourceWordFrame({...request,jointEvidence:structuredClone(proof)});assert.ok(fake);
 assert.equal(measureSourceWordLayout({...measurement,image:fake.image,line:fake.line,neighborBoxes:fake.neighborBoxes}).reason,'joint-source-ownership');
 frame.image.rgba.fill(255);assert.equal(measureSourceWordLayout({...measurement}).reason,'joint-source-ownership');
 assert.ok(remeasureSourceWordLayout(measurement,'#121212',budget.remaining).runs);
});

test('failed horizontal rows use the same private joint evidence without changing successful rows',t=>{
 const f=fixture(t),image={width:120,height:70,rgba:Buffer.alloc(120*70*4,255)};
 for(const [top,bottom]of [[17,33],[41,55]])for(let y=top;y<bottom;y++)for(let x=14;x<106;x++)
  image.rgba.set([17,17,17,255],(y*120+x)*4);
 writePng(f.file,image);const session=createSourceWordLayoutSession(f.file);
 const lines=[{text:'UPPER',confidence:.99,box:{x:10,y:10,w:100,h:28}},
  {text:'LOWER',confidence:.99,box:{x:10,y:30,w:100,h:28}}];
 const neighbors=lines.map(line=>line.box),budget={remaining:4000000};
 const originals=lines.map((line,i)=>({id:String(i),text:line.text,box:{...line.box},font:{color:'#111111'},source:{pageImage:'assets/source.png'}}));
 const eager=structuredClone(originals);
 for(let i=0;i<lines.length;i++){
  registerSourceWordLayout(eager[i],lines[i],session.image,{remaining:4000000},neighbors);
  registerSourceWordLayout(originals[i],lines[i],session.image,budget,neighbors,false,session.token);
 }
 const page={textBoxes:structuredClone(originals)},before=applySourceWordLayouts(page,eager),after=applySourceWordLayouts(page,originals);
 assert.equal(before.layouts,1);assert.equal(after.layouts,2);
 assert.deepEqual(after.page.textBoxes[0],before.page.textBoxes[0]);
 const lower=after.page.textBoxes[1];assert.equal(lower.style.textWarp,'textPlain');assert.equal(lower.rotation,undefined);
 assert.equal(lower.positionedRuns.map(run=>run.text).join(''),'LOWER');
 assert.ok(budget.remaining>=0&&budget.remaining<4000000);
 const remaining=budget.remaining;assert.deepEqual(applySourceWordLayouts(page,originals).page,after.page);assert.equal(budget.remaining,remaining);
 // A shared connected stroke has no witnessed row owner and stays rejected.
 for(let y=33;y<42;y++)image.rgba.set([17,17,17,255],(y*120+14)*4);
 writePng(f.file,image);const joined=createSourceWordLayoutSession(f.file),blocked=structuredClone(originals),limited={remaining:4000000};
 for(let i=0;i<lines.length;i++)registerSourceWordLayout(blocked[i],lines[i],joined.image,limited,neighbors,false,joined.token);
 assert.equal(applySourceWordLayouts(page,blocked).page.textBoxes[1].positionedRuns,undefined);
});
