"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const admission = require("../packages/slideclone-core/deck-ir-admission");
const worker = require("../packages/slideclone-core/team-worker");
const deck = () => ({version:"1.0", slideSize:{widthPt:960,heightPt:540}, pages:[{}]});

test("production admission composes tree, object, metadata and asset checks without mutation", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-admission-"));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  fs.mkdirSync(path.join(root,"assets"));
  const sourceImage = path.join(root,"assets","source.png");
  fs.writeFileSync(sourceImage, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Jx2UAAAAASUVORK5CYII=", "base64"));
  assert.equal(worker.validateDeckIr, admission.validateDeckIr);
  const input = deck();
  input.pages[0].source = {pageImage:"assets/source.png"};
  const before = structuredClone(input);
  assert.deepEqual(admission.validateDeckIr(input,root), {pages:1,assets:1});
  assert.deepEqual(input,before);
  for (const invalid of [null,{}, {...deck(),pages:[]}, {...deck(),pages:Array(51).fill({})}]) {
    assert.throws(() => admission.validateDeckIr(invalid,root), /editable/u);
  }
  const extreme = deck(); extreme.slideSize = {widthPt:4000,heightPt:4000}; extreme.pages = Array.from({length:50},(_,pageIndex)=>({pageIndex}));
  assert.deepEqual(admission.validateDeckIr(extreme,root), {pages:50,assets:0});
  for (const page of [
    {shapes:[{type:"rect",box:{x:0,y:0,w:-1,h:2}}]},
    {reconstruction:{contractVersion:"invalid"}},
    {source:{pageImage:"assets/missing.png"}},
    {source:{pageImage:"../outside.png"}}
  ]) {
    const invalid=deck(); invalid.pages=[page];
    assert.throws(() => admission.validateDeckIr(invalid,root), /editable/u);
  }
  let calls=0;
  const unsafe=deck(); Object.defineProperty(unsafe.pages[0],"source",{enumerable:true,get(){calls++;throw new Error("private-sentinel");}});
  assert.throws(() => admission.validateDeckIr(unsafe,root), /data properties/u);
  assert.equal(calls,0);
  fs.writeFileSync(path.join(root,"deck.json"),JSON.stringify(input));
  const admittedPackage = worker.validatePackage(root);
  assert.equal(admittedPackage.kind, "deck-ir");
  assert.equal(admittedPackage.deckFile, path.join(root, "deck.json"));
  assert.equal(admittedPackage.pages, 1);
  assert.equal(admittedPackage.assets, 1);
  assert.deepEqual(admittedPackage.structuredDeck, input);
  assert.deepEqual(admittedPackage.structuredSourceImages, [sourceImage]);
  fs.writeFileSync(path.join(root,"deck.json"),"invalid");
  assert.throws(() => worker.validatePackage(root), /invalid JSON/u);
});

test("asset path admission rejects empty, extreme and unsafe external values", () => {
  for(const value of [undefined,null,"",12,"assets/"+"a".repeat(512),"/assets/a.png","assets/../../a.png","assets\\a.png","assets/a\0.png"])
    assert.throws(()=>admission.safeAssetPath(value), /editable deck/u);
  assert.equal(admission.safeAssetPath("assets/sub/../source.png"),"assets/source.png");
});

test("rebuilt page admission enforces a single inert deck before namespace traversal", () => {
  const input=deck();
  assert.equal(admission.admitRebuiltPage({deck:input},os.tmpdir()),input);
  for(const value of [null,{},[],{deck:null},{deck:{...deck(),pages:[{pageIndex:0},{pageIndex:1}]}}])
    assert.throws(()=>admission.admitRebuiltPage(value,os.tmpdir()),/rebuild|editable/u);
  let traps=0;
  const proxy=new Proxy({deck:input},{getOwnPropertyDescriptor(){traps++;throw new Error("private-sentinel");}});
  assert.throws(()=>admission.admitRebuiltPage(proxy,os.tmpdir()),/result is invalid/u);
  assert.equal(traps,0);
});
