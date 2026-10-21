"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {admitOcrResult}=require("../packages/slideclone-core/ocr-result-admission");
const size={widthPx:100,heightPx:100};
const line={text:"label",confidence:.95,box:{x:10,y:10,w:30,h:10}};
test("OCR source frame accepts matching metadata and existing metadata-free input",()=>{
 for(const dimensions of [undefined,size])assert.equal(admitOcrResult({lines:[line],...(dimensions?{dimensions}:{})},size).lines.length,1);
 assert.equal(admitOcrResult({dimensions:size,lines:[]},size).lines.length,0);
});
test("OCR source frame rejects mismatched, empty, malformed and extreme declared dimensions",()=>{
 for(const dimensions of [{widthPx:99,heightPx:100},{widthPx:100,heightPx:99},null,{},
  {widthPx:"100",heightPx:100},{widthPx:Infinity,heightPx:100},{widthPx:0,heightPx:100},
  {widthPx:Number.MAX_SAFE_INTEGER,heightPx:100}]){
  assert.throws(()=>admitOcrResult({dimensions,lines:[line]},size),TypeError);
 }
});
test("OCR source frame never executes metadata accessors or proxy traps",()=>{
 let executed=0;
 const input={lines:[line]};Object.defineProperty(input,"dimensions",{get(){executed++;return size;}});
 assert.throws(()=>admitOcrResult(input,size),TypeError);
 const metadata={heightPx:100};Object.defineProperty(metadata,"widthPx",{get(){executed++;return 100;}});
 assert.throws(()=>admitOcrResult({dimensions:metadata,lines:[line]},size),TypeError);
 const proxy=new Proxy(size,{get(){executed++;return 100;}});
 assert.throws(()=>admitOcrResult({dimensions:proxy,lines:[line]},size),TypeError);
 assert.equal(executed,0);
});
