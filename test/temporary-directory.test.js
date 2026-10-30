'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createTemporaryTestDirectory:create,removeTemporaryTestDirectory:remove}=require('./helpers/temporary-directory.cjs');
test('owned temporary hierarchies are removed with an idempotent final cleanup',()=>{
 const root=create('cleanup-test-');fs.mkdirSync(path.join(root,'nested'));fs.writeFileSync(path.join(root,'nested','evidence'),'test');
 remove(root);assert.equal(fs.existsSync(root),false);assert.doesNotThrow(()=>remove(root));
});
test('unknown paths and invalid prefixes never grant recursive cleanup authority',()=>{
 for(const value of [null,undefined,'',process.cwd(),path.dirname(process.cwd()),'..'])assert.throws(()=>remove(value),/Unowned/);
 for(const value of [null,'','../','a/b-','a'.repeat(81)+'-'])assert.throws(()=>create(value),/prefix/);
 assert.equal(fs.existsSync(process.cwd()),true);
});
test('bounded retry settings preserve and surface permanent deletion failures',t=>{
 const root=create('cleanup-failure-'),file=path.join(root,'evidence');fs.writeFileSync(file,'preserved');
 try{
  let calls=0;
  t.mock.method(fs,'rmSync',(target,options)=>{
   calls++;assert.equal(target,root);assert.equal(options.recursive,true);assert.ok(options.maxRetries>0&&options.maxRetries<=3);
   throw Object.assign(new Error('locked'),{code:'ENOTEMPTY'});
  });
  assert.throws(()=>remove(root),{code:'ENOTEMPTY'});assert.equal(calls,1);assert.equal(fs.readFileSync(file,'utf8'),'preserved');
 }finally{t.mock.restoreAll();remove(root);}
});

test('owned cleanup retries transient ENOTEMPTY beyond the default removal attempt',t=>{
 const root=create('cleanup-transient-'),rmdir=fs.rmdirSync;
 fs.writeFileSync(path.join(root,'evidence'),'test');
 let attempts=0;
 try{
  t.mock.method(fs,'rmdirSync',(target,...args)=>{
   if(target===root){
    attempts++;
    if(attempts<=2)throw Object.assign(new Error('transient directory scan'),{code:'ENOTEMPTY'});
   }
   return rmdir(target,...args);
  });
  assert.throws(()=>fs.rmSync(root,{recursive:true,force:true}),{code:'ENOTEMPTY'});
  assert.equal(fs.existsSync(root),true);
  fs.writeFileSync(path.join(root,'evidence'),'test');
  attempts=0;
  remove(root);
  assert.ok(attempts>=3);assert.equal(fs.existsSync(root),false);
  assert.doesNotThrow(()=>remove(root));
 }finally{t.mock.restoreAll();remove(root);}
});
test('a substituted root is rejected before recursive removal',t=>{
 const root=create('cleanup-substitution-'),lstat=fs.lstatSync;
 try{
  t.mock.method(fs,'lstatSync',(target,options)=>target===root?{isDirectory:()=>true,isSymbolicLink:()=>true}:lstat(target,options));
  assert.throws(()=>remove(root),/target changed/);assert.equal(fs.existsSync(root),true);
 }finally{t.mock.restoreAll();remove(root);}
});
test('temporary cleanup regressions are included in unified CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.endsWith('temporary-directory.test.js')));
});
