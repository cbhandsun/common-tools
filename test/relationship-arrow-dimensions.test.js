"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const shapes=require('../packages/slideclone-core/relationship-native-shapes');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/native-component-quality');

test('relationship factories explicitly preserve the renderer medium arrow dimensions',()=>{
 const atom={kind:'connector-arrow-candidate',box:{x:20,y:30,w:60,h:4},color:'#234567',
  lineEndpoints:{from:{x:20,y:32},to:{x:80,y:32}}};
 const factories=['hubSpokeConnectorShape','topologyConnectorShape',
  'measuredGenericConnectorShape','funnelLensConnectorShape','swimlaneConnectorShape'];
 const lines=factories.map(name=>shapes[name]({id:'source'},atom,0));
 lines.push(shapes.branchCardCurveShape({id:'source'},atom,
  {points:[{x:20,y:30},{x:45,y:40},{x:80,y:32}],confidence:1},0));
 lines.push(shapes.flowConnectorShape({id:'source'},{box:{x:0,y:10,w:20,h:30}},
  {box:{x:80,y:10,w:20,h:30}},atom,0));
 lines.push(shapes.fishboneSpineShape({id:'source'},atom));
 for(const shape of lines){
  assert.equal(shape.style.endArrow,'triangle',shape.id);
  assert.equal(shape.style.endArrowWidth,'medium',shape.id);
  assert.equal(shape.style.endArrowLength,'medium',shape.id);
  assert.equal(shape.style.startArrow,undefined,shape.id);
 }
 const audit=auditNativeComponentQuality({pages:[{shapes:lines,textBoxes:[],images:[]}]});
 assert.deepEqual(audit.findings.filter(f=>/arrow-size-missing/.test(f.code)),[]);
});

test('arrow dimensions belong only to the indicated endpoint and never create an arrow',()=>{
 assert.deepEqual(shapes.connectorArrowStyle(),{});
 assert.deepEqual(shapes.connectorArrowStyle({kind:'line',arrowDirection:'left'}),{});
 for(const arrowDirection of ['left','up'])assert.deepEqual(shapes.connectorArrowStyle({kind:'connector-arrow-candidate',arrowDirection}),
  {startArrow:'triangle',startArrowWidth:'medium',startArrowLength:'medium'});
 for(const arrowDirection of ['right','down',undefined])assert.deepEqual(shapes.connectorArrowStyle({kind:'connector-arrow-candidate',arrowDirection}),
  {endArrow:'triangle',endArrowWidth:'medium',endArrowLength:'medium'});
 for(const name of ['hubSpokeConnectorShape','funnelLensConnectorShape','swimlaneConnectorShape']){
  const style=shapes[name]({}, {kind:'line',box:{x:20,y:30,w:60,h:4}},0).style;
  for(const key of ['startArrow','endArrow','endArrowWidth','endArrowLength'])assert.equal(style[key],undefined);
 }
});

test('relationship arrow regressions run in the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite)
  .some(entry=>entry.file.endsWith('relationship-arrow-dimensions.test.js')));
});
