'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {boundedOcrSourceDeck}=require('../packages/slideclone-core/ocr-source-deck');
function fixture(){const sourceRaster={width:100,height:100,rgba:Buffer.alloc(40000)};for(let n=0;n<10000;n++)sourceRaster.rgba.set([20,70,120,255],n*4);for(let y=30;y<70;y++)for(let x=43;x<57;x++)sourceRaster.rgba.set([255,255,255,255],(y*100+x)*4);return {metadata:{dimensions:{widthPx:100,heightPx:100}},sourceImage:'assets/source.png',sourceRaster,ocr:{lines:[{text:'X',confidence:.99,box:{x:40,y:30,w:20,h:40}}]}};}
test('source-proven light glyph ink survives OCR projection instead of acquiring the dark default',()=>{const input=fixture(),before=Buffer.from(input.sourceRaster.rgba);assert.equal(boundedOcrSourceDeck(input).pages[0].textBoxes[0].font.color,'#FFFFFF');assert.deepEqual(input.sourceRaster.rgba,before);});
test('a horizontal Paddle quadrilateral retains the same source-proven light ink as its axis-aligned box',()=>{
 const input=fixture();input.ocr.lines[0].polygon=[[40,30],[60,30],[60,70],[40,70]];
 assert.equal(boundedOcrSourceDeck(input).pages[0].textBoxes[0].font.color,'#FFFFFF');
});
test('OCR color proposals without matching source ink have no style authority',()=>{const input=fixture();input.ocr.lines[0].color='#FFFFFF';input.sourceRaster.rgba.fill(255);assert.equal(boundedOcrSourceDeck(input).pages[0].textBoxes[0].font.color,'#111111');delete input.sourceRaster;assert.equal(boundedOcrSourceDeck(input).pages[0].textBoxes[0].font.color,'#111111');});

test('source light ink sampling keeps the shared budget and rejects clipped, transparent or mixed evidence',()=>{
 const {sampleLightOcrInkColor}=require('../packages/slideclone-core/ocr-light-ink-color');
 const f=fixture(),box=f.ocr.lines[0].box,budget={remaining:704};
 assert.equal(sampleLightOcrInkColor(f.sourceRaster,box,budget),'#FFFFFF');assert.equal(budget.remaining,0);
 const insufficient={remaining:703};assert.equal(sampleLightOcrInkColor(f.sourceRaster,box,insufficient),null);assert.equal(insufficient.remaining,703);
 assert.throws(()=>sampleLightOcrInkColor(f.sourceRaster,box,{remaining:NaN}),/budget/);
 assert.equal(sampleLightOcrInkColor(f.sourceRaster,{...box,x:0},{remaining:704}),null);
 for(const bad of [{...box,w:NaN},{...box,w:1,h:1},{...box,h:10000}]){const bounded={remaining:704};assert.equal(sampleLightOcrInkColor(f.sourceRaster,bad,bounded),null);assert.equal(bounded.remaining,704);}
 const transparent=fixture();transparent.sourceRaster.rgba[(24*100+40)*4+3]=0;
 assert.equal(sampleLightOcrInkColor(transparent.sourceRaster,box,{remaining:704}),null);
 const mixed=fixture();for(let y=50;y<70;y++)for(let x=43;x<57;x++)mixed.sourceRaster.rgba.set([130,255,150,255],(y*100+x)*4);
 assert.equal(sampleLightOcrInkColor(mixed.sourceRaster,box,{remaining:704}),null);
 const dark=fixture();for(let y=30;y<70;y++)for(let x=43;x<57;x++)dark.sourceRaster.rgba.set([0,0,0,255],(y*100+x)*4);
 assert.equal(sampleLightOcrInkColor(dark.sourceRaster,box,{remaining:704}),null);
});
test('low confidence, rotated or invalid OCR never acquires source-derived light ink styling',()=>{
 const f=fixture();f.ocr.lines[0].confidence=.89;
 assert.equal(boundedOcrSourceDeck(f).pages[0].textBoxes[0].font.color,'#111111');
 const empty=fixture();empty.ocr.lines=[];assert.deepEqual(boundedOcrSourceDeck(empty).pages[0].textBoxes,[]);
 const rotated=fixture();rotated.ocr.lines[0].polygon=[[45,30],[60,35],[55,70],[40,65]];
 assert.equal(boundedOcrSourceDeck(rotated).pages[0].textBoxes[0].font.color,'#111111');
 const invalid=fixture();invalid.ocr.lines[0].box.w=Infinity;assert.throws(()=>boundedOcrSourceDeck(invalid));
 const hostile=fixture();let invoked=0;Object.defineProperty(hostile.ocr.lines[0],'color',{get(){invoked++;throw Error('private-content');}});
 assert.equal(boundedOcrSourceDeck(hostile).pages[0].textBoxes[0].font.color,'#FFFFFF');assert.equal(invoked,0);
});

test('light ink regressions are part of the unified CI integration suite',()=>{
 const {includesSuite,validateTestSuiteManifest}=require('../scripts/test-suites');
 assert.equal(includesSuite('test/ocr-light-ink-color.test.js','integration'),true);
 const fs=require('fs');assert.deepEqual(validateTestSuiteManifest(fs.readdirSync(require('path').join(__dirname)).filter(n=>n.endsWith('.test.js'))),[]);
});
