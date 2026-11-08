'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inspectLibreOfficeGradientEvidence:inspect}=require('../packages/slideclone-core/libreoffice-gradient-evidence');
const {stageGroupedTextConnections}=require('../packages/slideclone-core/libreoffice-grouped-text-connections');
const {writeStoredZipAtomic}=require('../packages/ooxml-core/pptx-zip');
const head='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
const xml=body=>head+body+'</p:sld>',gradient='<a:gradFill><a:gsLst/><a:lin ang="0"/></a:gradFill>';

test('gradient strokes remain unverified even when their authored OOXML is valid',()=>{
 assert.deepEqual(inspect(xml('<p:sp><p:spPr><a:ln w="12700">'+gradient+'</a:ln></p:spPr></p:sp>')),
  {status:'requires-office-verification',gradientStrokes:1});
});
test('both connectors and open paths are inspected, separately from gradient fills',()=>{
 assert.equal(inspect(xml('<p:sp><p:spPr>'+gradient+'<a:ln>'+gradient+'</a:ln></p:spPr></p:sp><p:cxnSp><p:spPr><a:ln>'+gradient+'</a:ln></p:spPr></p:cxnSp>')).gradientStrokes,2);
 assert.deepEqual(inspect(xml('<p:spPr>'+gradient+'<a:ln><a:solidFill/></a:ln></p:spPr>')),{status:'not-needed',gradientStrokes:0});
});
test('local DrawingML namespace declarations emitted by the actual writer are supported',()=>{
 const local='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sp><p:spPr>'
  +'<a:ln xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+gradient+'</a:ln>'
  +'</p:spPr></p:sp></p:sld>';
 assert.deepEqual(inspect(local),{status:'requires-office-verification',gradientStrokes:1});
 assert.equal(inspect(local.replace('</p:spPr>','<a:ln>'+gradient+'</a:ln></p:spPr>')).status,'unverified-markup');
});
test('empty, solid and self-closing strokes cannot borrow a later fill gradient',()=>{
 for(const body of ['', '<a:ln/>', '<a:ln w="1"/><a:lnTo/><p:spPr>'+gradient+'</p:spPr>', '<a:ln><a:solidFill/></a:ln>'])
  assert.deepEqual(inspect(xml(body)),{status:'not-needed',gradientStrokes:0});
 assert.equal(inspect(xml('<a:ln/><a:ln>'+gradient+'</a:ln>')).gradientStrokes,1);
});
test('comments are not drawing or namespace evidence',()=>{
 assert.equal(inspect(xml('<!-- <a:ln>'+gradient+'</a:ln> -->')).gradientStrokes,0);
 assert.equal(inspect(xml('<!-- xmlns:a="unrelated" -->')).status,'not-needed');
 assert.equal(inspect('<!-- '+head+' --><p:sld></p:sld>').status,'unverified-markup');
 assert.throws(()=>inspect(xml('<!--')),/markup is invalid/);
});
test('unsupported namespaces, CDATA and ambiguous line nesting stay unverified',()=>{
 for(const value of ['', '<sld/>', xml('<a:x xmlns:a="unrelated"/>'),xml('<![CDATA[<a:ln/>]]>'),xml('<a:ln><a:ln/></a:ln>'),xml('<a:ln>'+gradient),xml('</a:ln>'),xml('<a:ln>'+gradient+gradient+'</a:ln>')])
  assert.deepEqual(inspect(value),{status:'unverified-markup',gradientStrokes:null});
});
test('namespace-like attribute values, duplicate bindings and malformed XML cannot supply evidence',()=>{
 const uri='http://schemas.openxmlformats.org/drawingml/2006/main';
 for(const value of [xml('<a:ln xmlns:a="'+uri+'" xmlns:a="'+uri+'"/>'),
  '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" note=\' xmlns:a="'+uri+'"\'><a:ln>'+gradient+'</a:ln></p:sld>',
  xml('<a:ln'),xml('<a:r>'.repeat(129)+'</a:r>'.repeat(129)),xml('<a:ln broken>'+gradient+'</a:ln>')])
  assert.deepEqual(inspect(value),{status:'unverified-markup',gradientStrokes:null});
});
test('unsafe declarations and invalid or oversized input fail with bounded errors',()=>{
 for(const value of [null,undefined,3,{},[],new Proxy({}, {get(){throw new Error('must not read');}}),xml('<!DOCTYPE unsafe>'),xml('<!ENTITY secret "payload">'),'x'.repeat(4*1024*1024+1)])
  assert.throws(()=>inspect(value),{name:'TypeError',message:'Renderer gradient evidence XML is invalid'});
 assert.throws(()=>inspect(xml('<a:r/>'.repeat(100001))),{name:'RangeError',message:'Renderer gradient evidence budget exceeded'});
});
test('render staging reports authored gradient fidelity without mutating source or paint',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lo-gradient-evidence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source.pptx'),output=path.join(root,'render.pptx');
 writeStoredZipAtomic(source,[{name:'ppt/slides/slide1.xml',data:xml('<p:sp><p:spPr><a:ln>'+gradient+'</a:ln></p:spPr></p:sp>')},
  {name:'ppt/slides/slide2.xml',data:xml(gradient)}]);const before=fs.readFileSync(source);
 const result=stageGroupedTextConnections(source,output);
 assert.deepEqual(result.gradientStrokeEvidence,{status:'requires-office-verification',gradientStrokes:1,unverifiedSlides:0,paintRewritten:false,officeFidelityVerified:false});
 assert.deepEqual(fs.readFileSync(source),before);assert.deepEqual(fs.readFileSync(output),before);
});
test('unknown slide markup is disclosed instead of reporting all slides gradient-free',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lo-gradient-unknown-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source.pptx'),output=path.join(root,'render.pptx');writeStoredZipAtomic(source,[{name:'ppt/slides/slide1.xml',data:'<slide/>'}]);
 assert.deepEqual(stageGroupedTextConnections(source,output).gradientStrokeEvidence,{status:'unverified-markup',gradientStrokes:0,unverifiedSlides:1,paintRewritten:false,officeFidelityVerified:false});
});

test('gradient renderer evidence is discovered by the unified CI integration gate',()=>{
 for(const suite of ['integration','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/libreoffice-gradient-evidence.test.js'));
});
