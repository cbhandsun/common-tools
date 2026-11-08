'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/approved-frame-application.cjs');
test('approved frame fixture teardown retries a transient directory deletion failure',t=>{
 let cleanup;const f=fixture({after(callback){cleanup=callback;}}),target=f.root,rmdir=fs.rmdirSync;
 let attempts=0;
 try{
  t.mock.method(fs,'rmdirSync',(directory,...args)=>{
   if(directory===target&&++attempts<=2)throw Object.assign(new Error('transient directory scan'),{code:'ENOTEMPTY'});
   return rmdir(directory,...args);
  });
  cleanup();assert.ok(attempts>=3);assert.equal(fs.existsSync(f.root),false);assert.doesNotThrow(cleanup);
 }finally{t.mock.restoreAll();cleanup();}
});
