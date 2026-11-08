// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {parseRetainedSceneReview}=require('../slideclone-core/scene-plan/retained-scene-review');
/** Operator-managed host configuration only. Job archives and model replies
 * cannot select this root or write retained human decisions into it.
 * @param {unknown} directory */
function createSourceSceneReviewStore(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||directory.length>4096)
  throw new TypeError('Scene review store root is invalid');
 const root=path.resolve(directory);
 const unavailable=()=>new TypeError('Scene review store is unavailable');
 /** @param {string} target */
 function ordinaryDirectory(target){
  for(let current=target,count=0;;current=path.dirname(current)){
   if(++count>64)throw unavailable();const stat=fs.lstatSync(current);
   if(!stat.isDirectory()||stat.isSymbolicLink())throw unavailable();
   if(path.dirname(current)===current)return;
  }
 }
 try{ordinaryDirectory(root);}catch{throw unavailable();}
 /** @param {string} sourceHash */
 return function readSourceSceneReview(sourceHash){
  if(typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(sourceHash))throw new TypeError('Scene review source hash is invalid');
  let fd;
  try{
   ordinaryDirectory(root);const file=path.join(root,sourceHash+'.json');let before;
   try{before=fs.lstatSync(file);}catch(error){
    if(error!==null&&typeof error==='object'&&'code' in error&&error.code==='ENOENT')return undefined;
    throw unavailable();
   }
   if(before.isSymbolicLink()||!before.isFile()||before.size<2||before.size>65536)throw unavailable();
   fd=fs.openSync(file,'r');const opened=fs.fstatSync(fd);
   if(!opened.isFile()||opened.size!==before.size||opened.ino!==before.ino||opened.dev!==before.dev||opened.mtimeMs!==before.mtimeMs)throw unavailable();
   const bytes=Buffer.alloc(before.size);let used=0;
   while(used<bytes.length){const count=fs.readSync(fd,bytes,used,bytes.length-used,used);if(!count)throw unavailable();used+=count;}
   if(fs.readSync(fd,Buffer.alloc(1),0,1,used)!==0)throw unavailable();
   const after=fs.fstatSync(fd);ordinaryDirectory(root);
   const linked=fs.lstatSync(file);
   if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||linked.isSymbolicLink()
    ||linked.ino!==opened.ino||linked.dev!==opened.dev||linked.size!==opened.size)throw unavailable();
   const review=parseRetainedSceneReview(JSON.parse(bytes.toString('utf8')));
   if(review.sourceHash!==sourceHash)throw unavailable();return review;
  }catch{throw unavailable();}finally{if(fd!==undefined)fs.closeSync(fd);}
 };
}
module.exports={createSourceSceneReviewStore};
