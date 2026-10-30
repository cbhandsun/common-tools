'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {segmentTextBoxesForUnderlay}=require('../packages/slideclone-core/scene-plan/graphic-underlay-crops');
const geometry=require('./fixtures/underlay-region-anchors/text-geometry.json');
test('a recovered continuation glyph cannot bridge unrelated underlay regions',()=>{
 const {textBoxes,slideSize,continuation}=structuredClone(geometry),before=structuredClone(textBoxes);
 const baseline=segmentTextBoxesForUnderlay(textBoxes,slideSize);
 assert.ok(baseline.length>1);
 for(const text of ['...','…','……','. . .','  ...  ','.'.repeat(16000)]){
  const added={text,box:{...continuation}};
  assert.deepEqual(segmentTextBoxesForUnderlay([...textBoxes,added],slideSize),baseline);
  assert.equal(added.text,text);
 }
 assert.deepEqual(textBoxes,before);
 // Real words, decimals, version labels and math symbols keep their geometry.
 for(const text of ['Label','v1.2','1.25','A...','$','+']){
  assert.notDeepEqual(segmentTextBoxesForUnderlay([...textBoxes,{text,box:{...continuation}}],slideSize),baseline);
 }
});
test('empty and continuation-only text cannot invent an underlay region',()=>{
 const size={widthPt:960,heightPt:1280};
 assert.deepEqual(segmentTextBoxesForUnderlay([],size),[]);
 for(const text of ['...','…','. . .'])assert.deepEqual(segmentTextBoxesForUnderlay([
  {text,box:{x:100,y:300,w:30,h:12}},{text,box:{x:150,y:300,w:30,h:12}}
 ],size),[]);
});
