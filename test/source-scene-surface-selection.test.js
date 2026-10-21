'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const glyph=require('../packages/slideclone-core/source-scene-glyph-occlusion');
const {selectMeasuredSceneSurfaceChoices:select}=require('../packages/slideclone-core/source-scene-surface-selection');
function fixture(){
 const image={width:1000,height:450,rgba:Buffer.alloc(1000*450*4)},budget={used:0},fill=[0,130,70];
 for(let i=0;i<1000*450;i++)image.rgba.set([...fill,255],i*4);
 for(const left of [30,530])for(let stripe=0;stripe<16;stripe++)for(let y=30;y<390;y++)for(let x=left+stripe*23;x<left+stripe*23+10;x++)
  image.rgba.set([255,255,255,255],(y*1000+x)*4);
 const boxes=[{x:20,y:20,w:420,h:400},{x:520,y:20,w:420,h:400}],texts=boxes.map(box=>({text:'private-label',box,font:{color:'#FFFFFF'}}));
 const token=glyph.createSceneGlyphOcclusion(image,texts,{widthPt:1000,heightPt:450},budget);
 const measure=box=>glyph.stageSceneSurfaceOwnership(token,()=>glyph.sceneFillGlyphBridge(token,image,budget,box,fill));
 return {image,budget,token,boxes,measure};
}
test('all complete surfaces can be measured before an attachment-aware shared-budget choice',()=>{
 const f=fixture(),original=Buffer.from(f.image.rgba),first=f.measure(f.boxes[0]),second=f.measure(f.boxes[1]);
 assert.equal(first.value.size,57600);assert.equal(second.value.size,57600);assert.equal(glyph.sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0);
 const rows=[{id:'paint',coveragePixels:90000,attachment:false,receipt:first.receipt},
  {id:'node',coveragePixels:60000,attachment:true,receipt:second.receipt}];
 const result=select(f.token,rows);
 assert.deepEqual(result.selected,['node']);assert.deepEqual(result.rejected,[{id:'paint',code:'surface-choice-budget',requestedGlyphs:57600,remainingGlyphs:42400}]);
 assert.equal(glyph.sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,57600);assert.deepEqual(f.image.rgba,original);
 assert.equal(rows[0].receipt,first.receipt);assert.equal(rows[1].id,'node');
});
test('coverage choices use actual incremental ownership unions and keep source scan cost unchanged',()=>{
 const f=fixture(),first=f.measure({...f.boxes[0],w:220}),second=f.measure(f.boxes[0]),scan=f.budget.used;
 const result=select(f.token,[{id:'half',coveragePixels:40000,attachment:false,receipt:first.receipt},
  {id:'whole',coveragePixels:60000,attachment:false,receipt:second.receipt}]);
 assert.deepEqual(new Set(result.selected),new Set(['half','whole']));assert.deepEqual(result.rejected,[]);
 assert.equal(glyph.sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,57600);assert.equal(f.budget.used,scan);
 assert.deepEqual(select(f.token,[]),{selected:[],rejected:[]});
});
test('every candidate receipt is validated before ownership changes and duplicate identities or receipts are refused',()=>{
 const f=fixture(),first=f.measure(f.boxes[0]),second=f.measure(f.boxes[1]),row={id:'paint',coveragePixels:60000,attachment:false,receipt:first.receipt};
 const foreign=fixture(),other=foreign.measure(foreign.boxes[0]);
 const invalidRows=[{...row,id:'second',receipt:other.receipt},{...row,id:'second',receipt:{}},
  {...row,id:'second',receipt:structuredClone(second.receipt)},{...row,id:'second',receipt:new Proxy(second.receipt,{})}];
 for(const invalid of invalidRows){assert.throws(()=>select(f.token,[row,invalid]),TypeError);assert.equal(glyph.sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0);}
 assert.throws(()=>select(f.token,[row,{...row,receipt:second.receipt}]),TypeError);
 assert.throws(()=>select(f.token,[row,{...row,id:'second'}]),TypeError);
 assert.equal(glyph.sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0);
});
test('normal caps, empty input, unsafe controls and extreme values cannot fabricate candidate authority',()=>{
 const f=fixture(),first=f.measure(f.boxes[0]),row={id:'paint',coveragePixels:60000,attachment:false,receipt:first.receipt};let calls=0;
 const getter={get coveragePixels(){calls++;throw Error('private-label');}};
 for(const input of [null,new Proxy([],{}),new Array(1),[getter],[{...row,coveragePixels:NaN}],[{...row,coveragePixels:40000001}],
  [{...row,coveragePixels:0}],[{...row,id:'<script>'}],[{...row,attachment:'yes'}],Array(121).fill(row)])
  assert.throws(()=>select(f.token,input),error=>error instanceof TypeError&&!error.message.includes('private-label'));
 for(const token of [null,undefined,true,new Proxy(f.token,{})])assert.throws(()=>select(token,[]),TypeError);
 assert.equal(calls,0);assert.equal(glyph.sceneGlyphOcclusionEvidence(f.token).glyphOwnedPixels,0);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-surface-selection.test.js','unit'),true);
});
