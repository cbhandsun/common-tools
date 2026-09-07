"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {createArchiveAdmission} = require("../packages/slideclone-core/archive-admission");

test("archive admission routes documents only after validating exclusive archive contents", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"archive-admission-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let calls=0;
  const admission=createArchiveAdmission(file=>{calls++;return {kind:path.extname(file).slice(1),extension:path.extname(file),pages:null};});
  assert.throws(()=>admission.validatePackage(root),/requires one to twenty/u);
  fs.mkdirSync(path.join(root,"assets"));
  for(const extension of [".pdf",".pptx"]) {
    const file=path.join(root,"assets","source"+extension);
    fs.writeFileSync(file,"fixture");
    assert.deepEqual(admission.validatePackage(root),{kind:"raw-document",documentKind:extension.slice(1),inputFile:file,assetPath:"assets/source"+extension,pages:null,assets:1});
    const before=calls;
    fs.writeFileSync(path.join(root,"unexpected"),"fixture");
    assert.throws(()=>admission.validatePackage(root),/exactly one/u);
    assert.equal(calls,before);
    fs.unlinkSync(path.join(root,"unexpected")); fs.unlinkSync(file);
  }
  fs.writeFileSync(path.join(root,"assets","source.pdf"),"fixture");
  const failed=createArchiveAdmission(()=>{throw new Error("document inspection failed");});
  assert.throws(()=>failed.validatePackage(root),/document inspection failed/u);
  fs.writeFileSync(path.join(root,"assets","source.pptx"),"fixture");
  assert.throws(()=>admission.validatePackage(root),/exactly one/u);
  assert.throws(()=>createArchiveAdmission(null),/inspector is required/u);
});

test("archive image reader rejects incomplete PNG and truncated JPEG dimensions", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"archive-image-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const admission=createArchiveAdmission(()=>{throw new Error("unexpected document");});
  for(const [extension,bytes] of [[".png",Buffer.from([137,80,78,71])],[".jpg",Buffer.from([255,216,255,192,0,2,0,0,0,0,0,255,217])]]) {
    const file=path.join(root,"source"+extension);fs.writeFileSync(file,bytes);
    assert.throws(()=>admission.readRawImageDimensions(file,extension),/raw editable/u);
  }
});
