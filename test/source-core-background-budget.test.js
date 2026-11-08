'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {supplementaryBackgroundFixture}=require('./helpers/source-supplementary-background.cjs');
const {observeSourceCoreBackdrop:observe}=require('../packages/slideclone-core/routing/source-route-core-backdrop');

test('overlapping complete background fields retain all observations within a bounded remaining proof budget',()=>{
 const baseline=supplementaryBackgroundFixture(),expected=observe(baseline);assert.ok(expected);
 const f=supplementaryBackgroundFixture(),source=Buffer.from(f.image.rgba);f.work.checks=3955000;
 const result=observe(f);assert.ok(result,'Repeated exterior reads must not exhaust the remaining 45000 checks');
 assert.deepEqual(result,expected);assert.deepEqual(f.image.rgba,source);assert.ok(f.work.checks<=4000000);
});

test('background budget regression is included in both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-core-background-budget.test.js'));
});
