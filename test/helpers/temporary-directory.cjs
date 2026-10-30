'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const issued=new Map();
function createTemporaryTestDirectory(prefix){
 if(typeof prefix!=='string'||!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}-$/u.test(prefix))throw new TypeError('Invalid test directory prefix');
 const parent=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,prefix));
 if(path.dirname(path.resolve(root))!==parent)throw new Error('Test directory escaped temporary root');
 issued.set(root,{parent,removed:false});return root;
}
function removeTemporaryTestDirectory(root){
 const state=typeof root==='string'?issued.get(root):undefined;
 if(!state)throw new TypeError('Unowned test directory cleanup');
 if(state.removed)return;
 const info=fs.lstatSync(root,{throwIfNoEntry:false});
 if(!info){state.removed=true;return;}
 const target=fs.realpathSync(root);
 if(!info.isDirectory()||info.isSymbolicLink()||target!==path.resolve(root)||path.dirname(target)!==state.parent)
  throw new Error('Test directory cleanup target changed');
 // Windows can transiently report ENOTEMPTY/EBUSY while scanning recently
 // replaced files. Node retries these bounded filesystem errors; permanent
 // failures still fail the test. No test or child-process deadline changes.
 fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:40});
 if(fs.lstatSync(target,{throwIfNoEntry:false}))throw new Error('Test directory cleanup incomplete');
 state.removed=true;
}
module.exports={createTemporaryTestDirectory,removeTemporaryTestDirectory};
