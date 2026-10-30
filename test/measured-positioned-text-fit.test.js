"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {planMeasuredSingleLineTextFit}=require('../packages/slideclone-core/typography/measured-text-fit');
const {validatePositionedTextLayout}=require('../packages/slideclone-core/typography/positioned-text-layout');
const {reframePositionedText}=require('../packages/slideclone-core/typography/positioned-text-reframe');
const {planMeasuredSingleLineTextSpacing}=require('../packages/slideclone-core/typography/measured-text-fit');
const slideSize={widthPt:960,heightPt:540};
function item(){return {id:'line',text:'AB',box:{x:100,y:100,w:100,h:24},
 font:{family:'Arial',sizePt:16,align:'left',valign:'middle'},wrap:false,
 style:{visibility:'visible',wrap:false,fit:'none',textWarp:'textPlain'},
 source:{editable:true,confidence:.95,ocrProvider:'test'},
 positionedRuns:[{text:'A',box:{x:102,y:102,w:35,h:20},fontOverride:{weight:'bold'}},{text:'B',box:{x:150,y:102,w:40,h:20}}]};}
test('measured parent translation moves absolute native text runs by the same displacement',()=>{
 const original=item(),before=structuredClone(original);
 const result=planMeasuredSingleLineTextFit({slideSize,textBoxes:[original],measurements:[{id:'line',source:{x:103,y:100,w:88,h:20},rendered:{x:102,y:102,w:88,h:20}}]});
 assert.equal(result.changes.length,1);const fitted=result.textBoxes[0];
 assert.equal(fitted.box.x,101);assert.equal(fitted.box.y,98);
 assert.equal(fitted.positionedRuns[0].box.x,103);assert.equal(fitted.positionedRuns[0].box.y,100);
 assert.equal(fitted.positionedRuns[1].box.x,151);assert.equal(fitted.positionedRuns[1].box.y,100);
 assert.deepEqual(fitted.positionedRuns[0].fontOverride,{weight:'bold'});
 validatePositionedTextLayout(fitted);assert.deepEqual(original,before);
});
test('frame scaling retains text, styles, source evidence and strict child containment',()=>{
 const original=item(),before=structuredClone(original);
 const fitted=reframePositionedText(original,{x:200,y:50,w:125,h:12});
 assert.deepEqual(fitted.positionedRuns[0].box,{x:202.5,y:51,w:43.75,h:10});
 assert.deepEqual(fitted.positionedRuns[1].box,{x:262.5,y:51,w:50,h:10});
 assert.deepEqual(fitted.source,original.source);assert.deepEqual(fitted.font,original.font);
 assert.deepEqual(fitted.positionedRuns.map(r=>r.text),['A','B']);
 validatePositionedTextLayout(fitted);assert.deepEqual(original,before);
 assert.notEqual(fitted.positionedRuns[0].fontOverride,original.positionedRuns[0].fontOverride);
});
test('spacing planner moves positioned children as well as the ordinary parent frame',()=>{
 const original=item();original.text='AABB';original.positionedRuns[0].text='AA';original.positionedRuns[1].text='BB';
 const result=planMeasuredSingleLineTextSpacing({slideSize,textBoxes:[original],measurements:[{id:'line',source:{x:102,y:102,w:88,h:22},rendered:{x:102,y:102,w:88,h:20}}]});
 assert.equal(result.changes.length,1);const fitted=result.textBoxes[0];
 assert.ok(Math.abs(fitted.positionedRuns[0].box.x-original.positionedRuns[0].box.x-(fitted.box.x-original.box.x))<1e-9);
 assert.ok(Math.abs(fitted.positionedRuns[0].box.y-original.positionedRuns[0].box.y-(fitted.box.y-original.box.y))<1e-9);
 validatePositionedTextLayout(fitted);
});
test('empty malformed extreme and unsafe positioned input fails without calling user accessors',()=>{
 for(const change of [t=>t.positionedRuns=[],t=>t.positionedRuns=new Array(2),t=>t.positionedRuns=Array(513).fill(t.positionedRuns[0]),
  t=>t.positionedRuns[0].box.w=Infinity,t=>t.positionedRuns[0].box.x=99,t=>t.positionedRuns[1].box.x=101,
  t=>t.positionedRuns[0].text='SECRET\n',t=>t.positionedRuns[0].fontOverride={weight:'unknown'},
  t=>t.positionedRuns=new Proxy(t.positionedRuns,{})]){
  const value=item();change(value);assert.throws(()=>reframePositionedText(value,{x:101,y:98,w:100,h:24}),e=>!e.message.includes('SECRET'));
 }
 for(const bad of [{x:0,y:0,w:0,h:1},{x:-1,y:0,w:100,h:24},{x:0,y:0,w:Infinity,h:24}])assert.throws(()=>reframePositionedText(item(),bad));
 let calls=0;
 for(const target of ['run','box','font','style']){
  const value=item(),owner=target==='run'?value.positionedRuns[0]:target==='box'?value.positionedRuns[0].box:target==='font'?value.positionedRuns[0].fontOverride:value.style;
  Object.defineProperty(owner,target==='box'?'x':target==='style'?'fit':target==='font'?'weight':'text',{get(){calls++;return 'SECRET';},enumerable:true});
  assert.throws(()=>reframePositionedText(value,{x:101,y:98,w:100,h:24}));
 }
 assert.equal(calls,0);
 const symbolic=item();Object.defineProperty(symbolic,Symbol('unsafe'),{get(){calls++;return 'SECRET';},enumerable:true});
 assert.throws(()=>reframePositionedText(symbolic,{x:101,y:98,w:100,h:24}));assert.equal(calls,0);
});
test('maximum native run count and fractional boundaries remain valid; ordinary text retains its contract',()=>{
 const value=item();value.box={x:1.3,y:10.2,w:512,h:10};value.text='A'.repeat(512);
 value.positionedRuns=Array.from({length:512},(_,i)=>({text:'A',box:{x:1.3+i,y:10.2,w:.9,h:10}}));
 validatePositionedTextLayout(reframePositionedText(value,{x:2.7,y:5.1,w:333.333,h:13.333}));
 const plain=item();delete plain.positionedRuns;assert.deepEqual(reframePositionedText(plain,{x:1,y:2,w:3,h:4}),{...plain,box:{x:1,y:2,w:3,h:4}});
 const noOp=planMeasuredSingleLineTextFit({slideSize,textBoxes:[item()],measurements:[]});assert.equal(noOp.changes.length,0);
});
