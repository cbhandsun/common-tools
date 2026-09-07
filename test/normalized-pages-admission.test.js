"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {admitNormalizedPages}=require("../packages/slideclone-core/normalized-pages-admission");
const {readRawImageDimensions}=require("../packages/slideclone-core/archive-admission");
test("normalized page admission checks actual dimensions, canonical paths and inert metadata",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"normalized-admission-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,"assets"));
  const inputFile=path.join(root,"assets","source-001.png");
  fs.copyFileSync(path.join(__dirname,"../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"),inputFile);
  const source={inputFile,assetPath:"assets/source-001.png",dimensions:readRawImageDimensions(inputFile,".png"),pageIndex:0};
  const make=()=>({sources:[structuredClone(source)],pages:1,assets:1});
  const input=make(),before=structuredClone(input),output=admitNormalizedPages(input,root);
  assert.deepEqual(output,input);assert.deepEqual(input,before);assert.ok(Object.isFrozen(output.sources[0].dimensions));
  for(const patch of [{inputFile:path.join(root,"outside.png")},{assetPath:"../source.png"},{pageIndex:2},{dimensions:{widthPx:1,heightPx:1}}]) {
    const invalid=make();Object.assign(invalid.sources[0],patch);assert.throws(()=>admitNormalizedPages(invalid,root),/normalized document/u);
  }
  for(const value of [null,{}, {sources:[],pages:0,assets:0},{sources:Array(21).fill(source),pages:21,assets:21},{...make(),pages:2}])assert.throws(()=>admitNormalizedPages(value,root),/page set/u);
  let calls=0;const unsafe=make();Object.defineProperty(unsafe.sources[0],"inputFile",{enumerable:true,get(){calls++;return "private-sentinel";}});
  assert.throws(()=>admitNormalizedPages(unsafe,root),/data properties/u);assert.equal(calls,0);
  const bytes=fs.readFileSync(inputFile);bytes.writeUInt32BE(10000,16);bytes.writeUInt32BE(4000,20);
  const large=[];
  for(let index=0;index<6;index++) {
    const assetPath=`assets/source-${String(index+1).padStart(3,"0")}.png`,file=path.join(root,...assetPath.split("/"));
    fs.writeFileSync(file,bytes);large.push({inputFile:file,assetPath,dimensions:{widthPx:10000,heightPx:4000},pageIndex:index});
  }
  assert.equal(admitNormalizedPages({sources:large.slice(0,5),pages:5,assets:5},root).pages,5);
  assert.throws(()=>admitNormalizedPages({sources:large,pages:6,assets:6},root),/batch processing limit/u);
  bytes.writeUInt32BE(10001,16);fs.writeFileSync(inputFile,bytes);
  assert.throws(()=>admitNormalizedPages({sources:[{...large[0],dimensions:{widthPx:10001,heightPx:4000}}],pages:1,assets:1},root),/dimensions are invalid/u);
  fs.unlinkSync(inputFile);assert.throws(()=>admitNormalizedPages(make(),root),{code:"ENOENT"});
});
