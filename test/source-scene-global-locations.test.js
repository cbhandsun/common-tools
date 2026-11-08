'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSceneGlobalLocations}=require('../packages/slideclone-core/scene-plan/source-scene-global-locations');
const row=(index=0)=>({index,labelRef:'private-label-identity',box_2d:[10,20,30,40],confidence:.95});

test('global locator compression preserves every original index, frame, confidence and quoted hint',()=>{
 const rows=[row(),{...row(1),ocrTextHint:'"数据" <script>'}],before=structuredClone(rows);
 const result=sourceSceneGlobalLocations(rows);
 assert.deepEqual(result,[[0,[10,20,30,40],.95],[1,[10,20,30,40],.95,'"数据" <script>']]);
 assert.deepEqual(rows,before);assert.equal(JSON.stringify(result).includes('private-label-identity'),false);
 assert.ok(Buffer.byteLength(JSON.stringify(result))<Buffer.byteLength(JSON.stringify(rows)));
 assert.deepEqual(sourceSceneGlobalLocations([]),[]);
 result[0][1][0]=15;assert.equal(rows[0].box_2d[0],10);
});
test('maximum original OCR context and Unicode hints keep the same bounded population',()=>{
 const rows=Array.from({length:512},(_,i)=>row(i));
 assert.equal(sourceSceneGlobalLocations(rows).length,512);
 assert.equal(sourceSceneGlobalLocations([{...row(),ocrTextHint:'😀'.repeat(128)}])[0][3],'😀'.repeat(128));
 assert.deepEqual(sourceSceneGlobalLocations([{...row(),box_2d:[0,0,1000,1000],confidence:0}])[0],[0,[0,0,1000,1000],0]);
});
test('malformed, extreme, sparse and executable input fail before accessing user code',()=>{
 let touched=false;const hostile=Object.defineProperty({},'index',{get(){touched=true;throw Error('private');},enumerable:true});
 const proxy=new Proxy({}, {get(){touched=true;throw Error('private');}});
 const sparse=[row()];delete sparse[0];const sparseBox=[10,20,30,40];delete sparseBox[0];
 for(const value of [undefined,null,{},sparse,Array(513).fill(row()),[hostile],[proxy],new Proxy([row()],{}),
  [row(1)],[row(),row()], [{...row(),index:NaN}],[{...row(),confidence:Infinity}],[{...row(),confidence:1.1}],
  [{...row(),box_2d:[30,20,10,40]}],[{...row(),box_2d:[0,0,1001,40]}],[{...row(),box_2d:[.1,0,30,40]}],
  [{...row(),box_2d:sparseBox}],[{...row(),ocrTextHint:'secret\nkey'}],[{...row(),ocrTextHint:proxy}],
  [{...row(),ocrTextHint:'x'.repeat(129)}],Array.from({length:33},(_,i)=>({...row(i),ocrTextHint:'x'.repeat(128)}))])
  assert.throws(()=>sourceSceneGlobalLocations(value),{name:'TypeError',message:'Scene global locations are invalid'});
 assert.equal(touched,false);
});
test('global locator regression enters unified CI and runtime distribution',()=>{
 const suites=require('../scripts/test-suites'),runtime=require('../scripts/verify-runtime-package');
 assert.equal(suites.includesSuite(__filename,'unit'),true);assert.equal(suites.includesSuite(__filename,'all'),true);
 assert.ok(runtime.REQUIRED_FILES.includes('packages/slideclone-core/scene-plan/source-scene-global-locations.js'));
});
